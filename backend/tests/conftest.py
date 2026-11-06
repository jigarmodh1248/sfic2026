import os
import pathlib

# Must be set before app modules are imported (config.py caches settings).
os.environ["DATABASE_URL"] = "sqlite:///./test.db"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Base  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _db():
    from app import seed as seed_module

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_module.run()
    yield
    engine.dispose()
    pathlib.Path("test.db").unlink(missing_ok=True)


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def _limiter_default_off():
    from app.api.v1.auth import limiter

    limiter.enabled = False
    yield
    limiter.enabled = False


@pytest.fixture(scope="session")
def admin_token(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "admin@gspc.local", "password": "ChangeMe123!"},
    )
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}


@pytest.fixture(scope="session")
def plant_headers(client):
    r = client.post(
        "/api/v1/auth/login",
        json={"email": "plant@gspc.local", "password": "ChangeMe123!"},
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}
