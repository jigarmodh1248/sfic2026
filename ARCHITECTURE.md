# ARCHITECTURE.md — Full Project Overview

**Project:** PS000200 — Easily Accessibility of Power Plant Data & Reporting
**Client:** GSPC Pipavav Power Corporation Limited (702 MW Combined Cycle Power Plant)

> What the system is, in one sentence: **a secure reporting layer on top of uploaded Excel data** — no live SCADA, no AI/ML, no real-time streaming (explicitly out of scope).

This file explains **how everything fits together** so any contributor can start working in under an hour. For the roadmap/work division see [PLAN.md](./PLAN.md).

---

## 1. The Big Picture

```
                        ┌──────────────────────────────┐
 ┌──────────┐   HTTPS    │      SINGLE DOCKER HOST      │       ┌────────────┐
 │   User   ├───────────►│  docker compose up           │       │   Admin    │
 │ (mobile/ │            │                              │       │  uploads   │
 │  desktop)│            │  ┌────────┐    ┌──────────┐  │       │  Excel     │
 └──────────┘            │  │ Nginx  │───►│ Backend  │──┼──────►└─────┬──────┘
                         │  │        │    │ FastAPI  │  │   /api/v1   │
   ==================    │  └────────┘    └────┬─────┘  │             ▼
   💡 Key mental model:  │                     │        │      ┌────────────┐
   Excel files are       │  ┌────────┐    ┌────▼─────┐  │      │  .xlsx/.csv│
   UPLOADED data —       │  │Frontend│    │PostgreSQL│  │      └────────────┘
   the app never talks   │  │ static │    │    15    │  │
   to SCADA/sensors.     │  └────────┘    └──────────┘  │
   ==================    └──────────────────────────────┘
```

**Data flow, end to end:**

1. **Admin logs in** → uploads an Excel/CSV file (plant performance data, long format).
2. **Backend validates & imports** rows into a big `plant_data` table (one row = one parameter reading). Failed rows are reported back; too many failures ⇒ whole batch rejected.
3. **Any authorized user** selects plant → unit → parameters → time period → sees results table + min/max/avg summary (+ optional chart).
4. **User downloads a PDF** — generated server-side, stamped "Confidential".
5. **Every action** (login, upload, query, download, user changes) is written to an `audit_logs` table, viewable by the Admin.

---

## 2. Tech Stack (final — do not substitute)

| Layer | Technology | Why |
|---|---|---|
| Backend | Python 3.11, FastAPI, SQLAlchemy 2.x, Alembic, Pydantic v2 | Fast, typed, standard |
| Auth libs | `python-jose` (JWT), `passlib[bcrypt]` | Spec requirement |
| Excel / PDF | `pandas`, `openpyxl`, `reportlab` | Parse uploads, build PDF |
| Rate limiting | `slowapi` | 5 login attempts/min/IP |
| Database | PostgreSQL 15 in Docker · SQLite allowed for local dev | Postgres ships in compose |
| Frontend | React 18 + Vite + TypeScript, Tailwind CSS | Fast DX |
| Frontend state/data | React Router v6, TanStack Query | Server-state fetching |
| Forms | React Hook Form + Zod | Typed validation |
| Charts | Recharts | Line charts per parameter |
| PWA | `vite-plugin-pwa` | Installable on mobile |
| Infra | Docker + Docker Compose, Nginx | One-command deploy |
| Tests | pytest (backend), lint+tsc (frontend) | Coverage required for auth/upload/query |

---

## 3. Repository Layout

```
.
├── PLAN.md                 # roadmap, phases, ownership (keep updated!)
├── ARCHITECTURE.md         # this file — project overview
├── README.md               # quickstart when it exists
├── docker-compose.yml      # db + backend + nginx  (one command start)
│
├── backend/                # ← we build here (FastAPI)
│   ├── app/
│   │   ├── main.py         # FastAPI app factory, router mounting, CORS
│   │   ├── core/
│   │   │   ├── config.py   # env settings (Pydantic-settings)
│   │   │   ├── security.py # bcrypt hash/verify, JWT create/decode
│   │   │   ├── deps.py     # get_db, get_current_user, require_admin, unit-scope
│   │   │   └── audit.py    # audit_log(user, action, payload, ip) helper
│   │   ├── models/         # SQLAlchemy 2.x models (§4)
│   │   ├── schemas/        # Pydantic v2 request/response models
│   │   ├── api/v1/         # one router file per section (§5)
│   │   │   ├── auth.py  users.py  plants.py  uploads.py  query.py  report.py  audit.py
│   │   ├── services/
│   │   │   ├── excel.py    # parse + validate + import (batch logic)
│   │   │   ├── query.py    # date expansion + filtering + summary stats
│   │   │   └── pdf.py      # ReportLab generator (§ 6.2)
│   │   └── seed.py         # plant, Units 1–3, admin user
│   ├── alembic/            # migrations
│   ├── tests/              # pytest
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/               # ← we build here (React); contributor reviews/extends
│   ├── src/
│   │   ├── pages/          # Login, Query, admin/* (§6)
│   │   ├── components/
│   │   ├── lib/api.ts      # axios instance + interceptors
│   │   ├── types/          # TS mirrors of API contracts (§5)
│   │   └── App.tsx / router
│   ├── package.json
│   ├── vite.config.ts      # dev proxy /api → backend
│   └── Dockerfile
│
└── nginx/                  # prod conf: serve static frontend + proxy /api
```

---

## 4. Data Model (7 tables)

```
plants ──< units ──< plant_data >── upload_batches
             │  ▲                          │
             └──────────┐                   │ (batch_id FK)
                        │                   │
users ──< user_unit_access >── units         │
  │         (who can see which unit)         │
  ├──< audit_logs                            │
  └──< upload_batches (uploaded_by) ─────────┘
```

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Accounts & roles | `id UUID`, `name`, `email`(unique), `password_hash`, `role` ∈ {ADMIN, PLANT_USER, VIEWER}, `is_active` |
| `plants` | Physical plants | `id`, `name`(unique), `location` |
| `units` | Units of a plant | `plant_id` FK, `unit_number`, `capacity_mw` — unique(plant_id, unit_number) |
| `user_unit_access` | Access grants | PK(user_id, unit_id) — **this table is the heart of authorization** |
| `upload_batches` | One per Excel upload | `filename`, `uploaded_by`, `status` ∈ {SUCCESS, PARTIAL, FAILED, DELETED}, `rows_imported`, `rows_rejected`, `error_report JSONB` |
| `plant_data` | The actual readings | `unit_id`, `parameter`, `value NUMERIC(14,4)`, `uom`, `recorded_date DATE`, `batch_id` — INDEX(unit_id, parameter, recorded_date) |
| `audit_logs` | Every user action | `user_id`, `action`, `payload JSONB`, `ip_address`, `created_at` — INDEX(user_id, created_at), INDEX(action, created_at) |

**Excel format (long format — one row per parameter reading):**

| Column | Type | Required |
|---|---|---|
| `unit_number` | string | yes |
| `recorded_date` | date `YYYY-MM-DD` | yes |
| `parameter` | string (e.g. `generation`, `plf`, `heat_rate`) | yes |
| `value` | number | yes |
| `uom` | string | optional |

**Validation on upload:** required columns present → dates parseable → values numeric → `unit_number` exists in `units`. If **> 20 %** of rows fail ⇒ whole batch rejected (`FAILED`). Deleting a batch cascades to its rows.

### 4.1 Data-Agnosticism Strategy (read before touching upload/query code)

**The problem:** we don't have GSPC's real Excel files yet — their sheets will probably be *wide format* (one row per date, one column per parameter, headers like `Heat Rate (kcal/kWh)`, merged cells, monthly tabs), not our neat 5-column long format.

**The solution — the backend adapts to the data, the data never bends the design:**

1. **`parameter` is free text.** Nothing about `generation`/`plf` is hardcoded anywhere. Whatever the company calls a parameter, that string is stored and returned. Same for `uom`.
2. **All UI options are derived from data.** The frontend's parameter multi-select is populated from `GET /units/{id}/parameters`, which does `SELECT DISTINCT parameter, uom FROM plant_data WHERE unit_id=X`. If GSPC writes `"Gross MWH"`, the dropdown shows `"Gross MWH"`. Zero code changes when real data arrives.
3. **Pluggable file translators.** The Excel service is built as `parse_rows(file, translator)`:

```
Excel file ──► [ translator: wide→long | long native ] ──► validate ──► plant_data
              (format detection: phase 2, admin can pick too)
```
   - **MVP ships `long_format` translator + official template** (see `GET /uploads/template`). Company admin is instructed: *fill our template*.
   - **Phase 2 adds `wide_format` translator** (first column = dates, header row = parameter names + uom in parentheses → pandas wide→long reshape) — *after* we've actually seen their file. Schema never changes either way.
4. **Validation = reliability feedback loop.** Unknown unit numbers are rejected with a message listing valid unit numbers; every bad row is reported with its row number. Bad file quality becomes a fix-in-one-pass loop instead of a crash.
5. **Demo/synthetic data is deletable.** Batches carry `batch_id`; anything we seed for demos can be removed without touching real data.

**Seed data (first run):**
- Plant *"GSPC Pipavav Power Corporation Ltd."* + Units 1, 2, 3 + admin `admin@gspc.local` with password from env `ADMIN_INITIAL_PASSWORD` (default `ChangeMe123!`).
- **Synthetic demo dataset (also seeds):** the last **12 months × 3 units × ~10 parameters** of realistic daily CCGT readings — `gross_generation`, `net_generation`, `plf`(30–60 %), `aux_consumption_pct`, `heat_rate`, `gas_consumption`, `steam_flow`, `steam_generation`, `hrsg_efficiency_pct`, `gas_turbine_output` — with plausible correlations (higher PLF ↔ lower heat rate). Stored as one self-identifying batch (`filename="SYNTHETIC_DEMO_DATA"`) so it can be deleted via the normal batch-delete flow once real data arrives. This gives frontend/chart demos ~10 k+ rows from day one.

---

## 5. API Contracts (Base URL: `/api/v1`)

All protected routes need `Authorization: Bearer <access_token>`. **Access rule outside ADMIN:** users may only touch units listed in `user_unit_access` for them.

### Auth
| Method & path | Body | Response | Notes |
|---|---|---|---|
| `POST /auth/login` | `{email, password}` | `{access_token, refresh_token, user}` | 429 after 5 fails/min/IP; 401 wrong creds |
| `POST /auth/refresh` | `{refresh_token}` | `{access_token}` | |
| `POST /auth/logout` | — | 204 | invalidates refresh token |
| `GET /auth/me` | — | `{user}` | current identity |

### Users (ADMIN only)
- `GET /users` — list
- `POST /users` — `{name, email, password, role, unit_ids[]}`
- `PATCH /users/{id}` — `{name?, role?, is_active?}`
- `POST /users/{id}/units` — `{unit_ids[]}` (replaces all assignments)
- `DELETE /users/{id}` — soft delete (`is_active=false`)

### Plants & Units
- `GET /plants` — list (non-admin: only plants containing assigned units)
- `GET /units?plant_id=` — units (same scoping)
- `GET /units/{unit_id}/parameters` — distinct parameters with uom seen for that unit; **populates the frontend's dynamic parameter dropdown** (returns `[]` if no data was ever uploaded)
  `→ [{ "parameter": "plf", "uom": "%" }, ...]`

### Uploads (ADMIN only)
- `GET /uploads/template` — downloads our official blank-import template `.xlsx` (5 required columns + one example row). **Company users should be asked to fill this template** until the phase-2 wide-format translator lands.
- `POST /uploads` — multipart `file` (`.xlsx`/`.csv`, ≤ 10 MB) →
  `{batch_id, rows_imported, rows_rejected, status, errors[]}`
- `GET /uploads` — paginated batches
- `GET /uploads/{id}` — detail + error report
- `DELETE /uploads/{id}` — soft delete (status=`DELETED`, rows removed)

### Query (all roles, unit-scoped)
```
POST /query
{ plant_id, unit_id,
  parameters: ["plf", ...],        // [] = all parameters for that unit
  period: {
    mode: "DAY" | "MONTH" | "YEAR" | "RANGE",
    day?: "YYYY-MM-DD", month?: "YYYY-MM", year?: "YYYY",
    start?: "YYYY-MM-DD", end?: "YYYY-MM-DD" } }
→ { rows: [{recorded_date, parameter, value, uom}],
    summary: [{parameter, min, max, avg}] }
```

### Report
- `POST /report/pdf` — same body as `/query` → `application/pdf` (streamed)

### Audit (ADMIN only)
- `GET /audit?user_id=&action=&from=&to=&page=` → `{items[], total}`

### Health
- `GET /health` → `{status:"ok"}`

**Audit event names (strings, used everywhere):**
`LOGIN_SUCCESS · LOGIN_FAILURE · EXCEL_UPLOAD · QUERY_EXECUTED · PDF_DOWNLOADED · USER_CREATED · USER_UPDATED · UNIT_ASSIGNED · BATCH_DELETED`

---

## 6. Frontend Overview (contributor zone)

### 6.1 Pages
| Route | What it does |
|---|---|
| `/login` | Email+password form (RHF+Zod), errors shown, "Forgot password" stub |
| `/` | Redirect: ADMIN → admin home; others → `/query` |
| `/query` | Main screen: plant → unit → parameters (multi-select, default=all) → period radio (DAY/MONTH/YEAR/RANGE). Results table + per-parameter min/max/avg cards + Recharts line + **Download PDF** button |
| `/admin/users` | List + create/edit modal + unit assignment |
| `/admin/uploads` | Upload form + batch history + error viewer |
| `/admin/audit` | Filterable audit log (user / action / date range) |
| `/admin/plants` | Read-only plants & units list |

### 6.2 PDF document structure (backend, ReportLab)
1. **Header:** `GSPC Pipavav Power Corporation Limited — Confidential`
2. Plant name · unit · date range · selected parameters
3. `Generated by <user name> at <timestamp>`
4. Result table (Date | Parameter | Value | UoM)
5. **Footer:** `Generated from PS000200 Reporting System`

### 6.3 Auth flow in the SPA
- Store access + refresh token after login (localStorage is acceptable for MVP).
- Axios request interceptor attaches bearer token; response interceptor on 401 → call `/auth/refresh` once → retry; on failure redirect to `/login`.
- Route guards by `user.role`; unassigned units must never be selectable — the dropdowns are filtered from `/plants` + `/units` responses (server also re-checks).

### 6.4 Non-functional requirements (checklist for both sides)
- Query response < 1 s for 100k rows (indexed columns; filter in SQL, not pandas).
- HTTPS only; CORS locked to frontend origin; structured JSON logs to stdout.
- WCAG AA contrast, keyboard navigable.
- English only for MVP, but all UI strings easy to extract later (i18n-ready).
- Chrome/Edge/Firefox/Safari — last 2 versions.

---

## 7. Local Development

### Backend (SQLite, no Docker needed)
```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head            # create schema
python -m app.seed              # seed plant + units + admin
uvicorn app.main:app --reload   # http://localhost:8000  (docs at /docs)
```

### Frontend
```powershell
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api → :8000)
```

### Full stack (prod-parity, Postgres)
```powershell
docker compose up --build
# Nginx on http://localhost:80 → frontend, /api → backend, db = postgres:15
```

**Default admin:** `admin@gspc.local` / `ADMIN_INITIAL_PASSWORD` (default `ChangeMe123!`) — change in production via env var.

---

## 8. Rules for Contributors (read before opening a PR)

1. Never commit secrets/tokens; config comes from env vars & compose.
2. Keep changes inside your folder (`frontend/` or `backend/`).
3. TS types in `frontend/src/types/` must mirror §5 exactly; if a contract must change, update ARCHITECTURE.md §5 in the same PR.
4. Every admin data-changing endpoint must write an audit event — use the `audit.py` helper, don't roll your own.
5. All authorization checks live **server-side**; frontend checks are UX only.
6. Run tests before pushing: `pytest` (backend) · `npm run lint` + `npx tsc --noEmit` (frontend).
7. English UI only for MVP; plain-ASCII strings so i18n can be added later.
