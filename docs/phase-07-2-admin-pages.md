# PH-A7.2 Explanation — Admin Pages (Phase 7.2)

**What this phase delivered:** the two admin frontend pages, wired to the real Phase 3 + Phase 4 APIs — `/admin/users` (user table + create/edit modal + unit-assignment modal) and `/admin/uploads` (upload form with per-row-error feedback, paginated batch history with error viewer and delete). Production build green (tsc strict). This makes the admin side fully usable end to end: log in as `admin@gspc.local`, create users, grant units, upload the template, watch validation errors, delete a batch.

---

## File-by-File

### `frontend/src/types/api.ts` (extended)
Added the contracts these pages consume — `UserListEntry`, `UserCreatePayload`, `UserUpdatePayload`, `BatchStatus`, `UploadErrorItem`, `UploadSummary`, `UploadBatch`, `UploadBatchDetail` (extends batch with `error_report`), `PaginatedUploads`. Mirror of ARCHITECTURE §5; keeping them in one file is the contributor's single reference point.

### `frontend/src/components/ui.tsx` — the design-system pieces both admin pages (and later pages) reuse
- **`Badge`**: five tones (`ok/warn/danger/muted/brand`) from the CSS theme. Encodes the status color rules from FRONTEND_GUIDE §7.2 — SUCCESS green, PARTIAL amber, FAILED red, DELETED gray.
- **`PrimaryButton` / `SecondaryButton`**: consistent brand-blue CTA vs outline button; Primary shows a spinner ring when disabled/busy (upload + modal saves).
- **`Modal`**: accessible dialog (`role="dialog"`, `aria-modal`, labelled), closes on backdrop click or ✕, scrollable to `max-h-85vh` — unit-assignment lists can be long.
- **`Field`**: label + input error slot with `role="alert"` (WCAG assistive tech announces it).
- **`EmptyState`**: single message for loading/empty/error table states (keeps tables from looking broken while fetching).

### `frontend/src/pages/admin/AdminUsers.tsx`
- **List**: TanStack Query `['users']` → `GET /users` (Phase 3). Table columns: name, email, role badge by color, active/inactive badge, unit count, actions row. Non-admin hitting the page never gets this far (route guard), but the table shows a readable error state if the API rejects anyway.
- **Create/Edit modal** (`UserModal`): RHF + Zod (`name`, `email`, `password` ≥ 8, role enum). Edit mode disables the email input (identity is immutable in MVP; PATCH contract carries only name/role/is_active) and hides the password field (no admin password-reset in MVP scope). Create `POST /users` — duplicate-email 409 surfaces as its server message.
- **Units modal** (`UnitsModal`): loads `GET /units` (admin scope ⇒ all units), checkbox list, **literal callout that saving REPLACES assignments** (matches the Phase-3 contract), saves via `POST /users/{id}/units`.
- **Deactivate**: confirm() → `DELETE /users/{id}` → invalidate `['users']`.
- Two error paths are handled distinctly: field-level (Zod inline) vs API-level (status line on the page + server `detail` string extraction helper `apiErrorMessage`, which understands both FastAPI string details and 422 validation arrays).

### `frontend/src/pages/admin/AdminUploads.tsx`
- **Upload section**: file picker (accept `.xlsx/.csv`), client-side 10 MB pre-check (server 413 is the backstop), **Download template** button streaming `GET /uploads/template` as a blob and triggering a browser download (`URL.createObjectURL` + anchor click) — the admin hands this template to whoever prepares the plant data.
- **Upload result block**: status badge + imported/rejected counts + scrollable per-row error list (`Row 3: Unknown unit_number 'Unit 99' …`), and when the whole batch was rejected, the explicit ">20% of rows failed — nothing was imported" line. This mirrors the Phase-4 response contract exactly.
- **Batch history**: TanStack Query keyed `['uploads', page]`, 10/page, Prev/Next pager from `total`. Columns: file, uploader name, timestamp (ISO→`YYYY-MM-DD HH:MM`), status badge, imported, rejected (red when >0).
- **Errors viewer**: "Errors" toggles an inline expanded row that lazily fetches `GET /uploads/{id}` (`enabled: expanded` — no detail requests for untouched rows) and renders the `error_report.errors` list; "no per-row errors" shown for clean batches.
- **Delete**: confirm dialog warning that data rows will be removed → `DELETE /uploads/{id}` → `['uploads']` invalidation refreshes the list (the row turns gray `DELETED` and loses its delete button).

### Data-flow pattern this phase establishes
```
mutation → POST/PATCH/DELETE → onSuccess: invalidateQueries([...]) → table re-fetches
```
No local cache juggling: the server response + TanStack invalidation is the single source of truth. All later pages (query/audit) follow the same shape.

## Verified
- `tsc --noEmit && vite build` clean (strict mode; unused local/parameter errors on).
- Three tsc issues were caught and fixed during the build run (stale import, missing `UploadBatch` type import, helper moving to module scope) — exactly the class of drift the strict gate exists for.
