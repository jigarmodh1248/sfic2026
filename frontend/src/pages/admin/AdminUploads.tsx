/* Admin: Excel upload form + batch history + error viewer. */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { isAxiosError } from "axios";
import { AppShell } from "../../components/AppShell";
import { Badge, EmptyState, PrimaryButton, SecondaryButton } from "../../components/ui";
import { api } from "../../lib/api";
import type { BatchStatus, PaginatedUploads, UploadBatch, UploadBatchDetail, UploadErrorItem, UploadSummary } from "../../types/api";

const PAGE_SIZE = 10;
const MAX_BYTES = 10 * 1024 * 1024;

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

export function AdminUploadsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [uploadResult, setUploadResult] = useState<UploadSummary | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const listQuery = useQuery({
    queryKey: ["uploads", page],
    queryFn: () => api.get<PaginatedUploads>(`/uploads?page=${page}&page_size=${PAGE_SIZE}`).then((r) => r.data),
  });
  const total = listQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function refresh() {
    void qc.invalidateQueries({ queryKey: ["uploads"] });
  }

  async function onUpload() {
    setUploadError(null);
    setUploadResult(null);
    if (!selectedFile) return;
    if (selectedFile.size > MAX_BYTES) {
      setUploadError("File is larger than 10 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const r = await api.post<UploadSummary>("/uploads", form);
      setUploadResult(r.data);
      refresh();
      setSelectedFile(null);
      if (fileInput.current) fileInput.current.value = "";
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        setUploadError(
          typeof detail === "string" ? detail : `Upload failed (${err.response?.status ?? "network"})`,
        );
      } else {
        setUploadError("Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  function downloadTemplate() {
    void api
      .get("/uploads/template", { responseType: "blob" })
      .then((r) => {
        const url = URL.createObjectURL(r.data as Blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "gspc-import-template.xlsx";
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => setUploadError("Could not download template"));
  }

  async function deleteBatch(batchId: string, filename: string) {
    if (!window.confirm(`Delete batch "${filename}"? Its data rows will be removed.`)) return;
    try {
      await api.delete(`/uploads/${batchId}`);
      refresh();
    } catch (err) {
      setUploadError(
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Could not delete batch",
      );
    }
  }

  const items = listQuery.data?.items ?? [];

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Excel uploads</h1>

      <section className="mt-4 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label htmlFor="file" className="block text-sm font-medium">
              Upload the filled import template (.xlsx / .csv, max 10 MB)
            </label>
            <input
              id="file"
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-sm"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <SecondaryButton onClick={downloadTemplate}>Download template</SecondaryButton>
          <PrimaryButton onClick={() => void onUpload()} disabled={uploading || !selectedFile}>
            {uploading ? "Uploading…" : "Upload"}
          </PrimaryButton>
        </div>

        {uploadError && <p className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-danger">{uploadError}</p>}
        {uploadResult && (
          <div className="mt-3 rounded border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={statusTone(uploadResult.status)}>{uploadResult.status}</Badge>
              <span className="font-medium">{uploadResult.filename}</span>
              <span className="text-green-800">{uploadResult.rows_imported} imported</span>
              <span className={uploadResult.rows_rejected ? "text-danger" : "text-slate-500"}>
                {uploadResult.rows_rejected} rejected
              </span>
            </div>
            {uploadResult.errors.length > 0 && (
              <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600" data-testid="upload-errors">
                {uploadResult.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
                {uploadResult.status === "FAILED" && (
                  <li className="text-danger">Whole batch rejected (&gt;20% of rows failed) — nothing was imported.</li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>

      <h2 className="mt-6 font-semibold">Batch history</h2>
      <div className="mt-2 overflow-x-auto rounded-lg bg-white shadow-sm">
        {listQuery.isLoading ? (
          <EmptyState message="Loading batches…" />
        ) : items.length === 0 ? (
          <EmptyState message="No batches uploaded yet" />
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="border-b bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-2">File</th>
                <th className="px-4 py-2">By</th>
                <th className="px-4 py-2">When</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Imported</th>
                <th className="px-4 py-2">Rejected</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((b) => (
                <BatchRow
                  key={b.id}
                  batch={b}
                  expanded={expandedBatch === b.id}
                  onToggle={() => setExpandedBatch(expandedBatch === b.id ? null : b.id)}
                  onDelete={() => void deleteBatch(b.id, b.filename)}
                />
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

function BatchRow({
  batch,
  expanded,
  onToggle,
  onDelete,
}: {
  batch: UploadBatch;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const isDeletable = batch.status !== "DELETED";

  const detailQuery = useQuery({
    queryKey: ["uploads", "detail", batch.id],
    queryFn: () => api.get<UploadBatchDetail>(`/uploads/${batch.id}`).then((r) => r.data),
    enabled: expanded,
  });
  const errors: UploadErrorItem[] =
    (detailQuery.data?.error_report?.errors as UploadErrorItem[] | undefined) ?? [];

  return (
    <>
      <tr className="border-b last:border-0 hover:bg-slate-50">
        <td className="px-4 py-2 font-medium">{batch.filename}</td>
        <td className="px-4 py-2">{batch.uploaded_by_name}</td>
        <td className="px-4 py-2">{batch.uploaded_at.slice(0, 16).replace("T", " ")}</td>
        <td className="px-4 py-2">
          <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
        </td>
        <td className="px-4 py-2">{batch.rows_imported}</td>
        <td className={`px-4 py-2 ${batch.rows_rejected ? "text-danger" : ""}`}>{batch.rows_rejected}</td>
        <td className="px-4 py-2 text-right">
          <div className="inline-flex gap-2">
            <SecondaryButton onClick={onToggle}>{expanded ? "Hide errors" : "Errors"}</SecondaryButton>
            {isDeletable && <SecondaryButton danger onClick={onDelete}>Delete</SecondaryButton>}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50">
          <td colSpan={7} className="px-4 py-3">
            {detailQuery.isLoading ? (
              <span className="text-xs text-slate-500">Loading report…</span>
            ) : errors.length === 0 ? (
              <span className="text-xs text-slate-500">No per-row errors recorded for this batch.</span>
            ) : (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600">
                {errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.message}
                  </li>
                ))}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
