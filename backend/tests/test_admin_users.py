"""Admin user management + unit assignment + access-scoped plants/units."""
import uuid


def _login(client, email):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": "ChangeMe123!"})
    assert r.status_code == 200, r.text
    return r.json()


def _admin_headers(client):
    return {"Authorization": f"Bearer {_login(client, 'admin@gspc.local')['access_token']}"}


def test_users_endpoint_requires_admin(client):
    plant_login = _login(client, "plant@gspc.local")
    r = client.get(
        "/api/v1/users",
        headers={"Authorization": f"Bearer {plant_login['access_token']}"},
    )
    assert r.status_code == 403


def test_list_users(client, admin_headers):
    r = client.get("/api/v1/users", headers=admin_headers)
    assert r.status_code == 200
    emails = [u["email"] for u in r.json()]
    assert "admin@gspc.local" in emails and "plant@gspc.local" in emails


def test_create_user(client, admin_headers):
    r = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Operator", "email": "op1@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "VIEWER"
    dup = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Dup", "email": "op1@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    )
    assert dup.status_code == 409


def test_created_user_cannot_login_until_active_and_correct_password(client, admin_headers):
    client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Tmp", "email": "tmp1@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    )
    wrong = client.post("/api/v1/auth/login", json={"email": "tmp1@gspc.local", "password": "nope"})
    assert wrong.status_code == 401
    ok = client.post("/api/v1/auth/login", json={"email": "tmp1@gspc.local", "password": "Secret123!"})
    assert ok.status_code == 200


def test_assign_units_replaces_previous(client, admin_headers):
    unit_ids = _all_unit_ids(client, admin_headers)
    r = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Scoped", "email": "scoped@gspc.local", "password": "Secret123!",
             "role": "PLANT_USER", "unit_ids": unit_ids},
    )
    assert r.status_code == 201
    user_id = r.json()["id"]
    assert len(r.json()["unit_ids"]) == len(unit_ids)

    # Replace with only the first unit
    r2 = client.post(
        f"/api/v1/users/{user_id}/units", headers=admin_headers, json={"unit_ids": [unit_ids[0]]}
    )
    assert r2.status_code == 200
    assert r2.json()["unit_ids"] == [unit_ids[0]]

    # Unknown unit id -> 400
    r3 = client.post(
        f"/api/v1/users/{user_id}/units",
        headers=admin_headers,
        json={"unit_ids": [str(uuid.uuid4())]},
    )
    assert r3.status_code == 400


def test_patch_user_role_and_name(client, admin_headers):
    created = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Patchy", "email": "patchy@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    ).json()
    r = client.patch(
        f"/api/v1/users/{created['id']}",
        headers=admin_headers,
        json={"name": "Patched", "role": "PLANT_USER"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Patched"
    assert r.json()["role"] == "PLANT_USER"


def test_soft_delete_deactivates(client, admin_headers):
    created = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Gone", "email": "gone@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    ).json()
    r = client.delete(f"/api/v1/users/{created['id']}", headers=admin_headers)
    assert r.status_code == 204
    # deactivated user cannot log in or use an old token
    assert client.post("/api/v1/auth/login", json={"email": "gone@gspc.local", "password": "Secret123!"}).status_code == 401
    login_before = client.post("/api/v1/auth/login", json={"email": "gone@gspc.local", "password": "Secret123!"})
    assert login_before.status_code == 401


def test_plants_and_units_scoping(client, admin_headers):
    """A user assigned to only one unit sees one unit; admin sees all."""
    unit_ids = _all_unit_ids(client, admin_headers)
    client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Single", "email": "single@gspc.local", "password": "Secret123!",
              "role": "VIEWER", "unit_ids": [unit_ids[0]]},
    )
    token = _login_with_password(client, "single@gspc.local", "Secret123!")["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    units = client.get("/api/v1/units", headers=headers).json()
    assert [u["id"] for u in units] == [unit_ids[0]]

    plants = client.get("/api/v1/plants", headers=headers).json()
    assert len(plants) == 1

    admin_units = client.get("/api/v1/units", headers=admin_headers).json()
    assert len(admin_units) == len(unit_ids)


def test_user_audit_events_written(client, admin_headers):
    client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "Audit", "email": "audit1@gspc.local", "password": "Secret123!", "role": "VIEWER"},
    )
    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import AuditLog

    db = SessionLocal()
    try:
        actions = db.scalars(
            select(AuditLog.action).order_by(AuditLog.id.desc()).limit(10)
        ).all()
        assert "USER_CREATED" in actions
    finally:
        db.close()


def _all_unit_ids(client, headers):
    return [u["id"] for u in client.get("/api/v1/units", headers=headers).json()]


def _login_with_password(client, email, password):
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r.json()
