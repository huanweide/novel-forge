import { Icon } from "@/components/ui/icons";
import { FORBIDDEN_CATEGORIES } from "@/lib/forbidden-checker";
import type { ForbiddenScanResult } from "./types";

interface ForbiddenTabProps {
  forbiddenScanResult: ForbiddenScanResult | null;
}

export function ForbiddenTab({ forbiddenScanResult }: ForbiddenTabProps) {
  return (
    <div className="p-4">
      {forbiddenScanResult ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 text-sm font-medium ${forbiddenScanResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-danger)]"}`}>
              <Icon name={forbiddenScanResult.passed ? "check" : "x"} size={15} /> {forbiddenScanResult.passed ? "废词检测通过" : `发现 ${forbiddenScanResult.totalMatches} 处问题`}
            </span>
            <span className="text-[10px] text-[var(--nv-text-tertiary)]">质量分 {forbiddenScanResult.qualityScore}/100</span>
            {forbiddenScanResult.fuzzyDensity > 0 && (
              <span className={`text-[10px] px-1.5 rounded ${forbiddenScanResult.fuzzyDensity > 3 ? "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}>
                <Icon name="cloud" size={10} /> 模糊词 {forbiddenScanResult.fuzzyDensity.toFixed(1)}/500字
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--nv-text-secondary)]">{forbiddenScanResult.summary}</p>
          {forbiddenScanResult.matches.map((m: any, i: number) => (
            <div key={i} className={`rounded px-3 py-2 text-xs ${m.severity === "error" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : m.severity === "warning" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
              <div className="flex items-center gap-1.5">
                <span className={m.severity === "error" ? "text-[var(--nv-danger)]" : m.severity === "warning" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]"}>
                  <Icon name={m.severity === "error" ? "x" : m.severity === "warning" ? "alert" : "info"} size={13} />
                </span>
                <span className="text-[var(--nv-text-secondary)] font-mono">{m.pattern?.length > 40 ? m.pattern.slice(0, 40) + "…" : m.pattern}</span>
                <span className="text-[var(--nv-text-tertiary)] text-[10px] ml-auto shrink-0">{
                  FORBIDDEN_CATEGORIES.find((c: any) => c.key === m.category)?.label || m.category
                }</span>
              </div>
              {m.context && m.index >= 0 && <p className="text-[var(--nv-text-tertiary)] mt-0.5 ml-4 truncate">{m.context}</p>}
              {m.suggestion && <p className="text-[var(--nv-success)]/80 mt-0.5 ml-4 flex items-center gap-1"><Icon name="lightbulb" size={11} /> {m.suggestion}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无废词检测结果。生成章节后自动扫描。</p>
      )}
    </div>
  );
}
