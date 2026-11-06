/* ADMIN landing: operational KPIs for decision-making at a glance. */

import { useQuery } from "@tanstack/react-query";
import { AppShell } from "../components/AppShell";
import { Badge, EmptyState, KpiCard, PrimaryButton } from "../components/ui";
import { api } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Factory, FileUp, LineChart, ScrollText, UserRound } from "lucide-react";
import type { BatchStatus, PaginatedUploads, Unit } from "../types/api";

interface AuditEntry {
  id: number;
  user: { id: string; name: string } | null;
  action: string;
  created_at: string;
}
interface AuditPage {
  items: AuditEntry[];
}

function isoDay(s: string): string {
  return s.slice(0, 16).replace("T", " ");
}

export function DashboardPage() {
  const navigate = useNavigate();

  const unitsQuery = useQuery({
    queryKey: ["units", "all"],
    queryFn: () => api.get<Unit[]>("/units").then((r) => r.data),
  });
  const uploadsQuery = useQuery({
    queryKey: ["uploads", 1],
    queryFn: () => api.get<PaginatedUploads>("/uploads?page=1&page_size=1").then((r) => r.data),
  });
  const lastLoginQuery = useQuery({
    queryKey: ["audit", "last-login"],
    queryFn: () => api.get<AuditPage>("/audit?action=LOGIN_SUCCESS&page=1&page_size=1").then((r) => r.data),
  });

  const unitCount = unitsQuery.data?.length ?? 0;
  const batchTotal = uploadsQuery.data?.total ?? 0;
  const latestBatch = uploadsQuery.data?.items?.[0];
  const lastLogin = lastLoginQuery.data?.items?.[0];
  const lastLoginFailed = lastLoginQuery.isError;
  const now = new Date();

  return (
    <AppShell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Operation overview for {now.toLocaleDateString(undefined, { dateStyle: "full" })}.
          </p>
        </div>
        <PrimaryButton onClick={() => navigate("/query")}>Open performance query</PrimaryButton>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard title="Total units" value={unitCount} sub="Active generating units (seeded)" />
        <KpiCard
          title="Batches uploaded"
          value={batchTotal}
          sub={latestBatch ? `Latest: ${latestBatch.filename}` : "No batches yet"}
        />
        <KpiCard
          title="Latest batch status"
          value={
            latestBatch ? (
              <Badge tone={statusTone(latestBatch.status as BatchStatus)}>{latestBatch.status}</Badge>
            ) : (
              "—"
            )
          }
          sub={
            latestBatch
              ? `${latestBatch.rows_imported} imported / ${latestBatch.rows_rejected} rejected · ${isoDay(latestBatch.uploaded_at)}`
              : "Upload data to see status"
          }
        />
        <KpiCard
          title="Last login"
          value={
            lastLoginFailed ? (
              <span className="text-sm text-danger">unavailable</span>
            ) : lastLogin ? (
              <span className="text-base">{lastLogin.user?.name ?? "—"}</span>
            ) : (
              "—"
            )
          }
          sub={lastLogin ? isoDay(lastLogin.created_at) : "No logins recorded yet"}
        />
      </dl>

      {(unitsQuery.isError || uploadsQuery.isError) && (
        <p className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-danger" role="alert">
          Some KPIs could not load. Is the backend running?
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Fast actions</h2>
          <ul className="mt-3 space-y-1 text-sm">
            {[
              { to: "/query", icon: LineChart, text: "Run a performance query — plant, unit, period, one-click PDF" },
              { to: "/admin/uploads", icon: FileUp, text: "Upload a filled template — or download the template" },
              { to: "/admin/users", icon: UserRound, text: "Grant unit access — invite plant staff as viewer" },
              { to: "/admin/audit", icon: ScrollText, text: "Inspect the audit trail — logins, queries, downloads" },
              { to: "/admin/plants", icon: Factory, text: "Review the plant & unit inventory" },
            ].map((a) => (
              <li key={a.to}>
                <Link
                  to={a.to}
                  className="group flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-slate-50"
                >
                  <span className="rounded-lg bg-brand-light p-2 text-brand transition-colors group-hover:bg-brand group-hover:text-white">
                    <a.icon size={15} aria-hidden />
                  </span>
                  <span className="flex-1">{a.text}</span>
                  <ChevronRight size={15} className="text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        <section className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Recent batches</h2>
          {uploadsQuery.isLoading ? (
            <EmptyState message="Loading…" />
          ) : (uploadsQuery.data?.items?.length ?? 0) === 0 ? (
            <EmptyState message="No batches uploaded yet" />
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {uploadsQuery.data!.items.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span className="truncate" title={b.filename}>{b.filename}</span>
                  <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function statusTone(status: BatchStatus): "ok" | "warn" | "danger" | "muted" {
  switch (status) {
    case "SUCCESS":
      return "ok";
    case "PARTIAL":
      return "warn";
    case "FAILED":
      return "danger";
    default:
      return "muted";
  }
}
