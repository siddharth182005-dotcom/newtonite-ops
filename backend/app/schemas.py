from datetime import datetime
from typing import Generic, TypeVar

from email_validator import EmailNotValidError, validate_email
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .config import settings
from .models import Priority, Role, Status, WorkType

T = TypeVar("T")
ORM = ConfigDict(from_attributes=True)


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    page: int
    page_size: int


class UserBrief(BaseModel):
    model_config = ORM
    id: int
    name: str


class TeamBrief(BaseModel):
    model_config = ORM
    id: int
    name: str


class LoginIn(BaseModel):
    email: str
    password: str = Field(min_length=1, max_length=256)

    @field_validator("email")
    @classmethod
    def validate_login_email(cls, value: str) -> str:
        try:
            return validate_email(
                value,
                check_deliverability=False,
                test_environment=settings.environment != "production",
            ).normalized
        except EmailNotValidError as exc:
            raise ValueError(str(exc)) from exc


class MembershipOut(BaseModel):
    team_id: int
    team_name: str
    role: Role


class MeOut(BaseModel):
    id: int
    name: str
    email: str
    is_admin: bool
    memberships: list[MembershipOut]
    csrf_token: str


class ItemOut(BaseModel):
    model_config = ORM
    id: int
    key: str
    title: str
    description: str
    type: WorkType
    status: Status
    priority: Priority
    team: TeamBrief
    creator: UserBrief
    assignee: UserBrief | None
    due_date: datetime | None
    version: int
    created_at: datetime
    updated_at: datetime
    resolved_at: datetime | None


class ItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    type: WorkType
    priority: Priority = Priority.medium
    team_id: int
    due_date: datetime | None = None

    @field_validator("title")
    @classmethod
    def strip(cls, v: str):
        v = v.strip()
        if not v:
            raise ValueError("title must not be blank")
        return v


class ItemPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")
    expected_version: int = Field(ge=1)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    priority: Priority | None = None
    due_date: datetime | None = None  # explicit null clears; omit to leave unchanged


class AssignIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    assignee_id: int | None
    expected_version: int | None = Field(default=None, ge=1)  # omitted = "claim" mode


class TransitionIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    to_status: Status
    expected_version: int = Field(ge=1)


class CommentIn(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class CommentOut(BaseModel):
    model_config = ORM
    id: int
    author: UserBrief
    body: str
    created_at: datetime


class ActivityOut(BaseModel):
    model_config = ORM
    id: int
    actor: UserBrief
    action: str
    field: str | None
    old_value: str | None
    new_value: str | None
    meta: dict | None
    created_at: datetime
