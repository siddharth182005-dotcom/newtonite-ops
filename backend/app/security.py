import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .errors import ApiError
from .models import Membership, Role, SessionRow, User, WorkItem

ph = PasswordHasher()
DUMMY_HASH = ph.hash("not-a-real-password")  # equalises timing for unknown emails
SAFE = {"GET", "HEAD", "OPTIONS"}
LEVEL = {Role.viewer: 1, Role.member: 2, Role.lead: 3, Role.admin: 4}
VIEWER, MEMBER, LEAD, ADMIN = 1, 2, 3, 4


def now() -> datetime:
    return datetime.now(timezone.utc)


def hash_password(p: str) -> str:
    return ph.hash(p)


def verify_password(h: str, p: str) -> bool:
    try:
        return ph.verify(h, p)
    except VerifyMismatchError:
        return False


def sha(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def new_session(db: Session, user: User) -> tuple[str, str]:
    token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(24)
    db.add(SessionRow(token_hash=sha(token), user_id=user.id, csrf_token=csrf,
                      expires_at=now() + timedelta(hours=settings.session_hours)))
    return token, csrf


def current_session(request: Request, db: Session = Depends(get_db)) -> SessionRow:
    token = request.cookies.get("session")
    s = db.get(SessionRow, sha(token)) if token else None
    if not s or s.expires_at <= now():
        raise ApiError(401, "not_authenticated", "Authentication required")
    if request.method not in SAFE:
        sent = request.headers.get("x-csrf-token", "")
        if not secrets.compare_digest(sent, s.csrf_token):
            raise ApiError(403, "csrf_failed", "Missing or invalid CSRF token")
    return s


def current_user(s: SessionRow = Depends(current_session), db: Session = Depends(get_db)) -> User:
    u = db.get(User, s.user_id)
    if not u or not u.is_active:
        raise ApiError(401, "not_authenticated", "Authentication required")
    return u


def role_level(db: Session, user: User, team_id: int) -> int:
    if user.is_admin:
        return ADMIN
    r = db.scalar(select(Membership.role).where(Membership.user_id == user.id, Membership.team_id == team_id))
    return LEVEL[r] if r else 0


def visible_scope(user: User):
    """SQL clause limiting work items to teams the user belongs to (admins see all)."""
    from sqlalchemy import true
    if user.is_admin:
        return true()
    return WorkItem.team_id.in_(select(Membership.team_id).where(Membership.user_id == user.id))


def get_item(db: Session, user: User, item_id: int) -> tuple[WorkItem, int]:
    item = db.get(WorkItem, item_id)
    lvl = role_level(db, user, item.team_id) if item else 0
    if not item or lvl == 0:  # same response for "missing" and "not yours": no ID probing
        raise ApiError(404, "not_found", "Work item not found")
    return item, lvl


def lead_scope(user: User):
    """Items in teams where the user is lead/admin (global admins: everything). Used for 'awaiting my approval'."""
    from sqlalchemy import true
    if user.is_admin:
        return true()
    return WorkItem.team_id.in_(select(Membership.team_id).where(
        Membership.user_id == user.id, Membership.role.in_([Role.lead, Role.admin])))
