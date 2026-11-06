# PH-A9 Explanation — Docker & Deploy (Phase 9)

**What Phase 9 delivered:** the full `docker compose up` deployment — Postgres 15, a Python 3.11 backend image that migrates + seeds + serves, and an nginx image that serves the built SPA and reverse-proxies `/api`. Plus one dependency fix (`psycopg2-binary`) Postgres mode needed. **Validation status: Docker Desktop is not installed on this workstation**, so images were built-by-reading, not built-by-running — the doc lists exactly what to verify on a host with Docker.

---

## File-by-File

### `backend/requirements.txt` — one line that matters
- `psycopg2-binary>=2.9.9` added: until now every run used SQLite's built-in driver; Postgres mode (compose) cannot start without the driver. Dev SQLite and Docker Postgres both stay on the same `DATABASE_URL` setting (Alembic + `db.py` already parameterized).

### `backend/Dockerfile`
- **`python:3.11-slim`** with `PYTHONUNBUFFERED=1` (stdout JSON logs actually stream, not buffer) and pip cache off.
- Installs from `requirements.txt`, then copies **only** `alembic.ini`, `alembic/`, and `app/` — no tests, no local `db.sqlite3`, nothing dev-only enters the image.
- **Entrypoint chain**: `alembic upgrade head && python -m app.seed && uvicorn …`
  - migrations first (idempotent on restart because Alembic tracks `alembic_version`),
  - the Phase-0 seeder second — *it's idempotent by design* (skips existing plant/units/users) and `SEED_DEMO_DATA` controls the synthetic dataset (set false in prod for a clean, empty system),
  - then uvicorn on 0.0.0.0:8000. If migrations fail (e.g., unreachable DB), the chain aborts and the container restarts — fail-fast, no half-migrated serving.

### `frontend/Dockerfile` — two-stage build
- Stage 1 `node:20-alpine`: `npm ci` (lockfile-pinned) → `npm run build` → `dist/` with the PWA service worker already generated.
- Stage 2 `nginx:1.27-alpine`: copies `dist/` to `/usr/share/nginx/html` and the custom site config. The Node toolchain never ships in the runtime image (~200 MB → ~50 MB image).

### `frontend/nginx/reports.conf`
- **API proxy**: `location /api/ → http://backend:8000` (compose service name) with `X-Forwarded-For/Proto` and `client_max_body_size 12m` (upload limit 10 MB + header headroom). Same-origin app+API ⇒ **no CORS preflights in production**; CORS middleware remains as the fallback for direct API access and is keyed to `FRONTEND_ORIGIN`.
- **SPAnish fallback**: `try_files $uri $uri/ /index.html` — deep links like `/admin/users` survive refresh.
- **Caching**: hashed `/assets/*.{js,css,png,…}` cached 30 days (immutable by content hash); `location = /sw.js` explicitly **no-cache** — a cached-outdated service worker is a broken-update footgun, so it always revalidates.
- A subtle write bug of mine (an invalid `add_header` signature) was caught and corrected during review of the config — nginx would otherwise have refused to start.

### `docker-compose.yml`
- **`db`**: Postgres 15 Alpine with a `pgdata` volume (data survives `compose down`, lost only `down -v`), healthcheck via `pg_isready` so the backend waits for a *ready* (not merely started) DB.
- **`backend`**: `depends_on` with `condition: service_healthy`; all secrets/config via env: `DATABASE_URL` (postgres DSN built from the password), `JWT_SECRET`, `FRONTEND_ORIGIN`, `ADMIN_INITIAL_PASSWORD`, `SEED_DEMO_DATA`. Port 8000 exposed for direct API/ops access.
- **`web`**: nginx on `${WEB_PORT:-8080}`.
- **Secret refusal**: password vars use `${VAR:?set in .env}` — compose **refuses to start** with missing secrets instead of silently running with empties.
- JSON structured stdout logging (Phase 0) covers every process — `docker compose logs backend` is already the ingest-ready format for the spec.

### `.env.example` + gitignore
- Template with the five required vars and a hint to generate `JWT_SECRET` (`openssl rand -hex 32`). `.gitignore` already excludes real `.env*` files with an allowlist for `.env.example` — no secret can leak into a commit.

## How to run (on a machine with Docker)
```bash
cp .env.example .env      # fill the three change-me secrets
docker compose up --build # → web on http://localhost:8080, API on :8000/api/v1
```
 First boot migrates, seeds (admin + units + optionally 10,950 demo rows), then serves.

## Deferred validation checklist (any Docker host)
1. `docker compose config --quiet` (syntax lint of the compose file).
2. `docker compose up --build` — three healthy services; `docker compose logs backend` shows JSON log lines + "Seed complete" only on first boot.
3. `POST http://localhost:8080/api/v1/auth/login` with `.env` admin credentials → tokens (proves proxy + Postgres path).
4. `/query` + PDF download from the running stack; service worker visible in devtools Application tab, installed via browser "Install" affordance.
Phase 10's optional CI workflow (GitHub Actions) would run steps 1–3 automatically on every push — first real validation gate.
