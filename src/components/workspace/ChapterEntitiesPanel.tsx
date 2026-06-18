/**
 * ChapterEntitiesPanel — 右侧实体追踪面板
 *
 * 扫描当前章节正文，按类型分组显示已出现的实体。
 * 颜色与正文高亮一致，点实体名可打开编辑弹窗。
 */

"use client";

import React, { useEffect, useState, useMemo } from "react";
import { getEntityMap, findEntitiesInText, getCategoryColor } from "@/core/entity-highlighter";
import { Icon } from "@/components/ui/icons";
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

function buildGroups(matches: EntityMatch[]): EntityGroup[] {
  const groupDefs: Array<{ key: string; label: string; icon: React.ReactNode; color: string; match: (m: EntityMatch) => boolean }> = [
    { key: "character", label: "角色", icon: <Icon name="user" size={14} />, color: "#5B9BD5", match: (m) => m.type === "character" },
    { key: "faction",   label: "势力", icon: <Icon name="building" size={14} />, color: "#70AD47", match: (m) => m.category === "faction" },
    { key: "item",      label: "物品", icon: <Icon name="gem" size={14} />, color: "#D4A017", match: (m) => m.category === "item" },
    { key: "geography", label: "地点", icon: <Icon name="map" size={14} />, color: "#C55A11", match: (m) => m.category === "geography" },
    { key: "magic",     label: "世界观", icon: <Icon name="globe" size={14} />, color: "#9B59B6", match: (m) => m.category === "magic_system" },
    { key: "technique", label: "功法", icon: <Icon name="sparkles" size={14} />, color: "#D64545", match: (m) => m.category === "technique" },
    { key: "creature",  label: "生物", icon: <Icon name="sparkles" size={14} className="text-violet-400" />, color: "#C77D9F", match: (m) => m.category === "creature" },
    { key: "culture",   label: "文化", icon: <Icon name="palette" size={14} />, color: "#5DA89B", match: (m) => m.category === "culture" },
    { key: "history",   label: "历史", icon: <Icon name="scroll" size={14} />, color: "#7B8CC4", match: (m) => m.category === "history" },
    { key: "other",     label: "其他", icon: <Icon name="package" size={14} />, color: "#8B8B8B", match: () => true },
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
      <div className="p-4 text-xs text-zinc-500 text-center">
        <p className="mb-1">暂无正文</p>
        <p>选择左侧大纲节点查看实体</p>
      </div>
    );
  }

  // ── 加载中 ──
  if (loading) {
    return (
      <div className="p-4 text-xs text-zinc-500 text-center animate-pulse">
        加载实体数据...
      </div>
    );
  }

  // ── 无匹配 ──
  if (groups.length === 0) {
    return (
      <div className="p-4 text-xs text-zinc-500 text-center">
        <p className="mb-1 flex items-center justify-center gap-1.5"><Icon name="inbox" size={14} className="text-zinc-600" /> 本章未匹配到已注册实体</p>
        <p>在左侧面板注册角色或词条后，正文中的名字会自动上色并出现在这里</p>
      </div>
    );
  }

  // ── 分组展示 ──
  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5"><Icon name="chart" size={12} /> 本章实体</h3>
        <span className="text-[10px] text-zinc-600">{matches.length} 次匹配</span>
      </div>

      {groups.map((group) => (
        <div key={group.key} className="rounded-lg bg-white/[0.02] backdrop-blur-sm border border-white/[0.06]/60 overflow-hidden">
          {/* 分组头 */}
          <button
            onClick={() => toggleGroup(group.key)}
            className="flex items-center gap-2 px-3 py-2 w-full text-left hover:bg-zinc-800/30 transition-colors"
          >
            <span className="text-[10px] text-zinc-600 w-3">{collapsed.has(group.key) ? "▶" : "▼"}</span>
            <span className="text-sm">{group.icon}</span>
            <span className="text-xs font-medium text-zinc-300">{group.label}</span>
            <span className="text-[10px] text-zinc-600 ml-auto">{group.entities.length}</span>
          </button>

          {/* 实体列表 */}
          {!collapsed.has(group.key) && (
          <div className="divide-y divide-zinc-800/30 border-t border-white/[0.06]/40">
            {group.entities.map((entity) => {
              const charId = entity.type === "character" ? findCharId(entity.name) : undefined;
              const loreId = entity.type === "lorebook" ? findLoreId(entity.name) : undefined;

              return (
                <div
                  key={`${entity.name}-${entity.type}`}
                  className="flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-800/40 transition-colors cursor-pointer group"
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
                  <span className="text-xs text-zinc-300 group-hover:text-zinc-100 truncate">
                    {entity.name}
                  </span>
                  {/* 无 ID 标记 */}
                  {!charId && !loreId && (
                    <span className="text-[10px] text-zinc-600 ml-auto shrink-0">未注册</span>
                  )}
                  {charId && (
                    <span className="text-[10px] text-zinc-600 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
      ))}

      {/* 底部统计 */}
      <div className="text-[10px] text-zinc-600 px-1 pt-1">
        已注册实体 {entityMap.size} 个 · 本章出现 {matches.length} 次
      </div>
    </div>
  );
}

export default ChapterEntitiesPanel;
