"""Outbox worker.

Delivery model: AT-LEAST-ONCE with an idempotent handler (UNIQUE notifications.job_id) => effectively-once results.
* claim_batch: SELECT … FOR UPDATE SKIP LOCKED, mark 'processing' + locked_at, attempts += 1 (committed before work starts).
* success -> 'done'. failure -> 'pending' with exponential backoff, or 'dead' once attempts >= MAX_ATTEMPTS.
* crash recovery: a 'processing' job whose lock is older than VISIBILITY_TIMEOUT is claimable again.
"""
import logging
import sys
import time
from datetime import datetime, timedelta

from sqlalchemy import and_, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Notification, OutboxJob, User, WorkItem
from ..security import now

log = logging.getLogger("worker")
MAX_ATTEMPTS = 5
VISIBILITY_TIMEOUT = timedelta(seconds=60)


def backoff(attempts: int) -> timedelta:
    return timedelta(seconds=min(300, 2 ** attempts))  # 2s, 4s, 8s, 16s … capped at 5 min


def handle_notify_assignee(db: Session, job: OutboxJob):
    p = job.payload
    item = db.get(WorkItem, job.work_item_id)
    user = db.get(User, p["assignee_id"])
    if not item or not user:
        raise ValueError("work item or assignee no longer exists")
    msg = f"{item.key} “{item.title}” was assigned to you"
    # Idempotent: a re-delivered job hits the UNIQUE(job_id) and inserts nothing.
    db.execute(pg_insert(Notification).values(user_id=user.id, work_item_id=item.id, message=msg, job_id=job.id)
               .on_conflict_do_nothing(index_elements=["job_id"]))


HANDLERS = {"notify_assignee": handle_notify_assignee}


def claim_batch(db: Session, limit: int = 10, at: datetime | None = None) -> list[int]:
    t = at or now()
    rows = db.scalars(select(OutboxJob).where(or_(
        and_(OutboxJob.status == "pending", OutboxJob.next_attempt_at <= t),
        and_(OutboxJob.status == "processing", OutboxJob.locked_at < t - VISIBILITY_TIMEOUT)))
        .order_by(OutboxJob.next_attempt_at, OutboxJob.id).limit(limit).with_for_update(skip_locked=True)).all()
    for r in rows:
        r.status, r.locked_at, r.attempts = "processing", t, r.attempts + 1
    db.commit()
    return [r.id for r in rows]


def run_job(db: Session, job_id: int, at: datetime | None = None):
    t = at or now()
    job = db.get(OutboxJob, job_id)
    try:
        h = HANDLERS.get(job.job_type)
        if h is None:
            raise ValueError(f"no handler for job type {job.job_type!r}")
        h(db, job)
        job.status, job.processed_at, job.last_error, job.locked_at = "done", t, None, None
    except Exception as e:  # noqa: BLE001 - any handler failure is retried/dead-lettered
        db.rollback()
        job = db.get(OutboxJob, job_id)
        job.last_error = f"{type(e).__name__}: {e}"[:1000]
        job.locked_at = None
        if job.attempts >= MAX_ATTEMPTS:
            job.status = "dead"
        else:
            job.status, job.next_attempt_at = "pending", t + backoff(job.attempts)
    db.commit()


def process_batch(db: Session, limit: int = 10, at: datetime | None = None) -> int:
    ids = claim_batch(db, limit, at)
    for i in ids:
        run_job(db, i, at)
    return len(ids)


def main(once: bool = False, interval: float = 2.0):
    from ..maintenance import purge_expired_idempotency, purge_expired_sessions
    logging.basicConfig(level=logging.INFO)
    tick = 0
    while True:
        with SessionLocal() as db:
            n = process_batch(db)
            if tick % 300 == 0:
                purge_expired_idempotency(db)
                purge_expired_sessions(db)
        if n: log.info("processed %d job(s)", n)
        if once:
            return
        tick += 1
        time.sleep(interval)


if __name__ == "__main__":
    main(once="--once" in sys.argv)
