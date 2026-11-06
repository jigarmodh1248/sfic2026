import { useState } from "react";
import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../lib/auth";

const navItems = [
  { to: "/query", label: "Query", adminOnly: false },
  { to: "/admin/users", label: "Users", adminOnly: true },
  { to: "/admin/uploads", label: "Uploads", adminOnly: true },
  { to: "/admin/audit", label: "Audit", adminOnly: true },
  { to: "/admin/plants", label: "Plants", adminOnly: true },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [navOpen, setNavOpen] = useState(false);
  const items = navItems.filter((i) => !i.adminOnly || user?.role === "ADMIN");

  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-brand-dark px-4 py-2 text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              GSPC Pipavav Power Corporation Ltd.
            </p>
            <p className="truncate text-xs text-white/70">Reporting — PS000200</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden text-xs text-white/80 sm:inline" data-testid="user-name">
              {user?.name} · {user?.role}
            </span>
            <button
              type="button"
              onClick={() => void logout().then(() => window.location.assign("/login"))}
              className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20 focus-visible:outline focus-visible:outline-2"
            >
              Logout
            </button>
            <button
              type="button"
              aria-label="Toggle navigation"
              aria-expanded={navOpen}
              className="rounded bg-white/10 px-3 py-1 text-sm hover:bg-white/20 focus-visible:outline focus-visible:outline-2 md:hidden"
              onClick={() => setNavOpen((v) => !v)}
            >
              ☰
            </button>
          </div>
        </div>
        <nav
          className={`mx-auto mt-2 max-w-6xl flex-wrap gap-1 text-sm md:flex ${navOpen ? "flex" : "hidden"}`}
        >
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={({ isActive }) =>
                `rounded px-3 py-1 ${isActive ? "bg-white/20 font-semibold" : "hover:bg-white/10"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-4">{children}</main>
      <footer className="px-4 py-2 text-center text-xs text-slate-500">
        Generated from PS000200 Reporting System
      </footer>
    </div>
  );
}
