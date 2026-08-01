"use client";

import type { CharacterData } from "./types";
import { CharacterRow } from "./CharacterRow";

export function CharacterGroupList({
  grouped,
  roleOrder,
  roleLabel,
  selectedIds,
  deletingId,
  tagFilter,
  onToggleSelect,
  onEdit,
  onDelete,
  onTagClick,
}: {
  grouped: Record<string, CharacterData[]>;
  roleOrder: string[];
  roleLabel: Record<string, string>;
  selectedIds: Set<string>;
  deletingId: string | null;
  tagFilter: string;
  onToggleSelect: (id: string) => void;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string, name: string) => void;
  onTagClick: (tag: string) => void;
}) {
  return (
    <>
      {/* 角色列表——按 role 分组 */}
      {roleOrder.map(role => {
        const items = grouped[role];
        if (!items || items.length === 0) return null;
        return (
          <div key={role} className="mb-2">
            <div className="text-[10px] text-[var(--nv-text-tertiary)] px-2 mb-0.5 font-medium uppercase tracking-wider">
              {roleLabel[role] || role} ({items.length})
            </div>
            {items.map(c => (
              <CharacterRow
                key={c.id}
                character={c}
                selected={selectedIds.has(c.id)}
                deleting={deletingId === c.id}
                onToggleSelect={onToggleSelect}
                onEdit={onEdit}
                onDelete={onDelete}
                tagFilter={tagFilter}
                onTagClick={onTagClick}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}
