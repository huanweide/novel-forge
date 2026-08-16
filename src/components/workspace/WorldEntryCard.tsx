"use client";

import { memo } from "react";
import { Icon } from "@/components/ui/icons";
import type { LorebookData } from "./types";

interface WorldEntryCardProps {
  entry: LorebookData;
  depthLabels: Record<number, string>;
  onDelete: (id: string) => void;
  deleting: boolean;
  /** 编辑回调：传入完整条目，由父级复用 LorebookEditDialog 打开弹窗 */
  onEdit?: (entry: LorebookData) => void;
  /** 待审确认：自动填表条目确认并入 */
  onConfirm?: (id: string) => void;
}

function WorldEntryCardImpl({ entry, depthLabels, onDelete, deleting, onEdit, onConfirm }: WorldEntryCardProps) {
  return (
    <div
      className={"group min-w-0 overflow-hidden rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2 transition-all hover:-translate-y-0.5 hover:border-[var(--nv-border-3)] hover:shadow-[var(--shadow-glass-rest)]" + (entry.enabled ? "" : " opacity-60")}
    >
      <div className="flex items-start justify-between">
        <span
          className="break-words text-xs font-medium leading-tight text-[var(--nv-text-primary)] cursor-pointer hover:text-[var(--nv-accent)]"
          onClick={() => onEdit?.(entry)}
          title="点击查看 / 编辑完整条目"
        >{entry.title}</span>
        {!entry.enabled && (
          <span className="ml-1 shrink-0 rounded bg-[var(--nv-surface-3)] px-1 py-0.5 text-[8px] text-[var(--nv-text-tertiary)]">已停用</span>
        )}
        {entry.reviewStatus === "pending" && (
          <span className="ml-1 shrink-0 rounded bg-[var(--nv-warning)]/20 px-1 py-0.5 text-[8px] text-[var(--nv-warning)]">待审</span>
        )}
        {entry.reviewStatus === "pending" && onConfirm && (
          <button
            onClick={() => onConfirm(entry.id)}
            disabled={deleting}
            className="ml-1 shrink-0 text-[var(--nv-success)] opacity-0 transition-all hover:text-[var(--nv-success)] group-hover:opacity-100 disabled:opacity-40"
            aria-label="确认并入"
            title="确认并入世界书"
          >
            <Icon name="check" size={12} />
          </button>
        )}
        <button
          onClick={() => onEdit?.(entry)}
          disabled={deleting}
          className="ml-1 shrink-0 text-[var(--nv-text-muted)] opacity-0 transition-all hover:text-[var(--nv-accent)] group-hover:opacity-100 disabled:opacity-40"
          aria-label="编辑条目"
          title="编辑条目"
        >
          <Icon name="pencil" size={12} />
        </button>
        <button
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          className="ml-1 shrink-0 text-[var(--nv-text-muted)] opacity-0 transition-all hover:text-[var(--nv-danger)] group-hover:opacity-100 disabled:opacity-40"
          aria-label="删除条目（拒绝待审）"
          title="删除条目（拒绝待审）"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      {entry.content && (
        <p className="mt-0.5 line-clamp-4 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">
          {entry.content}
        </p>
      )}
      {/* 触发关键词 */}
      {entry.keys && entry.keys.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {entry.keys.slice(0, 4).map((k, i) => (
            <span key={i} className="rounded bg-[var(--nv-surface-2)] px-1 py-0.5 text-[8px] text-[var(--nv-text-tertiary)]">{k}</span>
          ))}
        </div>
      )}
      {/* 注入深度徽标 */}
      {typeof entry.depth === "number" && (
        <div className="mt-1">
          <span className={`rounded px-1 py-0.5 text-[8px] ${entry.depth <= 2 ? "bg-[var(--nv-accent)]/20 text-[var(--nv-accent)]" : "bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]"}`}>
            {depthLabels[entry.depth] || `深度${entry.depth}`}
          </span>
        </div>
      )}
    </div>
  );
}

export const WorldEntryCard = memo(WorldEntryCardImpl);
