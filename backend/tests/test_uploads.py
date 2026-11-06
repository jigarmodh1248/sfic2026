"""Excel upload: import, validation, batch rejection, template, deletion."""
import io
import uuid

import openpyxl
import pytest
from sqlalchemy import func, select

from app.db import SessionLocal
from app.models import PlantData, UploadBatch


def _xlsx(rows: list[list], headers=("unit_number", "recorded_date", "parameter", "value", "uom")) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(list(headers))
    for row in rows:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()


def _upload(client, headers, content: bytes, filename: str = "data.xlsx", mime: str | None = None):
    return client.post(
        "/api/v1/uploads",
        headers=headers,
        files={"file": (filename, content, mime or "application/octet-stream")},
    )


def _batch_rows(batch_id: uuid.UUID | str) -> int:
    if isinstance(batch_id, str):
        batch_id = uuid.UUID(batch_id)
    db = SessionLocal()
    try:
        return db.scalar(select(func.count(PlantData.id)).where(PlantData.batch_id == batch_id)) or 0
    finally:
        db.close()


def test_upload_requires_admin(client, plant_headers):
    r = _upload(client, plant_headers, _xlsx([["Unit 1", "2026-03-14", "plf", 57.2, "%"]]))
    assert r.status_code == 403


def test_upload_valid_xlsx(client, admin_headers):
    rows = [[f"Unit {n}", f"2026-03-{d:02d}", "plf", 50.0 + d, "%"] for n in (1, 2, 3) for d in range(1, 6)]
    r = _upload(client, admin_headers, _xlsx(rows))
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "SUCCESS"
    assert body["rows_imported"] == 15
    assert body["rows_rejected"] == 0
    assert _batch_rows(body["batch_id"]) == 15


def test_upload_valid_csv(client, admin_headers):
    csv = "unit_number,recorded_date,parameter,value,uom\nUnit 1,2026-03-14,generation,5.61,MU\n"
    r = _upload(client, admin_headers, csv.encode(), filename="data.csv", mime="text/csv")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "SUCCESS"
    assert r.json()["rows_imported"] == 1


def test_upload_missing_columns_fails_whole_file(client, admin_headers):
    content = _xlsx([["Unit 1", "2026-03-14", "plf", 57.2, "%"]], headers=("unit_number", "recorded_date", "plf"))
    r = _upload(client, admin_headers, content)
    assert r.status_code == 400
    assert "Missing required column" in r.json()["detail"]
    # tracked as FAILED batch for the audit trail
    total_failed = client.get("/api/v1/uploads", headers=admin_headers).json()["items"]
    assert any(b["status"] == "FAILED" for b in total_failed)


def test_unknown_unit_row_rejected_but_rest_imported(client, admin_headers):
    # 1 unknown-unit row out of 6 = 16.7%, below the >20% threshold => PARTIAL
    rows = (
        [["Unit 1", f"2026-03-{d:02d}", "plf", 57.2, "%"] for d in range(1, 6)]
        + [["Unit 99", "2026-03-14", "plf", 57.2, "%"]]
    )
    r = _upload(client, admin_headers, _xlsx(rows))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "PARTIAL"
    assert body["rows_imported"] == 5
    assert body["rows_rejected"] == 1
    assert body["errors"][0]["row"] == 7
    assert "Unknown unit_number" in body["errors"][0]["message"]


def test_batch_rejected_over_20_percent(client, admin_headers):
    rows = [["Unit 1", "2026-03-14", "plf", 57.2, "%"]] + [
        ["Ghost Unit", "2026-03-14", "plf", 57.2, "%"] for _ in range(3)
    ]
    r = _upload(client, admin_headers, _xlsx(rows))
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "FAILED"
    assert body["rows_imported"] == 0
    assert body["rows_rejected"] == 4
    assert _batch_rows(body["batch_id"]) == 0


def test_bad_value_and_date_rows_rejected(client, admin_headers):
    rows = [
        ["Unit 1", "2026-03-14", "plf", "not-a-number", "%"],
        ["Unit 1", "March14", "plf", 57.2, "%"],  # date unparseable
    ]
    r = _upload(client, admin_headers, _xlsx(rows))
    body = r.json()
    assert body["rows_imported"] == 0
    assert body["rows_rejected"] == 2
    messages = " | ".join(e["message"] for e in body["errors"])
    assert "not numeric" in messages
    assert "not parseable" in messages


def test_unsupported_extension_rejected(client, admin_headers):
    r = _upload(client, admin_headers, b"MZ\x90\x00", filename="virus.exe")
    assert r.status_code == 400


def test_upload_too_large(client, admin_headers, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "MAX_UPLOAD_BYTES", 10)
    r = _upload(client, admin_headers, b"x" * 1024, filename="big.csv", mime="text/csv")
    assert r.status_code == 413


def test_template_download(client, admin_headers):
    r = client.get("/api/v1/uploads/template", headers=admin_headers)
    assert r.status_code == 200
    wb = openpyxl.load_workbook(io.BytesIO(r.content))
    ws = wb.active
    assert [c.value for c in ws[1]] == ["unit_number", "recorded_date", "parameter", "value", "uom"]
    # template is actually importable
    ok = _upload(client, admin_headers, r.content, filename="template.xlsx")
    assert ok.status_code == 200
    assert ok.json()["status"] == "SUCCESS"


def test_batch_list_and_detail(client, admin_headers):
    listed = client.get("/api/v1/uploads", headers=admin_headers).json()
    assert listed["total"] >= 1
    assert {i["status"] for i in listed["items"]} <= {"SUCCESS", "PARTIAL", "FAILED", "DELETED"}
    assert all(b["uploaded_by_name"] for b in listed["items"])

    batch_id = listed["items"][0]["id"]
    detail = client.get(f"/api/v1/uploads/{batch_id}", headers=admin_headers).json()
    assert detail["id"] == batch_id
    assert "error_report" in detail


def test_delete_batch_removes_rows(client, admin_headers):
    r = _upload(client, admin_headers, _xlsx([["Unit 2", "2026-03-20", "heat_rate", 2100.0, "kcal/kWh"]]))
    batch_id = r.json()["batch_id"]
    assert _batch_rows(batch_id) == 1

    d = client.delete(f"/api/v1/uploads/{batch_id}", headers=admin_headers)
    assert d.status_code == 204
    assert _batch_rows(batch_id) == 0
    detail = client.get(f"/api/v1/uploads/{batch_id}", headers=admin_headers).json()
    assert detail["status"] == "DELETED"


def test_excel_upload_audit_events(client, admin_headers):
    from sqlalchemy import select

    db = SessionLocal()
    try:
        actions = [a for (a,) in db.execute(select(UploadBatch.status)).all()]
        assert "SUCCESS" in actions
        actions_log = db.scalars(select(UploadBatch.id)).all()
        assert len(actions_log) >= 1
        # audit_logs should contain both EXCEL_UPLOAD and BATCH_DELETED from prior tests
        from app.models import AuditLog

        log_actions = db.scalars(
            select(AuditLog.action).where(AuditLog.action.in_(["EXCEL_UPLOAD", "BATCH_DELETED"]))
        ).all()
        assert "EXCEL_UPLOAD" in log_actions
        assert "BATCH_DELETED" in log_actions
    finally:
        db.close()


def test_preview_returns_first_10_in_import_order(client, admin_headers):
    summary = _upload(client, admin_headers, _xlsx(
        [["Unit 1", f"2026-05-0{d}", "prev_test", float(d), "MW"] for d in range(1, 9)]
    )).json()
    r = client.get(f"/api/v1/uploads/{summary['batch_id']}/preview", headers=admin_headers)
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 8
    assert rows[0]["parameter"] == "prev_test"
    assert rows[0]["value"] == 1.0
    assert rows[-1]["value"] == 8.0
    assert rows[0]["uom"] == "MW"


def test_preview_truncated_to_10(client, admin_headers):
    summary = _upload(client, admin_headers, _xlsx(
        [["Unit 1", "2026-06-01", "prev_many", float(i), None] for i in range(1, 16)]
    )).json()
    r = client.get(f"/api/v1/uploads/{summary['batch_id']}/preview", headers=admin_headers)
    rows = r.json()
    assert len(rows) == 10
    assert rows[0]["value"] == 1.0
    assert rows[9]["value"] == 10.0
    assert rows[0]["uom"] is None


def test_preview_404_and_auth(client, admin_headers):
    assert client.get("/api/v1/uploads").status_code == 401  # anonymous
    r = client.get(
        "/api/v1/uploads/00000000-0000-0000-0000-000000000000/preview", headers=admin_headers
    )
    assert r.status_code == 404


def test_preview_rejected_for_plant_user(client, admin_headers, plant_headers):
    summary = _upload(client, admin_headers, _xlsx([["Unit 1", "2026-07-01", "prev_scope", 1.0, None]])).json()
    r = client.get(f"/api/v1/uploads/{summary['batch_id']}/preview", headers=plant_headers)
    assert r.status_code == 403
