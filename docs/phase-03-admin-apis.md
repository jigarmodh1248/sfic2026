# PH-A3 Explanation — Admin APIs (Phase 3)

**What Phase 3 delivered:** the admin-facing user management APIs — list/create/edit/soft-delete users, (re)assign units to a user, plus the **unit-access-scoped** plants & units listing. Every mutation writes an audit event. Extended coverage: 9 new tests (20 total passing).

---

## Endpoints added (all under `/api/v1`, all ADMIN-only except plants/units)

| Endpoint | Behavior |
|---|---|
| `GET /users` | Full user list incl. deactivated (serialized as `UserOut`, with `unit_ids`) |
| `POST /users` | Create with name/email/password/role/`unit_ids[]`; **409 duplicate email**; rejects unknown unit ids with 400; 201 on success + `USER_CREATED` audit |
| `PATCH /users/{id}` | Partial update (name / role / is_active); audited with the exact `changes` diff as `USER_UPDATED` |
| `POST /users/{id}/units` | **REPLACES** the user's unit assignments (delete-all then insert) per spec contract; audited as `UNIT_ASSIGNED` with the new list |
| `DELETE /users/{id}` | Soft delete (`is_active=False`, row kept); blocks self-deactivation (an admin locking themselves out would be worse than the spec's silence); audited as `USER_UPDATED {changes:{is_active:false}}` |
| `GET /plants` | ADMIN: all plants. Others: only plants containing ≥1 of their assigned units |
| `GET /units?plant_id=` | Same rule per unit; works without `plant_id` too (returns all scoped units — the frontend uses this to build dropdowns in one request) |

## File-by-File

### `backend/app/schemas/users.py`
- `UserCreate` / `UserUpdate` / `UnitsAssign` / `UserOut` request-response models; `Role` is a `Literal` type so an invalid role string is rejected at validation (422), never touching the DB.
- **The `.local` email decision (important for contributors):** pydantic's `EmailStr` uses the `email-validator` package, which **refuses `.local`** ("special-use or reserved domain"). The spec itself seeds `admin@gspc.local` — an internal plant system must accept such intranet addresses. So UserCreate uses a **lax validator**: trims, lowercases, verifies `something@domain.tld`; no SMTP deliverability rules. Documented in a comment in the file.
- `serialize_user(db, user)` — the **single source of truth** for the user JSON shape. Phase 2's auth router duplicated this; both routers now call the same function (contracts can never drift between /auth and /users responses). Password hash is obviously never present in the output object.

### `backend/app/api/v1/users.py`
- Every endpoint starts with `admin: User = Depends(require_admin)` — one line from Phase 2's dependency machinery, so authorization can't be "forgotten".
- `_assert_units_exist(db, unit_ids)`: bulk `SELECT ... IN` then reports the offending ids in the 400 message (the data-agnostic-friendly pattern: precise error → user knows what to fix).
- Duplicate email check before insert → `409 CONFLICT` (idempotency-friendly, prevents silent overwrite attempts).
- `POST /users`: `db.flush()` after `db.add(user)` so `user.id` (app-side uuid) exists before inserting `user_unit_access` rows; one `db.commit()` covers user + assignments + audit atomically.
- Email is normalized to lowercase before lookup/creation (consistent with auth login lookups — prevents `Admin@GSPC.local` vs `admin@gspc.local` duplicates).
- `assign_units`: delete + re-insert **inside one transaction** — no half-states; duplication is prevented by de-duping `unit_ids` first.

### `backend/app/api/v1/plants.py`
- Reuses `get_allowed_unit_ids` (Phase 2) — **the same permission set every future data endpoint will use**; admins bypass filtering entirely.
- Ordering by name/unit_number for stable UI lists.

### `backend/app/schemas/plants.py`
- `PlantOut{id,name,location}` / `UnitOut{id,plant_id,unit_number,capacity_mw}` — exactly the shapes FRONTEND_GUIDE §5 documents. (Units are flat with `plant_id`; the frontend links them client-side.)

### Refactors this phase (why)
- `schemas/auth.py` no longer defines its own `UserOut`; `auth.py` now imports `serialize_user` — removes a duplicated serialization + the direct `user_unit_access` query it needed.
- All routers wired in `api/v1/__init__.py` (single include point).

## Tests added (`backend/tests/test_admin_users.py`)
| test | proves |
|---|---|
| `test_users_endpoint_requires_admin` | 403 for PLANT_USER (role gate works) |
| `test_list_users` | seeded users visible |
| `test_create_user` | 201 + duplicate email → 409 |
| `test_created_user_cannot_login...` | new account authenticates only with his password (bcrypt on create path) |
| `test_assign_units_replaces_previous` | assignment truly REPLACES (not appends), unknown unit → 400 |
| `test_patch_user_role_and_name` | partial PATCH semantics |
| `test_soft_delete_deactivates` | after DELETE: login 401 — user inactive |
| `test_plants_and_units_scoping` | viewer assigned 1 unit sees exactly that unit; admin sees all 3 |
| `test_user_audit_events_written` | `USER_CREATED` row actually persisted |

## Was caught by the tests (worth remembering)
1. **`.local` email → 422** via strict `EmailStr` (fixed by lax validator above — root cause explained at §schemas).
2. A test-own bug (helper logged in with wrong password) — caught immediately by asserting readable responses, `assert r.status_code == 200, r.text` is the standard in this suite because FastAPI error bodies usually self-explain.
