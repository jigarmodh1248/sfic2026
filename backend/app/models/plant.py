import uuid
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Column,
    ForeignKey,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, UuidType, new_uuid


class Plant(Base):
    __tablename__ = "plants"

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))

    units: Mapped[list["Unit"]] = relationship(back_populates="plant", lazy="selectin")


BATCH_STATUS_SUCCESS = "SUCCESS"
BATCH_STATUS_PARTIAL = "PARTIAL"
BATCH_STATUS_FAILED = "FAILED"
BATCH_STATUS_DELETED = "DELETED"
BATCH_STATUSES = (BATCH_STATUS_SUCCESS, BATCH_STATUS_PARTIAL, BATCH_STATUS_FAILED, BATCH_STATUS_DELETED)


class Unit(Base):
    __tablename__ = "units"
    __table_args__ = (
        UniqueConstraint("plant_id", "unit_number", name="units_plant_unit_unique"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UuidType, primary_key=True, default=new_uuid)
    plant_id: Mapped[uuid.UUID] = mapped_column(
        UuidType, ForeignKey("plants.id", ondelete="CASCADE"), nullable=False
    )
    unit_number: Mapped[str] = mapped_column(String(20), nullable=False)
    capacity_mw: Mapped[Decimal | None] = mapped_column(Numeric(8, 2))

    plant: Mapped["Plant"] = relationship(back_populates="units")
