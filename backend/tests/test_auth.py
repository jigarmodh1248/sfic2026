"""Auth flow tests: login, me, refresh, logout/revocation, rate limit, health."""


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_success(client):
    r = client.post(
        "/api/v1/auth/login", json={"email": "admin@gspc.local", "password": "ChangeMe123!"}
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["user"]["role"] == "ADMIN"
    assert body["user"]["email"] == "admin@gspc.local"
    assert "unit_ids" in body["user"]


def test_login_wrong_password(client):
    r = client.post(
        "/api/v1/auth/login", json={"email": "admin@gspc.local", "password": "wrong"}
    )
    assert r.status_code == 401


def test_login_unknown_email(client):
    r = client.post(
        "/api/v1/auth/login", json={"email": "nobody@gspc.local", "password": "whatever"}
    )
    assert r.status_code == 401


def test_me_requires_token(client):
    r = client.get("/api/v1/auth/me")
    assert r.status_code == 401


def test_me_works(client, admin_headers):
    r = client.get("/api/v1/auth/me", headers=admin_headers)
    assert r.status_code == 200
    assert r.json()["email"] == "admin@gspc.local"


def test_refresh_flow(client):
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@gspc.local", "password": "ChangeMe123!"}
    ).json()
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["access_token"]


def test_refresh_rejects_access_token(client, admin_token):
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": admin_token})
    assert r.status_code == 401


def test_logout_revokes_refresh(client, admin_headers):
    login = client.post(
        "/api/v1/auth/login", json={"email": "admin@gspc.local", "password": "ChangeMe123!"}
    ).json()
    r = client.post(
        "/api/v1/auth/logout", headers=admin_headers, json={"refresh_token": login["refresh_token"]}
    )
    assert r.status_code == 204
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": login["refresh_token"]})
    assert r.status_code == 401


def test_rate_limit_5_per_minute(client):
    """6th attempt inside a minute must hit the 5/minute limit."""
    from slowapi.errors import RateLimitExceeded

    from app.api.v1.auth import limiter

    limiter.enabled = True
    try:
        statuses = []
        for _ in range(6):
            r = client.post("/api/v1/auth/login", json={"email": "ratelimit@gspc.local", "password": "x"})
            statuses.append(r.status_code)
        assert statuses[-1] == 429
        assert all(s in (401, 429) for s in statuses)
    finally:
        limiter.enabled = False


def test_seed_demo_data_exists(client, admin_headers):
    """Sanity for phase-1 seed: plant + units visible in DB through API gating later."""
    import uuid

    from sqlalchemy import select

    from app.db import SessionLocal
    from app.models import Plant, PlantData

    db = SessionLocal()
    try:
        plant = db.scalar(select(Plant))
        assert plant is not None
        n_rows = db.scalar(select(PlantData.id).limit(1))
        assert n_rows is not None
    finally:
        db.close()
