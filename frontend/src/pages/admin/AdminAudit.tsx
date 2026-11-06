/* Admin: filterable, paginated audit log. */

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "../../components/AppShell";
import { Badge, EmptyState, SecondaryButton } from "../../components/ui";
import { api } from "../../lib/api";
import type { AuditAction } from "../../types/api";

const PAGE_SIZE = 25;

const ACTION_TONES: Record<AuditAction, "ok" | "warn" | "danger" | "muted" | "brand"> = {
  LOGIN_SUCCESS: "ok",
  LOGIN_FAILURE: "danger",
  EXCEL_UPLOAD: "brand",
  QUERY_EXECUTED: "brand",
  PDF_DOWNLOADED: "warn",
  USER_CREATED: "ok",
  USER_UPDATED: "warn",
  UNIT_ASSIGNED: "warn",
  BATCH_DELETED: "danger",
};

const ACTION_CHOICES: AuditAction[] = [
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "EXCEL_UPLOAD",
  "QUERY_EXECUTED",
  "PDF_DOWNLOADED",
  "USER_CREATED",
  "USER_UPDATED",
  "UNIT_ASSIGNED",
  "BATCH_DELETED",
];

interface AuditEntry {
  id: number;
  user: { id: string; name: string } | null;
  action: string;
  payload: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
interface PaginatedAudit {
  items: AuditEntry[];
  total: number;
  page: number;
  page_size: number;
}

export function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [user, setUser] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const auditQuery = useQuery({
    queryKey: ["audit", page, action, user, from, to],
    queryFn: () => {
      const q = new URLSearchParams({ page: String(page), page_size: String(PAGE_SIZE) });
      if (action) q.set("action", action);
      if (user) q.set("user_id", user);
      if (from) q.set("from", from);
      if (to) q.set("to", to);
      return api.get<PaginatedAudit>(`/audit?${q.toString()}`).then((r) => r.data);
    },
  });

  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const items = auditQuery.data?.items ?? [];

  function resetFilters() {
    setAction("");
    setUser("");
    setFrom("");
    setTo("");
    setPage(1);
  }

  const hasFilters = action || user || from || to;

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Audit log</h1>
      <p className="mt-1 text-sm text-slate-500">Newest first. {total} entries match.</p>

      <section className="mt-4 grid gap-3 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5">
        <label className="text-sm font-medium">
          Action
          <select
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All actions</option>
            {ACTION_CHOICES.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium">
          User (ID)
          <input
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={user}
            placeholder="uuid (optional)"
            onChange={(e) => {
              setUser(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          From
          <input
            type="date"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="text-sm font-medium">
          To
          <input
            type="date"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <div className="flex items-end">
          <SecondaryButton onClick={resetFilters} disabled={!hasFilters}>
            Clear filters
          </SecondaryButton>
        </div>
      </section>

      <div className="mt-4 overflow-x-auto rounded-lg bg-white shadow-sm">
        {auditQuery.isLoading ? (
          <EmptyState message="Loading audit entries…" />
        ) : items.length === 0 ? (
          <EmptyState message="No audit entries match the filters" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">User</th>
                <th className="px-4 py-2">Action</th>
                <th className="px-4 py-2">Payload</th>
                <th className="px-4 py-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-1.5 whitespace-nowrap">{e.created_at.slice(0, 19).replace("T", " ")}</td>
                  <td className="px-4 py-1.5">{e.user ? e.user.name : <span className="text-slate-500">—</span>}</td>
                  <td className="px-4 py-1.5">
                    <Badge tone={ACTION_TONES[e.action as AuditAction] ?? "muted"}>{e.action}</Badge>
                  </td>
                  <td className="max-w-sm truncate px-4 py-1.5 font-mono text-xs text-slate-500" title={JSON.stringify(e.payload ?? {})}>
                    {e.payload ? JSON.stringify(e.payload) : ""}
                  </td>
                  <td className="px-4 py-1.5 text-slate-500">{e.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-3 text-sm">
          <SecondaryButton disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            ← Prev
          </SecondaryButton>
          <span>
            Page {page} / {totalPages}
          </span>
          <SecondaryButton disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next →
          </SecondaryButton>
        </div>
      )}
    </AppShell>
  );
}
