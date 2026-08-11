"use client";

import { useState } from "react";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const statusOf = (key: TabKey) => {
    const hasContent =
      (key === "extraction" && extractionData) ||
      (key === "plot" && extractionData && (extractionData.summary?.keyEvents?.length || 0) > 0) ||
      (key === "forbidden" && forbiddenScanResult) ||
      (key === "logic" && logicCheckResult) ||
      (key === "distill" && distillSummary) ||
      (key === "review" && reviewResult);
    const hasIssues =
      (key === "forbidden" && forbiddenScanResult && !forbiddenScanResult.passed) ||
      (key === "logic" && logicCheckResult && !logicCheckResult.passed) ||
      (key === "review" && reviewResult && !reviewResult.passed);
    return { hasContent, hasIssues };
  };

  const primaryTabs = TABS.filter((t) => t.key === "extraction" || t.key === "plot");
  const advancedTabs = TABS.filter((t) => t.key !== "extraction" && t.key !== "plot");
  const advancedHasIssues = advancedTabs.some((t) => statusOf(t.key).hasIssues);
  const advancedActive = advancedTabs.some((t) => t.key === tab);

  const renderTabButton = (t: (typeof TABS)[number]) => {
    const { hasContent, hasIssues } = statusOf(t.key);
    return (
      <button key={t.key} onClick={() => onTabChange(t.key)}
        className={`flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2 text-xs font-medium transition-colors
          ${tab === t.key ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-transparent text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"}
          ${!hasContent ? "opacity-40" : ""}`}>
        <Icon name={t.icon} size={13} /> {t.label}
        {hasIssues && <span className="h-1.5 w-1.5 rounded-full bg-[var(--nv-danger)]" />}
      </button>
    );
  };

  return (
    <div>
      {/* 主行：章节提取 常显 + 高级折叠入口 */}
      <div className="flex border-b border-[var(--nv-border-2)]">
        {primaryTabs.map((t) => renderTabButton(t))}
        <button onClick={() => setAdvancedOpen((o) => !o)}
          className={`flex items-center justify-center gap-1 border-b-2 py-2 px-2.5 text-xs font-medium transition-colors
            ${advancedActive || advancedOpen ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-transparent text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"}`}>
          高级 <span className="text-[10px] opacity-70">▾</span>
          {advancedHasIssues && <span className="h-1.5 w-1.5 rounded-full bg-[var(--nv-danger)]" />}
        </button>
      </div>
      {/* 高级行：废词 / 逻辑 / 蒸馏 / 审校（默认折叠，避免视觉过载） */}
      {advancedOpen && (
        <div className="flex border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40">
          {advancedTabs.map((t) => renderTabButton(t))}
        </div>
      )}
    </div>
  );
}
