"use client";

import { useState } from "react";
import { EmptyState } from "@/components/ui/States";
import type { LorebookData } from "./types";
import { WorldEntryCard } from "./WorldEntryCard";

interface WorldEntryListProps {
  entries: LorebookData[];
  moduleLabel: string | undefined;
  depthLabels: Record<number, string>;
  onDelete: (id: string) => void;
  deletingId: string | null;
}

export function WorldEntryList({ entries, moduleLabel, depthLabels, onDelete, deletingId }: WorldEntryListProps) {
  const [view, setView] = useState<"list" | "grid">("list");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 列表 / 网格 切换（对齐竞品卡片仪表板视图） */}
      <div className="flex items-center justify-between px-2 pt-1.5">
        <span className="text-[11px] text-[var(--nv-text-tertiary)]">{entries.length} 条</span>
        <div className="flex items-center gap-1 rounded-lg border border-[var(--nv-border-2)] p-0.5">
          <button onClick={() => setView("list")}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${view === "list" ? "bg-[var(--nv-surface-2)] text-[var(--nv-text-primary)]" : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)]"}`}>
            列表
          </button>
          <button onClick={() => setView("grid")}
            className={`rounded px-2 py-0.5 text-[11px] transition-colors ${view === "grid" ? "bg-[var(--nv-surface-2)] text-[var(--nv-text-primary)]" : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)]"}`}>
            网格
          </button>
        </div>
      </div>
      <div className={view === "grid" ? "flex-1 grid grid-cols-1 min-[360px]:grid-cols-2 gap-2 overflow-y-auto p-2" : "flex-1 space-y-1 overflow-y-auto p-2"}>
        {entries.length === 0 && (
          <EmptyState
            icon="book"
            title={`暂无${moduleLabel}设定`}
            description='点击"+ 新建"或写完章节后自动提取'
          />
        )}
        {entries.map((entry) => (
          <WorldEntryCard
            key={entry.id}
            entry={entry}
            depthLabels={depthLabels}
            onDelete={onDelete}
            deleting={deletingId === entry.id}
          />
        ))}
      </div>
    </div>
  );
}
