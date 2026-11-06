"""Paginated, filterable audit log viewer (ADMIN only)."""
import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.db import get_db
from app.models import AuditLog, User

router = APIRouter()

PAGE_SIZE_DEFAULT = 25


class AuditEntryOut(BaseModel):
    id: int
    user: dict | None  # {id, name}
    action: str
    payload: dict | None
    ip_address: str | None
    created_at: str


class PaginatedAudit(BaseModel):
    items: list[AuditEntryOut]
    total: int
    page: int
    page_size: int


@router.get("/audit", response_model=PaginatedAudit)
def list_audit(
    user_id: uuid.UUID | None = None,
    action: str | None = None,
    from_: _dt.date | None = Query(default=None, alias="from"),
    to: _dt.date | None = None,
    page: int = 1,
    page_size: int = PAGE_SIZE_DEFAULT,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> PaginatedAudit:
    page = max(1, page)
    page_size = max(1, min(page_size, 100))

    query = select(AuditLog)
    if user_id is not None:
        query = query.where(AuditLog.user_id == user_id)
    if action is not None:
        query = query.where(AuditLog.action == action.upper())
    if from_ is not None:
        query = query.where(AuditLog.created_at >= _dt.datetime(from_.year, from_.month, from_.day))
    if to is not None:
        query = query.where(AuditLog.created_at < _dt.datetime(to.year, to.month, to.day) + _dt.timedelta(days=1))

    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    entries = db.scalars(
        query.order_by(AuditLog.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()

    user_names = {
        u.id: u
        for u in db.scalars(
            select(User).where(User.id.in_([e.user_id for e in entries if e.user_id] or [None]))
        ).all()
    } if any(e.user_id for e in entries) else {}

    items = [
        AuditEntryOut(
            id=e.id,
            user={"id": str(e.user_id), "name": user_names[e.user_id].name} if e.user_id in user_names else None,
            action=e.action,
            payload=e.payload,
            ip_address=e.ip_address,
            created_at=e.created_at.isoformat() if e.created_at else "",
        )
        for e in entries
    ]
    return PaginatedAudit(items=items, total=total, page=page, page_size=page_size)
