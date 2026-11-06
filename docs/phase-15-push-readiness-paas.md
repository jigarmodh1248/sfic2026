# PH-A15 Explanation — Push-Readiness Review & PaaS Preparation (Phase 15)

**What Phase 15 delivered:** a final codebase review against the Problem Statement with a push verdict (ready), plus three small PaaS-preparation changes so the app can deploy as a **single platform** without code forks: a configurable API base for static hosting, a PORT-aware uvicorn command, and the admin-registration kill switch wired into compose/env.

---

## Review against the Problem Statement (final verdict)

> "End user can easily access & download the power plant performance and operation parameters instantly for suitable further decision making process for the plant."

| # | Requirement trace | Where implemented | Status |
|---|---|---|---|
| 1 | Easy access | Role redir (plant users land on `/query`), one-click presets, first-unit auto-select, lucide-nav app, installable PWA | ✅ |
| 2 | Instant download | `POST /report/pdf` enabled pre-run from valid unit+period; blob download + toast; audit `PDF_DOWNLOADED` w/ file size | ✅ |
| 3 | Performance & operation parameters | Data-agnostic parameter vocabulary via `GET /units/{id}/parameters`; long-format ingest (wide-format Phase 11 pending real file) | ✅ demo scope |
| 4 | Decision making | Min/Max/Avg cards, single-parameter trend chart, records table, admin Dashboard KPIs (units/batches/health/last login) | ✅ |
| 5 | Governance | Full audit trail (logins, failed logins, uploads, deletions, registrations, queries, downloads), admin-only audit viewer | ✅ |
| 6 | Access control | JWT + role gates, unit-level `ensure_unit_access` everywhere data is read | ✅ |

**Verdict: ready to push.** Evidence at review time: pytest **59/59**, `tsc --noEmit` + production build clean (PWA precache emitted), live proxy e2e re-verified (admin/plant logins, role-based scoping). Repo state: clean working tree, linear main, `.env` gitignored beyond the `.env.example` template, CI workflow validating every push.

**Known deferrals (by design, in PLAN.md):** Phase 11 `wide_format` translator (awaits the real GSPC file); Docker-build validation (no Docker daemon on the dev workstation — compose files written and reviewed, CI checks code but not image builds).

## PaaS preparation changes (`5f7c67c`)

1. **`frontend/src/lib/api.ts` — `API_BASE`**: axios baseURL is now `import.meta.env.VITE_API_URL` when set, else the same-origin `/api/v1` (Vite proxy in dev, nginx in compose). `api.ts` refresh interceptor and `auth.tsx` login/register raw POSTs all use it. Needed because a hosted static site (e.g. Render Static Site) cannot reverse-proxy `/api` like the nginx image does — the SPA must call the backend on its platform URL directly, with CORS already keyed to `FRONTEND_ORIGIN`.
2. **`backend/Dockerfile` — `${PORT:-8000}`**: PaaS providers inject `PORT`; default stays 8000 for compose/local.
3. **compose + `.env.example` — `ALLOW_ADMIN_SELF_REGISTER`**: the Phase 13 kill switch is now a first-class compose env var (default true for demo, set false for the production rollout).

## Deployment recommendation (Render vs Vercel)

**Use Render — one platform, one repo, all three services.** Rationale and why not Vercel:

- This backend is a **long-running process with in-process state**: JWT refresh-token revocation (`token_store`) and the login rate limiter live in memory. Vercel's serverless model runs per-request instances where that state does not persist reliably, and its proxy limits (multipart Excel uploads to 10 MB, streaming PDFs) are awkward for FastAPI. Render runs the actual uvicorn container as designed — including our existing Dockerfile, unchanged.
- Total ecosystem also fits: Render Postgres (replaces the compose `db`), Render Static Site for the Vite build (with SPA rewrite), Render Web Service (Docker) for the backend.
- One repo → you can even leave `docker-compose.yml` as the local "prod simulator"; Render services are configured in the dashboard from the same Dockerfiles.

**Concrete Render setup (when ready):**
1. **PostgreSQL** instance → copy the *Internal Database URL*.
2. **Web Service** (Docker) with root `./backend`: env `DATABASE_URL=<internal url>` (swap scheme to `postgresql+psycopg2://`), `JWT_SECRET`, `ADMIN_INITIAL_PASSWORD`, `SEED_DEMO_DATA=false`, `ALLOW_ADMIN_SELF_REGISTER=true` (then false), `FRONTEND_ORIGIN=https://<your-static-site>.onrender.com`. Entrypoint auto-runs `alembic upgrade head && python -m app.seed`.
3. **Static Site** with root `./frontend`: build `npm ci && npm run build`, publish `dist`, SPA rewrite `/* → /index.html`, env `VITE_API_URL=https://<your-backend>.onrender.com`.
4. Operational notes: keep the backend to a **single instance** (in-memory token revocation would not survive horizontal scaling — Redis would be the upgrade path); the free tier sleeps after inactivity, so a first-request cold start (~30–60 s) is normal on payment-free plans.
