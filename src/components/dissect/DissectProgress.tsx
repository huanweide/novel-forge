"use client";

import type { DimensionResult } from "@/core/dissect/types";
import { DIMENSION_LABELS } from "@/core/dissect/types";
import { Icon } from "@/components/ui/icons";

interface DissectProgressProps {
  status: string;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  dimensions?: Record<string, DimensionResult>;
  error?: string;
}

export function DissectProgress({
  status,
  progress,
  totalChapters,
  completedChapters,
  dimensions,
  error,
}: DissectProgressProps) {
  const statusLabel: Record<string, string> = {
    pending: "等待开始",
    chunking: "正在检测章节...",
    extracting: "正在提取维度...",
    completed: "拆解完成",
    failed: "拆解失败",
  };

  const statusColor: Record<string, string> = {
    pending: "text-[var(--nv-text-muted)]",
    chunking: "text-info",
    extracting: "text-[var(--nv-primary)]",
    completed: "text-success",
    failed: "text-danger",
  };

  const barColor =
    status === "failed"
      ? "var(--nv-danger)"
      : status === "completed"
        ? "var(--nv-success)"
        : "var(--nv-primary)";

  // progress 保证在 0-100 之间
  const pct = Math.min(100, Math.max(0, progress));

  return (
    <div className="space-y-4">
      {/* 状态标签 */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${statusColor[status] || "text-[var(--nv-text-tertiary)]"}`}>
          {status === "extracting" && (
            <Icon name="loader" size={14} className="inline-block animate-spin mr-1" />
          )}
          {statusLabel[status] || status}
        </span>
        <span className="text-sm text-[var(--nv-text-muted)] tabular-nums">{Math.round(pct)}%</span>
      </div>

      {/* 进度条——用 transform:scaleX 代替 width，GPU 合成不走 reflow */}
      <div className="h-2 bg-[var(--nv-surface-2)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            backgroundColor: barColor,
            width: "100%",
            transformOrigin: "left center",
            transform: `scaleX(${pct / 100})`,
            transition: "transform 0.5s cubic-bezier(0.4, 0, 0.2, 1)",
            willChange: "transform",
          }}
        />
      </div>

      {/* 章节进度——固定高度防跳动 */}
      <div style={{ minHeight: 20 }}>
        {totalChapters > 0 && (
          <div className="text-xs text-[var(--nv-text-muted)] tabular-nums">
            章节：{completedChapters}/{totalChapters}
          </div>
        )}
      </div>

      {/* 维度状态网格——预设最小高度，出现时不跳 */}
      <div style={{ minHeight: 56 }}>
        {dimensions && Object.keys(dimensions).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {Object.entries(dimensions).map(([key, dim]) => {
              const dimLabel = DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS] || key;
              const dimIcon: "check" | "x" | "loader" | "circle" =
                dim.status === "completed"
                  ? "check"
                  : dim.status === "failed"
                    ? "x"
                    : dim.status === "extracting"
                      ? "loader"
                      : "circle";
              const dimSpin = dim.status === "extracting";
              const bg =
                dim.status === "completed"
                  ? "bg-success/10 text-success"
                  : dim.status === "failed"
                    ? "bg-danger/10 text-danger"
                    : dim.status === "extracting"
                      ? "bg-[var(--nv-primary)]/10 text-[var(--nv-primary)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)]";
              return (
                <div
                  key={key}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs ${bg}`}
                >
                  <Icon name={dimIcon} size={13} className={dimSpin ? "animate-spin" : ""} />
                  <span className="truncate">{dimLabel}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 错误信息 */}
      {error && (
        <div className="p-3 bg-danger/10 border border-danger/30 rounded-lg">
          <p className="text-sm text-danger">{error}</p>
        </div>
      )}
    </div>
  );
}
