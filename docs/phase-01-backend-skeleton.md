# PH-A1 Explanation — Backend Skeleton (Phase 1)

**What Phase 1 delivered:** a runnable FastAPI server with the full database schema (7 tables), one-time migrations, a seeder that installs login accounts + a plant + 3 units + **10,950 rows of realistic synthetic performance data**, and a `/health` check. No auth yet — that's Phase 2.

> How to run: `cd backend` → `.venv\Scripts\python -m alembic upgrade head` → `.venv\Scripts\python -m app.seed` → `.venv\Scripts\python -m uvicorn app.main:app --reload`
> API docs then at http://localhost:8000/docs

---

## File-by-File

### `backend/requirements.txt`
The exact dependency list. Two decisions worth knowing:
- **`bcrypt` directly instead of `passlib[bcrypt]`** — passlib is unmaintained and crashes on Python 3.13+ (its `crypt` module was removed from Python). bcrypt does the same PBKDF-equivalent work (password hashing) and is actively maintained.
- Everything else matches the spec: FastAPI web framework, SQLAlchemy ORM, Alembic migrations, pandas/openpyxl for Excel, reportlab for PDF, slowapi for rate limiting, pytest for tests.

### `backend/app/core/config.py` — all settings in one place
- Defines a `Settings` class using **pydantic-settings**: every setting is an env var with a documented default (`JWT_SECRET`, `DATABASE_URL`, `ADMIN_INITIAL_PASSWORD = ChangeMe123!`, upload size limit, login rate limit...).
- `get_settings()` is `@lru_cache`d — settings are read from `.env`/environment **once** and reused everywhere.
- Dev default is **SQLite** (`sqlite:///./db.sqlite3`); `docker-compose` will override with Postgres. Same code runs on both.

### `backend/app/core/logging.py` — JSON logs to stdout
- A custom `JsonFormatter` turns every log line into a single JSON object `{"ts","level","logger","message",...}` — this satisfies the spec's "structured JSON logs" requirement and makes logs grep-able in production.
- `setup_logging()` replaces the default handlers for root + uvicorn loggers so everything flows through the JSON formatter.
- Callers can attach structured fields via `logger.info("audit", extra={"extra_fields": {...}})` — see audit.py in Phase 2.

### `backend/app/db.py` — database engine + session factory
- Builds one global SQLAlchemy `engine` from `settings.DATABASE_URL`.
- SQLite special-case: `check_same_thread=False` (FastAPI serves requests across threads).
- `SessionLocal` = session factory; `get_db()` is the **FastAPI dependency** every endpoint uses — it opens a session per request and always closes it (`try/finally`), so no session leaks.

### `backend/app/main.py` — app factory
- `create_app()` builds the FastAPI application: title, JSON logging setup, CORS middleware **locked to the frontend origin** from settings, and mounts the whole versioned API under `prefix="/api/v1"` (spec contract).
- `app = create_app()` — the object uvicorn imports.

### `backend/app/models/` — the 7 tables (one file per domain)

| File | Contents |
|---|---|
| `base.py` | `Base` (DeclarativeBase) with a **naming convention** (indexes/constraints get predictable `ix/aq/fk/pk` names → Alembic migrations become stable/deterministic). Defines portable column types: plain `JSON`/`String` on SQLite that become `JSONB`/`INET` on Postgres (`with_variant`), a shared `UuidType`, and role constants (`ROLE_ADMIN`, `ROLE_PLANT_USER`, `ROLE_VIEWER`). UUIDs are generated app-side with `uuid4` (works identically on both DBs). |
| `user.py` | `users` table + the `user_unit_access` association table (**the authorization heart**: PK = user_id+unit_id; who may query which unit). `user.units` relationship is `viewonly` — assignment happens by inserting rows into the association table. Email is unique; role has a DB-level CHECK constraint. |
| `plant.py` | `plants` (name unique, location) and `units` (belongs to plant, `unit_number`, `capacity_mw`, unique together per plant). Also the four batch status constants (`SUCCESS/PARTIAL/FAILED/DELETED`). |
| `upload.py` | `upload_batches`: one row per Excel upload — filename, uploader FK, status (CHECK-constrained), `rows_imported` / `rows_rejected` counters, and `error_report` (JSONB on Postgres) storing the detailed per-row errors. |
| `data.py` | `plant_data`: the big measurements table. `id` uses **`BigInteger().with_variant(Integer, "sqlite")`** — this is a real gotcha: SQLite only autoincrements an INTEGER primary key, not BIGINT; on Postgres it stays BIGINT. Indexed composite `(unit_id, parameter, recorded_date)` — that's exactly the query pattern of `/query`, which is how <1s responses on 100k rows will be met. `batch_id` FK with `ON DELETE CASCADE` → deleting a batch deletes its rows (spec requirement). |
| `audit.py` | `audit_logs`: user_id (SET NULL if user deleted — log must survive), action string, payload JSON, ip, timestamp. Two indexes for the admin page's filter patterns: `(user_id, created_at)` and `(action, created_at)`. |
| `__init__.py` | Re-exports everything, so `from app.models import Base, User...` works and Alembic sees full metadata. |

### `backend/app/api/v1/health.py` + `api/v1/__init__.py`
- `GET /api/v1/health` → `{"status":"ok"}` — used by compose, nginx, and the frontend to detect backend availability. The v1 `__init__` is the single place where all routers get included (health today; auth/users/uploads... in later phases).

### `backend/app/seed.py` — one-time setup + demo data
Two responsibilities, both **idempotent** (safe to run repeatedly):

1. **Structure & accounts** (`seed_plant`, `seed_users`): creates plant `"GSPC Pipavav Power Corporation Ltd."` + Units 1–3 (234 MW each), the ADMIN (`admin@gspc.local`, password from env) and one demo `PLANT_USER` (`plant@gspc.local`) with access to all 3 units — that account exists so unit-scoped behavior can be tested end to end. Passwords are hashed with bcrypt at seed time, never stored raw.

2. **Synthetic demo dataset** (`seed_demo_data`): the answer to "we don't have the company's Excel yet". Generates **365 days × 3 units × 10 parameters ≈ 10,950 rows** in one `SYNTHETIC_DEMO_DATA` upload_batch — deliberately created through the same table real uploads use, so it can later be deleted with the normal batch-delete flow (batch_id + CASCADE).
   - `_load_factor_for()`: a smooth daily load factor (35–100 %) with a scheduled "outage" dip every ~47 days.
   - `_synthetic_value()`: each parameter is derived from that load factor, so the data *behaves like a real plant*: `plf` = LF×100; generation ∝ LF; `aux_consumption_pct` rises when load falls; **`heat_rate` improves (goes down) at high load** — the correlation that makes demo charts believable; steam parameters partially track load.

### Alembic scaffold (`alembic.ini`, `alembic/env.py`, `alembic/script.py.mako`, `alembic/versions/c74a1e82cfa2_initial_schema.py`)
- `env.py` was customized: DB URL comes from app settings (so `alembic upgrade` works identically for SQLite and Postgres) and `target_metadata` points at our models' metadata → `alembic revision --autogenerate` reads model changes and writes migration code (the initial migration is checked in).
- `script.py.mako` got one extra import (`Text`) — the JSONB variant renders `JSONB(astext_type=Text())` in generated migrations; without the import the migration file would crash (`NameError`). This fixes it for **all future auto-generated migrations**, not just this one.
- Why migrations instead of `Base.metadata.create_all()`: schema changes later (phase 5 + real-data onboarding) must be upgradable on the client's DB without recreating it.

---

## Verification done at the end of Phase 1
- `alembic upgrade head` created all 7 tables.
- `python -m app.seed` → `Seed complete: ... demo_rows=10950`.
- `TestClient(app).get("/api/v1/health")` → `200 {"status": "ok", ...}`.
