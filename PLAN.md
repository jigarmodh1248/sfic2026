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
| **Frontend** (React pages, forms, charts, PWA, styling) | **Contributor** | Owns `frontend/` folder |
| Frontend (backup / fill-in) | **Us** | We build progressively; contributor can replace/extend |

**Rule:** We build both halves as backup, but all frontend work happens in `frontend/` only and all backend work in `backend/` only — never mix folders in a PR.

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
- [ ] `backend/` project scaffold (FastAPI + config + logging)
- [ ] SQLAlchemy 2.x models for all 7 tables
- [ ] Alembic migration (initial schema)
- [ ] Seed script: plant, Units 1–3, admin user (password from `ADMIN_INITIAL_PASSWORD`)
- [ ] `GET /api/v1/health`

### Phase 2 — Auth & Roles
- [ ] `POST /auth/login` (bcrypt verify, JWT access 30min + refresh 7d)
- [ ] `POST /auth/refresh`, `POST /auth/logout` (refresh-token revocation), `GET /auth/me`
- [ ] Role dependencies: `ADMIN` / `PLANT_USER` / `VIEWER`
- [ ] Unit-access scoping dependency (PLANT_USER/VIEWER only see assigned units)
- [ ] Rate limit login: 5 attempts/min/IP (slowapi)
- [ ] Audit events: `LOGIN_SUCCESS`, `LOGIN_FAILURE`

### Phase 3 — Admin APIs
- [ ] `GET/POST /users`, `PATCH /users/{id}`, `DELETE /users/{id}` (soft delete)
- [ ] `POST /users/{id}/units` (replaces assignments)
- [ ] `GET /plants`, `GET /units?plant_id=`
- [ ] Audit events: `USER_CREATED`, `USER_UPDATED`, `UNIT_ASSIGNED`

### Phase 4 — Excel Upload
- [ ] `POST /uploads` (multipart, .xlsx/.csv, max 10 MB)
- [ ] Validation: required columns, dates parseable, values numeric, units exist
- [ ] `upload_batches` row + JSONB error report; `> 20%` failures ⇒ whole batch `FAILED`
- [ ] `GET /uploads` (paginated), `GET /uploads/{id}`, `DELETE /uploads/{id}` (soft delete, rows removed)
- [ ] Audit events: `EXCEL_UPLOAD`, `BATCH_DELETED`

### Phase 5 — Query & PDF
- [ ] `POST /query` — DAY / MONTH / YEAR / RANGE modes; rows + per-parameter min/max/avg
- [ ] Access-scoped (only units the user is assigned to)
- [ ] `POST /report/pdf` — ReportLab: "GSPC Pipavav Power Corporation Limited — Confidential" header, plant/unit/period/params/user/timestamp, result table, footer "Generated from PS000200 Reporting System"
- [ ] Audit events: `QUERY_EXECUTED`, `PDF_DOWNLOADED`

### Phase 6 — Audit API
- [ ] `GET /audit?user_id=&action=&from=&to=&page=` (paginated, ADMIN only)

### Phase 7 — Frontend (Contributor leads)
- [ ] Vite + React 18 + TS scaffold, Tailwind, React Router v6, TanStack Query
- [ ] `/login` (RHF + Zod, error handling, forgot-password stub)
- [ ] `/` role-based redirect
- [ ] `/query` — plant → unit → parameters (multi-select) → period form; results table; min/max/avg summary cards; Recharts line chart; "Download PDF" button
- [ ] `/admin/users` — list + create/edit modal + unit assignment
- [ ] `/admin/uploads` — upload form + batch history + error viewer
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

- API contract questions → ARCHITECTURE.md §5; if a change is needed, update the contract there **in the PR that changes the backend**, and ping the other owner.
- Contract types are duplicated in frontend TS types under `frontend/src/types/` — keep in sync.
