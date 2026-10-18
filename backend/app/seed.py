"""Development-only seed (~3,000 work items). Safe to re-run: exits if users already exist. Refuses in production."""
import random
from datetime import timedelta

from sqlalchemy import insert, select

from .config import settings
from .db import SessionLocal
from .models import Activity, Comment, Membership, Priority, Role, Status, Team, User, WorkItem, WorkType
from .security import hash_password, now

PW = "ChangeMe!Dev123"  # development only
N_ITEMS = 3000
USERS = [("Ada Admin", "admin@newtonite.dev", True), ("Lena Lead", "lead@newtonite.dev", False), ("Leo Lead", "lead2@newtonite.dev", False),
         ("Sam Member", "sam@newtonite.dev", False), ("Priya Member", "priya@newtonite.dev", False), ("Mia Member", "mia@newtonite.dev", False),
         ("Noah Member", "noah@newtonite.dev", False), ("Vic Viewer", "viewer@newtonite.dev", False), ("Vera Viewer", "viewer2@newtonite.dev", False),
         ("Omar Outsider", "omar@newtonite.dev", False)]
TEAMS = {"Platform": "Core platform & infrastructure", "Support": "Customer operations", "Payments": "Payments & reconciliation", "Compliance": "Regulatory & audit"}
MEMBERS = {  # email -> {team: role}
    "lead@newtonite.dev": {"Platform": Role.lead, "Support": Role.member}, "lead2@newtonite.dev": {"Payments": Role.lead, "Compliance": Role.lead},
    "sam@newtonite.dev": {"Platform": Role.member, "Payments": Role.member}, "priya@newtonite.dev": {"Platform": Role.member, "Support": Role.lead},
    "mia@newtonite.dev": {"Support": Role.member, "Compliance": Role.member}, "noah@newtonite.dev": {"Payments": Role.member},
    "viewer@newtonite.dev": {"Platform": Role.viewer, "Support": Role.viewer}, "viewer2@newtonite.dev": {"Payments": Role.viewer, "Compliance": Role.viewer},
    "omar@newtonite.dev": {"Compliance": Role.member}}
NOUNS = ["login", "checkout", "invoice", "refund", "webhook", "export", "report", "API", "dashboard", "email", "ledger", "audit trail", "onboarding", "SSO", "queue"]
VERBS = ["fails", "is slow", "returns errors", "needs review", "shows wrong totals", "times out", "needs approval", "is duplicated", "cannot be accessed", "needs update"]


def run(n_items: int = N_ITEMS):
    if settings.environment == "production":
        raise SystemExit("Refusing to seed in production")
    rnd, t0 = random.Random(7), now()
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)):
            print("Already seeded (drop the database or run on a clean one to reseed)"); return
        h = hash_password(PW)
        users = {e: User(name=n, email=e, password_hash=h, is_admin=a) for n, e, a in USERS}
        teams = {n: Team(name=n, description=d) for n, d in TEAMS.items()}
        db.add_all([*users.values(), *teams.values()]); db.flush()
        for e, tm in MEMBERS.items():
            for tn, r in tm.items():
                db.add(Membership(user_id=users[e].id, team_id=teams[tn].id, role=r))
        db.flush()
        roster = {tn: [(e, r) for e, tm in MEMBERS.items() for t2, r in tm.items() if t2 == tn] for tn in TEAMS}
        rows = []
        for i in range(n_items):
            tn = rnd.choice(list(TEAMS)); team = teams[tn]
            creators = [users[e].id for e, r in roster[tn] if r != Role.viewer]
            workers = [users[e].id for e, r in roster[tn] if r != Role.viewer]
            status = rnd.choices(list(Status), weights=[25, 20, 8, 7, 20, 20])[0]
            assignee = None if status == Status.open and rnd.random() < .6 else rnd.choice(workers)
            if status in (Status.in_progress, Status.awaiting_approval, Status.blocked) and assignee is None: assignee = rnd.choice(workers)
            created = t0 - timedelta(days=rnd.random() * 90)
            updated = created + (t0 - created) * rnd.random()
            rows.append(dict(title=f"{rnd.choice(NOUNS).capitalize()} {rnd.choice(VERBS)} ({tn.lower()} #{i})", description=f"Seeded work item #{i} for the {tn} team.",
                             type=rnd.choice(list(WorkType)), status=status, priority=rnd.choices(list(Priority), weights=[8, 20, 42, 30])[0],
                             team_id=team.id, creator_id=rnd.choice(creators), assignee_id=assignee, version=1, created_at=created, updated_at=updated,
                             due_date=(t0 + timedelta(days=rnd.randint(-10, 20))) if rnd.random() < .6 else None,
                             resolved_at=updated if status in (Status.resolved, Status.closed) else None))
        ids = [r[0] for r in db.execute(insert(WorkItem).returning(WorkItem.id), rows)]
        db.execute(insert(Activity), [dict(work_item_id=i, actor_id=r["creator_id"], action="created", created_at=r["created_at"]) for i, r in zip(ids, rows)])
        db.execute(insert(Activity), [dict(work_item_id=i, actor_id=r["assignee_id"], action="claimed", field="assignee_id", new_value=str(r["assignee_id"]),
                                           created_at=r["created_at"] + timedelta(minutes=5)) for i, r in zip(ids, rows) if r["assignee_id"]])
        db.execute(insert(Comment), [dict(work_item_id=i, author_id=r["creator_id"], body="Looking into this.", created_at=r["created_at"] + timedelta(hours=1))
                                     for i, r in zip(ids, rows) if rnd.random() < .15])
        db.commit(); print(f"Seeded {len(USERS)} users, {len(TEAMS)} teams, {n_items} work items. Password for all demo users: {PW}")


if __name__ == "__main__":
    run()
