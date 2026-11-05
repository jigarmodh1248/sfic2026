import uuid
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Role = Literal["ADMIN", "PLANT_USER", "VIEWER"]


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    # Lax validation on purpose: the spec's own domain (gspc.local) is a
    # special-use/reserved name that strict SMTP validation (email-validator)
    # refuses. An internal plant system must accept it.
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=72)  # 72: bcrypt input limit
    role: Role
    unit_ids: list[uuid.UUID] = Field(default_factory=list)

    @field_validator("email")
    @classmethod
    def _basic_email(cls, v: str) -> str:
        v = v.strip().lower()
        local, _, domain = v.rpartition("@")
        if not local or not domain or "." not in domain:
            raise ValueError("must be a valid email address")
        return v


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    role: Role | None = None
    is_active: bool | None = None


class UnitsAssign(BaseModel):
    unit_ids: list[uuid.UUID]


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str
    is_active: bool
    unit_ids: list[uuid.UUID] = []


def serialize_user(db, user) -> UserOut:
    """Single source of truth for the user JSON shape (used by auth + admin routers)."""
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        unit_ids=[u.id for u in user.units],
    )
