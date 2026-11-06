/* Small shared UI pieces. */

import type { ReactNode } from "react";

export function Badge({ tone, children }: { tone: "ok" | "warn" | "danger" | "muted" | "brand"; children: ReactNode }) {
  const tones: Record<string, string> = {
    ok: "bg-green-100 text-green-800",
    warn: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-800",
    muted: "bg-slate-100 text-slate-600",
    brand: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tones[tone]}`}>
      {children}
    </span>
  );
}

const spinner = "inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white";

export function PrimaryButton({
  children, onClick, disabled, type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 rounded bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark focus-visible:outline focus-visible:outline-2 disabled:opacity-60"
    >
      {disabled && <span className={spinner} aria-hidden />}
      {children}
    </button>
  );
}

export function SecondaryButton({
  children, onClick, disabled, danger,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded border px-3 py-1.5 text-sm focus-visible:outline focus-visible:outline-2 disabled:opacity-60 ${
        danger ? "border-red-300 text-danger hover:bg-red-50" : "border-slate-300 text-slate-700 hover:bg-slate-100"
      }`}
    >
      {children}
    </button>
  );
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
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

export function EmptyState({ message }: { message: string }) {
  return <div className="py-10 text-center text-sm text-slate-400">{message}</div>;
}
