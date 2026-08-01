import { Icon } from "@/components/ui/icons";
import { TABS, type TabKey, type ExtractionData, type DistillSummary, type ForbiddenScanResult, type LogicScanResult } from "./types";

interface PostGenPanelTabsProps {
  tab: TabKey;
  onTabChange: (t: TabKey) => void;
  extractionData: ExtractionData | null;
  forbiddenScanResult: ForbiddenScanResult | null;
  logicCheckResult: LogicScanResult | null;
  distillSummary: DistillSummary | null;
  reviewResult: { passed: boolean; issues: any[] } | null;
}

export function PostGenPanelTabs({
  tab,
  onTabChange,
  extractionData,
  forbiddenScanResult,
  logicCheckResult,
  distillSummary,
  reviewResult,
}: PostGenPanelTabsProps) {
  return (
    <div className="flex border-b border-[var(--nv-border-2)]">
      {TABS.map((t) => {
        const hasContent =
          (t.key === "extraction" && extractionData) ||
          (t.key === "forbidden" && forbiddenScanResult) ||
          (t.key === "logic" && logicCheckResult) ||
          (t.key === "distill" && distillSummary) ||
          (t.key === "review" && reviewResult);
        const hasIssues =
          (t.key === "forbidden" && forbiddenScanResult && !forbiddenScanResult.passed) ||
          (t.key === "logic" && logicCheckResult && !logicCheckResult.passed) ||
          (t.key === "review" && reviewResult && !reviewResult.passed);
        return (
          <button key={t.key} onClick={() => onTabChange(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors
              ${tab === t.key ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-transparent text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"}
              ${!hasContent ? "opacity-40" : ""}`}>
            <Icon name={t.icon} size={13} /> {t.label}
            {hasIssues && <span className="h-1.5 w-1.5 rounded-full bg-[var(--nv-danger)]" />}
          </button>
        );
      })}
    </div>
  );
}
