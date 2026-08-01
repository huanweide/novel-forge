"use client";

import { Icon } from "@/components/ui/icons";
import type { CharacterData } from "./types";

export function CharacterRow({
  character,
  selected,
  deleting,
  onToggleSelect,
  onEdit,
  onDelete,
  tagFilter,
  onTagClick,
}: {
  character: CharacterData;
  selected: boolean;
  deleting: boolean;
  onToggleSelect: (id: string) => void;
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string, name: string) => void;
  tagFilter: string;
  onTagClick: (tag: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded text-xs text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] group">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggleSelect(character.id)}
        onClick={e => e.stopPropagation()}
        className="rounded accent-[var(--nv-accent)] shrink-0"
      />
      <div onClick={() => onEdit(character)} className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
        <span className="w-5 h-5 rounded-full bg-[var(--nv-surface-2)] flex items-center justify-center text-[10px] shrink-0">
          {character.name[0]}
        </span>
        <div className="flex-1 min-w-0">
          <span className="truncate block hover:text-[var(--nv-text-primary)]">{character.name}</span>
          {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 0 && (
            <div className="flex gap-0.5 mt-0.5 flex-wrap">
              {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).slice(0, 5).map((t: string) => (
                <button
                  key={t}
                  onClick={e => { e.stopPropagation(); onTagClick(t); }}
                  className={`text-[9px] px-1 py-0 rounded transition-colors ${
                    tagFilter === t ? "bg-[var(--nv-creative)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
                  }`}
                >{t}</button>
              ))}
              {(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 5 && (
                <span className="text-[9px] text-[var(--nv-text-tertiary)]">+{(character.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length - 5}</span>
              )}
            </div>
          )}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(character.id, character.name); }}
        disabled={deleting}
        className="opacity-0 group-hover:opacity-100 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] shrink-0 disabled:opacity-40"
      ><Icon name="x" size={12} className="align-middle" /></button>
    </div>
  );
}
