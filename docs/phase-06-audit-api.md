# PH-A6 Explanation — Audit API (Phase 6)

**What Phase 6 delivered:** one admin-only endpoint, `GET /api/v1/audit` — a filterable, paginated, newest-first read-only view over the `audit_logs` table that every earlier phase has been writing into. 6 new tests (51 total passing). This completes the backend; what remains is frontend wiring (Phases 7.x) and deployment (Phase 9).

---

## File-by-File

### `backend/app/api/v1/audit.py`
- **Authorization:** dependency `require_admin` — a plant user gets a plain `403`, an anonymous caller `401`. Audit visibility is deliberately admin-only (auditors want completeness, viewers don't need it).
- **Filters, all optional and AND-combined:**
  - `user_id` — exact-match `audit_logs.user_id`;
  - `action` — normalized with `.upper()` so the URL stays forgiving (`login_success` ≡ `LOGIN_SUCCESS`);
  - `from` / `to` — date-only parameters. Implementation detail of note: `from` is a **Python reserved keyword**, so the parameter is declared `from_: ... = Query(alias="from")` — the client sends `?from=2026-01-01`, the function sees `from_`. The **inclusive semantics** documented in §5.1 are achieved by half-open datetime windows: `from_` → `>= midnight of that day`, `to` → `< midnight+1day` (`timedelta(days=1)`); this keeps the comparison index/pragmatic and means "from == to" selects that one full day.
- **Pagination the same way as uploads:** `page`/`page_size` (default 25, clamped to 1..100 — oversized requests are clamped, not errored, so the frontend can't be broken by a typo); `total` comes from `count(*)` over a subquery of the *filtered* query so it always agrees with the filter set.
- **Ordering:** `ORDER BY id DESC` — audit ids are strictly increasing (autoincrement), so id order ≡ chronological order and stays stable even for entries created within the same second.
- **User names resolved server-side:** entries carry `user: {id, name} | null`; only the users referenced by the current page are fetched (`IN (...)`). If a user has since been deleted, the entry degrades to `user: null` instead of breaking the response.

### `backend/tests/test_audit.py` — behavior pinned
1. **Auth wall:** anonymous → 401; plant user → 403 (tested with the `plant_headers` fixture). Admin passes everywhere.
2. **Newest-first ordering + entry shape** asserted on real seeded audit traffic (login events from the test run itself).
3. **Filters** — case-insensitive action match verified end-to-end; user+action combined filter validated structurally.
4. **Date window:** 1999 range → `total == 0`; an old `from` bound → entries found.
5. **Pagination:** two size-2 pages return disjoint id sets; page 999 → empty `items`, not a 404.
6. **Clamping:** `page=0 → 1`, `page_size=999 → 100`.

### Contract notes for the frontend (Phase 7.5 admin audit page)
- Params: `?user_id=&action=&from=&to=&page=&page_size=`.
- Response: `{items, total, page, page_size}`; render `created_at` as local time.
- Good default filters for the UI: action select (LOGIN_SUCCESS, LOGIN_FAILURE, QUERY_EXECUTED, PDF_DOWNLOADED, EXCEL_UPLOAD, BATCH_DELETED, USER_CREATED, USER_UPDATED, USER_DEACTIVATED, UNIT_ACCESS_SET) — these are the exact strings written by phases 2–6.
- This page is ADMIN-only in navigation; the API enforces it regardless.
