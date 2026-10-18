import hashlib
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, Header, Query, Response
from sqlalchemy import case, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from ..db import get_db
from ..errors import ApiError
from ..models import (Activity, Comment, IdempotencyKey, Membership, OutboxJob, Priority, Status, User, WorkItem, WorkType)
from ..schemas import (ActivityOut, AssignIn, CommentIn, CommentOut, ItemCreate, ItemOut, ItemPatch, Page,
                       TransitionIn)
from .. import authz
from ..authz import DONE, TRANSITIONS
from ..security import LEAD, MEMBER, current_user, get_item, lead_scope, now, role_level, visible_scope

router = APIRouter(prefix="/work-items", tags=["work-items"])
S = Status


def sv(v):
    return None if v is None else (v.value if hasattr(v, "value") else v.isoformat() if isinstance(v, datetime) else str(v))


def log(db, item_id, actor_id, action, field=None, old=None, new=None, meta=None):
    db.add(Activity(work_item_id=item_id, actor_id=actor_id, action=action, field=field,
                    old_value=sv(old), new_value=sv(new), meta=meta))


def enqueue(db, job_type, item_id, payload):
    """Outbox insert: same transaction as the mutation, so the job exists iff the change committed."""
    db.add(OutboxJob(job_type=job_type, work_item_id=item_id, payload=payload))


def reload(db: Session, item_id: int) -> WorkItem:
    return db.execute(select(WorkItem).where(WorkItem.id == item_id).execution_options(populate_existing=True)).scalar_one()


def conflict(db: Session, item_id: int, code="version_conflict",
             msg="This item was changed by someone else. Review the latest version and try again."):
    db.rollback()
    cur = ItemOut.model_validate(reload(db, item_id)).model_dump(mode="json")
    raise ApiError(409, code, msg, {"current": cur})


def guarded_update(db: Session, item_id: int, expected: int, values: dict, extra_where=()):
    """Atomic compare-and-swap on version. Returns False when 0 rows matched."""
    stmt = (update(WorkItem).where(WorkItem.id == item_id, WorkItem.version == expected, *extra_where)
            .values(**values, version=WorkItem.version + 1, updated_at=func.now())
            .returning(WorkItem.id).execution_options(synchronize_session=False))
    return db.execute(stmt).first() is not None


# ---------------------------------------------------------------- list / detail
RANK = case(*[(WorkItem.priority == p, i) for i, p in enumerate([Priority.critical, Priority.high, Priority.medium, Priority.low])])
SORTS = {"created_at": WorkItem.created_at, "updated_at": WorkItem.updated_at, "priority": RANK,
         "status": WorkItem.status, "key": WorkItem.id, "due_date": WorkItem.due_date}


@router.get("", response_model=Page[ItemOut])
def list_items(q: str | None = Query(None, max_length=100), status: list[Status] = Query(default=[]),
               priority: list[Priority] = Query(default=[]), type: list[WorkType] = Query(default=[]),
               team_id: int | None = None, assignee: str | None = Query(None, description="user id, 'me' or 'unassigned'"),
               overdue: bool | None = None, view: Literal['assigned_to_me', 'unassigned_urgent', 'awaiting_my_approval', 'needs_attention'] | None = None, sort: Literal[tuple(SORTS)] = "updated_at",
               order: Literal["asc", "desc"] = "desc", page: int = Query(1, ge=1),
               page_size: int = Query(25, ge=1, le=100), user: User = Depends(current_user), db: Session = Depends(get_db)):
    w = [visible_scope(user)]
    if q:
        esc = q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        w.append(WorkItem.title.ilike(f"%{esc}%", escape="\\") | WorkItem.key.ilike(f"%{esc}%", escape="\\"))
    if status: w.append(WorkItem.status.in_(status))
    if priority: w.append(WorkItem.priority.in_(priority))
    if type: w.append(WorkItem.type.in_(type))
    if team_id: w.append(WorkItem.team_id == team_id)
    if assignee == "me": w.append(WorkItem.assignee_id == user.id)
    elif assignee == "unassigned": w.append(WorkItem.assignee_id.is_(None))
    elif assignee:
        if not assignee.isdigit(): raise ApiError(422, "validation_error", "assignee must be an id, 'me' or 'unassigned'")
        w.append(WorkItem.assignee_id == int(assignee))
    if view == 'assigned_to_me': w += [WorkItem.assignee_id == user.id, WorkItem.status.notin_(DONE)]
    elif view == 'unassigned_urgent': w += [WorkItem.assignee_id.is_(None), WorkItem.priority.in_([Priority.critical, Priority.high]), WorkItem.status.notin_(DONE)]
    elif view == 'needs_attention':  # same definition as /dashboard/attention: active AND (blocked OR overdue OR urgent-and-unowned)
        w += [WorkItem.status.notin_(DONE), (WorkItem.status == Status.blocked) | (WorkItem.due_date < now()) | (WorkItem.assignee_id.is_(None) & WorkItem.priority.in_([Priority.critical, Priority.high]))]
    elif view == 'awaiting_my_approval': w += [WorkItem.status == Status.awaiting_approval, lead_scope(user)]
    if overdue:
        w += [WorkItem.due_date < now(), WorkItem.status.notin_(DONE)]
    total = db.scalar(select(func.count()).select_from(WorkItem).where(*w))
    col = SORTS[sort]
    col = (col.asc() if order == "asc" else col.desc()) if sort != "due_date" else (
        col.asc().nulls_last() if order == "asc" else col.desc().nulls_last())
    rows = db.scalars(select(WorkItem).where(*w).order_by(col, WorkItem.id.desc())
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.get("/{item_id}", response_model=ItemOut)
def detail(item_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return get_item(db, user, item_id)[0]


# ---------------------------------------------------------------- create (idempotent)
@router.post("", response_model=ItemOut, status_code=201)
def create(body: ItemCreate, response: Response, idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
           user: User = Depends(current_user), db: Session = Depends(get_db)):
    authz.require(role_level(db, user, body.team_id), "create")
    kid = None
    if idempotency_key is not None:
        if not 8 <= len(idempotency_key) <= 128:
            raise ApiError(422, "validation_error", "Idempotency-Key must be 8-128 characters")
        fp = hashlib.sha256(json.dumps(body.model_dump(mode="json"), sort_keys=True).encode()).hexdigest()
        # A concurrent duplicate blocks here on the unique index until the first tx commits, then gets no row.
        kid = db.execute(pg_insert(IdempotencyKey).values(user_id=user.id, key=idempotency_key, fingerprint=fp)
                         .on_conflict_do_nothing(index_elements=["user_id", "key"]).returning(IdempotencyKey.id)).scalar()
        if kid is None:
            prev = db.scalar(select(IdempotencyKey).where(IdempotencyKey.user_id == user.id, IdempotencyKey.key == idempotency_key))
            if prev.fingerprint != fp:
                raise ApiError(409, "idempotency_key_reuse", "This Idempotency-Key was already used with a different request body")
            response.status_code = 200
            response.headers["Idempotent-Replay"] = "true"
            return db.get(WorkItem, prev.work_item_id)
    item = WorkItem(**body.model_dump(), creator_id=user.id, status=Status.open, version=1)
    db.add(item)
    db.flush()
    log(db, item.id, user.id, "created", meta={"key": item.key})
    if kid:
        db.execute(update(IdempotencyKey).where(IdempotencyKey.id == kid).values(work_item_id=item.id))
    db.commit()
    return reload(db, item.id)


# ---------------------------------------------------------------- edit
@router.patch("/{item_id}", response_model=ItemOut)
def edit(item_id: int, body: ItemPatch, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, lvl = get_item(db, user, item_id)
    if not authz.can_edit(lvl, user, item):
        raise ApiError(403, "forbidden", "Only leads, or the creator/assignee, can edit this item")
    if item.status == S.closed:
        raise ApiError(422, "item_closed", "Closed items cannot be edited; reopen the item first")
    changes = {}
    for f in ("title", "description", "priority", "due_date"):
        if f in body.model_fields_set:
            new = getattr(body, f)
            if new is None and f != "due_date":
                raise ApiError(422, "validation_error", f"{f} cannot be null")
            if new != getattr(item, f):
                changes[f] = (getattr(item, f), new)
    if item.version != body.expected_version:
        conflict(db, item_id)
    if not changes:
        return item
    if not guarded_update(db, item_id, body.expected_version, {k: v[1] for k, v in changes.items()}):
        conflict(db, item_id)
    for f, (old, new) in changes.items():
        log(db, item_id, user.id, "updated", f, old if f != "description" else None, new if f != "description" else None)
    db.commit()
    return reload(db, item_id)


# ---------------------------------------------------------------- assign / claim
@router.post("/{item_id}/assign", response_model=ItemOut)
def assign(item_id: int, body: AssignIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, lvl = get_item(db, user, item_id)
    authz.require(lvl, "claim")
    if item.status == S.closed:
        raise ApiError(422, "item_closed", "Closed items cannot be reassigned")
    # Authorize BEFORE inspecting the target, so a forbidden caller learns nothing about other users/teams.
    if body.expected_version is not None:
        authz.require(lvl, "reassign")
    elif body.assignee_id is not None and body.assignee_id != user.id:
        authz.require(lvl, "assign_other")
    target = None
    if body.assignee_id is not None:
        target = db.get(User, body.assignee_id)
        in_team = db.scalar(select(Membership.user_id).where(Membership.user_id == body.assignee_id, Membership.team_id == item.team_id))
        if not (target and target.is_active and in_team):
            raise ApiError(422, "invalid_assignee", "Assignee must be an active member of the item's team")
    old = item.assignee_id
    if body.expected_version is None:  # CLAIM: only succeeds while unassigned; atomic in one UPDATE
        if target is None:
            raise ApiError(422, "validation_error", "Claiming requires an assignee_id")
        if target.id != user.id:
            authz.require(lvl, "assign_other")
        r = db.execute(update(WorkItem).where(WorkItem.id == item_id, WorkItem.assignee_id.is_(None))
                       .values(assignee_id=target.id, version=WorkItem.version + 1, updated_at=func.now())
                       .returning(WorkItem.id).execution_options(synchronize_session=False)).first()
        if r is None:
            conflict(db, item_id, "already_assigned", "This item has already been claimed by someone else.")
        action = "claimed" if target.id == user.id else "assigned"
    else:  # REASSIGN / UNASSIGN: manager only, version-guarded
        authz.require(lvl, "reassign")
        if not guarded_update(db, item_id, body.expected_version, {"assignee_id": target.id if target else None}):
            conflict(db, item_id)
        action = "unassigned" if target is None else ("assigned" if old is None else "reassigned")
    log(db, item_id, user.id, action, "assignee_id", old, body.assignee_id,
        {"new_assignee": target.name if target else None})
    if target:
        enqueue(db, "notify_assignee", item_id, {"assignee_id": target.id, "assigned_by": user.id, "key": item.key})
    db.commit()
    return reload(db, item_id)


# ---------------------------------------------------------------- transition
@router.post("/{item_id}/transition", response_model=ItemOut)
def transition(item_id: int, body: TransitionIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, lvl = get_item(db, user, item_id)
    cur, to = item.status, body.to_status
    act = authz.transition_action(cur, to)
    if act == "work":
        if not authz.can_work(lvl, user, item):
            raise ApiError(403, "forbidden", "Only leads, or the assignee, can move this item through the workflow")
    else:
        authz.require(lvl, act)   # approve / reject / close / reopen are lead-only
    if to not in TRANSITIONS[cur]:
        raise ApiError(422, "invalid_transition", f"Cannot move from {cur.value} to {to.value}",
                       {"allowed": sorted(s.value for s in TRANSITIONS[cur])})
    if item.version != body.expected_version:
        conflict(db, item_id)
    vals = {"status": to, "resolved_at": now() if to == S.resolved else (None if to in (S.open, S.in_progress) else item.resolved_at)}
    if not guarded_update(db, item_id, body.expected_version, vals):
        conflict(db, item_id)
    name = {"approve": "approved", "reject": "changes_requested", "close": "closed", "reopen": "reopened", "work": "status_changed"}[act]
    log(db, item_id, user.id, name, "status", cur, to)
    db.commit()
    return reload(db, item_id)


# ---------------------------------------------------------------- comments / activity
@router.post("/{item_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(item_id: int, body: CommentIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    item, lvl = get_item(db, user, item_id)
    authz.require(lvl, "comment")
    c = Comment(work_item_id=item_id, author_id=user.id, body=body.body.strip())
    db.add(c)
    db.flush()
    log(db, item_id, user.id, "commented", meta={"comment_id": c.id})
    db.commit()
    return db.execute(select(Comment).where(Comment.id == c.id).execution_options(populate_existing=True)).scalar_one()


@router.get("/{item_id}/comments", response_model=Page[CommentOut])
def comments(item_id: int, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100),
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_item(db, user, item_id)
    total = db.scalar(select(func.count()).select_from(Comment).where(Comment.work_item_id == item_id))
    rows = db.scalars(select(Comment).where(Comment.work_item_id == item_id).order_by(Comment.created_at, Comment.id)
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)


@router.get("/{item_id}/activity", response_model=Page[ActivityOut])
def activity(item_id: int, page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=100),
             user: User = Depends(current_user), db: Session = Depends(get_db)):
    get_item(db, user, item_id)
    total = db.scalar(select(func.count()).select_from(Activity).where(Activity.work_item_id == item_id))
    rows = db.scalars(select(Activity).where(Activity.work_item_id == item_id).order_by(Activity.created_at.desc(), Activity.id.desc())
                      .limit(page_size).offset((page - 1) * page_size)).unique().all()
    return Page(items=rows, total=total, page=page, page_size=page_size)
