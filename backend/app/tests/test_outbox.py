import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import Notification, OutboxJob
from app.security import now
from app.worker import runner
from .conftest import mk

API = "/api/v1"


async def make_job(world, login):
    lead, m1 = await login("lead"), await login("m1")
    it = await mk(lead, world["A"])
    r = await m1.post(f"{API}/work-items/{it['id']}/assign", json={"assignee_id": world["m1"]})
    assert r.status_code == 200
    with SessionLocal() as db:
        return db.scalars(select(OutboxJob)).one().id


def state(job_id):
    with SessionLocal() as db:
        j = db.get(OutboxJob, job_id)
        return j.status, j.attempts, j.last_error, j.next_attempt_at, db.scalar(select(func.count()).select_from(Notification))


async def test_job_enqueued_atomically_and_processed_once(world, login):
    jid = await make_job(world, login)
    assert state(jid)[0] == "pending"
    with SessionLocal() as db:
        assert runner.process_batch(db) == 1
        assert runner.process_batch(db) == 0                      # nothing left to do
        n = db.scalars(select(Notification)).one()
        assert n.user_id == world["m1"] and "assigned to you" in n.message
    assert state(jid)[0] == "done"
    # duplicate delivery (e.g. worker died after the handler but before 'done' was committed) creates no second notification
    with SessionLocal() as db:
        db.get(OutboxJob, jid).status = "pending"; db.commit()
        runner.process_batch(db)
    assert state(jid)[0] == "done" and state(jid)[4] == 1


async def test_retry_backoff_and_dead_letter(world, login, monkeypatch):
    jid = await make_job(world, login)
    def boom(db, job): raise RuntimeError("smtp down")
    monkeypatch.setitem(runner.HANDLERS, "notify_assignee", boom)
    t = now()
    with SessionLocal() as db:
        assert runner.process_batch(db, at=t) == 1
    st, attempts, err, nxt, notes = state(jid)
    assert (st, attempts, notes) == ("pending", 1, 0) and "smtp down" in err and nxt >= t + timedelta(seconds=2)
    with SessionLocal() as db:
        assert runner.process_batch(db, at=t) == 0                # backoff not elapsed: not retried yet
        for k in range(2, runner.MAX_ATTEMPTS + 1):
            t += timedelta(minutes=10)
            assert runner.process_batch(db, at=t) == 1
    st, attempts, err, _, notes = state(jid)
    assert (st, attempts, notes) == ("dead", runner.MAX_ATTEMPTS, 0)
    with SessionLocal() as db:
        assert runner.process_batch(db, at=t + timedelta(days=1)) == 0   # dead jobs are never retried


async def test_crash_recovery_and_no_double_claim(world, login):
    jid = await make_job(world, login)
    with SessionLocal() as db:
        assert runner.claim_batch(db) == [jid]                    # worker A claims, then "crashes"
        assert runner.claim_batch(db) == []                       # lock still fresh: nobody else may take it
    with ThreadPoolExecutor(2) as ex:                             # two workers racing for a stale lock: exactly one wins
        with SessionLocal() as db:
            db.get(OutboxJob, jid).locked_at = now() - runner.VISIBILITY_TIMEOUT - timedelta(seconds=5); db.commit()
        def claim():
            with SessionLocal() as d:
                return runner.claim_batch(d)
        got = [x for r in [ex.submit(claim), ex.submit(claim)] for x in r.result()]
    assert got == [jid]
    with SessionLocal() as db:
        runner.run_job(db, jid)
    assert state(jid)[0] == "done"
