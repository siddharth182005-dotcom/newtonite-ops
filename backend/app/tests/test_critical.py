"""Critical-behaviour tests. Races are FORCED: a barrier makes both requests read the pre-change row before either writes,
so correctness comes from the conditional UPDATE / version guard, not from lucky timing."""
import asyncio
import threading
from datetime import timedelta

import pytest
from sqlalchemy import func, select, update

from app import maintenance, seed
from app.api import work_items
from app.config import settings
from app.db import SessionLocal
from app.models import Activity, IdempotencyKey, OutboxJob, SessionRow, User, WorkItem
from app.security import now
from .conftest import PW, mk

API = "/api/v1"


def count(model, *where):
    with SessionLocal() as db:
        return db.scalar(select(func.count()).select_from(model).where(*where))


@pytest.fixture
def overlap(monkeypatch):
    orig, st = work_items.get_item, {"b": None}

    def wrapped(*a, **k):
        r = orig(*a, **k)
        if st["b"]:
            st["b"].wait(timeout=10)   # both requests now hold the same pre-change snapshot
        return r
    monkeypatch.setattr(work_items, "get_item", wrapped)
    return lambda n: st.__setitem__("b", threading.Barrier(n)), lambda: st.__setitem__("b", None)


async def ver(c, i):
    return (await c.get(i)).json()["version"]


# ---------------------------------------------------------------- forced races
async def test_claim_race_both_pass_precheck(world, login, overlap):
    arm, disarm = overlap
    lead, m1, m2 = await login("lead"), await login("m1"), await login("m2")
    it = await mk(lead, world["A"])
    arm(2)
    rs = await asyncio.gather(m1.post(f"{API}/work-items/{it['id']}/assign", json={"assignee_id": world["m1"]}),
                              m2.post(f"{API}/work-items/{it['id']}/assign", json={"assignee_id": world["m2"]}))
    disarm()
    assert sorted(r.status_code for r in rs) == [200, 409]
    win = next(r for r in rs if r.status_code == 200).json()["assignee"]["id"]
    with SessionLocal() as db:
        row = db.get(WorkItem, it["id"])
        assert row.assignee_id == win and row.version == 2
        claims = db.scalars(select(Activity).where(Activity.work_item_id == it["id"], Activity.action == "claimed")).all()
        assert [a.actor_id for a in claims] == [win]
    assert count(OutboxJob) == 1


async def test_stale_edit_race_both_pass_precheck(world, login, overlap):
    arm, disarm = overlap
    lead, m1 = await login("lead"), await login("m1")
    it = await mk(m1, world["A"])
    i = f"{API}/work-items/{it['id']}"
    arm(2)
    rs = await asyncio.gather(lead.patch(i, json={"expected_version": 1, "title": "from lead"}),
                              m1.patch(i, json={"expected_version": 1, "title": "from member"}))
    disarm()
    assert sorted(r.status_code for r in rs) == [200, 409]
    winner = next(r for r in rs if r.status_code == 200).json()
    loser = next(r for r in rs if r.status_code == 409).json()["error"]
    assert loser["code"] == "version_conflict" and loser["details"]["current"]["title"] == winner["title"]
    cur = (await lead.get(i)).json()
    assert cur["title"] == winner["title"] and cur["version"] == 2
    assert count(Activity, Activity.work_item_id == it["id"], Activity.field == "title") == 1


async def test_transition_race_approve_vs_request_changes(world, login, overlap):
    arm, disarm = overlap
    lead, admin, m1 = await login("lead"), await login("admin"), await login("m1")
    it = await mk(lead, world["A"])
    i = f"{API}/work-items/{it['id']}"
    await m1.post(f"{i}/assign", json={"assignee_id": world["m1"]})
    for to in ("in_progress", "awaiting_approval"):
        assert (await m1.post(f"{i}/transition", json={"to_status": to, "expected_version": await ver(m1, i)})).status_code == 200
    v = await ver(lead, i)
    arm(2)
    rs = await asyncio.gather(lead.post(f"{i}/transition", json={"to_status": "resolved", "expected_version": v}),
                              admin.post(f"{i}/transition", json={"to_status": "in_progress", "expected_version": v}))
    disarm()
    assert sorted(r.status_code for r in rs) == [200, 409]
    final = (await lead.get(i)).json()
    assert final["version"] == v + 1 and final["status"] in ("resolved", "in_progress")
    assert count(Activity, Activity.work_item_id == it["id"], Activity.action.in_(["approved", "changes_requested"])) == 1


# ---------------------------------------------------------------- activity/outbox are atomic with the change
async def test_failure_after_update_rolls_back_everything(world, login, monkeypatch):
    lead, m1 = await login("lead"), await login("m1", quiet=True)
    it = await mk(lead, world["A"])
    i = f"{API}/work-items/{it['id']}"
    # (a) activity insert fails AFTER the guarded UPDATE succeeded -> the state change must not persist
    await m1.post(f"{i}/assign", json={"assignee_id": world["m1"]})
    await m1.post(f"{i}/transition", json={"to_status": "in_progress", "expected_version": await ver(m1, i)})
    base_v, base_acts = await ver(m1, i), count(Activity, Activity.work_item_id == it["id"])
    orig = work_items.log

    def boom(db, item_id, actor_id, action, *a, **k):
        if action == "status_changed":
            raise RuntimeError("audit write failed")
        return orig(db, item_id, actor_id, action, *a, **k)
    monkeypatch.setattr(work_items, "log", boom)
    r = await m1.post(f"{i}/transition", json={"to_status": "awaiting_approval", "expected_version": base_v})
    assert r.status_code == 500
    monkeypatch.setattr(work_items, "log", orig)
    cur = (await m1.get(i)).json()
    assert (cur["status"], cur["version"]) == ("in_progress", base_v) and count(Activity, Activity.work_item_id == it["id"]) == base_acts
    # (b) outbox insert fails after UPDATE + activity -> claim, its audit row and the job all vanish
    it2 = await mk(lead, world["A"])
    j = f"{API}/work-items/{it2['id']}"
    monkeypatch.setattr(work_items, "enqueue", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("outbox failed")))
    assert (await m1.post(f"{j}/assign", json={"assignee_id": world["m1"]})).status_code == 500
    monkeypatch.undo()
    cur = (await m1.get(j)).json()
    assert cur["assignee"] is None and cur["version"] == 1
    assert count(Activity, Activity.work_item_id == it2["id"]) == 1 and count(OutboxJob, OutboxJob.work_item_id == it2["id"]) == 0
    assert (await m1.post(f"{j}/assign", json={"assignee_id": world["m1"]})).status_code == 200   # and it can still be claimed


async def test_failed_create_leaves_no_item_or_key_and_retry_succeeds(world, login, monkeypatch):
    m1 = await login("m1", quiet=True)
    orig = work_items.log
    monkeypatch.setattr(work_items, "log", lambda db, item_id, actor_id, action, *a, **k: (_ for _ in ()).throw(RuntimeError("x")) if action == "created" else orig(db, item_id, actor_id, action, *a, **k))
    body, h = {"title": "Once", "type": "task", "team_id": world["A"]}, {"Idempotency-Key": "key-atomic-0001"}
    assert (await m1.post(f"{API}/work-items", json=body, headers=h)).status_code == 500
    assert count(WorkItem) == 0 and count(IdempotencyKey) == 0           # item, audit and key all rolled back together
    monkeypatch.undo()
    r = await m1.post(f"{API}/work-items", json=body, headers=h)         # uncertain-outcome retry with the SAME key
    assert r.status_code == 201 and count(WorkItem) == 1 and count(Activity) == 1


# ---------------------------------------------------------------- authorization gaps
async def test_more_authorization(world, login):
    lead, m1, viewer, out, admin = [await login(n) for n in ("lead", "m1", "viewer", "outsider", "admin")]
    it = await mk(lead, world["A"])
    i = f"{API}/work-items/{it['id']}"
    assert (await viewer.post(f"{i}/assign", json={"assignee_id": world["viewer"]})).status_code == 403   # viewers can't claim
    r = await lead.post(f"{i}/assign", json={"assignee_id": world["outsider"]})                            # target not in the team
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_assignee"
    assert (await m1.post(f"{i}/assign", json={"assignee_id": world["m2"]})).status_code == 403            # members can't assign others
    assert count(Activity, Activity.work_item_id == it["id"]) == 1 and count(OutboxJob) == 0
    assert (await out.get(f"{i}/comments")).status_code == 404 and (await out.get(f"{i}/activity")).status_code == 404
    other = await mk(out, world["B"])
    assert (await admin.get(f"{API}/work-items/{other['id']}")).status_code == 200                         # global admin sees every team
    assert (await lead.get(f"{API}/work-items/{other['id']}")).status_code == 404
    ids = {x["id"] for x in (await lead.get(f"{API}/work-items", params={"page_size": 100})).json()["items"]}
    assert other["id"] not in ids and it["id"] in ids


# ---------------------------------------------------------------- sessions
async def test_session_expiry_inactive_user_and_purge(world, login):
    import httpx
    from app.main import app
    c = await login("m1")
    assert (await c.get(f"{API}/auth/me")).status_code == 200
    with SessionLocal() as db:
        db.execute(update(SessionRow).values(expires_at=now() - timedelta(seconds=1))); db.commit()
    assert (await c.get(f"{API}/auth/me")).status_code == 401                       # expired session rejected
    with SessionLocal() as db:
        assert maintenance.purge_expired_sessions(db) >= 1
    assert count(SessionRow) == 0
    c2 = await login("m2")
    with SessionLocal() as db:
        db.execute(update(User).where(User.id == world["m2"]).values(is_active=False)); db.commit()
    assert (await c2.get(f"{API}/auth/me")).status_code == 401                      # deactivated user's live session stops working
    anon = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    assert (await anon.post(f"{API}/auth/login", json={"email": "m2@t.dev", "password": PW})).status_code == 401
    await anon.aclose()


async def test_idempotency_purge(world, login):
    m1 = await login("m1")
    await m1.post(f"{API}/work-items", json={"title": "x", "type": "task", "team_id": world["A"]}, headers={"Idempotency-Key": "key-purge-0001"})
    with SessionLocal() as db:
        assert maintenance.purge_expired_idempotency(db) == 0                       # fresh keys are retained
        db.execute(update(IdempotencyKey).values(created_at=now() - maintenance.IDEMPOTENCY_TTL - timedelta(minutes=1))); db.commit()
        assert maintenance.purge_expired_idempotency(db) == 1


# ---------------------------------------------------------------- seed + migrations
async def test_seed_is_hashed_rerunnable_and_dev_only(world, login, monkeypatch):
    from sqlalchemy import text
    from app.db import engine
    with engine.begin() as c:
        c.execute(text("TRUNCATE users, teams, memberships, sessions, work_items, comments, activity_logs, idempotency_keys, outbox_jobs, notifications RESTART IDENTITY CASCADE"))
    monkeypatch.setattr(settings, "environment", "production")
    with pytest.raises(SystemExit):
        seed.run(5)
    assert count(User) == 0
    monkeypatch.setattr(settings, "environment", "development")
    seed.run(150); seed.run(150)                                                     # second run must be a no-op
    assert (count(User), count(WorkItem)) == (10, 150)
    with SessionLocal() as db:
        assert all(h.startswith("$argon2") for h in db.scalars(select(User.password_hash)))
    import httpx
    from app.main import app
    c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")
    assert (await c.post(f"{API}/auth/login", json={"email": "lead@newtonite.dev", "password": seed.PW})).status_code == 200
    await c.aclose()


def test_migrations_match_models_and_are_reversible():
    from alembic import command
    from .conftest import alembic_cfg
    cfg = alembic_cfg()
    command.check(cfg)                    # raises if models and migrated schema have drifted
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    command.check(cfg)


# ---------------------------------------------------------------- needs_attention queue (powers the dashboard centrepiece)
async def test_needs_attention_view_is_scoped_filterable_and_paginated(world, login):
    from datetime import datetime, timezone
    lead, m1, out = await login("lead"), await login("m1"), await login("outsider")
    past = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    urgent = await mk(lead, world["A"], priority="critical", title="urgent unowned")
    low = await mk(lead, world["A"], priority="low", title="low unowned")                       # not attention: low priority, no flags
    overdue = await mk(lead, world["A"], priority="low", due_date=past, title="overdue")
    blocked = await mk(lead, world["A"], priority="medium", title="blocked")
    await lead.post(f"{API}/work-items/{blocked['id']}/assign", json={"assignee_id": world["lead"]})
    await lead.post(f"{API}/work-items/{blocked['id']}/transition", json={"to_status": "blocked", "expected_version": 2})
    done = await mk(lead, world["A"], priority="critical", due_date=past, title="resolved overdue")   # resolved items never need attention
    await lead.post(f"{API}/work-items/{done['id']}/assign", json={"assignee_id": world["lead"]})
    for to in ("in_progress", "awaiting_approval", "resolved"):
        v = (await lead.get(f"{API}/work-items/{done['id']}")).json()["version"]
        assert (await lead.post(f"{API}/work-items/{done['id']}/transition", json={"to_status": to, "expected_version": v})).status_code == 200
    L = f"{API}/work-items"
    got = (await m1.get(L, params={"view": "needs_attention", "page_size": 50})).json()
    assert {x["id"] for x in got["items"]} == {urgent["id"], overdue["id"], blocked["id"]} and got["total"] == 3
    p1 = (await m1.get(L, params={"view": "needs_attention", "page_size": 2, "sort": "priority", "order": "asc"})).json()
    p2 = (await m1.get(L, params={"view": "needs_attention", "page_size": 2, "page": 2, "sort": "priority", "order": "asc"})).json()
    assert p1["total"] == 3 and len(p1["items"]) == 2 and len(p2["items"]) == 1 and p1["items"][0]["id"] == urgent["id"]   # critical first
    assert (await m1.get(L, params={"view": "needs_attention", "q": "overdue"})).json()["total"] == 1                     # search composes with the view
    assert (await m1.get(L, params={"view": "needs_attention", "status": "blocked"})).json()["total"] == 1
    assert (await out.get(L, params={"view": "needs_attention"})).json()["total"] == 0                                       # team-scoped
    s = (await lead.get(f"{API}/dashboard/summary")).json()
    assert s["recent_activity"] and all(a["work_item_key"].startswith("OPS-") for a in s["recent_activity"])               # timeline can link by key
