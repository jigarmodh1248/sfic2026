"""Excel/CSV upload parsing with pluggable format translators.

See ARCHITECTURE.md §4.1 (Data-Agnosticism Strategy):
- MVP ships the `long_format` translator + an official blank template.
- Phase-2 (real-data onboarding) adds a `wide_format` translator; the DB
  schema never changes either way — both produce the same normalized rows.

Implementation note: parsing uses openpyxl + stdlib csv directly (not pandas)
so the service has one small, auditable dependency surface and no native-DLL
shim between platforms. pandas stays available in the container image for the
phase-11 wide-format translator, which benefits from DataFrames.
"""
from __future__ import annotations

import csv
import datetime as dt
import io
from dataclasses import dataclass, field
from typing import Any
import uuid

from openpyxl import Workbook, load_workbook

REQUIRED_COLUMNS = ("unit_number", "recorded_date", "parameter", "value")
TEMPLATE_COLUMNS = (*REQUIRED_COLUMNS, "uom")
MAX_ERRORS_REPORTED = 200

_DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d", "%d.%m.%Y")


class UnsupportedFormatError(Exception):
    pass


@dataclass
class ParsedUpload:
    rows: list[dict[str, Any]] = field(default_factory=list)  # ready for PlantData insert
    errors: list[dict[str, Any]] = field(default_factory=list)  # [{row, message}]
    columns_found: list[str] = field(default_factory=list)
    missing_columns: list[str] = field(default_factory=list)
    row_count: int = 0

    @property
    def rejected_pct(self) -> float:
        if self.row_count == 0:
            return 0.0
        return 100.0 * len(self.errors) / self.row_count


def _clean_str(value: Any) -> str:
    return " ".join(str(value).split())


def _normalize_unit(value: Any) -> str:
    return _clean_str(value).lower()


def _parse_date(value: Any) -> dt.date | None:
    if isinstance(value, dt.datetime):
        return value.date()
    if isinstance(value, dt.date):
        return value
    text = _clean_str(value)
    for fmt in _DATE_FORMATS:
        try:
            return dt.datetime.strptime(text, fmt).date()
        except ValueError:
            continue
    try:  # ISO with time part, e.g. "2026-03-14T00:00:00"
        return dt.datetime.fromisoformat(text).date()
    except ValueError:
        return None


def _parse_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = _clean_str(value)
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        pass
    try:  # tolerate thousand separators: "1,234.5"
        return float(text.replace(",", ""))
    except ValueError:
        return None


def _read_records(content: bytes, filename: str) -> tuple[list[str], list[dict[str, Any]]]:
    """Returns (header columns, records). Raises UnsupportedFormatError."""
    lower = filename.lower()
    if lower.endswith(".csv"):
        reader = csv.DictReader(io.StringIO(content.decode("utf-8-sig")))
        if reader.fieldnames is None:
            raise UnsupportedFormatError("CSV file is empty")
        return [str(c) for c in reader.fieldnames], list(reader)
    if lower.endswith(".xlsx"):
        wb = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        try:
            ws = wb.active
            sheet_rows = ws.iter_rows(values_only=True)
            try:
                header = next(sheet_rows)
            except StopIteration:
                raise UnsupportedFormatError("Excel file is empty")  # noqa: B904
            columns = [str(c) if c is not None else "" for c in header]
            records = [
                dict(zip(columns, row)) for row in sheet_rows if any(c is not None for c in row)
            ]
            return columns, records
        finally:
            wb.close()
    raise UnsupportedFormatError(f"Unsupported file type: {filename} (use .xlsx or .csv)")


def translate_long_format(
    columns: list[str],
    records: list[dict[str, Any]],
    known_units: dict[str, uuid.UUID],
) -> ParsedUpload:
    """The MVP translator: exact required columns, one row per reading."""
    out = ParsedUpload(columns_found=columns, row_count=len(records))
    missing = [c for c in REQUIRED_COLUMNS if c not in columns]
    if missing:
        out.missing_columns = missing
        return out

    for index, record in enumerate(records):
        row_number = index + 2  # +1 header, +1 human numbering

        unit_key = _normalize_unit(record.get("unit_number"))
        unit_id = known_units.get(unit_key)
        if unit_id is None:
            sample = ", ".join(sorted(known_units)) or "(none defined)"
            out.errors.append({
                "row": row_number,
                "message": (
                    f"Unknown unit_number '{_clean_str(record.get('unit_number'))}' "
                    f"(known units: {sample})"
                ),
            })
            continue

        recorded_date = _parse_date(record.get("recorded_date"))
        if recorded_date is None:
            out.errors.append({
                "row": row_number,
                "message": f"recorded_date not parseable ({record.get('recorded_date')!r})",
            })
            continue

        parameter = _clean_str(record.get("parameter"))
        if not parameter:
            out.errors.append({"row": row_number, "message": "parameter is empty"})
            continue

        value = _parse_value(record.get("value"))
        if value is None:
            out.errors.append({
                "row": row_number,
                "message": f"value is not numeric ({record.get('value')!r})",
            })
            continue

        uom_raw = record.get("uom")
        uom = _clean_str(uom_raw) if uom_raw is not None and str(uom_raw).strip() else None

        out.rows.append(
            {
                "unit_id": unit_id,
                "parameter": parameter,
                "value": value,
                "uom": uom,
                "recorded_date": recorded_date,
            }
        )
    return out


def parse_upload(content: bytes, filename: str, known_units: dict[str, uuid.UUID]) -> ParsedUpload:
    columns, records = _read_records(content, filename)
    return translate_long_format(columns, records, known_units)


def build_template_xlsx() -> bytes:
    """Official blank-import template with headers + one example row."""
    wb = Workbook()
    ws = wb.active
    ws.append(list(TEMPLATE_COLUMNS))
    ws.append(["Unit 1", "2026-03-14", "plf", 57.2, "%"])
    buffer = io.BytesIO()
    wb.save(buffer)
    return buffer.getvalue()
