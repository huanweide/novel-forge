"use client";
import { describeHttpError } from "@/lib/stream-error";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { DiagnosticReport, DiagnosticCheck } from "@/core/diagnostics";

const STATUS_STYLE: Record<DiagnosticCheck["status"], string> = {
  ok: "text-[var(--nv-success)] bg-[var(--nv-success)]/10",
  warn: "text-[var(--nv-warning)] bg-[var(--nv-warning)]/10",
  error: "text-[var(--nv-danger)] bg-[var(--nv-danger)]/10",
};
const STATUS_LABEL: Record<DiagnosticCheck["status"], string> = { ok: "通过", warn: "注意", error: "异常" };

export function ProjectDiagnostics({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<DiagnosticReport | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/diagnostics`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        { const _f = describeHttpError(res.status, d); throw new Error(_f.description); }
      }
      setReport(await res.json());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "自检失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-[var(--nv-text-primary)]">项目自检</span>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-1 rounded bg-[var(--nv-accent)] px-2 py-1 text-xs text-white disabled:opacity-50"
        >
          <Icon name={loading ? "loader" : "search"} size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "检测中…" : "运行自检"}
        </button>
      </div>

      {err && <p className="text-xs text-[var(--nv-danger)]">{err}</p>}

      {report && (
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1 text-xs">
            <span className={`rounded px-1.5 py-0.5 font-medium ${STATUS_STYLE[report.overall]}`}>
              总体 {STATUS_LABEL[report.overall]}
            </span>
            <span className="text-[var(--nv-text-tertiary)]">{report.projectName}</span>
          </div>
          {report.checks.map((c) => (
            <div key={c.key} className="flex items-start gap-2 rounded bg-[var(--nv-surface-2)] px-2 py-1.5">
              <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${STATUS_STYLE[c.status]}`}>
                {STATUS_LABEL[c.status]}
              </span>
              <div className="min-w-0">
                <div className="text-xs text-[var(--nv-text-primary)]">{c.label}</div>
                <div className="text-[11px] text-[var(--nv-text-secondary)] break-words">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
