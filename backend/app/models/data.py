import uuid
import datetime as dt
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Date,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, UuidType

# SQLite needs INTEGER PK for autoincrement; Postgres keeps BIGINT/BIGSERIAL
BigIntPk = BigInteger().with_variant(Integer(), "sqlite")


class PlantData(Base):
    __tablename__ = "plant_data"
    __table_args__ = (
        Index("ix_plant_data_unit_param_date", "unit_id", "parameter", "recorded_date"),
    )

    id: Mapped[int] = mapped_column(BigIntPk, primary_key=True, autoincrement=True)
    unit_id: Mapped[uuid.UUID] = mapped_column(
        UuidType, ForeignKey("units.id", ondelete="CASCADE"), nullable=False
    )
    parameter: Mapped[str] = mapped_column(String(100), nullable=False)
    value: Mapped[Decimal] = mapped_column(Numeric(14, 4), nullable=False)
    uom: Mapped[str | None] = mapped_column(String(20))
    recorded_date: Mapped[dt.date] = mapped_column(Date, nullable=False)
    batch_id: Mapped[uuid.UUID | None] = mapped_column(
        UuidType, ForeignKey("upload_batches.id", ondelete="CASCADE")
    )
