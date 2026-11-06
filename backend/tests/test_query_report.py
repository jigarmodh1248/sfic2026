"""Query engine + dynamic parameters + PDF report (all access-scoped)."""
import io
import openpyxl
from sqlalchemy import select

from app.db import SessionLocal
from app.models import AuditLog, Plant, Unit


def _xlsx(rows: list[list]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["unit_number", "recorded_date", "parameter", "value", "uom"])
    for row in rows:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _upload(client, headers, rows: list[list]) -> dict:
    r = client.post(
        "/api/v1/uploads", headers=headers, files={"file": ("q.xlsx", _xlsx(rows), "application/octet-stream")}
    )
    assert r.status_code == 200, r.text
    return r.json()


def _ids(client, headers) -> tuple[str, dict[str, str]]:
    plant = client.get("/api/v1/plants", headers=headers).json()[0]
    units = {u["unit_number"]: u["id"] for u in client.get("/api/v1/units", headers=headers).json()}
    return plant["id"], units


DAY_ROWS = [
    ["Unit 1", "2026-03-14", "plf", 57.2, "%"],
    ["Unit 1", "2026-03-15", "plf", 62.1, "%"],
    ["Unit 1", "2026-03-16", "plf", 48.9, "%"],
    ["Unit 1", "2026-03-16", "heat_rate", 2140.0, "kcal/kWh"],
]


def _unit_ids(db) -> dict[str, object]:
    return {u.unit_number: u.id for u in db.scalars(select(Unit)).all()}


def test_query_requires_auth(client):
    r = client.post("/api/v1/query", json={})
    assert r.status_code == 401


def test_day_query_and_summary(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    _upload(client, admin_headers, DAY_ROWS)

    r = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "DAY", "day": "2026-03-16"},
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    # synthetic seed has all 10 parameters daily + the 2 uploaded rows this day
    assert len(body["rows"]) == 12
    # summary covers every parameter that appears
    params = {s["parameter"] for s in body["summary"]}
    assert "plf" in params
    assert "heat_rate" in params
    # avg of the uploaded plf rows present on 2026-03-16 (48.9 + seed if any)
    plf_summary = next(s for s in body["summary"] if s["parameter"] == "plf")
    assert plf_summary["min"] <= plf_summary["avg"] <= plf_summary["max"]


def test_month_and_year_modes(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    month = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "MONTH", "month": "2026-03"},
        },
    )
    assert month.status_code == 200
    assert len(month.json()["rows"]) >= len(DAY_ROWS)

    year = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "YEAR", "year": "2026"},
        },
    )
    assert year.status_code == 200
    assert len(year.json()["rows"]) >= len(month.json()["rows"])


def test_range_mode_filters_between(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    r = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "RANGE", "start": "2026-03-14", "end": "2026-03-15"},
        },
    )
    assert r.status_code == 200
    dates = {row["recorded_date"] for row in r.json()["rows"]}
    assert dates <= {"2026-03-14", "2026-03-15"}


def test_parameter_filter_honored(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    r = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": ["plf"],
            "period": {"mode": "RANGE", "start": "2026-03-14", "end": "2026-03-16"},
        },
    )
    body = r.json()
    assert body["rows"], "expected uploaded plf rows"
    assert all(row["parameter"] == "plf" for row in body["rows"])
    assert [s["parameter"] for s in body["summary"]] == ["plf"]


def test_empty_result(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    r = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "DAY", "day": "1999-01-01"},
        },
    )
    assert r.status_code == 200
    assert r.json()["rows"] == [] and r.json()["summary"] == []


def test_invalid_period_shapes_422(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    base = {"plant_id": plant_id, "unit_id": units["Unit 1"], "parameters": []}
    bad_month = client.post(
        "/api/v1/query", headers=admin_headers, json={**base, "period": {"mode": "MONTH", "month": "2026-13"}}
    )
    assert bad_month.status_code == 422
    bad_range = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={**base, "period": {"mode": "RANGE", "start": "2026-03-16", "end": "2026-03-14"}},
    )
    assert bad_range.status_code == 422


def test_unit_plant_mismatch_400(client, admin_headers):
    db = SessionLocal()
    try:
        plant_id = str(db.scalar(select(Plant.id)))
        unit_ids = list(_unit_ids(db).values())
        other_unit = str(unit_ids[-1])
    finally:
        db.close()
    # ask with a unit of a *different* plant id string: mismatch returns 400/404
    r = client.post(
        "/api/v1/query",
        headers=admin_headers,
        json={"plant_id": "00000000-0000-0000-0000-000000000000", "unit_id": other_unit, "parameters": [],
              "period": {"mode": "DAY", "day": "2026-03-16"}},
    )
    assert r.status_code == 400


def test_access_scope_403_for_other_units(client, admin_headers):
    # viewer assigned only to Unit 1
    plant_id, units = _ids(client, admin_headers)
    created = client.post(
        "/api/v1/users",
        headers=admin_headers,
        json={"name": "QScope", "email": "qscope@gspc.local", "password": "Secret123!",
              "role": "VIEWER", "unit_ids": [units["Unit 1"]]},
    )
    assert created.status_code == 201
    token = client.post(
        "/api/v1/auth/login", json={"email": "qscope@gspc.local", "password": "Secret123!"}
    ).json()["access_token"]

    ok = client.post(
        "/api/v1/query",
        headers={"Authorization": f"Bearer {token}"},
        json={"plant_id": plant_id, "unit_id": units["Unit 1"], "parameters": [],
              "period": {"mode": "DAY", "day": "2026-03-16"}},
    )
    assert ok.status_code == 200

    forbidden = client.post(
        "/api/v1/query",
        headers={"Authorization": f"Bearer {token}"},
        json={"plant_id": plant_id, "unit_id": units["Unit 2"], "parameters": [],
              "period": {"mode": "DAY", "day": "2026-03-16"}},
    )
    assert forbidden.status_code == 403

    # parameters endpoint is scoped the same way
    ok_params = client.get(
        f"/api/v1/units/{units['Unit 1']}/parameters", headers={"Authorization": f"Bearer {token}"}
    )
    assert ok_params.status_code == 200
    names = [p["parameter"] for p in ok_params.json()]
    assert "plf" in names

    forbidden_params = client.get(
        f"/api/v1/units/{units['Unit 2']}/parameters", headers={"Authorization": f"Bearer {token}"}
    )
    assert forbidden_params.status_code == 403


def test_dynamic_parameters_endpoint(client, admin_headers):
    _upload(client, admin_headers, DAY_ROWS)
    plant_id, units = _ids(client, admin_headers)
    r = client.get(f"/api/v1/units/{units['Unit 1']}/parameters", headers=admin_headers)
    assert r.status_code == 200
    by_param = {p["parameter"]: p["uom"] for p in r.json()}
    assert by_param.get("plf") == "%"
    assert by_param.get("heat_rate") == "kcal/kWh"


def test_pdf_download(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    _upload(client, admin_headers, DAY_ROWS)
    r = client.post(
        "/api/v1/report/pdf",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "RANGE", "start": "2026-03-14", "end": "2026-03-16"},
        },
    )
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/pdf"
    assert "attachment" in r.headers.get("content-disposition", "")
    assert r.content[:5] == b"%PDF-"
    assert len(r.content) > 1000

    # audit recorded with file size
    db = SessionLocal()
    try:
        entry = db.scalars(
            select(AuditLog).where(AuditLog.action == "PDF_DOWNLOADED").order_by(AuditLog.id.desc())
        ).first()
        assert entry is not None
        assert entry.payload["file_size"] == len(r.content)
    finally:
        db.close()


def test_pdf_empty_result_still_renders(client, admin_headers):
    plant_id, units = _ids(client, admin_headers)
    r = client.post(
        "/api/v1/report/pdf",
        headers=admin_headers,
        json={
            "plant_id": plant_id,
            "unit_id": units["Unit 1"],
            "parameters": [],
            "period": {"mode": "DAY", "day": "1999-01-01"},
        },
    )
    assert r.status_code == 200
    assert r.content[:5] == b"%PDF-"
