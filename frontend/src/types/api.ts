/* TS mirrors of the backend API contracts (ARCHITECTURE.md §5). Keep in sync. */

export type Role = "ADMIN" | "PLANT_USER" | "VIEWER";

export type AuditAction =
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILURE"
  | "EXCEL_UPLOAD"
  | "QUERY_EXECUTED"
  | "PDF_DOWNLOADED"
  | "USER_CREATED"
  | "USER_UPDATED"
  | "UNIT_ASSIGNED"
  | "BATCH_DELETED";

export interface LoggedUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  unit_ids: string[];
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
}

export interface Plant {
  id: string;
  name: string;
  location: string | null;
}

export interface Unit {
  id: string;
  plant_id: string;
  unit_number: string;
  capacity_mw: string | null;
}

export interface ParameterMeta {
  parameter: string;
  uom: string | null;
}

export type PeriodMode = "DAY" | "MONTH" | "YEAR" | "RANGE";

export type Period =
  | { mode: "DAY"; day: string }
  | { mode: "MONTH"; month: string }
  | { mode: "YEAR"; year: string }
  | { mode: "RANGE"; start: string; end: string };

export interface QueryRequest {
  plant_id: string;
  unit_id: string;
  parameters: string[]; // [] = all
  period: Period;
}

export interface QueryRow {
  recorded_date: string;
  parameter: string;
  value: number;
  uom: string | null;
}

export interface QuerySummary {
  parameter: string;
  min: number;
  max: number;
  avg: number;
}

export interface QueryResponse {
  rows: QueryRow[];
  summary: QuerySummary[];
}

/* ---- Users admin ---- */

export interface UserListEntry {
  id: string;
  name: string;
  email: string;
  role: Role;
  is_active: boolean;
  unit_ids: string[];
}

export interface UserCreatePayload {
  name: string;
  email: string;
  password: string;
  role: Role;
  unit_ids: string[];
}

export interface UserUpdatePayload {
  name?: string;
  role?: Role;
  is_active?: boolean;
}

/* ---- Uploads admin ---- */

export type BatchStatus = "SUCCESS" | "PARTIAL" | "FAILED" | "DELETED";

export interface UploadErrorItem {
  row: number;
  message: string;
}

export interface UploadSummary {
  batch_id: string;
  filename: string;
  rows_imported: number;
  rows_rejected: number;
  status: Exclude<BatchStatus, "DELETED">;
  errors: UploadErrorItem[];
}

export interface UploadBatch {
  id: string;
  filename: string;
  uploaded_by_name: string;
  uploaded_at: string;
  status: BatchStatus;
  rows_imported: number;
  rows_rejected: number;
}

export interface UploadBatchDetail extends UploadBatch {
  error_report: Record<string, unknown> | null;
}

export interface PaginatedUploads {
  items: UploadBatch[];
  total: number;
  page: number;
  page_size: number;
}
