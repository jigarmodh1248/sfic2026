import uuid

from sqlalchemy import JSON, MetaData, String
from sqlalchemy import Uuid as SAUuid
from sqlalchemy.dialects.postgresql import INET, JSONB
from sqlalchemy.orm import DeclarativeBase

convention = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=convention)


# Portable types: plain JSON/String on SQLite, JSONB/INET on Postgres
JSONType = JSON().with_variant(JSONB(), "postgresql")
IpType = String(64).with_variant(INET(), "postgresql")

UuidType = SAUuid()

ROLE_ADMIN = "ADMIN"
ROLE_PLANT_USER = "PLANT_USER"
ROLE_VIEWER = "VIEWER"
ROLES = (ROLE_ADMIN, ROLE_PLANT_USER, ROLE_VIEWER)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()
