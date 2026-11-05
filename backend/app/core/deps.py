import uuid

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db import get_db
from app.models import User, Unit, user_unit_access
from app.models.base import ROLE_ADMIN

bearer_scheme = HTTPBearer(auto_error=False)


def get_client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else None


def get_current_user(
    db: Session = Depends(get_db),
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> User:
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    user_id = decode_token(credentials.credentials, "access")
    if user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = db.get(User, uuid.UUID(user_id))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User is not active")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != ROLE_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin privileges required")
    return user


def get_allowed_unit_ids(db: Session, user: User) -> set[uuid.UUID]:
    """ADMIN sees every unit; others only the units assigned to them."""
    if user.role == ROLE_ADMIN:
        return {row[0] for row in db.execute(select(Unit.id)).all()}
    rows = db.execute(
        select(user_unit_access.c.unit_id).where(user_unit_access.c.user_id == user.id)
    ).all()
    return {row[0] for row in rows}


def ensure_unit_access(db: Session, user: User, unit_id: uuid.UUID) -> None:
    if unit_id not in get_allowed_unit_ids(db, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "You do not have access to this unit")
