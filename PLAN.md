# PLAN.md — Project Roadmap & Work Division

**Project:** PS000200 — Easily Accessibility of Power Plant Data & Reporting
**Client:** GSPC Pipavav Power Corporation Limited (702 MW Combined Cycle Power Plant)
**Goal:** A secure, role-based web/mobile (PWA) app where authorized users log in, select plant / unit / time period, instantly view performance parameters from uploaded Excel data, download a PDF report, and have every action audit-logged.

> This file is the **single source of truth for "what" and "when"**.
> For "how it all fits together", see [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## 1. Team Ownership

| Area | Owner | Notes |
|---|---|---|
| **Backend** (FastAPI, DB, auth, uploads, query, PDF, audit, Docker) | **Us (main)** | Full responsibility |
| **Frontend** (React pages, forms, charts, PWA, styling) | **Us (main)** | We build it; FRONTEND_GUIDE.md is the implementation spec |
| Review / backup support | **Contributor** | Reviews PRs, can pick up tickets (responsive polish, extra pages) using FRONTEND_GUIDE.md as reference |

**Rule:** Frontend work happens in `frontend/` only and backend work in `backend/` only — never mix folders in one commit/PR.

---

## 2. Milestones & Phases

Status legend: `[ ]` todo · `[~]` in progress · `[x]` done

### Phase 0 — Repo Setup & Docs
- [x] PLAN.md (this file)
- [x] ARCHITECTURE.md
- [ ] Git init + first commit pushed to GitHub
- [ ] Branch protection: PRs only into `main` (optional but recommended)
- [ ] `README.md` quickstart (how to run backend, frontend, docker compose)

### Phase 1 — Backend Skeleton
- [x] `backend/` project scaffold (FastAPI + config + logging)
- [x] SQLAlchemy 2.x models for all 7 tables
- [x] Alembic migration (initial schema)
- [x] Seed script: plant, Units 1–3, admin user (password from `ADMIN_INITIAL_PASSWORD`)
- [x] **Synthetic demo-data generator**: 12 months × 3 units × ~10 parameters (~10k+ rows, realistic CCGT correlations, marked as `SYNTHETIC_DEMO_DATA` batch so it's deletable once real data arrives)
- [x] `GET /api/v1/health`

### Phase 2 — Auth & Roles
- [x] `POST /auth/login` (bcrypt verify, JWT access 30min + refresh 7d)
- [x] `POST /auth/refresh`, `POST /auth/logout` (refresh-token revocation), `GET /auth/me`
- [x] Role dependencies: `ADMIN` / `PLANT_USER` / `VIEWER`
- [x] Unit-access scoping dependency (PLANT_USER/VIEWER only see assigned units)
- [x] Rate limit login: 5 attempts/min/IP (slowapi)
- [x] Audit events: `LOGIN_SUCCESS`, `LOGIN_FAILURE`

### Phase 3 — Admin APIs
- [x] `GET/POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}` (soft delete)
- [x] `POST /users/{id}/units` (replaces assignments)
- [x] `GET /plants`, `GET /units?plant_id=` (unit-access scoped)
- [x] Audit events: `USER_CREATED`, `USER_UPDATED`, `UNIT_ASSIGNED`

### Phase 4 — Excel Upload
- [x] Excel service built as pluggable `parse_rows(file, translator)`; MVP ships `long_format` translator (see ARCHITECTURE.md §4.1)
- [x] `GET /uploads/template` — official blank-import template download
- [x] `POST /uploads` (multipart, .xlsx/.csv, max 10 MB)
- [x] Validation: required columns, dates parseable, values numeric, units exist (unknown unit → rejection message lists valid unit numbers)
- [x] `upload_batches` row + JSONB error report; `> 20%` failures ⇒ whole batch `FAILED`
- [x] `GET /uploads` (paginated), `GET /uploads/{id}`, `DELETE /uploads/{id}` (soft delete, rows removed)
- [x] Audit events: `EXCEL_UPLOAD`, `BATCH_DELETED`

### Phase 5 — Query & PDF
- [x] `GET /units/{unit_id}/parameters` — dynamic parameter list (+uom) per unit, feeds the frontend selector (never hardcode parameter names)
- [x] `POST /query` — DAY / MONTH / YEAR / RANGE modes; rows + per-parameter min/max/avg
- [x] Access-scoped (only units the user is assigned to)
- [x] `POST /report/pdf` — ReportLab: "GSPC Pipavav Power Corporation Limited — Confidential" header, plant/unit/period/params/user/timestamp, result table, footer "Generated from PS000200 Reporting System"
- [x] Audit events: `QUERY_EXECUTED`, `PDF_DOWNLOADED`

### Phase 6 — Audit API
- [x] `GET /audit?user_id=&action=&from=&to=&page=` (paginated, ADMIN only)

### Phase 7 — Frontend (we build; contributor reviews)
- [x] Vite + React 18 + TS scaffold, Tailwind, React Router v6, TanStack Query
- [x] `/login` (RHF + Zod, error handling, forgot-password stub)
- [x] `/` role-based redirect
- [x] App shell: top bar, mobile drawer nav, role-filtered links, logout
- [ ] `/query` — plant → unit → parameters (multi-select) → period form; results table; min/max/avg summary cards; Recharts line chart; "Download PDF" button
  - **Note:** parameter options come from `GET /units/{id}/parameters` (dynamic, data-driven) — never hardcode names; `[]` parameter list = All
- [x] `/admin/users` — list + create/edit modal + unit assignment
- [x] `/admin/uploads` — upload form + batch history + error viewer
- [ ] `/admin/audit` — filterable log table
- [ ] `/admin/plants` — read-only plant/unit list
- [ ] Axios interceptor: attach token, auto-refresh on 401

### Phase 8 — PWA & Polish
- [ ] `vite-plugin-pwa`: manifest + service worker (installable)
- [ ] Mobile-first responsive pass, WCAG AA contrast, keyboard navigable
- [ ] (Optional, low priority) cache last successful query per user for offline

### Phase 9 — Docker & Deploy
- [ ] `backend/Dockerfile` (python:3.11)
- [ ] `frontend/Dockerfile` (build stage → static files)
- [ ] `nginx/` config: serve frontend + reverse proxy `/api` → backend
- [ ] `docker-compose.yml`: `db` (postgres:15) + `backend` + `web` — one `docker compose up`
- [ ] CORS locked to frontend origin
- [ ] JSON structured logs to stdout

### Phase 10 — Tests & CI
- [ ] pytest: auth (login/refresh/roles/scope), upload (valid/invalid/batch-reject), query (+ PDF content smoke)
- [ ] Frontend: `npm run lint` + `tsc --noEmit` clean
- [ ] (Optional) GitHub Actions CI: backend pytest + frontend lint/build

### Phase 11 — Real-Data Onboarding (phase 2, when GSPC's real file arrives)
- [ ] Obtain a sample of the real company Excel file
- [ ] `wide_format` translator (wide→long reshape in pandas; header = parameter name + uom in parentheses)
- [ ] Format auto-detection (or admin picks translator at upload time)
- [ ] Keep template flow as fallback; re-test validators against real-world data quirks (merged cells, thousand separators, "-" / "N.A." values)

---

## 3. Definition of Done (per feature)

1. Endpoint/page implemented per API contract (ARCHITECTURE.md §5 / §6).
2. Audit event logged where required.
3. Access control enforced server-side (never trust the frontend).
4. Tests pass; app runs with `docker compose up`.
5. Response codes documented in the PR.

---

## 4. Git Workflow

- `main` = always working (docker compose up must succeed).
- PRs from branches: `feat/<area>-<thing>` e.g. `feat/frontend-login`, `feat/backend-auth`.
- Frontend contributors never commit inside `backend/` and vice versa.
- Commit message style: short imperative (e.g. `feat: add login page`).

## 5. Communication & Handoff

- Primary implementation = us (both halves). Contributor reviews PRs and may take **non-blocking tickets only** (UI polish, extra validation UX) — each ticket links to the exact page/contract in FRONTEND_GUIDE.md.
- API contract changes always update ARCHITECTURE.md §5 and FRONTEND_GUIDE.md §5 in the same commit.
