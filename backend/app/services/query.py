"""Query engine: period expansion + unit/parameter/date filtering + summary stats."""
from __future__ import annotations

import calendar
import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlantData
from app.schemas.query import Period


def expand_period(period: Period) -> tuple[dt.date, dt.date]:
    """Inclusive [start, end] date range for any period mode."""
    if period.mode == "DAY":
        return period.day, period.day
    if period.mode == "MONTH":
        year, month = (int(x) for x in period.month.split("-"))
        last_day = calendar.monthrange(year, month)[1]
        return dt.date(year, month, 1), dt.date(year, month, last_day)
    if period.mode == "YEAR":
        year = int(period.year)
        return dt.date(year, 1, 1), dt.date(year, 12, 31)
    # RANGE
    return period.start, period.end


def period_label(period: Period) -> str:
    if period.mode == "DAY":
        return period.day.isoformat()
    if period.mode == "MONTH":
        return period.month
    if period.mode == "YEAR":
        return period.year
    return f"{period.start.isoformat()} to {period.end.isoformat()}"


def run_query(
    db: Session,
    unit_id,
    parameters: list[str],
    period: Period,
) -> tuple[list[dict], list[dict]]:
    """Returns (rows, summary). Rows sorted by date then parameter; summary per parameter."""
    start, end = expand_period(period)
    query = (
        select(
            PlantData.recorded_date,
            PlantData.parameter,
            PlantData.value,
            PlantData.uom,
        )
        .where(PlantData.unit_id == unit_id)
        .where(PlantData.recorded_date.between(start, end))
        .order_by(PlantData.recorded_date, PlantData.parameter)
    )
    if parameters:
        query = query.where(PlantData.parameter.in_(parameters))

    rows: list[dict] = []
    stats: dict[str, dict] = {}
    for recorded_date, parameter, value, uom in db.execute(query).all():
        numeric = float(value)
        rows.append(
            {"recorded_date": recorded_date, "parameter": parameter, "value": numeric, "uom": uom}
        )
        s = stats.setdefault(parameter, {"min": numeric, "max": numeric, "sum": 0.0, "n": 0, "uom": uom})
        s["min"] = min(s["min"], numeric)
        s["max"] = max(s["max"], numeric)
        s["sum"] += numeric
        s["n"] += 1
        if s["uom"] is None and uom is not None:
            s["uom"] = uom

    summary = [
        {
            "parameter": parameter,
            "min": round(s["min"], 4),
            "max": round(s["max"], 4),
            "avg": round(s["sum"] / s["n"], 4),
        }
        for parameter, s in sorted(stats.items())
    ]
    return rows, summary


def unit_parameters(db: Session, unit_id) -> list[tuple[str, str | None]]:
    """Distinct parameters (with a representative uom) ever recorded for a unit."""
    pairs: dict[str, str | None] = {}
    for parameter, uom in db.execute(
        select(PlantData.parameter, PlantData.uom)
        .where(PlantData.unit_id == unit_id)
        .distinct()
    ).all():
        if parameter not in pairs or (pairs[parameter] is None and uom is not None):
            pairs[parameter] = uom
    return sorted(pairs.items())
