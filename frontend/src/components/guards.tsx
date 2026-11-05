import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";

/** Blocks unauthenticated access; defers while the /auth/me restore is running. */
export function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

/** For admin-only areas. */
export function RequireAdmin() {
  const { user } = useAuth();
  if (user?.role !== "ADMIN") return <Navigate to="/query" replace />;
  return <Outlet />;
}
