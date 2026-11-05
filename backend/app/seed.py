"""Seed script: plant + units + admin + demo users + synthetic demo dataset.

Run:  python -m app.seed
Idempotent: skips what already exists. Demo data is one batch (SYNTHETIC_DEMO_DATA)
so it can be deleted through the normal batch-delete flow once real data arrives.
"""
import math
import random
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.logging import setup_logging
from app.core.security import hash_password
from app.db import SessionLocal
from app.models import Plant, PlantData, Unit, UploadBatch, User, user_unit_access
from app.models.base import ROLE_ADMIN, ROLE_PLANT_USER
from app.models.plant import BATCH_STATUS_SUCCESS

PLANT_NAME = "GSPC Pipavav Power Corporation Ltd."

# (parameter, uom, daily_base, spread)  — daily means per-unit, per-day expected value
PARAM_DEFS = [
    ("gross_generation", "MU", 5.4, 1.6),        # million units/day @ ~100% PLF
    ("net_generation", "MU", 5.1, 1.5),
    ("plf", "%", 85.0, 25.0),                     # plant load factor
    ("aux_consumption_pct", "%", 6.2, 0.8),       # auxiliary consumption
    ("heat_rate", "kcal/kWh", 2050.0, 180.0),
    ("gas_consumption", "thousand NM3", 1450.0, 260.0),
    ("steam_flow", "TPH", 712.0, 90.0),
    ("steam_generation", "MT", 17100.0, 2200.0),
    ("hrsg_efficiency_pct", "%", 76.0, 4.0),
    ("gas_turbine_output", "MW", 78.0, 14.0),
]

DEMO_FILENAME = "SYNTHETIC_DEMO_DATA"
DAYS_BACK = 365


def _load_factor_for(day_index: int, rng: random.Random) -> float:
    """Plausible daily load factor 0.35..1.0 with an outage dip every ~45 days."""
    base = 0.72 + 0.16 * math.sin(day_index / 29.0)
    lf = max(0.35, min(1.0, base + rng.uniform(-0.08, 0.08)))
    if (day_index % 47) < 3:  # scheduled outage
        lf = rng.uniform(0.05, 0.2)
    return lf


def _synthetic_value(parameter: str, daily_base: float, lf: float, rng: random.Random) -> float:
    if parameter in ("plf",):
        return round(lf * 100.0, 2)
    if parameter == "gross_generation" or parameter == "net_generation":
        return round(daily_base * lf * rng.uniform(0.97, 1.03), 2)
    if parameter == "aux_consumption_pct":
        return round(5.4 + (1.0 - lf) * 1.6 + rng.uniform(-0.15, 0.15), 2)
    if parameter == "heat_rate":  # better heat rate at higher load
        v = 2250.0 - 220.0 * lf + rng.uniform(-25.0, 25.0)
        return round(max(1780.0, v), 1)
    if parameter == "gas_consumption":
        return round(daily_base * lf * rng.uniform(0.96, 1.04), 1)
    if parameter == "gas_turbine_output":
        return round(daily_base * lf * rng.uniform(0.98, 1.02), 1)
    # steam params track load too
    return round(daily_base * (0.55 + 0.45 * lf) * rng.uniform(0.98, 1.02), 1)


def seed_plant(db: Session) -> tuple[Plant, list[Unit]]:
    plant = db.scalar(select(Plant).where(Plant.name == PLANT_NAME))
    if plant is None:
        plant = Plant(name=PLANT_NAME, location="Pipavav, Amreli District, Gujarat")
        db.add(plant)
        db.flush()
    units: list[Unit] = []
    for n in (1, 2, 3):
        unit = db.scalar(
            select(Unit).where(Unit.plant_id == plant.id, Unit.unit_number == f"Unit {n}")
        )
        if unit is None:
            unit = Unit(plant_id=plant.id, unit_number=f"Unit {n}", capacity_mw=234.0)
            db.add(unit)
            units.append(unit)
        else:
            units.append(unit)
    db.flush()
    return plant, units


def seed_users(db: Session, units: list[Unit]) -> None:
    admin = db.scalar(select(User).where(User.email == settings.ADMIN_EMAIL))
    if admin is None:
        db.add(
            User(
                name="Plant Administrator",
                email=settings.ADMIN_EMAIL,
                password_hash=hash_password(settings.ADMIN_INITIAL_PASSWORD),
                role=ROLE_ADMIN,
            )
        )
    demo = db.scalar(select(User).where(User.email == settings.DEMO_PLANT_USER_EMAIL))
    if demo is None:
        new_demo = User(
            name="Demo Plant User",
            email=settings.DEMO_PLANT_USER_EMAIL,
            password_hash=hash_password(settings.DEMO_PLANT_USER_PASSWORD),
            role=ROLE_PLANT_USER,
        )
        db.add(new_demo)
        db.flush()
        for unit in units:
            db.execute(user_unit_access.insert().values(user_id=new_demo.id, unit_id=unit.id))


def seed_demo_data(db: Session, units: list[Unit]) -> int:
    existing = db.scalar(select(UploadBatch).where(UploadBatch.filename == DEMO_FILENAME))
    if existing is not None:
        return 0
    admin = db.scalar(select(User).where(User.email == settings.ADMIN_EMAIL))
    batch = UploadBatch(
        filename=DEMO_FILENAME,
        uploaded_by=admin.id,
        status=BATCH_STATUS_SUCCESS,
        rows_imported=0,
        rows_rejected=0,
    )
    db.add(batch)
    db.flush()

    today = date.today()
    start = today - timedelta(days=DAYS_BACK)
    rows: list[dict] = []
    rng = random.Random(20070401)  # deterministic seed: dataset is reproducible
    for unit in units:
        unit_index = int(unit.unit_number.split()[-1]) - 1
        for day_offset in range(DAYS_BACK):
            day_index = day_offset + unit_index * 17
            lf = _load_factor_for(day_index, rng)
            day = start + timedelta(days=day_offset)
            for parameter, uom, daily_base, _spread in PARAM_DEFS:
                rows.append(
                    {
                        "unit_id": unit.id,
                        "parameter": parameter,
                        "value": _synthetic_value(
                            parameter, daily_base * 0.9 + unit_index * 0.05, lf, rng
                        ),
                        "uom": uom,
                        "recorded_date": day,
                        "batch_id": batch.id,
                    }
                )
    db.bulk_insert_mappings(PlantData, rows)
    batch.rows_imported = len(rows)
    return len(rows)


def run() -> None:
    setup_logging()
    db: Session = SessionLocal()
    try:
        plant, units = seed_plant(db)
        seed_users(db, units)
        inserted = 0
        if settings.SEED_DEMO_DATA:
            inserted = seed_demo_data(db, units)
        db.commit()
        print(f"Seed complete: plant={plant.name!r} units={[u.unit_number for u in units]} demo_rows={inserted}")
    finally:
        db.close()


if __name__ == "__main__":
    run()
