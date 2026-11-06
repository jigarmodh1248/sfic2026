import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { RequireAdmin, RequireAuth } from "./components/guards";
import { DashboardPage } from "./pages/Dashboard";
import { HomePage } from "./pages/Home";
import { LoginPage } from "./pages/Login";
import { QueryPage } from "./pages/Query";
import { AdminAuditPage } from "./pages/admin/AdminAudit";
import { AdminPlantsPage } from "./pages/admin/AdminPlants";
import { AdminUploadsPage } from "./pages/admin/AdminUploads";
import { AdminUsersPage } from "./pages/admin/AdminUsers";

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<RequireAuth />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/admin/users" element={<AdminUsersPage />} />
            <Route path="/admin/uploads" element={<AdminUploadsPage />} />
            <Route path="/admin/audit" element={<AdminAuditPage />} />
            <Route path="/admin/plants" element={<AdminPlantsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster richColors position="top-right" />
    </>
  );
}
