"""Auth endpoints: login (rate-limited), refresh, logout, me."""
import datetime as _dt
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from slowapi import Limiter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security as sec
from app.core.audit import audit_log
from app.core.config import settings
from app.core.deps import get_client_ip, get_current_user
from app.core.security import (
    create_access_token,
    create_refresh_token,
    verify_password,
)
from app.core.token_store import is_revoked, revoke
from app.db import get_db
from app.models import User, user_unit_access
from app.schemas.auth import AccessTokenResponse, LoginRequest, RefreshRequest, TokenPair, UserOut

router = APIRouter()
limiter = Limiter(key_func=get_client_ip)


def _user_out(db: Session, user: User) -> UserOut:
    unit_ids = [
        row[0]
        for row in db.execute(
            select(user_unit_access.c.unit_id).where(user_unit_access.c.user_id == user.id)
        ).all()
    ]
    return UserOut(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        is_active=user.is_active,
        unit_ids=unit_ids,
    )


@router.post("/auth/login", response_model=TokenPair)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)) -> TokenPair:
    user = db.scalar(select(User).where(User.email == body.email))
    ip = get_client_ip(request)
    if user is None or not user.is_active or not verify_password(body.password, user.password_hash):
        audit_log(
            db,
            user.id if user else None,
            "LOGIN_FAILURE",
            {"email": body.email, "reason": "invalid_credentials_or_inactive"},
            ip,
        )
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    audit_log(db, user.id, "LOGIN_SUCCESS", {"email": user.email}, ip)
    db.commit()
    return TokenPair(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        user=_user_out(db, user),
    )


@router.post("/auth/refresh", response_model=AccessTokenResponse)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> AccessTokenResponse:
    try:
        payload = sec.jwt.decode(body.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except sec.JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if payload.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")
    if is_revoked(payload.get("jti", "")):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token revoked, please login again")
    user = db.get(User, uuid.UUID(payload["sub"]))
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User is not active")
    return AccessTokenResponse(access_token=create_access_token(str(user.id)))


@router.post("/auth/logout", status_code=204)
def logout(body: RefreshRequest, user: User = Depends(get_current_user)) -> None:
    try:
        payload = sec.jwt.decode(body.refresh_token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except sec.JWTError:
        return None
    if payload.get("type") == "refresh" and payload.get("jti"):
        revoke(payload["jti"], payload["exp"])


@router.get("/auth/me", response_model=UserOut)
def me(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(db, user)
