# FRONTEND_GUIDE.md — Frontend Developer Handbook

**Read this first if you are working on `frontend/`.**
**Project:** PS000200 — Easily Accessibility of Power Plant Data & Reporting
**Client:** GSPC Pipavav Power Corporation Limited (702 MW Combined Cycle Power Plant)

> **Status:** frontend is being implemented by the main team using this file as the specification. If you are a contributor: treat it as the review reference — check PRs against §5 contracts and §7 UI specs, and pick up polish tickets from PLAN.md. Never edit `backend/`.

> Companions: [ARCHITECTURE.md](../ARCHITECTURE.md) (whole system) · [PLAN.md](../PLAN.md) (who owns what)
> **Your territory:** everything inside `frontend/`. **Our territory:** `backend/`. If you need an API that doesn't exist yet, ping us — never edit backend files.

---

## 1. The App in Plain Words (your mental model)

GSPC's O&M team keeps power-plant performance data in Excel sheets. Digging up old data = manually opening files. We are building the reporting layer:

1. User logs in (email + password).
2. Picks **Plant → Unit → Parameters → Time period**.
3. Instantly sees the readings as a table + min/max/avg summary (+ optional chart).
4. Hits **Download PDF** — the *backend* generates it; you just trigger the download.
5. Everything they did (login, query, PDF) is auto-audited backend-side. **You never touch audit logging.**

**You do NOT need any power-plant domain knowledge.** Treat data as `(date, parameter-name, number, unit-of-measure)` rows.
**You do NOT build PDFs, auth logic, rate limits, or validation of unit permissions server-side — all backend.** Your permission checks are UX only (hide what the user can't use); the server is the real gatekeeper.

---

## 2. Stack You Must Use (fixed)

| Concern | Choice |
|---|---|
| Build | Vite + React 18 + TypeScript |
| Styling | Tailwind CSS (mobile-first) |
| Routing | React Router v6 |
| Server data | TanStack Query (all GET/POST → hooks) |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| HTTP | Axios |
| PWA | vite-plugin-pwa (manifest + service worker) |

---

## 3. Pages You Will Build

| Route | Page | Notes |
|---|---|---|
| `/login` | Login | RHF+Zod, show field/API errors, "Forgot password" = disabled stub link |
| `/` | Redirect | ADMIN → `/admin/users`; PLANT_USER/VIEWER → `/query` |
| `/query` | Main screen | The core product page — details in §7.1 |
| `/admin/users` | Users | list + create modal + edit modal + assign units + deactivate |
| `/admin/uploads` | Uploads | upload form + batch history + error viewer |
| `/admin/audit` | Audit log | filterable table (user / action / date range), paginated |
| `/admin/plants` | Plants | read-only plant/unit/capacity list |

Layout: top bar (app name, user name, Logout; ADMIN gets "Admin" link). On mobile, collapsible drawer.

---

## 4. Auth Flow (exact behavior)

1. `POST /auth/login` with `{email, password}` → save `access_token` + `refresh_token` + `user` in localStorage.
2. Attach `Authorization: Bearer <access_token>` to every request (Axios interceptor).
3. On any `401`, call `POST /auth/refresh {refresh_token}` once; retry the original request. If refresh also fails → clear storage → redirect `/login`.
4. Logout: `POST /auth/logout` then clear storage.
5. Route guards: no token → `/login`; the 3 roles are `ADMIN` | `PLANT_USER` | `VIEWER` (VI & PU have identical UI access: only `/query`).

---

## 5. API Contracts (copy exactly — types below)

Base URL: `import.meta.env.VITE_API_BASE` (dev = `/api/v1` via Vite proxy).

### 5.1 `POST /auth/login`
```jsonc
// req   { "email": "admin@gspc.local", "password": "ChangeMe123!" }
// 400 → 401 on wrong creds ("Invalid email or password")
// 429 → "Too many attempts, try again in a minute" (5/min/IP, backend handles)
// 200 →
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "user": { "id": "uuid", "name": "Admin", "email": "admin@gspc.local", "role": "ADMIN" }
}
```

### 5.2 `POST /auth/refresh`
```jsonc
// req { "refresh_token": "eyJ..." } → { "access_token": "eyJ..." }
```

### 5.3 `GET /plants` (auth)
```jsonc
// ADMIN sees all plants; others only plants of their assigned units.
// → [{ "id": "uuid", "name": "GSPC Pipavav Power Corporation Ltd.", "location": "Pipavav, Gujarat" }]
```

### 5.4 `GET /units?plant_id=<uuid>` (auth, same scoping)
```jsonc
// → [{ "id": "uuid", "plant_id": "uuid", "unit_number": "Unit 1", "capacity_mw": 234.0 }]
```

### 5.4b `GET /units/{unit_id}/parameters` (auth) — dynamic parameter options
```jsonc
// → [{ "parameter": "plf", "uom": "%" }, { "parameter": "heat_rate", "uom": "kcal/kWh" }]
// [] when no data was ever uploaded for that unit.
// ⚠️ NEVER hardcode parameter names anywhere. The Parameter multi-select (and its
// default UoM display) comes from THIS endpoint; a user may also type-free select All.
```

### 5.5 `POST /query` (auth) — THE main endpoint
```jsonc
// req
{
  "plant_id": "uuid",
  "unit_id": "uuid",
  "parameters": [],            // [] = ALL parameters for that unit; else e.g. ["plf","heat_rate"]
  "period": {                  // exactly one mode:
    "mode": "DAY",   "day": "2026-03-14" },
  // period could also be: { "mode": "MONTH", "month": "2026-03" }
  //                    or { "mode": "YEAR",  "year": "2026" }
  //                    or { "mode": "RANGE", "start": "2026-01-01", "end": "2026-03-14" }
}
// res
{
  "rows": [
    { "recorded_date": "2026-03-14", "parameter": "generation", "value": 23.4, "uom": "MU" }
  ],
  "summary": [
    { "parameter": "generation", "min": 12.0, "max": 23.4, "avg": 18.7 }
  ]
}
```
Errors: 403 if unit not assigned to you (show a friendly "You don't have access to this unit").

### 5.6 `POST /report/pdf` (auth) — same body as `/query`
Response is a PDF stream (`content-type: application/pdf`).
Implementation: `axios.post('/report/pdf', queryBody, { responseType: 'blob' })` → create `ObjectURL` → `a.download = \`${unit}_${dateRange}.pdf\``. Filename is your choice.

### 5.7 `GET /auth/me` (auth) → `{ user }` — use on app boot to restore session.

---

### 5.8 ADMIN-only endpoints

**Users**
```jsonc
GET    /users                        → paginated [{ id, name, email, role, is_active, unit_ids[] }]
POST   /users     { name, email, password, role, unit_ids[] }       // roles: "ADMIN"|"PLANT_USER"|"VIEWER"
PATCH  /users/{id}  { name?, role?, is_active? }                    // partial; success = 200 + updated user
POST   /users/{id}/units  { unit_ids: ["uuid", ...] }               // REPLACES all assignments
DELETE /users/{id}                                                  // 204 = deactivated
```

**Uploads (ADMIN)**
```jsonc
POST /uploads  FormData: file = .xlsx | .csv (≤10MB)
// 200 →
{ "batch_id": "uuid", "rows_imported": 1200, "rows_rejected": 3, "status": "SUCCESS"|"PARTIAL"|"FAILED",
  "errors": [ { "row": 42, "message": "value is not numeric" } ] }
// >20% rows bad → whole batch "FAILED", nothing imported, errors list filled.

GET    /uploads?page=1   → paginated [{ id, filename, uploaded_by_name, uploaded_at, status, rows_imported, rows_rejected }]
GET    /uploads/{id}     → single batch incl. full error report
DELETE /uploads/{id}     → 204 (batch + its rows removed, soft-deleted)
```

**Audit (ADMIN)**
```jsonc
GET /audit?user_id=&action=&from=&to=&page=1
// from/to = YYYY-MM-DD; page starts at 1, page size ~25 (honor "total" for pagination)
// → { "total": 312, "items": [ { "id": 1, "user": { "id":"uuid","name":"Admin" },
//     "action": "QUERY_EXECUTED", "payload": { "unit_id": "...", "period": {...} },
//     "ip_address": "10.0.0.5", "created_at": "2026-03-14T09:31:00Z" } ] }
// action filter values: LOGIN_SUCCESS | LOGIN_FAILURE | EXCEL_UPLOAD | QUERY_EXECUTED |
//   PDF_DOWNLOADED | USER_CREATED | USER_UPDATED | UNIT_ASSIGNED | BATCH_DELETED
```

**Health:** `GET /health` → `{ "status": "ok" }` (no auth; use for a "backend down" snackbar).

---

## 6. TypeScript Types (put in `frontend/src/types/`)

```ts
export type Role = 'ADMIN' | 'PLANT_USER' | 'VIEWER';

export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'EXCEL_UPLOAD' | 'QUERY_EXECUTED'
  | 'PDF_DOWNLOADED' | 'USER_CREATED' | 'USER_UPDATED' | 'UNIT_ASSIGNED' | 'BATCH_DELETED';

export interface User { id: string; name: string; email: string; role: Role; is_active?: boolean; unit_ids?: string[]; }
export interface Plant { id: string; name: string; location: string | null; }
export interface Unit { id: string; plant_id: string; unit_number: string; capacity_mw: number | null; }
export interface ParameterMeta { parameter: string; uom: string | null; }

export type PeriodMode = 'DAY' | 'MONTH' | 'YEAR' | 'RANGE';
export type Period =
  | { mode: 'DAY';   day: string }
  | { mode: 'MONTH'; month: string }                       // "YYYY-MM"
  | { mode: 'YEAR';  year: string }                        // "YYYY"
  | { mode: 'RANGE'; start: string; end: string };

export interface QueryRequest {
  plant_id: string;
  unit_id: string;
  parameters: string[];                                    // [] = all
  period: Period;
}
export interface QueryRow  { recorded_date: string; parameter: string; value: number; uom: string | null; }
export interface QuerySummary { parameter: string; min: number; max: number; avg: number; }
export interface QueryResponse { rows: QueryRow[]; summary: QuerySummary[]; }

export interface UploadResult {
  batch_id: string; rows_imported: number; rows_rejected: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  errors: { row: number; message: string }[];
}
export interface UploadBatch {
  id: string; filename: string; uploaded_by_name: string; uploaded_at: string;
  status: UploadResult['status']; rows_imported: number; rows_rejected: number;
}
export interface AuditEntry {
  id: number; user: { id: string; name: string } | null;
  action: AuditAction; payload: Record<string, unknown>;
  ip_address: string | null; created_at: string;
}
```
> Backend still in progress? Mock these responses in a `src/lib/mock/` and flag mocks with a `TODO(mock)` comment — swap to real API by only changing `lib/api.ts`.

---

## 7. UI Specifications

### 7.1 `/query` — the money page
```
┌ Query ───────────────────────────────────────┐
│ Plant ▼  Unit ▼  (daisy-chained dropdowns)   │
│ Parameters: multiselect chips (default = All)│
│   ⚠ options fetched from /units/{id}/params  │
│ Period:  ( ) Day ( ) Month ( ) Year ( ) Range│
│         [ date input(s) per chosen mode ]    │
│ [ Query ]  [ Download PDF ]                  │
├──────────────────────────────────────────────┤
│ Summary cards:  per-parameter min/max/avg    │
│ Results table:  Date | Parameter | Value | UoM│
│ (optional) Recharts line per parameter       │
└──────────────────────────────────────────────┘
```
- Changing Plant resets Unit (and options).
- When Unit changes: fetch `GET /units/{unit_id}/parameters` and rebuild the Parameter multi-select from it. Sending `parameters: []` means ALL.
- Unit dropdown = server-filtered to user's access — never guess across the network.
- `parameters: []` default; empty arrays are valid.
- Entries with `null` UoM: show "—". Large tables: virtualize or paginate client-side (period = month ⇒ likely < 1k rows).
- Tables must be keyboard-navigable.

### 7.2 Design rules (non-negotiable)
* Tailwind, mobile-first.
* WCAG AA contrast.
* English strings only, plain ASCII.
* Consistent icon + badge colors for batch status:
  SUCCESS=green, PARTIAL=amber, FAILED=red, DELETED=gray.
* Suggested palette: primary steel-blue `#0F4C81` (plant/industrial feel).

### 7.3 PWA
* `vite-plugin-pwa` → installable.
* Service worker: pre-cache the shell assets only; never cache API responses for now.
* (Low priority, skip for MVP): offline cache of last query result per user.

---

## 8. Dev Setup

```powershell
cd frontend
npm install
npm run dev          # → http://localhost:5173 (Vite proxies /api → http://localhost:8000)
```
- If the backend isn't up yet: build against mocks per §6 or run ours (`uvicorn app.main:app` in `backend/`, seed first: run `backend/README.md` setup).
- Lint/Type-check must pass: `npm run lint` + `npx tsc --noEmit`.

## 9. Contribution Rules
1. Only files in `frontend/`. Branch names: `feat/frontend-login` style.
2. Tests not required but keep apps compiling after every commit.
3. After finishing an interactive piece, update the checklist in [PLAN.md](../PLAN.md) with you-own-it boxes.
4. Any doubt about a contract → ask on the chat before guessing; wrong contract guesses are the #1 frontend bug here.
