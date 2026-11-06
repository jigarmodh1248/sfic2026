# PH-A10 Explanation — Tests & CI (Phase 10)

**What Phase 10 delivered:** confirmation that the test/lint goals are fully met (51 backend pytest tests green on the whole suite; frontend `tsc --noEmit` + production build clean), plus a GitHub Actions workflow that gives the project its first reproducible validation gate — important given this workstation has no Docker daemon and now CI also protects the repo independent of any one machine.

---

## File-by-File

### Backend test suite — final shape (built phases 1–6, verified wholly now)
- `tests/conftest.py` forces `DATABASE_URL=sqlite:///./test.db` *before* any app import, runs the real seeder, and disables the login rate limiter by default (one dedicated rate-limit test re-enables it) — so 51 suites run in ~12 s on one unbounded temp DB.
- Coverage map:
  - **auth**: login ok/wrong-password, missing refresh, access-token expiry path, admin-unit scoping, refresh/logout token lifecycle;
  - **admin users**: create/patch/role-change/deactivate, unit-assignment replace semantics, VIEWER restrictions (403s), plant/unit visibility scoping (viewer with 1 unit sees 1 unit);
  - **uploads**: template download, valid import, malformed workbook → FAILED batch, per-row validation with PARTIAL, >20% auto-reject rule, batch detail/delete cascade, upload size/access limits;
  - **query + report**: all four period modes incl. leap-month boundaries, parameter filtering, mismatch 400, viewers 403s, dynamic-parameters endpoint, empty-result handling, PDF stream (`%PDF-` magic + size > threshold), PDF audit payload integrity (`file_size` matches streamed bytes);
  - **audit API**: admin gate (401/403), newest-first ordering, action/user/date filters, pagination + clamping.
- Conventions worth remembering: fixtures `admin_headers` / `plant_headers`; deterministic `.xlsx` built via openpyxl in-test; the pandas DLL incompatibility on this workstation is bypassed entirely (openpyxl + stdlib), so tests and dev both run here.

### `.github/workflows/ci.yml`
- Two independent jobs (parallel on push to main / any PR):
  1. **backend** — Python 3.11 (`actions/setup-python` with pip cache), `pip install -r requirements.txt` (installs pandas too — fine on Linux; that's the Docker-parity environment), then `python -m pytest tests -q` with the same env contract as local tests (sqlite test URL, CI JWT secret, demo seed on).
  2. **frontend** — Node 20 + npm cache keyed on `frontend/package-lock.json`, `npm ci`, `npm run lint` (tsc --noEmit), `npm run build` (which now also emits the PWA precache — so a broken manifest/plugin config fails CI, not just TS errors).
- Env vars are pinned so seeding/JWT never depend on hackers' defaults changing.
- This is the "optional" CI item, deliberately added: from now on a green commit on GitHub is evidence the whole stack compiles and its 51 test contracts hold — and every future PR inherits the gate.

### Why no NEW backend tests were written in Phase 10
The per-feature tests shipped **with** each feature phase (the plan's goal was confidence per phase, not a test phase bolted on at the end); Phase 10's job was to verify the aggregate suite passes together — done (51/51), and to wire CI.

### Validation transcript (this session)
- `cd backend; .venv\Scripts\python -m pytest tests -q` → **51 passed** (3 warnings, slowapi/uvicorn deprecation noise only);
- `cd frontend; npm run lint` → clean; `npm run build` → success incl. `dist/sw.js` + workbox precache (11 entries).
