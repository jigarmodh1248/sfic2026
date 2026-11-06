"""PDF report endpoint: same body as /query → streamed application/pdf."""
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.core.audit import audit_log
from app.core.deps import ensure_unit_access, get_client_ip, get_current_user
from app.db import get_db
from app.models import Plant, Unit, User
from app.schemas.query import QueryRequest
from app.services.pdf import render_report
from app.services.query import expand_period, period_label, run_query

router = APIRouter()


@router.post("/report/pdf")
def download_report_pdf(
    body: QueryRequest,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    ensure_unit_access(db, user, body.unit_id)

    unit = db.get(Unit, body.unit_id)
    if unit is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unit not found")
    if unit.plant_id != body.plant_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unit does not belong to the selected plant")
    plant = db.get(Plant, unit.plant_id)
    plant_name = plant.name if plant else "Unknown plant"

    rows, _summary = run_query(db, body.unit_id, body.parameters, body.period)
    parameters_selected = ", ".join(body.parameters) if body.parameters else "All parameters"

    pdf = render_report(
        plant_name=plant_name,
        unit_number=unit.unit_number,
        period_text=f"{period_label(body.period)} "
        f"({expand_period(body.period)[0].isoformat()} … {expand_period(body.period)[1].isoformat()})",
        parameters_selected=parameters_selected,
        generated_by=user.name,
        rows=rows,
    )

    audit_log(
        db, user.id, "PDF_DOWNLOADED",
        {
            "plant_id": str(body.plant_id),
            "unit_id": str(body.unit_id),
            "period": body.period.model_dump(mode="json"),
            "parameters": body.parameters,
            "file_size": len(pdf),
        },
        get_client_ip(request),
    )
    db.commit()

    filename = f"{unit.unit_number.replace(' ', '_')}_{period_label(body.period).replace(' to ', '_').replace(' ', '')}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
