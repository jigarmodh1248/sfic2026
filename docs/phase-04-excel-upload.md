# PH-A4 Explanation — Excel Upload (Phase 4)

**What Phase 4 delivered:** the admin's data-entry pipeline — `POST /uploads` parses an `.xlsx`/`.csv` through a pluggable translator, validates every row (columns, dates, numbers, units), stores valid rows in `plant_data` linked to an `upload_batches` record with a JSONB error report, rejects whole batches when >20 % of rows are bad, plus paginated batch list, batch detail, soft delete with row cascade, an official blank template download, and `EXCEL_UPLOAD` / `BATCH_DELETED` audit events. 13 new tests (33 total passing).

**A deliberate stack change discovered during this phase:** the original plan used pandas for parsing. This dev machine's **Windows Application Control policy blocks pandas' native DLLs** (numpy loads, `pandas._libs.join` is blocked). Rather than depend on a corporate policy, the service parses with **openpyxl + stdlib `csv`** directly — smaller dependency surface, identical behavior on any platform. pandas remains in `requirements.txt` for the Docker (Linux) image and the phase-11 wide-format translator, which *will* benefit from DataFrames.

---

## File-by-File

### `backend/app/services/excel.py` — the data-agnostic parser (heart of §4.1)

Three public functions + a result object:

- **`ParsedUpload`** (dataclass): `rows` (ready-for-insert dicts), `errors` (`[{row: <human row number>, message}]`), `columns_found`, `missing_columns`, `row_count`, and a derived `rejected_pct`. Row numbers are **human-facing** (header ignored → data starts at 2) so the error report speaks Excel's language.
- **`_read_records(content, filename)`**: picks a reader by extension —
  - `.csv` → `csv.DictReader` (with `utf-8-sig` decode so Excel's BOM doesn't corrupt the first column name);
  - `.xlsx` → `openpyxl.load_workbook(read_only=True, data_only=True)` — `data_only` is what makes *formula results* (`=A5*0.98`) arrive as values, not formulas; blank rows are skipped; anything else raises `UnsupportedFormatError` (kept for the 4xx path, never a 500).
- **`translate_long_format(columns, records, known_units)`**: the MVP translator. Missing required column = instant return of an empty result with `missing_columns` (router turns that into 400 + FAILED batch). Per-row via small helper functions:
  - `_normalize_unit` (case/whitespace-insensitive `unit_number` matching) + unknown → error message **listing valid unit numbers** (self-fixing feedback loop);
  - `_parse_date`: accepts native Excel datetime cells, `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `YYYY/MM/DD`, `DD.MM.YYYY`, ISO datetime — the loose date tolerance a plant clerk's spreadsheet needs;
  - `_parse_value`: numbers pass through; strings float-parsed, with **thousand-separator tolerance** (`"1,234.5"`); booleans explicitly rejected;
  - `parameter` empty-string rejection; `uom` optional (blank → SQL NULL).
- **`parse_upload(...)`**: reader + translator composition — the single entry point; the phase-11 `wide_format` translator will slot in here with no API change.
- **`build_template_xlsx()`**: generates the official template in memory — headers + one example row; no binary asset to maintain.

### `backend/app/schemas/uploads.py`
- `UploadSummary{batch_id, filename, rows_imported, rows_rejected, status, errors[]}` — the spec's upload response (now also carrying `filename` for UI convenience).
- `UploadBatchOut` — list row shape with `uploaded_by_name` (the resolver performs the user lookup once, in the router helper `_batch_out`).
- `UploadBatchDetail(UploadBatchOut)` adds `error_report` (the raw JSONB).
- `PaginatedUploads{items, total, page, page_size}`.

### `backend/app/api/v1/uploads.py` — the five endpoints

- **`GET /uploads/template`**: streams `build_template_xlsx()` as an attachment. ADMIN-only (upload-related).
- **`POST /uploads`** (ADMIN-only) — the flow:
  1. size guard: content read then `413` if over `MAX_UPLOAD_BYTES` (checked *before* parsing — byte count, not meaning);
  2. **`_fail_batch(msg, code)`** helper: any structural failure (unsupported format, missing columns) still writes a `FAILED` batch + `EXCEL_UPLOAD` audit row before mirroring the 4xx — *the audit trail must record attempts, not just successes*;
  3. parse via service with `_known_units(db)` (normalized `unit_number → id` map; **documented MVP simplification**: unit numbers are treated as globally unique across plants — real multi-plant disambiguation is a phase-11 concern);
  4. status decision: `>20 %` rejected (or zero data rows) ⇒ `FAILED` with **nothing imported**; some rows rejected but under threshold ⇒ `PARTIAL`; all clean ⇒ `SUCCESS`;
  5. `db.bulk_insert_mappings(PlantData, rows)` — chosen over `insert(PlantData), rows` because SQLAlchemy requests `INSERT..RETURNING` for identity PKs, which **SQLite cannot do for executemany** (caught first by tests); `bulk_insert_mappings` avoids RETURNING and works on both DBs;
  6. every row dict gets `batch_id` — the linkage that makes the synthetic demo batch and any real batch deletable uniformly;
  7. audit `EXCEL_UPLOAD {batch_id, filename, rows_imported, rows_rejected, status}` + commit; response returns top-level `errors` (first 200) while the **full list** lives in `error_report` JSONB (bounded payloads).
- **`GET /uploads`**: page/page_size clamped (1..100), newest first, + total for pagination.
- **`GET /uploads/{id}`**: 404-safe detail incl. `error_report`.
- **`DELETE /uploads/{id}`**: soft delete — `status=DELETED` while **rows are hard-deleted** (`DELETE FROM plant_data WHERE batch_id=...`, explicit CASCADE-like behavior; the rowcount is recorded in the `BATCH_DELETED` audit payload). A DELETED batch keeps its history/audit references valid.

### Router wiring
`uploads.router` added to `api/v1/__init__.py` (single include point, tag "uploads").

### `backend/tests/test_uploads.py` (13 tests — every rule of §1.2, exercised)
| test | proves |
|---|---|
| `test_upload_requires_admin` | 403 for PLANT_USER |
| `test_upload_valid_xlsx` | 15 rows in 3 units → SUCCESS + rows actually in `plant_data` under the batch |
| `test_upload_valid_csv` | CSV path works |
| `test_upload_missing_columns_fails_whole_file` | 400 + a FAILED batch exists in history |
| `test_unknown_unit_row_rejected_but_rest_imported` | 1 bad of 6 (16.7 % ≤ 20 %) → PARTIAL; error row number + "known units" message |
| `test_batch_rejected_over_20_percent` | 1 valid + 3 bad (75 %) → FAILED, `rows_imported=0`, **zero rows landed** |
| `test_bad_value_and_date_rows_rejected` | non-numeric value + unparseable date each rejected with the right message |
| `test_unsupported_extension_rejected` | `.exe` → 400 |
| `test_upload_too_large` | 413 (monkeypatched limit to 10 bytes) |
| `test_template_download` | template has the 5 headers **and round-trips through upload as SUCCESS** (never let the template rot) |
| `test_batch_list_and_detail` | pagination shape + `uploaded_by_name` + detail exposes `error_report` |
| `test_delete_batch_removes_rows` | 204 → rows gone → batch shows `DELETED` |
| `test_excel_upload_audit_events` | `EXCEL_UPLOAD` and `BATCH_DELETED` truly persisted in `audit_logs` |

### Fixture / config note
`conftest.py` gained the `plant_headers` fixture (non-admin token) — used wherever a 403 is expected.

## Data flow (Phase 4) at a glance
```
[admin picks file] → POST /uploads (multipart, ≤10 MB)
   ├─ size guard ⇒ 413
   ├─ translate [.csv | .xlsx → normalized row dicts]
   │     ├─ missing columns ⇒ 400 + FAILED batch (audited)
   │     └─ per-row errors: unknown unit / bad date / bad value / empty param
   ├─ ≤20% bad ⇒ SUCCESS|PARTIAL → bulk insert with batch_id
   └─ >20% bad ⇒ FAILED, nothing imported
response {batch_id, rows_imported, rows_rejected, status, errors[0:200]}
```
