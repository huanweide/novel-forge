import { Icon } from "@/components/ui/icons";
import type { LogicScanResult } from "./types";

interface LogicTabProps {
  logicCheckResult: LogicScanResult | null;
}

export function LogicTab({ logicCheckResult }: LogicTabProps) {
  return (
    <div className="p-4">
      {logicCheckResult ? (
        <div className="space-y-3">
          <span className={`flex items-center gap-1.5 text-sm font-medium ${logicCheckResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-danger)]"}`}>
            <Icon name={logicCheckResult.passed ? "check" : "x"} size={15} /> {logicCheckResult.passed ? "逻辑自查通过" : `发现 ${logicCheckResult.issues.length} 个问题`}
          </span>
          {logicCheckResult.summary && <p className="text-xs text-[var(--nv-text-secondary)]">{logicCheckResult.summary}</p>}
          {logicCheckResult.issues.map((issue: any, i: number) => (
            <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "error" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : issue.severity === "warning" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
              <div className="flex items-center gap-2">
                <span className={issue.severity === "error" ? "text-[var(--nv-danger)]" : issue.severity === "warning" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]"}>
                  <Icon name={issue.severity === "error" ? "x" : issue.severity === "warning" ? "alert" : "info"} size={13} />
                </span>
                <span className="text-[var(--nv-text-secondary)]">{issue.description}</span>
              </div>
              {issue.evidence && <p className="text-[var(--nv-text-tertiary)] mt-1 ml-5 truncate">{issue.evidence}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无逻辑自查结果。生成章节后自动运行。</p>
      )}
    </div>
  );
}
