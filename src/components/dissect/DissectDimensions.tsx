"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { DimensionResult } from "@/core/dissect/types";
import { DIMENSION_LABELS, DIMENSION_ICONS } from "@/core/dissect/types";
import { Icon, type IconName } from "@/components/ui/icons";
import type { CharacterRole } from "@/core/types";
import { CHARACTER_ROLE_LABEL } from "@/lib/character-parse";

// ─── 维度分组 ──────────────────────────────────────────

interface DimensionGroup {
  id: string;
  label: string;
  icon: IconName;
  dims: string[];
}

const DIMENSION_GROUPS_UI: DimensionGroup[] = [
  {
    id: "overview",
    label: "总览",
    icon: "clipboard",
    dims: ["basic_info", "story_core"],
  },
  {
    id: "world",
    label: "世界设定",
    icon: "globe",
    dims: ["worldview", "map", "factions", "special_settings"],
  },
  {
    id: "power",
    label: "力量体系",
    icon: "zap",
    dims: ["power_system", "cultivation", "currency"],
  },
  {
    id: "characters_plot",
    label: "角色与剧情",
    icon: "users",
    dims: ["characters", "plot_thread", "outline_summary", "foreshadowing"],
  },
  {
    id: "items_style",
    label: "物品与风格",
    icon: "backpack",
    dims: ["items", "style_analysis"],
  },
];

interface DissectDimensionsProps {
  dimensions: Record<string, DimensionResult>;
  chapterList?: Array<{ index: number; title: string; summary?: string }>;
  onConvertToProject?: (modifications?: string) => void;
  convertedToProjectId?: string;
  converting?: boolean;
}

export function DissectDimensions({
  dimensions,
  chapterList,
  onConvertToProject,
  convertedToProjectId,
  converting,
}: DissectDimensionsProps) {
  const entries = Object.entries(dimensions).filter(
    ([, v]) => v?.status === "completed",
  );
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    Object.fromEntries(DIMENSION_GROUPS_UI.map((g) => [g.id, true])),
  );
  const [expandedDims, setExpandedDims] = useState<Record<string, boolean>>({});

  // 统计数据用于导入预览
  const charContent = dimensions.characters?.content || "";
  const charPreview = parseCharPreviewDetailed(charContent);
  const loreCount = Object.entries(dimensions).filter(
    ([k, v]) =>
      k !== "characters" &&
      k !== "style_analysis" &&
      k !== "basic_info" &&
      v?.status === "completed" &&
      v?.content &&
      v.content.length >= 15,
  ).length;
  const hasStyle = dimensions.style_analysis?.content && dimensions.style_analysis.content.length > 20;

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--nv-text-muted)]">
        <div className="text-4xl mb-3 text-[var(--nv-text-tertiary)]"><Icon name="inbox" size={32} /></div>
        <p>尚无维度数据</p>
      </div>
    );
  }

  const toggleGroup = (gid: string) => {
    setExpandedGroups((prev) => ({ ...prev, [gid]: !prev[gid] }));
  };

  const toggleDim = (key: string) => {
    setExpandedDims((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // 判断某个维度是否有内容
  const hasContent = (key: string) => {
    const d = dimensions[key];
    return d && d.status === "completed" && d.content && d.content.length > 10;
  };

  return (
    <div className="space-y-4">
      {/* ── 导入预设总览卡片 ── */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {/* 角色卡片——迷你角色卡格式，匹配工作区CharacterList */}
        <div className={`p-4 rounded-xl border ${charPreview.length > 0 ? "bg-[var(--nv-primary)]/5 border-[var(--nv-primary)]/30" : "bg-[var(--nv-surface-2)] backdrop-blur-sm border-[var(--nv-border-2)]"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl"><Icon name="users" size={15} className="inline-block align-text-bottom shrink-0" /></span>
            <span className="text-sm font-semibold text-[var(--nv-text-secondary)]">角色</span>
            {charPreview.length > 0 && (
              <span className="text-xs bg-[var(--nv-primary)]/30 text-[var(--nv-primary)] px-1.5 py-0.5 rounded-full">{charPreview.length}个</span>
            )}
          </div>
          {charPreview.length > 0 ? (
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {charPreview.slice(0, 8).map((c, i) => (
                <div key={i} className="flex items-center gap-2 py-0.5 px-1.5 rounded text-[11px] bg-[var(--nv-surface-3)]/50 hover:bg-[var(--nv-surface-2)]">
                  <span className="w-4 h-4 rounded-full bg-[var(--nv-primary)]/50 flex items-center justify-center text-[9px] shrink-0">
                    {c.name[0]}
                  </span>
                  <span className="font-medium text-[var(--nv-text-secondary)] truncate">{c.name}</span>
                  <span className={`text-[9px] px-1 py-0 rounded-full shrink-0 ${
                    c.role === "protagonist" ? "bg-warning/30 text-warning" :
                    c.role === "antagonist" ? "bg-danger/30 text-danger" :
                    c.role === "mentor" ? "bg-info/30 text-info" :
                    "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)]"
                  }`}>
                    {c.role === "protagonist" ? "★主角" : c.role === "antagonist" ? "◆反派" : c.role === "mentor" ? "◈导师" : `●${CHARACTER_ROLE_LABEL[c.role as CharacterRole] ?? "配角"}`}
                  </span>
                  {c.description && (
                    <span className="text-[9px] text-[var(--nv-text-muted)] truncate hidden md:inline">{c.description.slice(0, 30)}</span>
                  )}
                </div>
              ))}
              {charPreview.length > 8 && (
                <p className="text-[10px] text-[var(--nv-text-muted)] px-1.5">+{charPreview.length - 8}个角色...</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--nv-text-muted)]">未能提取到角色，将从其他维度兜底扫描</p>
          )}
        </div>

        {/* 世界书卡片 */}
        <div className={`p-4 rounded-xl border ${loreCount > 0 ? "bg-success/5 border-success/30" : "bg-[var(--nv-surface-2)] backdrop-blur-sm border-[var(--nv-border-2)]"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl"><Icon name="book" size={15} className="inline-block align-text-bottom shrink-0" /></span>
            <span className="text-sm font-semibold text-[var(--nv-text-secondary)]">世界书词条</span>
            {loreCount > 0 && (
              <span className="text-xs bg-success/30 text-success px-1.5 py-0.5 rounded-full">{loreCount}条</span>
            )}
          </div>
          {loreCount > 0 ? (
            <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto">
              {[
                { key: "worldview", label: "世界观" },
                { key: "story_core", label: "故事核心" },
                { key: "factions", label: "势力阵营" },
                { key: "power_system", label: "力量体系" },
                { key: "cultivation", label: "功法体系" },
                { key: "map", label: "地理地图" },
                { key: "special_settings", label: "特殊设定" },
                { key: "currency", label: "货币体系" },
                { key: "items", label: "重要物品" },
                { key: "plot_thread", label: "情节脉络" },
                { key: "foreshadowing", label: "未收尾线索" },
                { key: "outline_summary", label: "大纲摘要" },
              ]
                .filter((d) => {
                  const content = dimensions[d.key]?.content;
                  return content && content.length >= 15;
                })
                .map((d) => (
                  <span key={d.key} className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">
                    {d.label}
                  </span>
                ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--nv-text-muted)]">无足够维度数据</p>
          )}
        </div>

        {/* 文风卡片 */}
        <div className={`p-4 rounded-xl border ${hasStyle ? "bg-warning/5 border-warning/30" : "bg-[var(--nv-surface-2)] backdrop-blur-sm border-[var(--nv-border-2)]"}`}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl"><Icon name="pencil" size={15} className="inline-block align-text-bottom shrink-0" /></span>
            <span className="text-sm font-semibold text-[var(--nv-text-secondary)]">文笔风格</span>
            {hasStyle && (
              <span className="text-xs bg-warning/30 text-warning px-1.5 py-0.5 rounded-full">已提取</span>
            )}
          </div>
          {hasStyle ? (
            <p className="text-[10px] text-[var(--nv-text-muted)] leading-relaxed line-clamp-3">
              {dimensions.style_analysis?.content?.slice(0, 200)}
            </p>
          ) : (
            <p className="text-xs text-[var(--nv-text-muted)]">未提取到风格数据</p>
          )}
        </div>
      </div>

      {/* 分组卡片 */}
      {DIMENSION_GROUPS_UI.map((group) => {
        const groupDims = group.dims.filter(hasContent);
        if (groupDims.length === 0) return null;

        const isExpanded = expandedGroups[group.id];

        return (
          <div
            key={group.id}
            className="bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)] rounded-xl overflow-hidden"
          >
            {/* 组标题 */}
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[var(--nv-surface-3)]/50 transition-colors text-left"
            >
              <span className="text-lg"><Icon name={group.icon} size={16} className="inline-block align-text-bottom" /></span>
              <span className="text-sm font-semibold text-[var(--nv-text-secondary)]">{group.label}</span>
              <span className="text-xs text-[var(--nv-text-muted)] ml-2">{groupDims.length}项</span>
              <span className="ml-auto text-[var(--nv-text-muted)] text-xs">
                {isExpanded ? "收起 ▲" : "展开 ▼"}
              </span>
            </button>

            {/* 维度列表 */}
            {isExpanded && (
              <div className="px-4 pb-4 space-y-2">
                {groupDims.map((key) => {
                  const dim = dimensions[key];
                  if (!dim) return null;
                  const isDimExpanded = expandedDims[key] ?? false;
                  const contentPreview = dim.content?.slice(0, 300) || "";

                  return (
                    <div
                      key={key}
                      className="bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)]/50 rounded-lg overflow-hidden"
                    >
                      {/* 维度标题行 */}
                      <button
                        onClick={() => toggleDim(key)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-[var(--nv-surface-3)]/30 transition-colors text-left"
                      >
                        <span className="text-sm shrink-0">
                          {DIMENSION_ICONS[key as keyof typeof DIMENSION_ICONS]}
                        </span>
                        <span className="text-sm font-medium text-[var(--nv-text-secondary)]">
                          {DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS]}
                        </span>
                        <span className="text-xs text-[var(--nv-text-muted)] ml-auto">
                          {dim.content ? `${dim.content.length}字` : "空"}
                        </span>
                      </button>

                      {/* 内容——始终显示前300字预览，展开后全量 */}
                      <div className="px-4 pb-3">
                        <div className="prose prose-invert prose-sm max-w-none text-[var(--nv-text-tertiary)] leading-relaxed">
                          {dim.content ? (
                            isDimExpanded ? (
                              <ReactMarkdown>{dim.content}</ReactMarkdown>
                            ) : (
                              <>
                                <ReactMarkdown>{contentPreview}</ReactMarkdown>
                                {dim.content.length > 300 && (
                                  <button
                                    onClick={() => toggleDim(key)}
                                    className="text-[var(--nv-primary)] text-xs hover:text-[var(--nv-primary)] mt-1"
                                  >
                                    展开全部（{dim.content.length}字）→
                                  </button>
                                )}
                              </>
                            )
                          ) : (
                            <span className="text-[var(--nv-text-muted)] italic">暂无内容</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* 章节列表（如果有摘要） */}
      {chapterList && chapterList.length > 0 && chapterList.some((c) => c.summary) && (
        <div className="bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)] rounded-xl overflow-hidden">
          <button
            onClick={() => toggleGroup("chapters")}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-[var(--nv-surface-3)]/50 transition-colors text-left"
          >
            <span className="text-lg"><Icon name="file" size={15} className="inline-block align-text-bottom shrink-0" /></span>
            <span className="text-sm font-semibold text-[var(--nv-text-secondary)]">章节摘要</span>
            <span className="text-xs text-[var(--nv-text-muted)] ml-2">{chapterList.filter((c) => c.summary).length}/{chapterList.length}章</span>
            <span className="ml-auto text-[var(--nv-text-muted)] text-xs">
              {expandedGroups.chapters !== false ? "收起 ▲" : "展开 ▼"}
            </span>
          </button>
          {expandedGroups.chapters !== false && (
            <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
              {chapterList
                .filter((c) => c.summary)
                .map((ch: any) => (
                  <div
                    key={ch.index}
                    className="p-3 bg-[var(--nv-surface-2)] backdrop-blur-sm border border-[var(--nv-border-2)]/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-[var(--nv-text-muted)] font-mono">#{ch.index}</span>
                      <span className="text-sm font-medium text-[var(--nv-text-secondary)] truncate">
                        {ch.title}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--nv-text-muted)] leading-relaxed">
                      {ch.summary}
                    </p>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* 底部操作区 */}
      {onConvertToProject && (
        <div className="pt-2">
          {convertedToProjectId ? (
            <a
              href={`/workspace/${convertedToProjectId}`}
              className="block w-full py-3 rounded-lg bg-success text-[var(--nv-text-primary)] text-sm font-medium text-center hover:bg-success transition-colors"
            >
              <Icon name="check" size={15} className="inline-block align-text-bottom shrink-0" /> 项目已创建，点击进入工作区 →
                                      </a>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onConvertToProject()}
                disabled={converting}
                className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                  converting
                    ? "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)] cursor-not-allowed"
                    : "bg-[var(--nv-primary)] text-[var(--nv-text-primary)] hover:bg-[var(--nv-primary)]"
                }`}
              >
                {converting ? (<><Icon name="loader" size={13} className="animate-spin" /> 转换中...</>) : (<><Icon name="package" size={13} className="inline-block align-text-bottom" /> 原样转为项目（100%还原）</>)}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** 从角色维度内容中提取结构化角色预览（匹配工作区CharacterCard字段） */
interface CharPreviewItem {
  name: string;
  role: string;
  description: string;
  abilities: string[];
}
function parseCharPreviewDetailed(charContent: string): CharPreviewItem[] {
  if (!charContent || charContent.length < 10) return [];
  const chars: CharPreviewItem[] = [];
  const lines = charContent.split("\n");

  const roleLabels: Record<string, string> = {
    "主角": "protagonist", "主人公": "protagonist", "男主": "protagonist", "女主": "protagonist",
    "反派": "antagonist", "敌人": "antagonist",
    "导师": "mentor", "师父": "mentor", "师傅": "mentor",
    "配角": "supporting", "主要配角": "supporting", "其他角色": "supporting",
  };

  // 逐行匹配角色名+角色描述
  for (const line of lines) {
    // 跳过标题行和字段标签行
    if (/^(#{1,3}\s*)?(角色|人物|主角|配角|反派|主要|其他|说明|以上|以下|注意|备注|一、|二、|三、)/.test(line.trim())) continue;

    // 匹配 "**名字** - 角色定位" 或 "名字：描述"
    let name = "";
    let rest = "";

    const boldMatch = line.match(/\*\*(.+?)\*\*\s*[-:：]\s*(.+)/);
    if (boldMatch) { name = boldMatch[1].trim(); rest = boldMatch[2].trim(); }

    if (!name) {
      const bulletMatch = line.match(/^[-*]\s+\*?\*?(.+?)\*?\*?\s*[-:：]?\s*(.*)/);
      if (bulletMatch && bulletMatch[1].length >= 2 && bulletMatch[1].length <= 10) {
        name = bulletMatch[1].trim(); rest = bulletMatch[2].trim();
      }
    }

    if (!name) {
      const looseMatch = line.match(/^([一-鿿]{2,4})\s*[-:：——]\s*(.+)/);
      if (looseMatch) { name = looseMatch[1].trim(); rest = looseMatch[2].trim(); }
    }

    // 过滤字段标签
    if (!name || name.length < 2 || name.length > 10) continue;
    if (/^(角色|人物|性别|年龄|外貌|性格|能力|背景|动机|别名|称号|说话风格|关键剧情|节点|关系|作用|头发|发型|发色|眼睛|身高|体型|特征|印记|着装|装备|功法|修为|境界|技能|武器|介绍)$/.test(name)) continue;
    if (/^[在背与性说别年外能动关一二三四五六七八九十]$/.test(name)) continue;

    // 猜测角色定位
    let role = "supporting";
    const combined = `${name} ${rest}`;
    for (const [label, r] of Object.entries(roleLabels)) {
      if (combined.includes(label)) { role = r; break; }
    }

    // 提取描述和能力
    const abilities: string[] = [];
    const abMatch = rest.match(/(?:能力|技能|功法|擅长)[：:]\s*(.+)/);
    if (abMatch) {
      abilities.push(...abMatch[1].split(/[,，、]/).map((s) => s.trim()).filter(Boolean).slice(0, 5));
    }

    chars.push({
      name,
      role,
      description: rest.slice(0, 80).replace(name, "").replace(/^[-:：\s]+/, ""),
      abilities,
    });

    if (chars.length >= 15) break;
  }

  return chars;
}
