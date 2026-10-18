from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import Activity, Membership, Priority, Status, Team, User, WorkItem
from ..schemas import ActivityOut, ItemOut, MembershipOut, UserBrief
from ..authz import DONE
from ..security import current_user, lead_scope, now, visible_scope
from .work_items import RANK

router = APIRouter(tags=["dashboard", "directory"])


@router.get("/dashboard/summary")
def summary(user: User = Depends(current_user), db: Session = Depends(get_db)):
    sc, active, t = visible_scope(user), WorkItem.status.notin_(DONE), now()
    r = db.execute(select(
        func.count().filter(active), func.count().filter(active, WorkItem.assignee_id == user.id),
        func.count().filter(active, WorkItem.priority.in_([Priority.critical, Priority.high])),
        func.count().filter(WorkItem.status == Status.blocked),
        func.count().filter(active, WorkItem.due_date < t),
        func.count().filter(active, WorkItem.assignee_id.is_(None), WorkItem.priority.in_([Priority.critical, Priority.high])),
        func.count().filter(WorkItem.status == Status.awaiting_approval, lead_scope(user))).where(sc)).one()
    by_status = db.execute(select(WorkItem.status, func.count()).where(sc).group_by(WorkItem.status)).all()
    by_prio = db.execute(select(WorkItem.priority, func.count()).where(sc, active).group_by(WorkItem.priority)).all()
    recent = db.scalars(select(WorkItem).where(sc).order_by(WorkItem.updated_at.desc()).limit(8)).unique().all()
    acts = db.execute(select(Activity, WorkItem.key).join(WorkItem, WorkItem.id == Activity.work_item_id).where(sc)
                      .order_by(Activity.created_at.desc(), Activity.id.desc()).limit(12)).unique().all()
    return {"total_active": r[0], "my_assigned": r[1], "critical_high": r[2], "blocked": r[3], "overdue": r[4], "unassigned_urgent": r[5], "awaiting_my_approval": r[6],
            "by_status": {k.value: v for k, v in by_status}, "by_priority": {k.value: v for k, v in by_prio},
            "recently_updated": [ItemOut.model_validate(i) for i in recent],
            "recent_activity": [{**ActivityOut.model_validate(a).model_dump(mode="json"), "work_item_id": a.work_item_id, "work_item_key": k} for a, k in acts]}


@router.get("/dashboard/attention")
def attention(limit: int = Query(20, ge=1, le=50), user: User = Depends(current_user), db: Session = Depends(get_db)):
    t = now()
    crit_unassigned = (WorkItem.priority.in_([Priority.critical, Priority.high])) & WorkItem.assignee_id.is_(None)
    cond = (WorkItem.status == Status.blocked) | (WorkItem.due_date < t) | crit_unassigned
    rows = db.scalars(select(WorkItem).where(visible_scope(user), WorkItem.status.notin_(DONE), cond)
                      .order_by(RANK, WorkItem.due_date.asc().nulls_last()).limit(limit)).unique().all()
    out = []
    for i in rows:
        why = []
        if i.status == Status.blocked: why.append("blocked")
        if i.due_date and i.due_date < t: why.append("overdue")
        if i.assignee_id is None and i.priority in (Priority.critical, Priority.high): why.append("unassigned_high_priority")
        out.append({"item": ItemOut.model_validate(i), "reasons": why})
    return {"items": out}


@router.get("/teams")
def teams(user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(Team, func.count(Membership.user_id)).outerjoin(Membership, Membership.team_id == Team.id).group_by(Team.id).order_by(Team.name)
    if not user.is_admin:
        q = q.where(Team.id.in_(select(Membership.team_id).where(Membership.user_id == user.id)))
    mine = {m.team_id: m.role.value for m in db.scalars(select(Membership).where(Membership.user_id == user.id))}
    return [{"id": t.id, "name": t.name, "description": t.description, "member_count": n,
             "my_role": "admin" if user.is_admin else mine.get(t.id)} for t, n in db.execute(q).all()]


@router.get("/users", response_model=list[UserBrief])
def users(team_id: int | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(User).where(User.is_active)
    if team_id: q = q.where(User.id.in_(select(Membership.user_id).where(Membership.team_id == team_id)))
    if not user.is_admin:
        mine = select(Membership.team_id).where(Membership.user_id == user.id)
        q = q.where(User.id.in_(select(Membership.user_id).where(Membership.team_id.in_(mine))))
    return db.scalars(q.order_by(User.name)).all()
