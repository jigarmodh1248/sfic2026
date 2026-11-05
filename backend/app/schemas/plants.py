import uuid
from decimal import Decimal

from pydantic import BaseModel


class PlantOut(BaseModel):
    id: uuid.UUID
    name: str
    location: str | None


class UnitOut(BaseModel):
    id: uuid.UUID
    plant_id: uuid.UUID
    unit_number: str
    capacity_mw: Decimal | None
