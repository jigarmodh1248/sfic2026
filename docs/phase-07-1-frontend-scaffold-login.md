# PH-A7.1 Explanation — Frontend Scaffold + Login (Phase 7.1)

**What this phase delivered:** the complete React application skeleton plus a **working login** against the real backend. Verified end to end: `npm run dev` (Vite :5173) → proxy → FastAPI (:8000) → `/auth/login` returned the seeded ADMIN user; production build (`tsc --noEmit && vite build`) is clean. 8 files of real code, no placeholders except the still-coming pages.

---

## File-by-File

### `frontend/package.json` + `vite.config.ts`
- **Pinned stack** (per spec): React **18.3**, React Router **v6**, TanStack Query **v5**, React Hook Form **v7** + Zod **v3** (`@hookform/resolvers` bridges RHF↔Zod), Axios, Recharts, Tailwind **v4** via the `@tailwindcss/vite` plugin (no `tailwind.config.js` needed — theme lives in CSS, see below).
- `vite.config.ts`: dev server proxies **`/api/*` → `http://localhost:8000`** — this is why the frontend code can use relative URLs (`/api/v1/...`) in dev *and* production (nginx will proxy the same path), so no environment-specific base URL switching.
- Build script = `tsc --noEmit && vite build` — TypeScript errors block the build; Vite alone would transpile silently (it doesn't typecheck).
- tsconfig is strict (`strict`, `noUnusedLocals`, `noUnusedParameters`) and projects-reference-free: the earlier `tsc -b` setup emitted stray `.d.ts/.js` from the composite node config (committed-by-accident incident) — replaced with a single `noEmit` config; artifacts are now gitignored.

### `frontend/src/index.css` — theme (Tailwind v4)
- `@theme { --color-brand: #0f4c81; ... }` — Tailwind v4 generates utilities (`bg-brand`, `text-danger`...) from these CSS variables. The steel-blue palette from FRONTEND_GUIDE §7.2 is now the design system, not arbitrary hex sprinkled across components.
- Global `body` uses `@apply` for slate background + antialiasing.

### `frontend/src/types/api.ts` — contract mirror
- TypeScript interfaces for every contract the app touches: `LoggedUser`, `Tokens`, `Plant`, `Unit`, `ParameterMeta`, `Period` (a discriminated union of the 4 modes — `DAY|MONTH|YEAR|RANGE` with mode-specific fields, invalid combinations don't typecheck), `QueryRequest/Row/Summary/Response`. Mirrors ARCHITECTURE §5 exactly; when the backend contract changes, this file changes in the same commit.

### `frontend/src/lib/api.ts` — HTTP layer (the auth backbone)
- `loadTokens/saveTokens/clearTokens`: localStorage persistence under one key (`ps000200.tokens`).
- **Request interceptor**: attaches `Authorization: Bearer <access_token>` to every call.
- **Response interceptor (the subtle one)**: on any `401`, calls `POST /auth/refresh` **once** (guarded by a `_retried` marker on the request config to prevent infinite loops), saves the new access token, and *replays the original request with the fresh header*. If refresh itself fails → clear tokens + fire the global `unauthorizedHandler` (wired by `AuthProvider` to reset state and bounce to `/login`).
- Note: the refresh call uses the raw `axios` import, **not** the `api` instance — otherwise the request interceptor would attach an expired access token to the refresh call itself.

### `frontend/src/lib/auth.tsx` — session state for the whole UI
- `AuthProvider` holds `{user, loading}`; on mount it calls `GET /auth/me` if tokens exist ("session restore" — the `loading` flag prevents a protected route from flashing the login page while identity is still being fetched).
- `login(email, password)`: posts to `/auth/login` directly (no bearer needed), stores tokens, sets user in state.
- `logout()`: posts `/auth/logout` with the refresh token (server-side revocation, per spec) but clears local state **even if that call fails** (token may already be dead) — local logout must never be blocked by a network error.
- `useAuth()` hook: all pages/guards consume this instead of touching tokens directly.

### `frontend/src/components/guards.tsx` + `components/AppShell.tsx`
- `RequireAuth`: renders an Outlet after `loading` resolves and a user exists; otherwise `<Navigate to="/login">`. `RequireAdmin` additionally redirects non-admins to `/query` — **route-level role enforcement matches the backend's 403s (UX layer only; the server remains the real gate).**
- `AppShell`: dark steel-blue top bar with plant name + PS000200 tag, user name/role chip, Logout button, and a nav row filtered by role (ADMIN sees Users/Uploads/Audit/Plants; others just Query). Mobile: hamburger toggles the nav (`md:hidden` aware), content wrapped in `max-w-6xl` with a PS000200 footer.

### `frontend/src/pages/Login.tsx`
- React Hook Form + Zod schema (`zodResolver`) — same validation shape on both client and (semantically) backend.
- Three explicit error buckets from the API: **429** → "Too many attempts…", **401** → "Invalid email or password", anything else → "Backend unreachable" (keeps a proxy/connection stall from being misread as bad credentials). Field-level Zod errors render under the inputs with `role="alert"`.
- "Forgot password?" is intentionally a `pointer-events-none` disabled stub (spec MVP scope).

### `frontend/src/pages/*` + `App.tsx` + `main.tsx`
- `Home` = role redirect: ADMIN → `/admin/users`, others → `/query`.
- The Query page and 4 admin pages are honest placeholders for their upcoming builds, but **routes, guards, shell and nav all exist** so each page only needs its content.
- `main.tsx`: QueryClientProvider (TanStack Query is installed and ready — used heavily from Phase 7.2) ⊃ AuthProvider ⊃ Router.

---

## Data flow now possible (verified live)
```
browser /login → handleSubmit → POST :5173/api/v1/auth/login
   → Vite proxy → :8000 FastAPI (bcrypt, JWT, audit, rate limit)
   → tokens+user stored → RequireAuth lets / through → role redirect
Every later call: api instance attaches bearer; 401 ⇒ one refresh ⇒ replay request
```

## How to run manually
```powershell
# terminal 1                                  # terminal 2
cd backend                                    cd frontend
.venv\Scripts\python -m uvicorn app.main:app --reload   npm run dev
# browser: http://localhost:5173/login
# admin@gspc.local / ChangeMe123!  → lands on /admin/users
# plant@gspc.local / ChangeMe123!  → lands on /query (no admin nav items)
```
