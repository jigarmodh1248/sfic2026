"""Admin-only audit log API with filters and pagination."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import User


def _admin_id() -> str:
    db = SessionLocal()
    try:
        return str(db.scalars(select(User.id).where(User.role == "ADMIN")).first())
    finally:
        db.close()


def test_audit_requires_admin(client, admin_headers, plant_headers):
    assert client.get("/api/v1/audit").status_code == 401
    r = client.get("/api/v1/audit", headers=plant_headers)
    assert r.status_code == 403


def test_audit_lists_entries_newest_first(client, admin_headers):
    # generate a couple of audited events
    client.post("/api/v1/auth/login", json={"email": "admin@gspc.local", "password": "ChangeMe123!"})
    r = client.get("/api/v1/audit", headers=admin_headers)
    assert r.status_code == 200
    body = r.json()
    assert body["total"] > 0
    ids = [e["id"] for e in body["items"]]
    assert ids == sorted(ids, reverse=True)
    entry = body["items"][0]
    assert {"id", "user", "action", "payload", "ip_address", "created_at"} <= set(entry)


def test_audit_filter_by_action_and_user(client, admin_headers):
    admin_id = _admin_id()

    r = client.get("/api/v1/audit", headers=admin_headers, params={"action": "login_success"})
    assert r.status_code == 200
    assert r.json()["total"] > 0
    assert all(e["action"] == "LOGIN_SUCCESS" for e in r.json()["items"])  # case-insensitive input

    r = client.get("/api/v1/audit", headers=admin_headers, params={"user_id": admin_id, "action": "QUERY_EXECUTED"})
    assert r.status_code == 200
    # this session ran queries in earlier tests? audit rows may exist; just validate shape + filter rule
    assert all(e["action"] == "QUERY_EXECUTED" and e["user"]["id"] == admin_id for e in r.json()["items"])


def test_audit_filter_by_date_range(client, admin_headers):
    r = client.get("/api/v1/audit", headers=admin_headers, params={"from": "1999-01-01", "to": "1999-01-02"})
    assert r.status_code == 200
    assert r.json()["total"] == 0

    today = client.get("/api/v1/audit", headers=admin_headers, params={"from": "2000-01-01"}).json()
    assert today["total"] > 0


def test_audit_pagination(client, admin_headers):
    r = client.get("/api/v1/audit", headers=admin_headers, params={"page": 1, "page_size": 2})
    first = r.json()
    assert first["page_size"] == 2
    assert len(first["items"]) == 2

    r2 = client.get("/api/v1/audit", headers=admin_headers, params={"page": 2, "page_size": 2})
    second = r2.json()
    assert second["page"] == 2
    assert [e["id"] for e in second["items"]] != [e["id"] for e in first["items"]]
    # page beyond the end is empty, not an error
    empty = client.get("/api/v1/audit", headers=admin_headers, params={"page": 999, "page_size": 2}).json()
    assert empty["items"] == []


def test_audit_filters_are_clamped(client, admin_headers):
    r = client.get("/api/v1/audit", headers=admin_headers, params={"page": 0, "page_size": 999})
    assert r.status_code == 200
    assert r.json()["page"] == 1
    assert r.json()["page_size"] == 100  # clamped to max
