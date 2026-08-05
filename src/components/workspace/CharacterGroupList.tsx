"use client";

import type { CharacterData } from "./types";
import { CharacterRow } from "./CharacterRow";
import { Collapse } from "@/components/ui/collapse";

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
          <Collapse key={role} title={`${roleLabel[role] || role} (${items.length})`} size="sm">
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
          </Collapse>
        );
      })}
    </>
  );
}
