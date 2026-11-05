import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    ForeignKey,
    String,
    Table,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UuidType, new_uuid


class User(Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('ADMIN','PLANT_USER','VIEWER')", name="role_valid"),)

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    units: Mapped[list["Unit"]] = relationship(
        "Unit", secondary="user_unit_access", lazy="selectin", viewonly=True
    )


user_unit_access = Table(
    "user_unit_access",
    Base.metadata,
    Column("user_id", UuidType, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("unit_id", UuidType, ForeignKey("units.id", ondelete="CASCADE"), primary_key=True),
)
