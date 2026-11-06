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
from app.models import User
from app.schemas.auth import AccessTokenResponse, LoginRequest, RefreshRequest, RegisterRequest, TokenPair
from app.schemas.users import UserOut, serialize_user

router = APIRouter()
limiter = Limiter(key_func=get_client_ip)


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
        user=serialize_user(db, user),
    )


@router.post("/auth/register", response_model=TokenPair, status_code=201)
@limiter.limit(settings.LOGIN_RATE_LIMIT)
def register_admin(request: Request, body: RegisterRequest, db: Session = Depends(get_db)) -> TokenPair:
    """Self-registration for administrators (mail + password), separate from user sign-in.

    Gated by ALLOW_ADMIN_SELF_REGISTER; the first admin always comes from the seeder.
    Created accounts have the ADMIN role and no unit assignments.
    """
    if not settings.ALLOW_ADMIN_SELF_REGISTER:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Administrator self-registration is disabled")

    email = " ".join(str(body.email).split()).lower()
    name = " ".join(str(body.name).split())
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Name is required")
    if len(body.password) < 8:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Password must be at least 8 characters")

    ip = get_client_ip(request)
    if db.scalar(select(User.id).where(User.email == email)) is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "This email is already registered")

    from app.models.base import ROLE_ADMIN

    user = User(
        name=name,
        email=email,
        password_hash=sec.hash_password(body.password),
        role=ROLE_ADMIN,
        is_active=True,
    )
    db.add(user)
    db.flush()
    audit_log(db, user.id, "ADMIN_SELF_REGISTER", {"email": user.email}, ip)
    db.commit()

    return TokenPair(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
        user=serialize_user(db, user),
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
    return serialize_user(db, user)
