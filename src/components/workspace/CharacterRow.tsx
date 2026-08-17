"use client";

import { memo } from "react";
import { Icon } from "@/components/ui/icons";
import { TagChip } from "./TagChip";
import type { CharacterData } from "./types";

function CharacterRowImpl({
  character,
  selected,
  deleting,
  onToggleSelect,
  onEdit,
  onDelete,
  onConfirm,
  tagFilter,
  onTagClick,
}: {
  character: CharacterData;
  selected: boolean;
  deleting: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string, name: string) => void;
  onConfirm?: (id: string) => void;
  tagFilter: string;
  onTagClick: (tag: string) => void;
}) {
  return (
    <div
      className={
        "flex items-center gap-2 py-1 px-2 rounded text-xs text-[var(--nv-text-secondary)] hover:shadow-[inset_2px_0_0_0_var(--nv-border-3)] transition-all duration-150 group " +
        (selected
          ? "bg-[var(--nv-accent)]/10 ring-1 ring-inset ring-[var(--nv-accent)]/30"
          : "hover:bg-[var(--nv-surface-2)]")
      }
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(character.id)}
        onClick={e => e.stopPropagation()}
        className="rounded accent-[var(--nv-accent)] shrink-0 h-3.5 w-3.5"
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => onEdit(character)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onEdit(character);
          }
        }}
        className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
      >
        <span className="w-5 h-5 rounded-full bg-[var(--nv-surface-2)] flex items-center justify-center text-[10px] shrink-0">
          {character.name[0]}
        </span>
        <div className="flex-1 min-w-0">
          <span className="truncate block hover:text-[var(--nv-text-primary)] transition-colors">{character.name}</span>
          {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝") && t !== "🗂 已合并").length > 0 && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝") && t !== "🗂 已合并").slice(0, 5).map((t: string) => (
                <TagChip
                  key={t}
                  label={t}
                  active={tagFilter === t}
                  size="xs"
                  onClick={() => onTagClick(t)}
                />
              ))}
              {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝") && t !== "🗂 已合并").length > 5 && (
                <span className="text-[9px] text-[var(--nv-text-tertiary)]">+{(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝") && t !== "🗂 已合并").length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>
      {character.reviewStatus === "pending" && (
        <span className="ml-1 shrink-0 rounded-full bg-[var(--nv-warning)]/20 px-1.5 py-0.5 text-[9px] text-[var(--nv-warning)]">待审</span>
      )}
      {character.reviewStatus === "pending" && onConfirm && (
        <button
          onClick={(e) => { e.stopPropagation(); onConfirm(character.id); }}
          disabled={deleting}
          className="ml-1 shrink-0 inline-flex items-center gap-0.5 rounded-full bg-[var(--nv-success)]/15 px-1.5 py-0.5 text-[9px] text-[var(--nv-success)] transition-colors hover:bg-[var(--nv-success)]/25 disabled:opacity-40"
          aria-label="确认并入"
          title="确认并入角色卡（审批后才会注入生成）"
        ><Icon name="check" size={11} className="align-middle" />确认</button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(character.id, character.name); }}
        disabled={deleting}
        aria-label="删除角色"
        title="删除角色"
        className="opacity-0 group-hover:opacity-100 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] transition-colors duration-150 shrink-0 disabled:opacity-40"
      ><Icon name="x" size={12} className="align-middle" />      </button>
    </div>
  );
}

export const CharacterRow = memo(CharacterRowImpl);
