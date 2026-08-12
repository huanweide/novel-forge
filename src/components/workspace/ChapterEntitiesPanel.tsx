/**
 * ChapterEntitiesPanel — 右侧实体追踪面板
 *
 * 扫描当前章节正文，按类型分组显示已出现的实体。
 * 颜色与正文高亮一致，点实体名可打开编辑弹窗。
 */

"use client";

import React, { useEffect, useState, useMemo } from "react";
import { getEntityMap, findEntitiesInText, getCategoryColor, CHARACTER_COLOR, LORE_COLORS } from "@/core/entity-highlighter";
import { ALL_WORLD_CATEGORIES, WORLD_CATEGORY_SECTIONS, type WorldCategory } from "@/lib/world-category-classifier";
import { WORLD_MODULES } from "@/components/workspace/worldPanelData";
import { Icon, type IconName } from "@/components/ui/icons";
import type { EntityHighlight, EntityMatch } from "@/core/entity-highlighter";

// ═══════════════════════════════════════════
// 分组定义
// ═══════════════════════════════════════════

interface EntityGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  entities: EntityMatch[];
}

// 分类 → 图标：单一权威源，从 WORLD_MODULES 派生（F-03 修复：消灭手抄 9 组图标漂移）
const MODULE_ICON: Record<string, IconName> = Object.fromEntries(
  WORLD_MODULES.map((m) => [m.key, m.icon]),
) as Record<string, IconName>;

function buildGroups(matches: EntityMatch[]): EntityGroup[] {
  const groupDefs: Array<{ key: string; label: string; icon: React.ReactNode; color: string; match: (m: EntityMatch) => boolean }> = [
    { key: "character", label: "角色", icon: <Icon name="user" size={14} />, color: CHARACTER_COLOR, match: (m) => m.type === "character" },
    // 遍历权威源 ALL_WORLD_CATEGORIES 动态生成 15 组（F-03 修复：law/currency/custom/fate_system/
    // physics/public_system/character_relationship 共 7 类不再被「其他」桶吞掉；未来增删分类自动同步）
    ...ALL_WORLD_CATEGORIES.map((cat) => ({
      key: cat,
      label: WORLD_CATEGORY_SECTIONS[cat].label,
      icon: <Icon name={MODULE_ICON[cat] ?? "package"} size={14} />,
      color: LORE_COLORS[cat],
      match: (m: EntityMatch) => m.category === cat,
    })),
    // 异常兜底：仅当 lorebook 的 category 不在 15 类权威源内时才进「其他」，正常实体绝不丢失
    { key: "other", label: "其他", icon: <Icon name="package" size={14} />, color: LORE_COLORS.custom, match: (m) => m.type === "lorebook" && !ALL_WORLD_CATEGORIES.includes(m.category as WorldCategory) },
  ];

  const groups: EntityGroup[] = [];

  for (const def of groupDefs) {
    const entities = matches.filter((m) => def.match(m) && !groups.some((g) => g.entities.includes(m)));
    if (entities.length > 0) {
      // 去重——同名同类型只保留一次
      const seen = new Set<string>();
      const unique = entities.filter((e) => {
        const key = `${e.name}|${e.type}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      groups.push({ key: def.key, label: def.label, icon: def.icon, color: def.color, entities: unique });
    }
  }

  return groups;
}

// ═══════════════════════════════════════════
// Props
// ═══════════════════════════════════════════

interface ChapterEntitiesPanelProps {
  projectId: string;
  chapterContent: string | undefined;
  onEditCharacter?: (id: string) => void;
  onEditLore?: (id: string) => void;
  /** 全部角色（含 id），用于定位编辑目标 */
  allCharacters?: Array<{ id: string; name: string }>;
  /** 全部词条（含 id） */
  allLoreEntries?: Array<{ id: string; title: string }>;
}

// ═══════════════════════════════════════════
// 组件
// ═══════════════════════════════════════════

export function ChapterEntitiesPanel({
  projectId,
  chapterContent,
  onEditCharacter,
  onEditLore,
  allCharacters = [],
  allLoreEntries = [],
}: ChapterEntitiesPanelProps) {
  const [entityMap, setEntityMap] = useState<Map<string, EntityHighlight>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoading(true);
    getEntityMap(projectId).then((map) => {
      if (!cancelled) {
        setEntityMap(map);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [projectId]);

  // 扫描正文
  const matches = useMemo(() => {
    if (!chapterContent || entityMap.size === 0) return [];
    return findEntitiesInText(chapterContent, entityMap);
  }, [chapterContent, entityMap]);

  // 分组
  const groups = useMemo(() => buildGroups(matches), [matches]);

  // 折叠状态：实体数 > 5 的组默认折叠
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      for (const g of groups) {
        if (g.entities.length > 5 && !next.has(g.key)) next.add(g.key);
        if (g.entities.length <= 5 && next.has(g.key)) next.delete(g.key);
      }
      return next;
    });
  }, [groups]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // 查找角色 ID（用于编辑回调）
  const findCharId = (name: string) => allCharacters.find((c) => c.name === name)?.id;
  const findLoreId = (title: string) => allLoreEntries.find((l) => l.title === title)?.id;

  // ── 空状态 ──
  if (!chapterContent || chapterContent.trim().length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--nv-text-tertiary)] text-center">
        <p className="mb-1">暂无正文</p>
        <p>选择左侧大纲节点查看实体</p>
      </div>
    );
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="p-4 text-xs text-[var(--nv-text-muted)] text-center animate-pulse">
        加载实体数据...
      </div>
    );
  }

  // ── 无匹配 ──
  if (groups.length === 0) {
    return (
      <div className="p-4 text-xs text-[var(--nv-text-tertiary)] text-center">
        <p className="mb-1 flex items-center justify-center gap-1.5"><Icon name="inbox" size={14} className="text-[var(--nv-text-muted)]" /> 本章未匹配到已注册实体</p>
        <p>在左侧面板注册角色或词条后，正文中的名字会自动上色并出现在这里</p>
      </div>
    );
  }

  // ── 分组展示 ──
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-[var(--nv-text-secondary)] uppercase tracking-wider flex items-center gap-1.5"><Icon name="chart" size={12} /> 本章实体</h3>
        <span className="text-[10px] text-[var(--nv-text-tertiary)]">{matches.length} 次匹配</span>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="rounded-lg bg-[var(--nv-surface-1)] backdrop-blur-sm border border-[var(--nv-border-2)] overflow-hidden">
          {/* 分组头 */}
          <button
            onClick={() => toggleGroup(group.key)}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-[var(--nv-surface-2)] transition-colors"
          >
            <Icon name={collapsed.has(group.key) ? "arrowRight" : "arrowDown" as any} size={11} className="text-[var(--nv-text-tertiary)] w-3" />
            <span className="text-sm">{group.icon}</span>
            <span className="text-xs font-medium text-[var(--nv-text-secondary)]">{group.label}</span>
            <span className="text-[10px] text-[var(--nv-text-muted)] ml-auto">{group.entities.length}</span>
          </button>

          {/* 实体列表 */}
          {!collapsed.has(group.key) && (
          <div className="divide-y divide-[var(--nv-border-1)] border-t border-[var(--nv-border-2)]">
            {group.entities.map((entity) => {
              const charId = entity.type === "character" ? findCharId(entity.name) : undefined;
              const loreId = entity.type === "lorebook" ? findLoreId(entity.name) : undefined;

              return (
                <div
                  key={`${entity.name}-${entity.type}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-[var(--nv-surface-2)] transition-colors cursor-pointer group"
                  onClick={() => {
                    if (charId && onEditCharacter) onEditCharacter(charId);
                    else if (loreId && onEditLore) onEditLore(loreId);
                  }}
                  title={charId || loreId ? "点击编辑" : "未在数据库中找到——请先注册"}
                >
                  {/* 颜色圆点 */}
                  <span
                    className="inline-block w-2 h-2 rounded-full shrink-0"
                    style={{ backgroundColor: entity.color }}
                  />
                  {/* 实体名 */}
                  <span className="text-xs text-[var(--nv-text-secondary)] group-hover:text-[var(--nv-text-primary)] truncate">
                    {entity.name}
                  </span>
                  {/* 无 ID 标记 */}
                  {!charId && !loreId && (
                    <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-auto shrink-0">未注册</span>
                  )}
                  {charId && (
                    <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"><Icon name="pencil" size={11} /></span>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      ))}

      {/* 底部统计 */}
      <div className="text-[10px] text-[var(--nv-text-tertiary)] px-1 pt-1">
        已注册实体 {entityMap.size} 个 · 本章出现 {matches.length} 次
      </div>
    </div>
  );
}

export default ChapterEntitiesPanel;
