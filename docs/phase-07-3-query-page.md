# PH-A7.3 Explanation — Query Page (Phase 7.3)

**What Phase 7.3 delivered:** `/query` — the page every role opens daily — replacing the placeholder. Cascading Plant → Unit selects, a data-driven parameter multi-select (fed live from the Phase 5 endpoint, never hardcoded), the four period modes, per-parameter Min/Max/Avg cards, a Recharts time-series, a capped records table, and a real blob-download PDF button. Build green (`tsc --noEmit && vite build`).

---

## File-by-File

### `frontend/src/pages/Query.tsx`

**State model.** One flat state block — `plantId`, `unitId`, `selectedParams[]`, `mode`, one field per period shape (`day`, `month`, `year`, `start`, `end`), plus `result` / `error` / `running` / `downloadingPdf`. Defaults are computed from the *current date* (`todayISO()`, `currentMonth()`, `year`, RANGE = last 7 days), so the page opens ready for a sensible "yesterday-style" query.

**Three cascading server reads (React Query):**
1. `["plants"]` — `GET /plants` (server returns only units/plants the caller may see, so the dropdowns are automatically de-scoped for VIEWER roles);
2. `["units", plantId]` — `GET /units?plant_id=…`, `enabled: plantId !== ""` (nothing fetched until a plant is chosen);
3. `["unit-params", unitId]` — `GET /units/{id}/parameters`, gated on `unitId !== ""`.

Cascade resets are explicit: `pickPlant` clears unit + params + results, `pickUnit` clears params + results — switching a parent can never silently pair with a stale child (this is exactly the mismatch class the backend would answer 400/403 to).

**Parameters multi-select.** Checkbox list rendered with `parameter` + `(uom)` hint; `[x] none selected = all parameters` — empty `parameters: []` is a *meaningful request* (ALL), matching the backend contract. When no unit is chosen / params still loading / unit has no data, contextual helper text replaces the checkboxes rather than an error.

**Period form.** Radio group `DAY | MONTH | YEAR | RANGE`; the matching native input appears below (`date`, `month`, `number`, two `date`s). Native controls give free keyboard/filler UX and mobile pickers. `buildPeriod()` maps state → the exact discriminated-union payloads the Zod-like Pydantic side expects (`{mode:"MONTH", month:"2026-03"}` etc.), so validation errors (422) surface only on genuinely bad data. "Run query" is disabled until both selects have values.

**Run + render pipeline.**
- `runQuery()` POSTs `/query`, sets `result`; errors render the backend message verbatim through `readableError()` (the same `axios detail` pattern as the admin pages) — e.g. *"You do not have access to this unit"*;
- **Summary:** one small card per parameter (Min / Max / Avg + uom grabbed from the first matching row);
- **Trend:** `chartData` groups rows by date into `{date, [param]: value}` objects and one `<Line>` per parameter from a fixed palette — no animation (perf on 30-point+ datasets), gridlines, shared date axis;
- **Records:** capped display table (`MAX_TABLE_ROWS = 300`, sticky header, hover) with an explicit "showing first 300 of N — PDF export contains all rows" note, so the browser never chokes on a 10k-row virtual dump while the faithful full detail still exists via PDF.

**PDF download.** `api.post("/report/pdf", body, {responseType:"blob"})` → `URL.createObjectURL` + invisible anchor click + revoke — the standard blob-download dance (same as the upload template). Filename: `Unit_1_<period-description>.pdf`. Button stays armed even before the first Run (same body would be sent), which matches "query then export".

### Notes
- `tickFontSize` was caught by strict TS during build (Recharts types changed in 2.x) — replaced with `tick={{ fontSize: 11 }}`.
- The Vite bundle warning after adding Recharts (chunk > 500 kB) is cosmetic for an internal tool; real fix (dynamic `import()` for the chart component) belongs to the Phase 8/9 polish pass, where lazy routes land anyway.
- A viewer with zero units sees an empty unit dropdown and can't run — the server-side access scoping makes a client error for this impossible.
