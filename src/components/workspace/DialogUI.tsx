"use client";

import { useRef } from "react";
import { useFocusTrap } from "@/hooks/use-focus-trap";

export function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, true, onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div ref={panelRef} tabIndex={-1} className="surface-floating rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[85vh] overflow-y-auto custom-scrollbar" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function DialogField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm text-[var(--nv-text-secondary)] mb-1 block">
        {label}
        {required && <span className="text-[var(--nv-danger)] ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

export function DialogInput({
  value,
  onChange,
  placeholder,
  autoFocus,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  rows?: number;
}) {
  if (rows && rows > 1) {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        autoFocus={autoFocus}
        className="input-glass w-full rounded-lg px-3 py-2 text-xs resize-none focus:border-[var(--nv-primary)] placeholder:text-[var(--nv-text-tertiary)]"
      />
    );
  }
  return (
    <input
      className="input-glass w-full rounded px-3 py-2 text-sm focus:border-[var(--nv-primary)]"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
}
