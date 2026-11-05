"""Admin-only user management: list/create/patch/soft-delete + unit assignment."""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.core.audit import audit_log
from app.core.deps import get_client_ip, require_admin
from app.core.security import hash_password
from app.db import get_db
from app.models import Unit, User, user_unit_access
from app.schemas.users import UnitsAssign, UserCreate, UserOut, UserUpdate, serialize_user

router = APIRouter()


def _assert_units_exist(db: Session, unit_ids: list[uuid.UUID]) -> None:
    if not unit_ids:
        return
    found = db.scalars(select(Unit.id).where(Unit.id.in_(unit_ids))).all()
    unknown = set(unit_ids) - set(found)
    if unknown:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Unknown unit id(s): {', '.join(str(u) for u in unknown)}",
        )


@router.get("/users", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> list[UserOut]:
    users = db.scalars(select(User).order_by(User.name)).all()
    return [serialize_user(db, u) for u in users]


@router.post("/users", response_model=UserOut, status_code=201)
def create_user(
    body: UserCreate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    duplicate = db.scalar(select(User).where(User.email == body.email))
    if duplicate is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "A user with this email already exists")

    unit_ids = list(dict.fromkeys(body.unit_ids))  # de-dup, keep order
    _assert_units_exist(db, unit_ids)

    user = User(
        name=body.name,
        email=body.email,
        password_hash=hash_password(body.password),
        role=body.role,
    )
    db.add(user)
    db.flush()
    for unit_id in unit_ids:
        db.execute(user_unit_access.insert().values(user_id=user.id, unit_id=unit_id))

    audit_log(
        db, admin.id, "USER_CREATED",
        {
            "user_id": str(user.id),
            "email": user.email,
            "role": user.role,
            "unit_count": len(unit_ids),
        },
        get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return serialize_user(db, user)


@router.patch("/users/{user_id}", response_model=UserOut)
def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    changes: dict = {}
    if body.name is not None:
        changes["name"] = body.name
        user.name = body.name
    if body.role is not None:
        changes["role"] = body.role
        user.role = body.role
    if body.is_active is not None:
        changes["is_active"] = body.is_active
        user.is_active = body.is_active

    audit_log(
        db, admin.id, "USER_UPDATED",
        {"user_id": str(user.id), "changes": changes},
        get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return serialize_user(db, user)


@router.post("/users/{user_id}/units", response_model=UserOut)
def assign_units(
    user_id: uuid.UUID,
    body: UnitsAssign,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    unit_ids = list(dict.fromkeys(body.unit_ids))
    _assert_units_exist(db, unit_ids)

    # REPLACES all assignments (spec contract)
    db.execute(user_unit_access.delete().where(user_unit_access.c.user_id == user.id))
    for unit_id in unit_ids:
        db.execute(insert(user_unit_access).values(user_id=user.id, unit_id=unit_id))

    audit_log(
        db, admin.id, "UNIT_ASSIGNED",
        {"user_id": str(user.id), "unit_ids": [str(u) for u in unit_ids]},
        get_client_ip(request),
    )
    db.commit()
    db.refresh(user)
    return serialize_user(db, user)


@router.delete("/users/{user_id}", status_code=204)
def deactivate_user(
    user_id: uuid.UUID,
    request: Request,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
) -> None:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if user.id == admin.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Admins cannot deactivate themselves")
    user.is_active = False
    audit_log(
        db, admin.id, "USER_UPDATED",
        {"user_id": str(user.id), "changes": {"is_active": False}},
        get_client_ip(request),
    )
    db.commit()
