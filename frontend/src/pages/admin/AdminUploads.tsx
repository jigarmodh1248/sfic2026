/* Admin: Excel upload form + batch history + details drawer (with import preview). */

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { CheckCircle2, Copy, Download, FileSpreadsheet, FileUp, Info, Trash2, XCircle } from "lucide-react";
import { AppShell } from "../../components/AppShell";
import { Badge, Dropzone, EmptyState, PrimaryButton, SecondaryButton, SideDrawer } from "../../components/ui";
import { api } from "../../lib/api";
import type { BatchStatus, PaginatedUploads, UploadBatch, UploadBatchDetail, UploadErrorItem, UploadSummary } from "../../types/api";

const PAGE_SIZE = 10;
const MAX_BYTES = 10 * 1024 * 1024;

interface BatchPreviewRecord {
  recorded_date: string;
  parameter: string;
  value: number;
  uom: string | null;
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

export function AdminUploadsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [drawerBatch, setDrawerBatch] = useState<UploadBatch | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

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
    if (!selectedFile) return;
    if (selectedFile.size > MAX_BYTES) {
      toast.error("File is larger than 10 MB");
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", selectedFile);
      const r = await api.post<UploadSummary>("/uploads", form);
      const s = r.data;
      if (s.status === "SUCCESS") {
        toast.success(`Imported ${s.rows_imported} rows from ${s.filename}`);
      } else if (s.status === "PARTIAL") {
        toast.warning(`${s.rows_imported} imported, ${s.rows_rejected} rejected from ${s.filename}`);
      } else {
        toast.error(`${s.filename}: whole batch rejected — nothing imported`);
      }
      refresh();
      setSelectedFile(null);
    } catch (err) {
      if (isAxiosError(err)) {
        const detail = err.response?.data?.detail;
        toast.error(
          typeof detail === "string" ? detail : `Upload failed (${err.response?.status ?? "network"})`,
        );
      } else {
        toast.error("Upload failed");
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
        toast.success("Template downloaded");
      })
      .catch(() => toast.error("Could not download template"));
  }

  async function deleteBatch(batchId: string, filename: string) {
    if (!window.confirm(`Delete batch "${filename}"? Its data rows will be removed.`)) return;
    try {
      await api.delete(`/uploads/${batchId}`);
      refresh();
      toast.success(`Batch "${filename}" deleted`);
    } catch (err) {
      toast.error(
        isAxiosError(err) && typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Could not delete batch",
      );
    }
  }

  function copyBatchId(id: string) {
    void navigator.clipboard?.writeText(id).then(
      () => toast.success("Batch ID copied"),
      () => toast.error("Copy failed"),
    );
  }

  const items = listQuery.data?.items ?? [];

  return (
    <AppShell>
      <h1 className="text-xl font-bold">Excel uploads</h1>

      <section className="mt-4 rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">New import</h2>
            <p className="text-xs text-slate-500">
              One row per reading: unit_number · recorded_date · parameter · value (+uom)
            </p>
          </div>
          <SecondaryButton icon={<Download size={15} aria-hidden />} onClick={downloadTemplate}>
            Download template
          </SecondaryButton>
        </div>

        <div className="mt-4">
          <Dropzone
            file={selectedFile}
            onFile={(f) => {
              if (f && f.size > MAX_BYTES) {
                toast.error("File is larger than 10 MB");
                return;
              }
              setSelectedFile(f);
            }}
          />
        </div>

        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <Info size={14} aria-hidden />
            Rows failing validation are rejected per-row; batches with more than 20% failures are
            rejected entirely.
          </p>
          <PrimaryButton
            icon={<FileUp size={16} aria-hidden />}
            onClick={() => void onUpload()}
            disabled={uploading || !selectedFile}
          >
            {uploading ? "Uploading…" : "Upload file"}
          </PrimaryButton>
        </div>
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
                <tr key={b.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium">{b.filename}</td>
                  <td className="px-4 py-2">{b.uploaded_by_name}</td>
                  <td className="px-4 py-2">{b.uploaded_at.slice(0, 16).replace("T", " ")}</td>
                  <td className="px-4 py-2">
                    <Badge tone={statusTone(b.status)}>{b.status}</Badge>
                  </td>
                  <td className="px-4 py-2">{b.rows_imported}</td>
                  <td className={`px-4 py-2 ${b.rows_rejected ? "text-danger" : ""}`}>{b.rows_rejected}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-2">
                      <SecondaryButton icon={<FileSpreadsheet size={14} aria-hidden />} onClick={() => setDrawerBatch(b)}>
                        Details
                      </SecondaryButton>
                      {b.status !== "DELETED" && (
                        <SecondaryButton danger icon={<Trash2 size={14} aria-hidden />} onClick={() => void deleteBatch(b.id, b.filename)}>
                          Delete
                        </SecondaryButton>
                      )}
                    </div>
                  </td>
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

      {drawerBatch && <BatchDrawer batch={drawerBatch} onClose={() => setDrawerBatch(null)} onCopyId={copyBatchId} />}
    </AppShell>
  );
}

function BatchDrawer({
  batch,
  onClose,
  onCopyId,
}: {
  batch: UploadBatch;
  onClose: () => void;
  onCopyId: (id: string) => void;
}) {
  const detailQuery = useQuery({
    queryKey: ["uploads", "detail", batch.id],
    queryFn: () => api.get<UploadBatchDetail>(`/uploads/${batch.id}`).then((r) => r.data),
  });
  const previewQuery = useQuery({
    queryKey: ["uploads", "preview", batch.id],
    queryFn: () => api.get<BatchPreviewRecord[]>(`/uploads/${batch.id}/preview`).then((r) => r.data),
  });

  const preview: BatchPreviewRecord[] = previewQuery.data ?? [];

  const errors: UploadErrorItem[] =
    (detailQuery.data?.error_report?.errors as UploadErrorItem[] | undefined) ?? [];

  return (
    <SideDrawer title="Batch details" onClose={onClose}>
      <h3 className="text-sm font-semibold">{batch.filename}</h3>

      <dl className="mt-3 space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-slate-500">Batch ID</dt>
          <dd className="flex items-center gap-1">
            <code className="max-w-44 truncate rounded bg-slate-100 px-1.5 py-0.5 text-xs">{batch.id}</code>
            <button
              type="button"
              aria-label="Copy batch ID"
              className="rounded p-1 text-slate-500 hover:bg-slate-100"
              onClick={() => onCopyId(batch.id)}
            >
              <Copy size={14} />
            </button>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Status</dt>
          <dd>
            <Badge tone={statusTone(batch.status)}>{batch.status}</Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Imported</dt>
          <dd className="inline-flex items-center gap-1 font-medium">
            <CheckCircle2 size={14} className="text-ok" aria-hidden />
            {batch.rows_imported}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Rejected</dt>
          <dd
            className={`inline-flex items-center gap-1 font-medium ${batch.rows_rejected ? "text-danger" : "text-slate-700"}`}
          >
            <XCircle size={14} className={batch.rows_rejected ? "text-danger" : "text-slate-400"} aria-hidden />
            {batch.rows_rejected}
          </dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-slate-500">Uploaded by</dt>
          <dd>{batch.uploaded_by_name}</dd>
        </div>
      </dl>

      <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold">
        <FileSpreadsheet size={15} aria-hidden /> First 10 imported records
      </h3>
      {previewQuery.isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Loading preview…</p>
      ) : previewQuery.isError ? (
        <p className="mt-2 text-xs text-danger">Preview unavailable for this batch.</p>
      ) : preview.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No data rows in this batch.</p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-left text-xs">
            <thead className="border-b bg-slate-50 uppercase text-slate-500">
              <tr>
                <th className="px-3 py-1.5">Date</th>
                <th className="px-3 py-1.5">Parameter</th>
                <th className="px-3 py-1.5 text-right">Value</th>
                <th className="px-3 py-1.5">UoM</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-3 py-1.5 whitespace-nowrap">{r.recorded_date}</td>
                  <td className="px-3 py-1.5">{r.parameter}</td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.value.toLocaleString()}</td>
                  <td className="px-3 py-1.5 text-slate-500">{r.uom ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="mt-5 text-sm font-semibold">Row errors</h3>
      {detailQuery.isLoading ? (
        <p className="mt-2 text-xs text-slate-500">Loading report…</p>
      ) : errors.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No per-row errors recorded for this batch.</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          {errors.map((e, i) => (
            <li key={i}>
              Row {e.row}: {e.message}
            </li>
          ))}
          {batch.status === "FAILED" && (
            <li className="font-semibold text-danger">
              Whole batch rejected (&gt;20% of rows failed) — nothing was imported.
            </li>
          )}
        </ul>
      )}
    </SideDrawer>
  );
}
