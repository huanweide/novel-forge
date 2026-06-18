"use client";

import type { DimensionResult } from "@/core/dissect/types";
import { DIMENSION_LABELS, DIMENSION_ICONS } from "@/core/dissect/types";

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
    pending: "text-zinc-500",
    chunking: "text-blue-400",
    extracting: "text-indigo-400",
    completed: "text-green-400",
    failed: "text-red-400",
  };

  const barColor =
    status === "failed"
      ? "bg-red-500"
      : status === "completed"
        ? "bg-green-500"
        : "bg-indigo-500";

  return (
    <div className="space-y-4">
      {/* 状态标签 */}
      <div className="flex items-center justify-between">
        <span className={`text-sm font-medium ${statusColor[status] || "text-zinc-400"}`}>
          {statusLabel[status] || status}
        </span>
        <span className="text-sm text-zinc-500">{Math.round(progress)}%</span>
      </div>

      {/* 进度条 */}
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      {/* 章节进度 */}
      {totalChapters > 0 && (
        <div className="text-xs text-zinc-500">
          章节：{completedChapters}/{totalChapters}
        </div>
      )}

      {/* 维度状态网格 */}
      {dimensions && Object.keys(dimensions).length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-3">
          {Object.entries(dimensions).map(([key, dim]) => {
            const icon =
              dim.status === "completed"
                ? "✅"
                : dim.status === "failed"
                  ? "❌"
                  : dim.status === "extracting"
                    ? "⏳"
                    : "⬜";
            return (
              <div
                key={key}
                className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs ${
                  dim.status === "completed"
                    ? "bg-green-500/10 text-green-400"
                    : dim.status === "failed"
                      ? "bg-red-500/10 text-red-400"
                      : dim.status === "extracting"
                        ? "bg-indigo-500/10 text-indigo-400"
                        : "bg-zinc-800 text-zinc-600"
                }`}
              >
                <span>{icon}</span>
                <span>{DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS] || key}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
