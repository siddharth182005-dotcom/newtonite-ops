import os
from pathlib import Path

from sqlalchemy.engine import make_url

TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://newtonite:newtonite@localhost:5432/newtonite_test")
DEVELOPMENT_URL = os.environ.get("DATABASE_URL")
if DEVELOPMENT_URL is None:
    backend_dir = Path(__file__).resolve().parents[2]
    for env_file in (backend_dir / ".env", backend_dir / ".env.example"):
        if not env_file.exists():
            continue
        for line in env_file.read_text(encoding="utf-8").splitlines():
            key, separator, value = line.partition("=")
            if separator and key.strip() == "DATABASE_URL":
                DEVELOPMENT_URL = value.strip().strip("\"'")
                break
        if DEVELOPMENT_URL:
            break


def database_name(url):
    name = make_url(url).database
    return name.casefold() if name else None


test_database = database_name(TEST_URL)
if not test_database or not test_database.endswith("_test"):
    raise RuntimeError("TEST_DATABASE_URL must target a dedicated database whose name ends in '_test'")
if DEVELOPMENT_URL and test_database == database_name(DEVELOPMENT_URL):
    raise RuntimeError("Refusing to run destructive tests against the development database")

os.environ["DATABASE_URL"] = TEST_URL  # must precede app imports

import httpx  # noqa: E402
import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Membership, Role, Team, User  # noqa: E402
from app.security import hash_password  # noqa: E402

PW = "Test-Passw0rd!"


ALEMBIC_INI = os.path.join(os.path.dirname(__file__), "..", "..", "alembic.ini")


def alembic_cfg():
    from alembic.config import Config
    cfg = Config(os.path.abspath(ALEMBIC_INI))
    cfg.set_main_option("script_location", os.path.abspath(os.path.join(os.path.dirname(ALEMBIC_INI), "alembic")))
    return cfg


@pytest.fixture(scope="session", autouse=True)
def schema():
    # The suite DROPS every table in the target database: refuse anything not clearly a test database.
    if not engine.url.database or not engine.url.database.endswith("_test"):
        raise RuntimeError("Refusing to wipe a database that is not explicitly named as a test database")
    with engine.connect() as connection:
        actual_database = connection.scalar(text("SELECT current_database()"))
    if not actual_database or not actual_database.endswith("_test"):
        raise RuntimeError("Refusing to wipe a connected database that is not explicitly named as a test database")
    if DEVELOPMENT_URL and actual_database.casefold() == database_name(DEVELOPMENT_URL):
        raise RuntimeError("Refusing to run destructive tests against the development database")
    from alembic import command
    Base.metadata.drop_all(engine)
    with engine.begin() as c:
        c.execute(text("DROP TABLE IF EXISTS alembic_version"))
    command.upgrade(alembic_cfg(), "head")   # the schema under test is the one the MIGRATIONS produce
    yield


@pytest.fixture
def world():
    with engine.begin() as c:
        c.execute(text("TRUNCATE users, teams, memberships, sessions, work_items, comments, activity_logs, idempotency_keys, outbox_jobs, notifications RESTART IDENTITY CASCADE"))
    h = hash_password(PW)
    with SessionLocal() as db:
        names = ["admin", "lead", "m1", "m2", "viewer", "outsider"]
        us = {n: User(name=n.title(), email=f"{n}@t.dev", password_hash=h, is_admin=(n == "admin")) for n in names}
        a, b = Team(name="A"), Team(name="B")
        db.add_all([*us.values(), a, b]); db.flush()
        for n, t, r in [("lead", a, Role.lead), ("m1", a, Role.member), ("m2", a, Role.member),
                        ("viewer", a, Role.viewer), ("outsider", b, Role.member)]:
            db.add(Membership(user_id=us[n].id, team_id=t.id, role=r))
        db.commit()
        return {"A": a.id, "B": b.id, **{n: u.id for n, u in us.items()}}


@pytest_asyncio.fixture
async def login():
    made = []

    async def _login(name, quiet=False):
        """quiet=True returns HTTP 500s instead of re-raising server exceptions (used by fault-injection tests)."""
        c = httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=not quiet), base_url="http://test")
        r = await c.post("/api/v1/auth/login", json={"email": f"{name}@t.dev", "password": PW})
        assert r.status_code == 200, r.text
        c.headers["X-CSRF-Token"] = r.json()["csrf_token"]
        made.append(c)
        return c

    yield _login
    for c in made:
        await c.aclose()


async def mk(c, team, **kw):
    r = await c.post("/api/v1/work-items", json={"title": "T", "type": "task", "team_id": team, **kw})
    assert r.status_code == 201, r.text
    return r.json()
