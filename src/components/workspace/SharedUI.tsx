"use client";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-[var(--nv-text-muted)] mb-1.5 uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

export function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--nv-text-muted)]">{label}</span>
      <span className="text-[var(--nv-text-secondary)] truncate ml-2 max-w-[140px] text-right">{value || "—"}</span>
    </div>
  );
}
