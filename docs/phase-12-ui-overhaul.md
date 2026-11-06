# PH-A12 Explanation — Incremental UI/UX Overhaul + Admin Context (Phase 12)

**What Phase 12 delivered:** an enterprise-polish pass over the existing app — indigo-600 rebrand, lucide icons, toast notifications, single-parameter trend chart, batch details drawer with import preview, an admin dashboard with KPI cards — plus one new iteration-only backend endpoint (`GET /uploads/{id}/preview`) and PWA naming/theme alignment. **No API contracts, routing logic, or AuthProvider changed.** Backend suite: 55/55 (added 4 tests). Frontend: `tsc --noEmit` clean, production build green, full e2e re-verified live.

This phase also completes the Problem Statement traceability (see the table at the end).

---

## 1. Backend — upload preview endpoint (iteration-only addition)

### `backend/app/schemas/uploads.py`
- New `BatchPreviewRecord {recorded_date, parameter, value, uom}` — mirror of a stored reading for the drawer. `value` is `float` (JSON number), date ISO string — matches the shape the query endpoint already returns, so the frontend table component can style both identically.

### `backend/app/api/v1/uploads.py` — `GET /uploads/{batch_id}/preview`
- **Admin-only** (`require_admin`) — matches every sibling endpoint in the same file; a plant user gets 403 (tested).
- 404 guard for unknown batch ids; returns the **first 10 rows of `plant_data` filtered by `batch_id`, ordered by `id`** — i.e. import order, so the drawer shows what the file actually contained, not DB insertion order accidents.
- Tests (4 new, now 55/55): first-10-in-import-order, truncation at exactly 10, 404 + anonymous-401, plant-user-403. A subtle test-fragility was also fixed mid-review: resolving a batch id via the *paginated list endpoint* can race on equal `uploaded_at` timestamps, so tests now use the authoritative `batch_id` from the upload response instead.

## 2. Frontend — enterprise polish (upgrades, not rewrites)

### Palette — `src/index.css`
- `@theme` vars: `--color-brand #0f4c81 → #4f46e5` (indigo-600), `--color-brand-dark → #4338ca`, `--color-brand-light → #eef2ff`. Every consumer (header, buttons, login, badges, checkboxes, focus rings) follows automatically because they reference the *variables*, not literals — the theme layer is the only file touched for the rebrand, except the 3 hardcoded cases cleaned up (`bg-blue-100` badge → theme-based, `accent-[#0f4c81]` → `accent-brand`). A repo-wide grep confirms no stale `#0F4C81` remains in `src/`.

### `src/components/ui.tsx` (component upgrades, APIs preserved)
- `PrimaryButton`/`SecondaryButton`: optional `icon?: ReactNode` prop (left-slot, `aria-hidden` handled by callers), shadow-sm + bg-white on secondary — existing call sites keep working unchanged.
- `Modal`: `rounded-lg p-5` → `rounded-xl p-6 shadow-xl` (kept the strong shadow deliberately — a floating dialog with `shadow-sm` reads as broken, per the agreed trade-off), close button now an `X` icon with focus ring.
- `Badge`: pill shape (`rounded-full`), brand tone switches to `bg-brand-light text-brand` (indigo) instead of hardcoded blue.
- New `SideDrawer` — right slide-over (`fixed inset-0` backdrop + `absolute right-0 max-w-md` panel), `role="dialog"` + `aria-modal`, Escape-close, click-outside-close, internal scroll. Keyboard parity with `Modal`.
- New `KpiCard` — dashboard stat tile with optional icon chip (title / big value / sub-line).

### Icons — `lucide-react`, `src/components/AppShell.tsx`
- Nav links get semantic icons (`LineChart`, `LayoutDashboard`, `UserRound`, `FileUp`, `ScrollText`, `Factory`) with `aria-hidden`; active/hover styling preserved. Dashboard is the first admin item.

### Toasts — `sonner`, `<Toaster richColors position="top-right" />` in `src/App.tsx`
- `AdminUploads.tsx`: all 5 destructive/feedback paths converted — upload success (**status-aware**: success/partial/whole-batch-rejected get different messages), oversize file, template download, delete, plus per-row history unchanged.
- `AdminUsers.tsx`: modal save failures now **toast + keep the modal open** (previously closed it and dropped the user's typed input — a UX regression from the old inline banner), successes toast with the user's name.
- `Login.tsx`: `apiError` banner → `toast.error`; helper-pattern retained for the three HTTP cases (429/401/unreachable). RHF field-level `role=alert` validation messages intentionally kept — they're form-local, not global events.
- `Query.tsx` follows the same pattern (query/PDF errors as toasts).

## 3. Chart UX — `src/pages/Query.tsx`
- Root cause documented: plotting `heat_rate` (~2,000+) and `plf` (~85) on one Y-axis makes both unreadable. The new implementation:
  - `chartParam` state + a `<select>` above the chart listing only parameters **present in the current result**;
  - auto-set to the first result parameter after every run;
  - `chartData` filters rows to the selected parameter (one line, one Y-axis, `domain="auto"`);
  - UoM label shown next to the selector; empty-selection empty state instead of a blank chart.
- Summary cards and records table remain all-parameters (they aggregate fine).

## 4. Admin upload context — `src/pages/admin/AdminUploads.tsx`
- Replaced the expanded-row error toggle with a **Details** drawer per batch:
  - header: filename; identity block: copyable Batch ID (clipboard + toast), status badge, imported/rejected counts with icon color coding, uploader;
  - **first-10 import preview** from the new endpoint (Loading/Error/Empty states handled);
  - row-errors list at the bottom (amber block, includes the >20% whole-batch note).
- Errors quick-view survives *inside* the drawer; Delete stays on the row.

## 5. PWA alignment
- Manifest: `name "GSPC Pipavav Reporting"`, `short_name "GSPC Plant"`, `theme_color #4f46e5`; `index.html` theme-color synced. Icons regenerated on indigo (192/512/maskable/favicon, same bolt motif — Pillow script, binaries committed). Service worker + precache verified emitted in `npm run build` (vite-plugin-pwa was already installed in Phase 8 with `autoUpdate` and the API `NetworkOnly` cache rule — unchanged, as re-installing would violate the "incremental" instruction).

## 6. Admin dashboard — `src/pages/Dashboard.tsx` (new) + routing
- Route: `/dashboard` (RequireAuth + RequireAdmin) in `src/App.tsx`; `Home.tsx` redirect changed ADMIN `/admin/users` → `/dashboard` (non-admins still land on `/query` — that part of the redirect logic was never touched, per instruction).
- 4 KPI cards using the new `KpiCard`, all data from **existing** endpoints + the audit API (no backend changes): Total units (`GET /units`), Batches uploaded + latest batch (`GET /uploads`), Latest batch status, Last login (`GET /audit?action=LOGIN_SUCCESS&page_size=1` — verified live to resolve "Plant Administrator").
- Fast-actions list + recent-batches mini-list cover the operator's next-decision paths.

## Verification trail
- Backend: `pytest tests -q` → **55 passed** (4 new preview tests).
- Frontend: `npm run lint && npm run build` → clean; PWA precache 14 entries emitted.
- Live e2e (uvicorn + Vite proxy): fresh CSV upload via curl → `SUCCESS 2 imported`; `GET /preview` returned exactly the imported rows (`e2e_preview_param=42.5 MW`); MONTH plf query 31 rows avg 52.0187; last-login audit entry resolved; PDF download 3,425 bytes with `%PDF-` magic. Earlier failure of the PDF call was diagnosed as PowerShell/cURL argument quoting (not app code) and re-run with a JSON body file.

---

## Problem Statement traceability

> "End user can easily access & download the power plant performance and operation parameters instantly for suitable further decision making process for the plant."

| Clause | Where it is solved (now) |
|---|---|
| **easily access** | Role redirect puts every plant user one navigation from `/query`; plant auto-selects its first unit; **one-click period presets** (Today / Last 7 days / This month / Last month / This year) replace manual date entry; parameter checkboxes come from the plant's own live data vocabulary. |
| **download … instantly** | **Download PDF is enabled as soon as unit+period are valid — no query run required** (backend accepts the query body directly); blob download with a meaningful filename + toast confirmation; installable PWA puts the whole flow one home-screen tap away. |
| **performance & operation parameters** | The 10 demo parameters (and any future real-file parameters — data-agnostic design) queryable with min/max/avg summaries, a per-parameter readable trend chart, and a records table with PDF parity. |
| **further decision making** | Trend + summary reveal deviations; admin **Dashboard KPIs** (units, batches, batch health, last login) offer the operational overview; the audit trail guarantees every query/download is traceable for governance decisions. |
