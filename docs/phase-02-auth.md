# PH-A2 Explanation — Auth & Roles (Phase 2)

**What Phase 2 delivered:** complete JWT authentication — login (bcrypt password check, access+refresh tokens), token refresh, logout with **refresh-token revocation**, session introspection (`/auth/me`), rate-limited login attempts (5/min/IP per spec), role dependencies (`require_admin`), unit-access scoping helper, and audit logging of both successful and failed logins. All covered by 11 passing pytest tests.

> The username/password checking was put in Phase 2, but the hashing functions (`hash_password` / `verify_password`) live in the `security.py` written this phase; the Phase-1 seeder already used them to create the accounts.

---

## File-by-File

### `backend/app/core/security.py` — the crypto core
- `hash_password` / `verify_password`: bcrypt (`hashpw`/`checkpw`). bcrypt salts automatically; verify never raises on hash format problems (returns `False` instead) — a defensive choice so corrupt DB rows read as "wrong password", not a 500 error.
- `_create_token(sub, type, ttl)`: builds the JWT payload `{sub: <user id>, type: "access"|"refresh", jti: <unique id>, iat, exp}`. Two payload fields matter:
  - **`type`** — stops a *refresh token being used as an access token* and vice versa (each decode validates the expected type).
  - **`jti`** — unique token id; the logout endpoint registers it in `token_store`, and refresh checks the registry (see below).
- `create_access_token(user_id)` → 30 min TTL; `create_refresh_token(user_id)` → 7 days (both from settings).
- `decode_token(token, expected_type)` → returns the `sub` (user id string) or `None`; expires/malformed/wrong-type all become `None`.

### `backend/app/core/token_store.py` — refresh-token revocation (logout)
- JWT is stateless, so "invalidate on logout" needs server-side state. This small thread-safe in-memory registry: `revoke(jti, expires_at)` / `is_revoked(jti)`; expired entries are garbage-collected on each access, so the set can't grow unbounded.
- **Known MVP limitation (documented in the module):** state is per-process memory. Fine for the single-worker uvicorn; for a multi-worker production deployment this graduates to a Postgres/Redis table — a one-file swap because all callers go through this module (`revoke`/`is_revoked`).

### `backend/app/core/audit.py` — one helper every endpoint will use
- `audit_log(db, user_id, action, payload, ip)` inserts an `audit_logs` row **and** emits a matching structured stdout log (JSON) — the DB record serves the admin's audit page, the stdout record serves operational monitoring. The caller owns `db.commit()`, so an audit entry participates in the same transaction as the action it describes.

### `backend/app/core/deps.py` — FastAPI dependency machinery
- `get_client_ip(request)`: reads `X-Forwarded-For` first (nginx will set it in prod), falls back to the socket address — needed for rate limiting + audit.
- `get_current_user(...)`: FastAPI dependency. Extracts `Bearer` credentials (401 if missing), decodes expecting `type="access"` (401 if expired/invalid), loads the `User` row, 401s if the user is inactive/missing. **Every protected endpoint in the app builds on this.**
- `require_admin(user = Depends(get_current_user))`: layered dependency — 403 unless `role == ADMIN`. Admin-only routers (users, uploads, audit) simply add this one line.
- `get_allowed_unit_ids(db, user)`: ADMIN ⇒ every unit id; others ⇒ the ids in `user_unit_access` for them. Returns a `set` for O(1) checks.
- `ensure_unit_access(db, user, unit_id)`: raises **403 "You do not have access to this unit"** when the requested unit isn't allowed — the exact contract error the frontend will show.

### `backend/app/schemas/auth.py` — request/response models (Pydantic v2)
- `LoginRequest{email,password}`, `RefreshRequest{refresh_token}` — typed request bodies.
- `UserOut{id,name,email,role,is_active,unit_ids[]}` — the stable user shape the frontend stores; `unit_ids` drives the frontend's unit dropdown filtering for non-admins.
- `TokenPair{access_token, refresh_token, token_type:"bearer", user}` — the login response (spec contract); `AccessTokenResponse` for refresh's response.

### `backend/app/api/v1/auth.py` — the four endpoints
- **`POST /auth/login`**
  1. Rate limited by **slowapi decorator** `@limiter.limit(settings.LOGIN_RATE_LIMIT)` (5/minute), keyed on client IP → 429 emitted by the app-level exception handler before any DB work.
  2. Loads user by email; **one audit branch for every failure**: no-user AND wrong-password AND inactive-user all produce `LOGIN_FAILURE` with a generic `{"reason": invalid...}` (no oracle for "user exists but password wrong"), then commit immediately so failure is recorded even though the request 401s.
  3. On success: `LOGIN_SUCCESS` audit + commit, then issue access+refresh and respond with `TokenPair`.
- **`POST /auth/refresh`**
  1. Decodes expecting `type="refresh"`, checks the `jti` is not revoked, checks the user still exists and is active.
  2. Issues only a new access token (`AccessTokenResponse`). The session itself is only terminated server-side by logout (revocation) or password-follow-up expiry — intentional, because refresh is called when the access token is dead, there's nothing to revoke.
- **`POST /auth/logout`** (204): requires a valid access token, takes `{refresh_token}` in the body, and revokes that refresh token's `jti` until its natural expiry. Batch: browser-side token clearing + server-side revocation = the "invalidates refresh token" requirement (a stolen refresh token stops working the instant its row is revoked... from that client's logout).
- **`GET /auth/me`** — identity for route guards + role-based redirect.

### `backend/app/main.py` (update)
- Wires the limiter into app state and registers `RateLimitExceeded → 429 JSON` handler, so 429 responses are consistent (`{"detail":"Rate limit exceeded..."}`).

### `backend/tests/` — pytest suite (everything was proven, not assumed)
- **`conftest.py`**: points `DATABASE_URL` at a disposable `test.db` **before any app import** (config reads env at import time), then within one session-wide fixture: drop tables → create via metadata → **run the real seeder** (so the test DB is identical in shape to dev: users, units, 10k data rows) → allow tests → dispose engine then delete the file (Windows locks open SQLite files; disposal avoids the `PermissionError`).
  - `_limiter_default_off` (autouse): the rate limiter counts per IP, and all tests share one IP — so it's disabled globally and **re-enabled only inside the rate-limit test** to assert the 429 deterministically; other login tests then never flake.
- **`test_auth.py`** (11 tests):
  | test | proves |
  |---|---|
  | `test_health` | API mounts correctly |
  | `test_login_success` | full happy path + TokenPair shape + ADMIN role |
  | `test_login_wrong_password` / `test_login_unknown_email` | both 401 **without leaking whether the account exists** |
  | `test_me_requires_token` | protected endpoints reject no-token requests |
  | `test_me_works` | valid access token → identity |
  | `test_refresh_flow` | refresh rotates access correctly |
  | `test_refresh_rejects_access_token` | type confusion attack rejected (access used as refresh → 401) |
  | `test_logout_revokes_refresh` | after logout the same refresh token stops working (revocation really recorded) |
  | `test_rate_limit_5_per_minute` | 6th rapid attempt → 429 |
  | `test_seed_demo_data_exists` | phase-1 seed landed in the test DB (plant + data row present) |

---

## How a login actually flows end to end (short version)
```
Browser:  POST /api/v1/auth/login {email, password}
   │  1. slowapi: 5/min/IP window → 429 if exceeded
   │  2. bcrypt.checkpw(password, user.password_hash)
   │  3. audit LOG to DB (success/failure) + stdout (JSON)
   ▼
Browser stores: access_token (memory) · refresh_token · user {role, unit_ids}
   │  every API call adds  Authorization: Bearer <access>
   ▼
Endpoint deps:  get_current_user → (require_admin) → ensure_unit_access
   ▼  access dies after 30 min:
Axios calls POST /auth/refresh {refresh_token} → new access → retry original request
   ▼  Logout: revoke jti server-side + clear client storage
```
