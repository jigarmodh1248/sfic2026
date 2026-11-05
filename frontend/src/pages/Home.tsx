/* Role-based entry point: ADMIN → /admin/users, others → /query. */

import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function HomePage() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <Navigate to="/admin/users" replace />;
  return <Navigate to="/query" replace />;
}
