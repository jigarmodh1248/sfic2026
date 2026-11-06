/* Role-based entry point: ADMIN → /dashboard, others → /query. */

import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/auth";

export function HomePage() {
  const { user } = useAuth();
  if (user?.role === "ADMIN") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/query" replace />;
}
