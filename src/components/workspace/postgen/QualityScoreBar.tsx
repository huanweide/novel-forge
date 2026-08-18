"use client";

/**
 * QualityScoreBar — 质量总分聚合条（2.0 P0-2）
 *
 * 渲染在 PostGenPanel 顶部：把废词/逻辑/审校三项结果聚合成一个总状态，
 * 任一项 fail 即整体 fail。不含任何新 LLM 调用，纯展示。
 */

import { Icon } from "@/components/ui/icons";
import { aggregateQuality } from "./quality-aggregate";
import type { ForbiddenScanResult, LogicScanResult } from "./types";

interface QualityScoreBarProps {
  forbiddenScanResult: ForbiddenScanResult | null;
  logicCheckResult: LogicScanResult | null;
  reviewResult: { passed: boolean; issues: unknown[] } | null;
}

export function QualityScoreBar({
  forbiddenScanResult,
  logicCheckResult,
  reviewResult,
}: QualityScoreBarProps) {
  const agg = aggregateQuality(forbiddenScanResult, logicCheckResult, reviewResult);

  const isFail = agg.overall === "fail";
  const isPass = agg.overall === "pass";
  const barColor = isFail
    ? "var(--nv-danger)"
    : isPass
      ? "var(--nv-success)"
      : "var(--nv-text-tertiary)";
  const barPct = isFail ? 100 : isPass ? (agg.score ?? 100) : 8;
  const statusLabel = isFail ? "未通过" : isPass ? "通过" : "待评测";
  const statusColor = isFail
    ? "text-[var(--nv-danger)]"
    : isPass
      ? "text-[var(--nv-success)]"
      : "text-[var(--nv-text-tertiary)]";

  return (
    <div className="px-4 py-3 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--nv-text-secondary)]">质量总分</span>
          <span className={`text-xs font-semibold ${statusColor}`}>
            {statusLabel}
            {agg.score != null && isPass ? ` · ${agg.score}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {agg.gates.map((g) => (
            <span
              key={g.key}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] border ${
                g.status === "pass"
                  ? "border-[var(--nv-success)]/30 text-[var(--nv-success)] bg-[var(--nv-success)]/10"
                  : g.status === "fail"
                    ? "border-[var(--nv-danger)]/30 text-[var(--nv-danger)] bg-[var(--nv-danger)]/10"
                    : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)]"
              }`}
            >
              {g.status === "pass" ? <Icon name="check" size={10} className="shrink-0" /> : g.status === "fail" ? <Icon name="x" size={10} className="shrink-0" /> : <span className="text-[10px]">·</span>} {g.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full rounded-full bg-[var(--nv-surface-2)] overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${barPct}%`, background: barColor }}
        />
      </div>
    </div>
  );
}
