"""Plants & units listing, scoped by unit access (non-admin sees only assigned)."""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import get_allowed_unit_ids, get_current_user
from app.db import get_db
from app.models import Plant, Unit, User
from app.models.base import ROLE_ADMIN
from app.schemas.plants import PlantOut, UnitOut

router = APIRouter()


@router.get("/plants", response_model=list[PlantOut])
def list_plants(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PlantOut]:
    allowed = get_allowed_unit_ids(db, user)
    plants = db.scalars(select(Plant).order_by(Plant.name)).all()
    out: list[PlantOut] = []
    for plant in plants:
        if user.role == ROLE_ADMIN:
            out.append(PlantOut(id=plant.id, name=plant.name, location=plant.location))
            continue
        if any(u.id in allowed for u in plant.units):
            out.append(PlantOut(id=plant.id, name=plant.name, location=plant.location))
    return out


@router.get("/units", response_model=list[UnitOut])
def list_units(
    plant_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UnitOut]:
    allowed = get_allowed_unit_ids(db, user)
    query = select(Unit).order_by(Unit.unit_number)
    if plant_id is not None:
        query = query.where(Unit.plant_id == plant_id)
    units = db.scalars(query).all()
    return [
        UnitOut(id=u.id, plant_id=u.plant_id, unit_number=u.unit_number, capacity_mw=u.capacity_mw)
        for u in units
        if u.id in allowed
    ]
