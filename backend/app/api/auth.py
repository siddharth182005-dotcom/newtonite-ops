from fastapi import APIRouter, Depends, Request, Response
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..config import settings
from ..db import get_db
from ..errors import ApiError
from ..models import Membership, SessionRow, User
from ..schemas import LoginIn, MeOut, MembershipOut
from ..security import (DUMMY_HASH, current_session, current_user, new_session, sha, verify_password)

router = APIRouter(prefix="/auth", tags=["auth"])


def me_out(db: Session, user: User, csrf: str) -> MeOut:
    ms = db.scalars(select(Membership).where(Membership.user_id == user.id)).all()
    return MeOut(id=user.id, name=user.name, email=user.email, is_admin=user.is_admin, csrf_token=csrf,
                 memberships=[MembershipOut(team_id=m.team_id, team_name=m.team.name, role=m.role) for m in ms])


@router.post("/login", response_model=MeOut)
def login(body: LoginIn, response: Response, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    ok = verify_password(user.password_hash if user else DUMMY_HASH, body.password)
    if not (user and ok and user.is_active):
        raise ApiError(401, "invalid_credentials", "Invalid email or password")
    token, csrf = new_session(db, user)
    db.commit()
    response.set_cookie("session", token, httponly=True, samesite="lax", secure=settings.cookie_secure,
                        max_age=settings.session_hours * 3600, path="/")
    return me_out(db, user, csrf)


@router.get("/me", response_model=MeOut)
def me(s: SessionRow = Depends(current_session), user: User = Depends(current_user), db: Session = Depends(get_db)):
    return me_out(db, user, s.csrf_token)


@router.post("/logout", status_code=204)
def logout(request: Request, response: Response, s: SessionRow = Depends(current_session), db: Session = Depends(get_db)):
    db.execute(delete(SessionRow).where(SessionRow.token_hash == s.token_hash))
    db.commit()
    response.delete_cookie("session", path="/")
