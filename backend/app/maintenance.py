from datetime import timedelta

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import IdempotencyKey, SessionRow
from .security import now

IDEMPOTENCY_TTL = timedelta(hours=24)  # keys are honoured for at least 24h, then purged by the worker


def purge_expired_idempotency(db: Session) -> int:
    n = db.execute(delete(IdempotencyKey).where(IdempotencyKey.created_at < now() - IDEMPOTENCY_TTL)).rowcount
    db.commit()
    return n


def purge_expired_sessions(db: Session) -> int:
    n = db.execute(delete(SessionRow).where(SessionRow.expires_at < now())).rowcount
    db.commit()
    return n
