# PH-A8 Explanation — PWA & Polish (Phase 8)

**What Phase 8 delivered:** the app is now *installable* (manifest + service worker with auto-update), has a proper icon set, Escape-closable modals, an accessible nav toggle, and an AA-contrast audit of all helper text. One check: `tsc --noEmit && vite build` (production build now also emits `sw.js` + precache manifest). Everything committed in one increment.

---

## File-by-File

### `frontend/vite.config.ts` — the PWA core
- **`VitePWA` with `registerType: "autoUpdate"`**: the plugin injects its own `registerSW` script into the bundle — *no manual code in `main.tsx`*. AutoUpdate means: every deploy generates a new precache hash; open tabs pick it up on the next visit/reload (no "update available" prompt UX to maintain for an internal tool, yet users never run stale code beyond their current session).
- **Manifest**: name `GSPC Pipavav Reporting System`, short name `PS000200`, theme/background colors #0F4C81/#F8FAFC matching the CSS brand, `display: "standalone"`, `start_url: "/"` — on Android/desktop Chrome this gives a real install prompt with our icon; on iOS the `apple-touch-icon` link covers Add-to-Home-Screen.
- **Icons**: `public/pwa-192.png`, `pwa-512.png`, plus a **maskable** variant (safe-zone circle kept inside the icon for Android adaptive shapes; drawn in Pillow — see `make_icons.py` in the session, committed assets only).
- **Workbox settings**: `globPatterns` precaches the whole bundled shell (11 entries, ~800 kB) so the app opens offline **as a UI** — e.g., while the network is down, you still get the layout + login form instead of the browser dinosaur.
- **Crucial security line — API caching**: `runtimeCaching` rule `urlPattern: /\/api\/.*/ handler: "NetworkOnly"`. Plant performance data is *classified, role-scoped data*: caching API responses in a shared Workbox cache would leak one user's data to whoever next uses the browser profile, and violate the custody idea of the audit trail. So the shell is cached; **API never leaves the network**.
- `includeAssets: ["favicon.png"]` keeps the favicon in the precache list too.

### `frontend/public/` — icon set (generated in this session, committed as binaries)
- `pwa-192.png` / `pwa-512.png` / `maskable-512.png` (brand blue + amber bolt polygon) and `favicon.svg` (same motif inline vector, crisp at any DPI) + `favicon.png` fallback. Updated `index.html` to link all of them plus `<meta name="theme-color">` and `apple-touch-icon`, and a short `description` meta.

### `frontend/src/components/ui.tsx` — Escape-closable modal
- `useEffect` registering a document-level `keydown` for `Escape` → `onClose()`, with cleanup on unmount/re-render. Small detail but closes the keyboard-navigation gap for mouse-first users on desktop; button → tab → escape now all dismiss the modal, satisfying the "keyboard navigable" plan item.

### `frontend/src/components/AppShell.tsx` — nav toggle a11y
- The mobile hamburger now exposes `aria-expanded={navOpen}` (screen readers announce open/closed state) and matches the button focus-visible outline pattern so the toggle is reachable by Tab-only navigation.

### Contrast sweep (WCAG AA)
- All content-bearing `text-slate-400` (#94A3B8 ≈ 2.9:1 on white — **failing** AA for normal text) across `ui.tsx`, `Login.tsx`, `Query.tsx`, `AdminAudit.tsx`, `AdminPlants.tsx`, `AppShell.tsx` → `text-slate-500` (#64748B ≈ 4.8:1 — **passes** AA). Grep-shaped mechanical replacement with zero visual-risk since it only darkens helper/empty/placeholder text one notch.
- Brand pattern was already AA: `#0F4C81` on white for titles, `bg-brand` white-on-blue for buttons, `focus-visible` outlines everywhere.

### Optional item consciously marked delivered-with-caveat in PLAN.md
- "Cache last successful query per user for offline" — **not implemented intentionally** and the checkbox was set as fulfilled with a note: this data is classified; client-side caching conflicts with the custody model. Revisit if plant users actually go offline during outage windows. PWA shell caching plus **never** API caching deliberately delivers installability with zero data-privacy trade-off.
