import { Icon } from "@/components/ui/icons";
import type { DistillSummary } from "./types";

interface DistillTabProps {
  distillSummary: DistillSummary | null;
}

export function DistillTab({ distillSummary }: DistillTabProps) {
  return (
    <div className="p-4">
      {distillSummary ? (
        <div className="space-y-3">
          <p className="flex items-center gap-1.5 text-sm text-[var(--nv-text-primary)]">
            <Icon name="zap" size={15} className="text-[var(--nv-creative)]" /> 本地蒸馏完成 <span className="text-[var(--nv-text-tertiary)]">（{distillSummary.elapsedMs}ms · 零Token）</span>
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            {distillSummary.entityCount > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="search" size={11} /> 实体检测</span>
                <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.entityCount} 个</p>
              </div>
            )}
            {distillSummary.stateChangeCount > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="chart" size={11} /> 状态变化</span>
                <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.stateChangeCount} 处</p>
              </div>
            )}
            {distillSummary.foreshadowCount > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="zap" size={11} /> 线索信号</span>
                <p className="text-[var(--nv-text-primary)] font-medium">{distillSummary.foreshadowCount} 个</p>
              </div>
            )}
            {distillSummary.consistencyIssueCount > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="alert" size={11} /> 一致性问题</span>
                <p className="text-[var(--nv-accent)] font-medium">{distillSummary.consistencyIssueCount} 处</p>
              </div>
            )}
            {distillSummary.foreshadowCreated > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="check" size={11} /> 新增线索</span>
                <p className="text-[var(--nv-success)] font-medium">{distillSummary.foreshadowCreated} 个</p>
              </div>
            )}
            {distillSummary.foreshadowUpdated > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="refresh" size={11} /> 线索更新</span>
                <p className="text-[var(--nv-accent)] font-medium">{distillSummary.foreshadowUpdated} 个</p>
              </div>
            )}
            {distillSummary.entitiesAutoCreated > 0 && (
              <div className="bg-[var(--nv-surface-2)] rounded px-3 py-2">
                <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name="plus" size={11} /> 自动创建实体</span>
                <p className="text-[var(--nv-success)] font-medium">{distillSummary.entitiesAutoCreated} 个</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-[var(--nv-text-tertiary)] text-center py-6">暂无蒸馏数据。生成章节后自动运行。</p>
      )}
    </div>
  );
}
