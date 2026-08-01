"use client";

import { Icon } from "@/components/ui/icons";
import type { LorebookData } from "./types";

interface WorldEntryCardProps {
  entry: LorebookData;
  depthLabels: Record<number, string>;
  onDelete: (id: string) => void;
  deleting: boolean;
}

export function WorldEntryCard({ entry, depthLabels, onDelete, deleting }: WorldEntryCardProps) {
  return (
    <div
      className="group rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2 transition-colors hover:border-[var(--nv-border-3)]"
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium leading-tight text-[var(--nv-text-primary)]">{entry.title}</span>
        <button
          onClick={() => onDelete(entry.id)}
          disabled={deleting}
          className="ml-1 shrink-0 text-[var(--nv-text-muted)] opacity-0 transition-all hover:text-[var(--nv-danger)] group-hover:opacity-100 disabled:opacity-40"
          aria-label="删除条目"
        >
          <Icon name="x" size={12} />
        </button>
      </div>
      {entry.content && (
        <p className="mt-0.5 line-clamp-3 text-[10px] leading-relaxed text-[var(--nv-text-tertiary)]">
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
