import enum
from datetime import datetime

from sqlalchemy import (Boolean, Computed, DateTime, Enum, ForeignKey, Index, Integer,
                        String, Text, UniqueConstraint, func)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class WorkType(str, enum.Enum):
    incident = "incident"; customer_issue = "customer_issue"; payment_investigation = "payment_investigation"
    compliance_request = "compliance_request"; task = "task"


class Status(str, enum.Enum):
    open = "open"; in_progress = "in_progress"; awaiting_approval = "awaiting_approval"
    blocked = "blocked"; resolved = "resolved"; closed = "closed"


class Priority(str, enum.Enum):
    critical = "critical"; high = "high"; medium = "medium"; low = "low"


class Role(str, enum.Enum):
    viewer = "viewer"; member = "member"; lead = "lead"; admin = "admin"


def E(cls):
    return Enum(cls, native_enum=False, length=30, create_constraint=True,
                name=f"ck_{cls.__name__.lower()}", validate_strings=True,
                values_callable=lambda e: [m.value for m in e])


TS = DateTime(timezone=True)


class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(254), unique=True)  # stored lowercase
    password_hash: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())


class Team(Base):
    __tablename__ = "teams"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())


class Membership(Base):
    __tablename__ = "memberships"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    role: Mapped[Role] = mapped_column(E(Role))
    team: Mapped[Team] = relationship(lazy="joined")
    __table_args__ = (Index("ix_memberships_team", "team_id"),)


class SessionRow(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    csrf_token: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(TS)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())


class WorkItem(Base):
    __tablename__ = "work_items"
    __mapper_args__ = {"eager_defaults": True}
    id: Mapped[int] = mapped_column(primary_key=True)
    key: Mapped[str] = mapped_column(String(20), Computed("'OPS-' || (1000 + id)", persisted=True), unique=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    type: Mapped[WorkType] = mapped_column(E(WorkType))
    status: Mapped[Status] = mapped_column(E(Status), default=Status.open)
    priority: Mapped[Priority] = mapped_column(E(Priority), default=Priority.medium)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    assignee_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    due_date: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    team: Mapped[Team] = relationship(lazy="joined")
    creator: Mapped[User] = relationship(foreign_keys=[creator_id], lazy="joined")
    assignee: Mapped[User | None] = relationship(foreign_keys=[assignee_id], lazy="joined")
    __table_args__ = (
        Index("ix_wi_team_status", "team_id", "status"),
        Index("ix_wi_assignee_status", "assignee_id", "status"),
        Index("ix_wi_priority", "priority"),
        Index("ix_wi_due", "due_date"),
        Index("ix_wi_updated", "updated_at"),
    )


class Comment(Base):
    __tablename__ = "comments"
    id: Mapped[int] = mapped_column(primary_key=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"))
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    author: Mapped[User] = relationship(lazy="joined")
    __table_args__ = (Index("ix_comments_item", "work_item_id", "created_at"),)


class Activity(Base):
    __tablename__ = "activity_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"))
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(40))
    field: Mapped[str | None] = mapped_column(String(40))
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    meta: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    actor: Mapped[User] = relationship(lazy="joined")
    __table_args__ = (Index("ix_activity_item", "work_item_id", "created_at", "id"),
                      Index("ix_activity_created", "created_at"))


class IdempotencyKey(Base):
    __tablename__ = "idempotency_keys"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    key: Mapped[str] = mapped_column(String(128))
    fingerprint: Mapped[str] = mapped_column(String(64))
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    __table_args__ = (UniqueConstraint("user_id", "key", name="uq_idem_user_key"),)


class OutboxJob(Base):
    """Transactional outbox: inserted in the SAME transaction as the state change that caused it."""
    __tablename__ = "outbox_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    job_type: Mapped[str] = mapped_column(String(50))
    payload: Mapped[dict] = mapped_column(JSONB)
    work_item_id: Mapped[int | None] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(12), default="pending", server_default="pending")  # pending|processing|done|dead
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    locked_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
    processed_at: Mapped[datetime | None] = mapped_column(TS, nullable=True)
    __table_args__ = (Index("ix_outbox_due", "status", "next_attempt_at"),)


class Notification(Base):
    """Result of the notify_assignee job. UNIQUE(job_id) makes processing idempotent."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    work_item_id: Mapped[int] = mapped_column(ForeignKey("work_items.id", ondelete="CASCADE"))
    message: Mapped[str] = mapped_column(Text)
    job_id: Mapped[int] = mapped_column(ForeignKey("outbox_jobs.id", ondelete="CASCADE"), unique=True)
    created_at: Mapped[datetime] = mapped_column(TS, server_default=func.now())
