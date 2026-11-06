"""Excel upload management (ADMIN only): upload, list, detail, soft delete, template."""
import uuid

from typing import NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.orm import Session

from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, require_admin
from app.db import get_db
from app.models import PlantData, Unit, UploadBatch, User
from app.models.plant import (
    BATCH_STATUS_DELETED,
    BATCH_STATUS_FAILED,
    BATCH_STATUS_PARTIAL,
    BATCH_STATUS_SUCCESS,
)
from app.schemas.uploads import (
    BatchPreviewRecord,
    PaginatedUploads,
    UploadBatchDetail,
    UploadBatchOut,
    UploadError,
    UploadSummary,
)
from app.services.excel import UnsupportedFormatError, build_template_xlsx, parse_upload

router = APIRouter()

PAGE_SIZE_DEFAULT = 20


def _known_units(db: Session) -> dict[str, uuid.UUID]:
    """unit_number -> unit_id map (normalized keys). Single-plant MVP: unit numbers
    are treated as globally unique; multi-plant collision is noted in phase 11."""
    rows = db.execute(select(Unit.unit_number, Unit.id)).all()
    return {" ".join(str(number).split()).lower(): unit_id for number, unit_id in rows}


def _batch_out(db: Session, batch: UploadBatch) -> UploadBatchOut:
    uploader = db.get(User, batch.uploaded_by)
    return UploadBatchOut(
        id=batch.id,
        filename=batch.filename,
        uploaded_by_name=uploader.name if uploader else "unknown",
        uploaded_at=batch.uploaded_at.isoformat() if batch.uploaded_at else "",
        status=batch.status,
        rows_imported=batch.rows_imported,
        rows_rejected=batch.rows_rejected,
    )


@router.get("/uploads/template")
def download_template(admin: User = Depends(require_admin)) -> Response:
    return Response(
        content=build_template_xlsx(),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="gspc-import-template.xlsx"'},
    )


@router.post("/uploads", response_model=UploadSummary)
def create_upload(
    request: Request,
    file: UploadFile,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UploadSummary:
    ip = get_client_ip(request)
    content = file.file.read()
    filename = file.filename or "unnamed"

    if len(content) > settings.MAX_UPLOAD_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds the {settings.MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
        )

    def _fail_batch(error_message: str, code: int) -> NoReturn:
        """Persist a FAILED batch for audit + return the 4xx it mirrors."""
        batch = UploadBatch(
            filename=filename,
            uploaded_by=admin.id,
            status=BATCH_STATUS_FAILED,
            rows_imported=0,
            rows_rejected=0,
            error_report={"error": error_message},
        )
        db.add(batch)
        db.flush()
        audit_log(db, admin.id, "EXCEL_UPLOAD", {
            "batch_id": str(batch.id), "filename": filename,
            "rows_imported": 0, "rows_rejected": 0, "status": BATCH_STATUS_FAILED,
        }, ip)
        db.commit()
        raise HTTPException(status_code=code, detail=error_message)

    try:
        parsed = parse_upload(content, filename, _known_units(db))
    except UnsupportedFormatError as exc:
        _fail_batch(str(exc), status.HTTP_400_BAD_REQUEST)

    if parsed.missing_columns:
        _fail_batch(f"Missing required column(s): {', '.join(parsed.missing_columns)}", status.HTTP_400_BAD_REQUEST)

    threshold = settings.BATCH_REJECT_THRESHOLD_PCT
    if parsed.row_count == 0 or parsed.rejected_pct > threshold:
        status_final = BATCH_STATUS_FAILED     # whole batch rejected, nothing imported
    elif parsed.errors:
        status_final = BATCH_STATUS_PARTIAL    # imported, but some rows were dropped
    else:
        status_final = BATCH_STATUS_SUCCESS

    batch = UploadBatch(
        filename=filename,
        uploaded_by=admin.id,
        status=status_final,
        rows_imported=len(parsed.rows) if status_final != BATCH_STATUS_FAILED else 0,
        rows_rejected=len(parsed.errors) if status_final != BATCH_STATUS_FAILED else parsed.row_count,
        error_report=_error_report(parsed),
    )
    db.add(batch)
    db.flush()

    if status_final != BATCH_STATUS_FAILED and parsed.rows:
        rows = [{**r, "batch_id": batch.id} for r in parsed.rows]
        db.bulk_insert_mappings(PlantData, rows)

    audit_log(db, admin.id, "EXCEL_UPLOAD", {
        "batch_id": str(batch.id),
        "filename": filename,
        "rows_imported": batch.rows_imported,
        "rows_rejected": batch.rows_rejected,
        "status": status_final,
    }, ip)
    db.commit()
    return UploadSummary(
        batch_id=batch.id,
        filename=filename,
        rows_imported=batch.rows_imported,
        rows_rejected=batch.rows_rejected,
        status=status_final,
        errors=[UploadError(**e) for e in parsed.errors],
    )


def _error_report(parsed) -> dict:
    report = {"columns_found": parsed.columns_found, "row_count": parsed.row_count}
    if parsed.errors:
        report["errors"] = parsed.errors
    return report


@router.get("/uploads", response_model=PaginatedUploads)
def list_batches(
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PaginatedUploads:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))
    total = db.scalar(select(func.count(UploadBatch.id))) or 0
    batches = db.scalars(
        select(UploadBatch).order_by(UploadBatch.uploaded_at.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginatedUploads(
        items=[_batch_out(db, b) for b in batches],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/uploads/{batch_id}", response_model=UploadBatchDetail)
def get_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UploadBatchDetail:
    batch = db.get(UploadBatch, batch_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found")
    out = _batch_out(db, batch)
    return UploadBatchDetail(**out.model_dump(), error_report=batch.error_report)


@router.get("/uploads/{batch_id}/preview", response_model=list[BatchPreviewRecord])
def preview_batch(
    batch_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[BatchPreviewRecord]:
    """First 10 imported records of a batch, in import order — admin "what did I upload" view."""
    if db.get(UploadBatch, batch_id) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found")
    rows = db.execute(
        select(
            PlantData.recorded_date,
            PlantData.parameter,
            PlantData.value,
            PlantData.uom,
        )
        .where(PlantData.batch_id == batch_id)
        .order_by(PlantData.id)
        .limit(10)
    ).all()
    return [
        BatchPreviewRecord(recorded_date=d.isoformat(), parameter=p, value=float(v), uom=uom)
        for d, p, v, uom in rows
    ]


@router.delete("/uploads/{batch_id}", status_code=204)
def delete_batch(
    batch_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    batch = db.get(UploadBatch, batch_id)
    if batch is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Batch not found")
    # soft-delete the batch, hard-remove its data rows (CASCADE semantics, explicit)
    removed = db.execute(sa_delete(PlantData).where(PlantData.batch_id == batch_id)).rowcount
    batch.status = BATCH_STATUS_DELETED
    audit_log(db, admin.id, "BATCH_DELETED", {
        "batch_id": str(batch_id),
        "filename": batch.filename,
        "rows_removed": removed,
    }, get_client_ip(request))
    db.commit()
