import uuid
from typing import Any

from pydantic import BaseModel


class UploadError(BaseModel):
    row: int
    message: str


class UploadSummary(BaseModel):
    batch_id: uuid.UUID
    filename: str
    rows_imported: int
    rows_rejected: int
    status: str
    errors: list[UploadError] = []


class UploadBatchOut(BaseModel):
    id: uuid.UUID
    filename: str
    uploaded_by_name: str
    uploaded_at: str
    status: str
    rows_imported: int
    rows_rejected: int


class UploadBatchDetail(UploadBatchOut):
    error_report: dict[str, Any] | None


class PaginatedUploads(BaseModel):
    items: list[UploadBatchOut]
    total: int
    page: int
    page_size: int


class BatchPreviewRecord(BaseModel):
    """One imported reading shown in the admin Details drawer (first 10 of a batch)."""
    recorded_date: str
    parameter: str
    value: float
    uom: str | None
