# PH-A7.4/7.5 Explanation — Admin Plants & Audit Pages

**What this build delivered:** the final two admin screens — the read-only plant/unit inventory and the filterable audit log viewer — plus marking the (already-built) Axios interceptor complete in PLAN.md. Live e2e through the Vite dev proxy verified the whole stack: login → audit (filters + pagination) → units → dynamic parameters → MONTH query with a parameter filter (31 rows, avg correct) → PDF download (`%PDF-` magic bytes present). Build green.

---

## File-by-File

### `frontend/src/pages/admin/AdminPlants.tsx` — read-only inventory
- Two React Query reads (`["plants"]`, `["units", "all"]`) render **one card per plant** with its location, a units count in the header, and a small units table (unit number + capacity MW) built by filtering the flat units list client-side (`units.filter(u => u.plant_id === plant.id)`).
- Deliberately no create/edit — plants/units are **seeded** (GSPC has one plant, three units) and ARCHITECTURE.md keeps seeding outside UI scope; wrong-capacity corrections happen in data, not in production.
- Empty/loading states reuse `EmptyState`; capacities show `—` when null (the column is nullable by design).

### `frontend/src/pages/admin/AdminAudit.tsx` — filterable log viewer
- **Filter state**: `action` (dropdown of the exact action strings Phases 2–6 write: LOGIN_SUCCESS, LOGIN_FAILURE, EXCEL_UPLOAD, QUERY_EXECUTED, PDF_DOWNLOADED, USER_CREATED, USER_UPDATED, UNIT_ASSIGNED, BATCH_DELETED), `user` (raw UUID paste), `from`/`to` (`date` inputs). Every filter change also **resets page to 1** — a classic pagination bug avoided (page 40 + new filter would otherwise render an empty-looking table).
- **Query key includes all filters** (`["audit", page, action, user, from, to]`), so React Query re-fetches/refetch-on-focus correctly per filter combination; empty-filter params are simply omitted from the `URLSearchParams`.
- Tone-int badges (green logins, red failures, blue uploads/queries/deletions via `BatchDeleted` association, amber updates), user name resolved server-side (see Phase 6), `created_at` shown as `YYYY-MM-DD HH:MM:SS`.
- Payload cells are truncated with `line-clamp` + a `title` tooltip carrying the full JSON — zero-width table rows with full detail on hover.
- Pagination identical pattern to uploads (Prev/Next, `totalPages` from `total/PAGE_SIZE`); clamp safety comes from the backend's 1..100 normalization.

### e2e verified live (before commit)
Backend `uvicorn` + Vite dev server; calls made **through the :5173 proxy** so the exact browser path is exercised:
- `POST /auth/login` → tokens; `GET /audit?page=1&page_size=3&from=2000-01-01` → `total=4`, first action LOGIN_SUCCESS;
- `GET /units` → Unit 1; `GET /units/{id}/parameters` → 10 parameters with uoms (`aux_consumption_pct`/`%`);
- `POST /query` (MONTH 2026-03, parameter `plf`) → **31 rows**, summary avg 52.0187;
- `POST /report/pdf` (same body) → 3,425 bytes starting `%PDF-`.
Both servers stopped after the check.

### Remaining Phase 7 note
- `/` (Home) stays the role-based redirect landing page from Phase 7.1 — no further dashboard scope was specified, so nothing new was added there.
