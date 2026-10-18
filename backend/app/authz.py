"""Centralised authorization. Every protected route resolves the caller's TEAM level and checks it here.

Levels: viewer=1 < member=2 < lead=3 < admin=4 (global is_admin users are admin everywhere).
Non-members never reach these checks: security.get_item answers 404 for items outside the caller's teams.
"""
from .errors import ApiError
from .models import Status, User, WorkItem
from .security import LEAD, MEMBER, VIEWER

S = Status
PERMISSIONS = {  # action -> minimum team level
    "read": VIEWER, "create": MEMBER, "comment": MEMBER, "claim": MEMBER,
    "assign_other": LEAD, "reassign": LEAD, "edit_any": LEAD,
    "approve": LEAD, "reject": LEAD, "close": LEAD, "reopen": LEAD,
}
NAMES = {1: "viewer", 2: "member", 3: "lead", 4: "admin"}

TRANSITIONS = {
    S.open: {S.in_progress, S.blocked},
    S.in_progress: {S.open, S.blocked, S.awaiting_approval},
    S.awaiting_approval: {S.resolved, S.in_progress},   # resolved = approval (lead only); in_progress = changes requested (lead only)
    S.blocked: {S.open, S.in_progress},
    S.resolved: {S.closed, S.open, S.in_progress},       # closed = lead; open/in_progress = reopen (lead)
    S.closed: {S.open},                                  # reopen (lead)
}
DONE = (S.resolved, S.closed)


def require(lvl: int, action: str):
    need = PERMISSIONS[action]
    if lvl < need:
        raise ApiError(403, "forbidden", f"This action requires the {NAMES[need]} role or higher in the item's team")


def can_edit(lvl: int, user: User, item: WorkItem) -> bool:
    return lvl >= PERMISSIONS["edit_any"] or (lvl >= MEMBER and user.id in (item.creator_id, item.assignee_id))


def can_work(lvl: int, user: User, item: WorkItem) -> bool:
    """Ordinary workflow moves: leads, or a member who is the assignee."""
    return lvl >= LEAD or (lvl >= MEMBER and item.assignee_id == user.id)


def transition_action(cur: Status, to: Status) -> str:
    if to == S.resolved:
        return "approve"            # nobody below lead may mark an item resolved: approval cannot be bypassed
    if cur == S.awaiting_approval:
        return "reject"
    if to == S.closed:
        return "close"
    if cur in DONE:
        return "reopen"
    return "work"
