# PH-A14 Explanation — Proper Upload Button & UI Feel Pass (Phase 14)

**What Phase 14 delivered:** a real upload experience — a drag-and-drop `Dropzone` with a selected-file card — plus a "feel" layer across the app (entry motion, gradients, hover/press feedback) that upgrades perceived quality without touching any logic, contract, or data flow. Backend untouched. `tsc --noEmit` clean, production build green (PWA precache regenerated), smoke test passed.

---

## File-by-File

### `src/components/ui.tsx` — new `Dropzone` component
- **Two states:** empty → a dashed drop target (`Drag & drop your Excel file here, or click to browse`, cloud icon, ".xlsx or .csv · max 10 MB" hint); file chosen → a **file card** (spreadsheet icon, name, humanized size — `formatBytes()`, "ready to upload", X to clear). Drag-over highlights the border in brand color and switches the icon/label ("Drop the file here").
- **Accessibility & semantics:** the empty target is `role="button"` + `tabIndex`, keyboard-activatable (Enter/Space → hidden input click), full ARIA labeling; **dragenter/dragleave flicker** is avoided with a simple `dragging` state instead of per-child styling.
- The component manages its **own hidden file input** (clearing `input.value` on change so picking the same file twice re-triggers `onChange` — a classic file-input bug), and reports back via one `onFile(File | null)` callback. The parent knows nothing about DOM details.
- Reusable beyond uploads (accept prop, hint prop).

### `src/pages/admin/AdminUploads.tsx` — "New import" card
- Replaced the bare `<input type=file>` with the Dropzone; structured header ("New import" + the schema hint `unit_number · recorded_date · parameter · value (+uom)`), "Download template" moved to the card header row.
- **Client 10 MB guard moved to selection time** (a toast fires the moment an oversized file is picked, not only after pressing Upload) — the backend limit unchanged.
- Under the zone: an Info line explaining the per-row rejection / >20% batch-reject rule, with the primary "Upload file" button anchored right. `useRef` for the old input removed (Dropzone owns it).

### Feel layer (pure visual, no logic)
- `src/index.css`: three keyframes — `fade-in` (overlay), `pop-in` (modal/cards), `slide-in-right` (drawer) — exposed as `anim-fade` / `anim-pop` / `anim-slide-right`, applied to `Modal` and `SideDrawer` (backdrops fade, panels rise/slide). **All disabled under `prefers-reduced-motion: reduce`.** Plus `page-enter` — every AppShell main content does a soft 12px rise on navigation.
- `src/components/AppShell.tsx`: header is now an indigo gradient (`from-brand-dark via-brand to-brand-dark`) with a small bolt glyph next to the company name.
- `src/components/ui.tsx`: buttons get `transition-all … hover:shadow` + `active:scale-[0.98]` press feedback; `KpiCard` gains `hover:shadow-md` lift.
- `src/pages/Dashboard.tsx`: fast actions rebuilt as icon rows — brand chip icon → hover inverts to solid brand (pure CSS), label, and a chevron that nudges right on hover. Extra 5th action (Plants inventory).
- `src/pages/Login.tsx`: user page backdrop is a soft brand-tinted gradient with the card in a ring; admin screens (`AdminLogin`, `AdminRegister`) get a dark brand gradient for a distinct "restricted" feel.

## Verification
- `npm run lint` clean after fixing 3 strict-TS catches (React `DragEvent` typing, unused import) and `npm run build` green.
- Live smoke: Vite dev server 200 + backend health `ok` — then both stopped.
- No backend changes → no test suite impact needed; the upload endpoint contract is untouched (same FormData POST, same client limit check ordering).

## Notes
- The old inline file input's `id="file"`/label pairing disappeared with it; the Dropzone carries its own accessible name, so no orphaned `htmlFor` remains.
- If drag & drop is ever needed elsewhere (e.g., dropping a CSV onto the query page), the Dropzone is already generic — pass `accept` and `hint`.
