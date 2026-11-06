# PH-A13 Explanation — Separated Admin Authentication (Phase 13)

**What Phase 13 delivered:** exactly the requested split — plant/user sign-in and administrator sign-in are now **separate screens and separate flows**. The regular `/login` page carries a clearly marked "Administrator sign in" button that leads to a dedicated admin screen (`/admin/login`), which additionally **refuses any non-ADMIN account**; and administrators can **register themselves** with a mail ID + password through `/admin/register`, creating a real ADMIN account via the new `POST /api/v1/auth/register`. Role gates unchanged elsewhere; existing API contracts (login/refresh/logout/me) untouched.

---

## Backend

### `app/core/config.py`
- New `ALLOW_ADMIN_SELF_REGISTER: bool = True` — kill switch. The first admin always comes from the seeder (`admin@gspc.local`); in production, once the real admin roster exists, set this to false and registration returns 403 without touching code.

### `app/schemas/auth.py`
- `RegisterRequest {name, email, password}`.

### `app/api/v1/auth.py` — `POST /auth/register`
- **Same rate limit as login** (5/min/IP via the slowapi limiter) — the endpoint hands out account sessions, so it deserves identical throttling.
- Input normalization: whitespace-trimmed/lowercased email, name trimmed; blank name → 422; password < 8 chars → 422 (same policy as `POST /users`).
- **Duplicate → 409** with the exact message the register page shows.
- Creates role `ADMIN`, `is_active=True`, **no unit assignments** (admin scope is not unit-based). Password hashed with the same bcrypt helper as everything else.
- **Audit `ADMIN_SELF_REGISTER`** with the actor's id — so the audit trail records who created an admin account even when no pre-existing admin did it.
- Returns the same `TokenPair` shape as login (`access_token`, `refresh_token`, `user`), letting the register page sign the new admin in immediately.

### Tests (`tests/test_auth.py`, 4 new → **59/59**)
- register → 201, role ADMIN, and the account can immediately log in through `/auth/login`;
- duplicate email → 409 with "already registered";
- blank name / short password → 422;
- self-registration when `ALLOW_ADMIN_SELF_REGISTER=False` → 403 (flag flipped per-test, restored in `finally`).

## Frontend

### `src/lib/auth.tsx` (interface extension, non-breaking)
- `login()` and new `registerAdmin()` **now return the LoggedUser** so pages can enforce role gates. Also stored in state as before — all existing call sites (user login page) are unaffected.

### `src/pages/Login.tsx` (user portal — unchanged behavior)
- Below the existing form: a bordered "**Administrator sign in**" button (shield icon) → `/admin/login`, with the caption "Admins register and sign in separately." The user form itself is untouched.

### `src/pages/admin/AdminLogin.tsx` (new, dedicated screen)
- Dark-background, admin-branded card: "This page is for administrators only. Plant users sign in from the main portal."
- **Hard role gate**: after `login()` resolves, `user.role !== "ADMIN"` → `logout()` + toast "This account is not an administrator. Use the plant user sign in." → redirect to `/login`. Tokens are cleared, so a plant user cannot linger authenticated.
- Admin-specific error wording ("Invalid administrator email or password"); links to Register and back to plant-user sign-in.

### `src/pages/admin/AdminRegister.tsx` (new)
- RHF+Zod form: name, mail ID, password (≥8), **confirm-password refine**; submits through `registerAdmin()`.
- Success → toast + redirect to `/dashboard` (already signed in, role ADMIN, so guards pass).
- Errors mirror backend messages verbatim (409 duplicate → "This email is already registered"), 429 handled, network error distinct.

### `src/App.tsx`
- `/admin/login` and `/admin/register` are **public routes** (like `/login`) — intentionally outside `RequireAuth`; a signed-in plant user who reaches them is refused by the role gate, not by routing.

## Verified live (through the Vite proxy)
1. `POST /auth/register` with a fresh mail ID → 201, `role=ADMIN`, tokens + user returned;
2. Same page flow's subsequent admin login → role ADMIN;
3. Plant user (`plant@gspc.local`) login response carries `role=PLANT_USER` — the admin screen rejects/clears this case;
4. Duplicate registration → 409 "This email is already registered";
5. `login` on the new admin through `/auth/login` → 200 ADMIN (accounts created via register are ordinary users afterward — refresh/logout/audit all consistent).

## Security notes (documented trade-off)
- Open admin self-registration is a **demo-appropriate convenience**; the env flag gates it for production. Recommend: register real admins once, then flip `ALLOW_ADMIN_SELF_REGISTER=false` (or remove the button too by rerouting the link) before the plant-wide rollout. All registrations are permanently visible in the audit trail (`ADMIN_SELF_REGISTER`), and accounts created this way appear in the Users admin page like any other user.
