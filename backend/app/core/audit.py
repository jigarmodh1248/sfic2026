import logging
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog

logger = logging.getLogger("audit")


def audit_log(
    db: Session,
    user_id: uuid.UUID | None,
    action: str,
    payload: dict[str, Any] | None,
    ip: str | None,
) -> None:
    """Write an audit row + structured log entry. Caller commits."""
    db.add(
        AuditLog(
            user_id=user_id,
            action=action,
            payload=payload or {},
            ip_address=ip,
        )
    )
    logger.info("audit %s", action, extra={"extra_fields": {
        **(payload or {}),
        "user_id": str(user_id) if user_id else None,
        "ip": ip,
    }})
