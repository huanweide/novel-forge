"use client";

import { EmptyState } from "@/components/ui/EmptyState";
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
  return (
    <div className="flex-1 space-y-1 overflow-y-auto p-2">
      {entries.length === 0 && (
        <EmptyState
          icon="book"
          title={`暂无${moduleLabel}设定`}
          hint='点击"+ 新建"或写完章节后自动提取'
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
  );
}
