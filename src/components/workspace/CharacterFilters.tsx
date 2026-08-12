"use client";

import { type ReactNode } from "react";
import { Icon, StatusDot } from "@/components/ui/icons";
import type { CharacterData } from "./types";
import { CHARACTER_ROLE_OPTIONS } from "@/lib/character-parse";

export function CharacterFilters({
  characters,
  search,
  onSearch,
  roleFilter,
  statusFilter,
  tagFilter,
  onRole,
  onStatus,
  onTag,
}: {
  characters: CharacterData[];
  search: string;
  onSearch: (v: string) => void;
  roleFilter: string;
  statusFilter: string;
  tagFilter: string;
  onRole: (v: string) => void;
  onStatus: (v: string) => void;
  onTag: (v: string) => void;
}) {
  // 从所有角色标签中提取唯一值（过滤掉系统标签如 📥📝）
  const allTags = [...new Set(characters.flatMap(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝"))))].sort();

  const statRole = (r: string) => characters.filter(c => c.role === r).length;
  const statHasTags = characters.filter(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length > 0).length;
  const statNoTags = characters.filter(c => (c.tags || []).filter(t => !t.startsWith("📥") && !t.startsWith("📝")).length === 0).length;
  const statDead = characters.filter(c => ["dead", "missing", "presumed_dead"].includes(c.currentStatus)).length;

  return (
    <>
      {/* 搜索 */}
      <div className="mb-1.5">
        <input
          type="text"
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="搜索角色…"
          className="w-full bg-[var(--nv-surface-1)] border border-[var(--nv-border-2)] rounded px-2 py-1 text-xs text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] focus:outline-none focus:border-[var(--nv-primary)]"
        />
      </div>

      {/* 筛选栏：角色定位 + 状态 */}
      <div className="flex gap-0.5 mb-1 flex-wrap items-center">
        {([
          { key: "all", label: "全部", count: characters.length },
          ...CHARACTER_ROLE_OPTIONS.map((o) => ({ key: o.value, label: o.label, count: statRole(o.value) })),
        ] as { key: string; label: ReactNode; count: number }[]).filter(o => o.count > 0 || o.key === "all").map(o => (
          <button
            key={o.key}
            onClick={() => { onRole(roleFilter === o.key ? "all" : o.key); onTag("all"); }}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              roleFilter === o.key ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        <span className="text-[var(--nv-border-3)] mx-0.5">|</span>
        {([
          { key: "alive", label: <span className="flex items-center gap-1"><StatusDot color="green" size={6} /> 存活</span>, count: characters.length - statDead },
          { key: "dead", label: <span className="flex items-center gap-1"><Icon name="skull" size={10} /> 离场</span>, count: statDead },
        ] as { key: string; label: ReactNode; count: number }[]).filter(o => o.count > 0).map(o => (
          <button
            key={o.key}
            onClick={() => { onStatus(statusFilter === o.key ? "all" : o.key); }}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              statusFilter === o.key ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        {(roleFilter !== "all" || tagFilter !== "all" || statusFilter !== "all") && (
          <button
            onClick={() => { onRole("all"); onTag("all"); onStatus("all"); }}
            className="text-[10px] px-1.5 py-0.5 rounded-full text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-1)]"
          >
            <Icon name="x" size={11} />
          </button>
        )}
      </div>

      {/* 标签筛选：已分类/未分类 + 具体标签 */}
      <div className="flex gap-0.5 mb-1.5 flex-wrap items-center">
        {([
          { key: "has-tags", label: <span className="flex items-center gap-1"><Icon name="tag" size={10} /> 已分类</span>, count: statHasTags },
          { key: "no-tags", label: "未分类", count: statNoTags },
        ] as { key: string; label: ReactNode; count: number }[]).filter(o => o.count > 0).map(o => (
          <button
            key={o.key}
            onClick={() => onTag(tagFilter === o.key ? "all" : o.key)}
            className={`text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${
              tagFilter === o.key
                ? "bg-[var(--nv-accent)] text-[var(--nv-text-primary)]"
                : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            {o.label}<span className="ml-0.5 opacity-60">{o.count}</span>
          </button>
        ))}
        {allTags.length > 0 && <span className="text-[var(--nv-border-3)] mx-0.5">·</span>}
        {allTags.slice(0, 12).map(t => (
          <button
            key={t}
            onClick={() => onTag(tagFilter === t ? "all" : t)}
            className={`text-[9px] px-1 py-0 rounded transition-colors ${
              tagFilter === t
                ? "bg-[var(--nv-creative)] text-[var(--nv-text-primary)]"
                : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            {t}
          </button>
        ))}
        {allTags.length > 12 && (
          <span className="text-[9px] text-[var(--nv-text-tertiary)]">+{allTags.length - 12}</span>
        )}
      </div>
    </>
  );
}
