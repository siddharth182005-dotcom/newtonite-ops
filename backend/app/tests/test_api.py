import asyncio

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Activity, WorkItem
from .conftest import PW, mk

API = "/api/v1"


def n_activity(item_id):
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(Activity).where(Activity.work_item_id == item_id))


# ------------------------------------------------------------------ auth
async def test_auth_flow(world, login):
    import httpx
    from app.main import app
    anon = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    assert (await anon.get(f"{API}/auth/me")).status_code == 401
    assert (await anon.get(f"{API}/work-items")).status_code == 401
    bad = await anon.post(f"{API}/auth/login", json={"email": "m1@t.dev", "password": "nope"})
    assert bad.status_code == 401 and bad.json()["error"]["code"] == "invalid_credentials"
    ok = await anon.post(f"{API}/auth/login", json={"email": "m1@t.dev", "password": PW})
    assert ok.status_code == 200 and "password" not in ok.text and "hash" not in ok.text
    assert "httponly" in ok.headers["set-cookie"].lower()
    assert (await anon.get(f"{API}/auth/me")).status_code == 200
    # CSRF: state-changing request without the header is rejected
    r = await anon.post(f"{API}/work-items", json={"title": "x", "type": "task", "team_id": world["A"]})
    assert r.status_code == 403 and r.json()["error"]["code"] == "csrf_failed"
    anon.headers["X-CSRF-Token"] = ok.json()["csrf_token"]
    assert (await anon.post(f"{API}/auth/logout")).status_code == 204
    assert (await anon.get(f"{API}/auth/me")).status_code == 401
    await anon.aclose()


# ------------------------------------------------------------------ authorization
async def test_cross_team_and_role_enforcement(world, login):
    lead, m1, viewer, out = [await login(n) for n in ("lead", "m1", "viewer", "outsider")]
    item = await mk(lead, world["A"])
    base = n_activity(item["id"])
    i = f"{API}/work-items/{item['id']}"
    for r in [await out.get(i), await out.patch(i, json={"expected_version": 1, "title": "hax"}),
              await out.post(f"{i}/comments", json={"body": "x"}),
              await out.post(f"{i}/transition", json={"to_status": "in_progress", "expected_version": 1}),
              await out.post(f"{i}/assign", json={"assignee_id": world["outsider"]})]:
        assert r.status_code == 404
    assert (await out.post(f"{API}/work-items", json={"title": "x", "type": "task", "team_id": world["A"]})).status_code == 403
    assert (await out.get(f"{API}/work-items")).json()["total"] == 0
    assert (await viewer.get(i)).status_code == 200
    assert (await viewer.post(f"{i}/comments", json={"body": "x"})).status_code == 403
    assert (await viewer.post(f"{API}/work-items", json={"title": "x", "type": "task", "team_id": world["A"]})).status_code == 403
    # member who is neither creator nor assignee cannot edit; unassigned => cannot transition
    assert (await m1.patch(i, json={"expected_version": 1, "title": "n"})).status_code == 403
    assert (await m1.post(f"{i}/transition", json={"to_status": "in_progress", "expected_version": 1})).status_code == 403
    assert n_activity(item["id"]) == base  # rejected operations leave no audit trail


# ------------------------------------------------------------------ create / validation / activity
async def test_create_validation_and_audit(world, login):
    m1 = await login("m1")
    assert (await m1.post(f"{API}/work-items", json={"title": "  ", "type": "task", "team_id": world["A"]})).status_code == 422
    assert (await m1.post(f"{API}/work-items", json={"title": "x", "type": "nope", "team_id": world["A"]})).status_code == 422
    it = await mk(m1, world["A"], title="Disk full", priority="high")
    assert it["key"] == "OPS-1001" and it["version"] == 1 and it["status"] == "open" and it["creator"]["name"] == "M1"
    act = (await m1.get(f"{API}/work-items/{it['id']}/activity")).json()
    assert act["total"] == 1 and act["items"][0]["action"] == "created" and act["items"][0]["actor"]["name"] == "M1"


# ------------------------------------------------------------------ workflow + approval
async def ver(c, i):
    return (await c.get(i)).json()["version"]


async def go(c, i, to):
    return await c.post(f"{i}/transition", json={"to_status": to, "expected_version": await ver(c, i)})


async def test_workflow_and_lead_only_approval(world, login):
    lead, m1, m2 = await login("lead"), await login("m1"), await login("m2")
    it = await mk(lead, world["A"])
    i = f"{API}/work-items/{it['id']}"
    assert (await go(m1, i, "in_progress")).status_code == 403          # unassigned: member can't work on it
    assert (await m1.post(f"{i}/assign", json={"assignee_id": world["m1"]})).status_code == 200
    assert (await go(m1, i, "in_progress")).json()["status"] == "in_progress"
    assert (await go(m1, i, "resolved")).status_code == 403             # a member cannot self-resolve (approval bypass)
    r = await go(lead, i, "resolved")                                   # even a lead must go through awaiting_approval
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_transition" and "awaiting_approval" in r.json()["error"]["details"]["allowed"]
    assert (await go(m1, i, "awaiting_approval")).json()["status"] == "awaiting_approval"
    before = n_activity(it["id"]); v = await ver(lead, i)
    assert (await go(m1, i, "resolved")).status_code == 403             # assignee member cannot approve
    assert (await go(m2, i, "resolved")).status_code == 403             # other member cannot either
    assert (await go(m1, i, "in_progress")).status_code == 403          # requesting changes is lead-only too
    cur = (await lead.get(i)).json()
    assert cur["status"] == "awaiting_approval" and cur["version"] == v and n_activity(it["id"]) == before   # rejected => no mutation, no audit
    ok = await go(lead, i, "resolved")
    assert ok.status_code == 200 and ok.json()["resolved_at"]
    assert (await go(m1, i, "closed")).status_code == 403               # close is lead-only
    assert (await go(lead, i, "closed")).json()["status"] == "closed"
    assert (await go(m1, i, "open")).status_code == 403                 # reopen is lead-only
    assert (await go(lead, i, "open")).json()["resolved_at"] is None
    r = await go(lead, i, "closed")                                     # open -> closed is not in the map
    assert r.status_code == 422
    actions = [a["action"] for a in (await lead.get(f"{i}/activity")).json()["items"]]
    assert {"approved", "closed", "reopened", "status_changed", "claimed", "created"} <= set(actions)


async def test_priority_and_assignment_audit(world, login):
    lead, m1 = await login("lead"), await login("m1")
    it = await mk(m1, world["A"])
    i = f"{API}/work-items/{it['id']}"
    r = await m1.patch(i, json={"expected_version": 1, "priority": "critical"})
    assert r.status_code == 200
    r = await lead.post(f"{i}/assign", json={"assignee_id": world["m2"], "expected_version": 2})
    assert r.status_code == 200 and r.json()["assignee"]["name"] == "M2" and r.json()["version"] == 3
    assert (await m1.post(f"{i}/assign", json={"assignee_id": world["m1"], "expected_version": 3})).status_code == 403  # member can't reassign
    assert (await m1.post(f"{i}/assign", json={"assignee_id": world["outsider"]})).status_code == 403
    acts = (await lead.get(f"{i}/activity")).json()["items"]
    pr = next(a for a in acts if a["field"] == "priority")
    assert (pr["old_value"], pr["new_value"], pr["actor"]["name"]) == ("medium", "critical", "M1")
    assert any(a["action"] == "assigned" and a["meta"]["new_assignee"] == "M2" for a in acts) and len(acts) == 3


async def test_idempotency_key_survives_failed_first_attempt(world, login):
    m1 = await login("m1")
    h = {"Idempotency-Key": "key-retry-0001"}
    bad = await m1.post(f"{API}/work-items", json={"title": "", "type": "task", "team_id": world["A"]}, headers=h)
    assert bad.status_code == 422
    good = await m1.post(f"{API}/work-items", json={"title": "Fine", "type": "task", "team_id": world["A"]}, headers=h)
    assert good.status_code == 201   # the failed attempt did not consume the key


async def test_dashboard_views(world, login):
    lead, m1 = await login("lead"), await login("m1")
    urgent = await mk(lead, world["A"], priority="critical")
    await mk(lead, world["A"], priority="low")
    ap = await mk(lead, world["A"])
    i = f"{API}/work-items/{ap['id']}"
    await m1.post(f"{i}/assign", json={"assignee_id": world["m1"]})
    await go(m1, i, "in_progress"); await go(m1, i, "awaiting_approval")
    L = f"{API}/work-items"
    assert [x["id"] for x in (await m1.get(L, params={"view": "unassigned_urgent"})).json()["items"]] == [urgent["id"]]
    assert [x["id"] for x in (await m1.get(L, params={"view": "assigned_to_me"})).json()["items"]] == [ap["id"]]
    assert (await m1.get(L, params={"view": "awaiting_my_approval"})).json()["total"] == 0   # members can't approve
    assert [x["id"] for x in (await lead.get(L, params={"view": "awaiting_my_approval"})).json()["items"]] == [ap["id"]]
    s = (await lead.get(f"{API}/dashboard/summary")).json()
    assert s["unassigned_urgent"] == 1 and s["awaiting_my_approval"] == 1 and s["by_status"]["awaiting_approval"] == 1
    out = await login("outsider")
    assert (await out.get(L, params={"view": "awaiting_my_approval"})).json()["total"] == 0


# ------------------------------------------------------------------ concurrency: claim
async def test_concurrent_claim_single_winner(world, login):
    lead, m1, m2 = await login("lead"), await login("m1"), await login("m2")
    it = await mk(lead, world["A"])
    for _ in range(1):
        rs = await asyncio.gather(*[m1.post(f"{API}/work-items/{it['id']}/assign", json={"assignee_id": world["m1"]}) for _ in range(5)],
                                  *[m2.post(f"{API}/work-items/{it['id']}/assign", json={"assignee_id": world["m2"]}) for _ in range(5)])
    codes = sorted(r.status_code for r in rs)
    assert codes == [200] + [409] * 9
    winner = next(r for r in rs if r.status_code == 200).json()
    loser = next(r for r in rs if r.status_code == 409).json()["error"]
    assert loser["code"] == "already_assigned" and loser["details"]["current"]["assignee"]["id"] == winner["assignee"]["id"]
    cur = (await lead.get(f"{API}/work-items/{it['id']}")).json()
    assert cur["version"] == 2 and cur["assignee"]["id"] == winner["assignee"]["id"]
    assert n_activity(it["id"]) == 2  # created + exactly one claim
    with SessionLocal() as db:  # exactly one notification job: the 9 losing claims enqueued nothing
        from app.models import OutboxJob
        assert db.scalar(select(func.count()).select_from(OutboxJob)) == 1


# ------------------------------------------------------------------ stale updates
async def test_stale_update_409(world, login):
    lead, m1 = await login("lead"), await login("m1")
    it = await mk(m1, world["A"])
    i = f"{API}/work-items/{it['id']}"
    ok = await m1.patch(i, json={"expected_version": 1, "title": "Edited"})
    assert ok.status_code == 200 and ok.json()["version"] == 2
    stale = await lead.patch(i, json={"expected_version": 1, "priority": "critical"})
    err = stale.json()["error"]
    assert stale.status_code == 409 and err["code"] == "version_conflict"
    assert err["details"]["current"]["title"] == "Edited" and err["details"]["current"]["version"] == 2
    assert (await lead.get(i)).json()["priority"] == "medium"  # nothing silently overwritten
    assert n_activity(it["id"]) == 2
    # concurrent edits with same expected version: exactly one wins
    rs = await asyncio.gather(*[lead.patch(i, json={"expected_version": 2, "description": f"d{n}"}) for n in range(6)])
    assert sorted(r.status_code for r in rs) == [200] + [409] * 5
    assert (await lead.get(i)).json()["version"] == 3


# ------------------------------------------------------------------ idempotency
async def test_idempotent_create(world, login):
    m1 = await login("m1")
    body = {"title": "Once", "type": "customer_issue", "team_id": world["A"]}
    h = {"Idempotency-Key": "key-aaaaaaaa"}
    a = await m1.post(f"{API}/work-items", json=body, headers=h)
    b = await m1.post(f"{API}/work-items", json=body, headers=h)
    assert a.status_code == 201 and b.status_code == 200 and a.json()["id"] == b.json()["id"]
    assert b.headers["idempotent-replay"] == "true"
    r = await m1.post(f"{API}/work-items", json={**body, "title": "Different"}, headers=h)
    assert r.status_code == 409 and r.json()["error"]["code"] == "idempotency_key_reuse"
    rs = await asyncio.gather(*[m1.post(f"{API}/work-items", json=body, headers={"Idempotency-Key": "key-concurrent"}) for _ in range(8)])
    assert all(r.status_code in (200, 201) for r in rs) and sorted(r.status_code for r in rs).count(201) == 1
    assert len({r.json()["id"] for r in rs}) == 1
    with SessionLocal() as db:
        assert db.scalar(select(func.count()).select_from(WorkItem)) == 2


# ------------------------------------------------------------------ search / filter / pagination / dashboard
async def test_search_filter_paginate_dashboard(world, login):
    lead, m1 = await login("lead"), await login("m1")
    for n in range(30):
        await mk(lead, world["A"], title=f"Item {n} {'payments' if n % 5 == 0 else 'misc'}", priority="critical" if n % 3 == 0 else "low")
    await mk((await login("outsider")), world["B"], title="Other team payments")
    L = f"{API}/work-items"
    p1 = (await m1.get(L, params={"page_size": 10, "page": 1, "sort": "key", "order": "asc"})).json()
    p3 = (await m1.get(L, params={"page_size": 10, "page": 3, "sort": "key", "order": "asc"})).json()
    assert p1["total"] == 30 and len(p1["items"]) == 10 and p1["items"][0]["key"] == "OPS-1001" and p3["items"][-1]["key"] == "OPS-1030"
    assert (await m1.get(L, params={"q": "payments"})).json()["total"] == 6  # excludes other team's match
    assert (await m1.get(L, params={"priority": "critical"})).json()["total"] == 10
    assert (await m1.get(L, params={"q": "%"})).json()["total"] == 0  # wildcard escaped
    assert (await m1.get(L, params={"assignee": "unassigned", "status": "open"})).json()["total"] == 30
    assert (await m1.get(L, params={"page_size": 101})).status_code == 422
    s = (await m1.get(f"{API}/dashboard/summary")).json()
    assert s["total_active"] == 30 and s["by_priority"]["critical"] == 10 and s["my_assigned"] == 0
    att = (await m1.get(f"{API}/dashboard/attention")).json()["items"]
    assert att and all("unassigned_high_priority" in a["reasons"] for a in att)
