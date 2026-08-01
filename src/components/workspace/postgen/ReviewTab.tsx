import { Icon } from "@/components/ui/icons";
import type { ReviewIssue } from "@/components/workspace/types";

interface ReviewTabProps {
  reviewResult: { passed: boolean; issues: ReviewIssue[] } | null;
}

export function ReviewTab({ reviewResult }: ReviewTabProps) {
  return (
    <div className="p-4">
      {reviewResult ? (
        <div className="space-y-3">
          <p className={`flex items-center gap-1.5 text-sm font-medium ${reviewResult.passed ? "text-[var(--nv-success)]" : "text-[var(--nv-accent)]"}`}>
            <Icon name={reviewResult.passed ? "check" : "alert"} size={15} /> {reviewResult.passed ? "审校通过" : `审校发现 ${reviewResult.issues.length} 个问题`}
          </p>
          {reviewResult.issues.map((issue: ReviewIssue, i: number) => (
            <div key={i} className={`rounded px-3 py-2 text-xs ${issue.severity === "major" || issue.severity === "critical" ? "bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/30" : issue.severity === "minor" ? "bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20" : "bg-[var(--nv-surface-2)]"}`}>
              <p className="text-[var(--nv-text-secondary)]">{issue.description}</p>
              {issue.location && <p className="text-[var(--nv-text-tertiary)] mt-1">位置：{issue.location.slice(0, 80)}</p>}
              {issue.suggestion && <p className="text-[var(--nv-success)]/80 mt-0.5 flex items-center gap-1"><Icon name="lightbulb" size={11} /> {issue.suggestion}</p>}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无审校结果。生成章节后自动运行。</p>
      )}
    </div>
  );
}
