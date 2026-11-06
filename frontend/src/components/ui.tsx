/* Small shared UI pieces. */

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, UploadCloud, X } from "lucide-react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "brand"; children: ReactNode }) {
  const tones: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    warn: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    muted: "bg-slate-100 text-slate-600",
    brand: "bg-brand-light text-brand",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

const spinner = "inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white";

export function PrimaryButton({
  children, onClick, disabled, type = "button", icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  icon?: ReactNode;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-brand-dark hover:shadow focus-visible:outline focus-visible:outline-2 active:scale-[0.98] disabled:opacity-60"
    >
      {disabled && <span className={spinner} aria-hidden />}
      {icon}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children, onClick, disabled, danger, icon,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 active:scale-[0.98] disabled:opacity-60 ${
        danger ? "border-red-300 text-danger hover:bg-red-50" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="anim-pop max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Right slide-over panel (batch details, etc.). Escape + backdrop close, scrolls internally. */
export function SideDrawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside className="anim-slide-right absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-200 p-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2"
          >
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </aside>
    </div>
  );
}

export function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Click-or-drag file picker for the admin Excel upload flow.
 *  Manages its own hidden input; onFile receives the picked file (or null when cleared). */
export function Dropzone({
  file, onFile, accept = ".xlsx,.csv", hint,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  accept?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function pick(e: React.DragEvent) {
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) onFile(dropped);
  }

  if (file) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-brand/30 bg-brand-light/50 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="rounded-lg bg-brand/10 p-2 text-brand">
            <FileSpreadsheet size={20} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={file.name}>{file.name}</p>
            <p className="text-xs text-slate-500">{formatBytes(file.size)} · ready to upload</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (inputRef.current) inputRef.current.value = "";
            onFile(null);
          }}
          aria-label="Remove selected file"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-danger shrink-0 focus-visible:outline focus-visible:outline-2"
        >
          <X size={16} />
        </button>
        <input ref={inputRef} type="file" accept={accept} hidden onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Choose a spreadsheet file to upload, or drag it here"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={pick}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors focus-visible:outline focus-visible:outline-2 ${
        dragging
          ? "border-brand bg-brand-light"
          : "border-slate-300 bg-slate-50 hover:border-brand/50 hover:bg-brand-light/40"
      }`}
    >
      <span className={`rounded-full p-3 transition-colors ${dragging ? "bg-brand text-white" : "bg-brand-light text-brand"}`}>
        <UploadCloud size={24} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-700">
        {dragging ? "Drop the file here" : "Drag & drop your Excel file here, or click to browse"}
      </p>
      <p className="mt-1 text-xs text-slate-500">{hint ?? ".xlsx or .csv · max 10 MB"}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0] ?? null;
          if (picked) onFile(picked);
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Dashboard/overview stat tile. */
export function KpiCard({
  title, value, sub, icon,
}: {
  title: string;
  value: ReactNode;
  sub?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-xl bg-white p-6 shadow-sm ring-1 ring-slate-200/60 transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between">
        <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</dt>
        {icon && <span className="rounded-lg bg-brand-light p-2 text-brand">{icon}</span>}
      </div>
      <dd className="mt-2 text-2xl font-bold text-slate-900">{value}</dd>
      {sub && <p className="mt-1 truncate text-xs text-slate-500" title={sub}>{sub}</p>}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-500">{message}</div>;
}
