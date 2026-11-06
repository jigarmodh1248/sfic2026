"""Query execution + dynamic per-unit parameter listing; both access-scoped."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import audit_log
from app.core.deps import ensure_unit_access, get_client_ip, get_current_user
from app.db import get_db
from app.models import Unit, User
from app.schemas.query import QueryRequest, QueryResponse, QuerySummaryOut, QueryRowOut
from app.services.query import run_query, unit_parameters

router = APIRouter()


@router.post("/query", response_model=QueryResponse)
def execute_query(
    body: QueryRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> QueryResponse:
    ensure_unit_access(db, user, body.unit_id)

    unit = db.get(Unit, body.unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    if unit.plant_id != body.plant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unit does not belong to the selected plant")

    rows, summary = run_query(db, body.unit_id, body.parameters, body.period)

    audit_log(
        db, user.id, "QUERY_EXECUTED",
        {
            "plant_id": str(body.plant_id),
            "unit_id": str(body.unit_id),
            "period": body.period.model_dump(mode="json"),
            "parameters": body.parameters,
            "rows": len(rows),
        },
        get_client_ip(request),
    )
    db.commit()

    return QueryResponse(
        rows=[QueryRowOut(**r) for r in rows],
        summary=[QuerySummaryOut(**s) for s in summary],
    )


@router.get("/units/{unit_id}/parameters")
def get_unit_parameters(
    unit_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Dynamic parameter options for the frontend multi-select (data-driven, never hardcoded)."""
    ensure_unit_access(db, user, unit_id)
    return [{"parameter": name, "uom": uom} for name, uom in unit_parameters(db, unit_id)]
