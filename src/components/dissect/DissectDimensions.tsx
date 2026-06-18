"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { DimensionResult } from "@/core/dissect/types";
import { DIMENSION_LABELS, DIMENSION_ICONS } from "@/core/dissect/types";

// ─── 维度分组 ──────────────────────────────────────────

interface DimensionGroup {
  id: string;
  label: string;
  icon: string;
  dims: string[];
}

const DIMENSION_GROUPS_UI: DimensionGroup[] = [
  {
    id: "overview",
    label: "总览",
    icon: "📋",
    dims: ["basic_info", "story_core"],
  },
  {
    id: "world",
    label: "世界设定",
    icon: "🌍",
    dims: ["worldview", "map", "factions", "special_settings"],
  },
  {
    id: "power",
    label: "力量体系",
    icon: "⚡",
    dims: ["power_system", "cultivation", "currency"],
  },
  {
    id: "characters_plot",
    label: "角色与剧情",
    icon: "👥",
    dims: ["characters", "plot_thread", "outline_summary", "foreshadowing"],
  },
  {
    id: "items_style",
    label: "物品与风格",
    icon: "🎒",
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

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <div className="text-4xl mb-3">📭</div>
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
      {/* 分组卡片 */}
      {DIMENSION_GROUPS_UI.map((group) => {
        const groupDims = group.dims.filter(hasContent);
        if (groupDims.length === 0) return null;

        const isExpanded = expandedGroups[group.id];

        return (
          <div
            key={group.id}
            className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden"
          >
            {/* 组标题 */}
            <button
              onClick={() => toggleGroup(group.id)}
              className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
            >
              <span className="text-lg">{group.icon}</span>
              <span className="text-sm font-semibold text-zinc-200">{group.label}</span>
              <span className="text-xs text-zinc-600 ml-2">{groupDims.length}项</span>
              <span className="ml-auto text-zinc-600 text-xs">
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
                      className="bg-zinc-900 border border-zinc-800/50 rounded-lg overflow-hidden"
                    >
                      {/* 维度标题行 */}
                      <button
                        onClick={() => toggleDim(key)}
                        className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-zinc-800/30 transition-colors text-left"
                      >
                        <span className="text-sm shrink-0">
                          {DIMENSION_ICONS[key as keyof typeof DIMENSION_ICONS]}
                        </span>
                        <span className="text-sm font-medium text-zinc-300">
                          {DIMENSION_LABELS[key as keyof typeof DIMENSION_LABELS]}
                        </span>
                        <span className="text-xs text-zinc-600 ml-auto">
                          {dim.content ? `${dim.content.length}字` : "空"}
                        </span>
                      </button>

                      {/* 内容——始终显示前300字预览，展开后全量 */}
                      <div className="px-4 pb-3">
                        <div className="prose prose-invert prose-sm max-w-none text-zinc-400 leading-relaxed">
                          {dim.content ? (
                            isDimExpanded ? (
                              <ReactMarkdown>{dim.content}</ReactMarkdown>
                            ) : (
                              <>
                                <ReactMarkdown>{contentPreview}</ReactMarkdown>
                                {dim.content.length > 300 && (
                                  <button
                                    onClick={() => toggleDim(key)}
                                    className="text-indigo-400 text-xs hover:text-indigo-300 mt-1"
                                  >
                                    展开全部（{dim.content.length}字）→
                                  </button>
                                )}
                              </>
                            )
                          ) : (
                            <span className="text-zinc-600 italic">暂无内容</span>
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
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
          <button
            onClick={() => toggleGroup("chapters")}
            className="w-full flex items-center gap-2 px-4 py-3 hover:bg-zinc-800/50 transition-colors text-left"
          >
            <span className="text-lg">📑</span>
            <span className="text-sm font-semibold text-zinc-200">章节摘要</span>
            <span className="text-xs text-zinc-600 ml-2">{chapterList.filter((c) => c.summary).length}/{chapterList.length}章</span>
            <span className="ml-auto text-zinc-600 text-xs">
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
                    className="p-3 bg-zinc-900 border border-zinc-800/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs text-zinc-600 font-mono">#{ch.index}</span>
                      <span className="text-sm font-medium text-zinc-300 truncate">
                        {ch.title}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 leading-relaxed">
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
              className="block w-full py-3 rounded-lg bg-green-600 text-white text-sm font-medium text-center hover:bg-green-500 transition-colors"
            >
              ✅ 项目已创建，点击进入工作区 →
            </a>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={() => onConvertToProject()}
                disabled={converting}
                className={`flex-1 py-3 rounded-lg text-sm font-medium transition-colors ${
                  converting
                    ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                    : "bg-indigo-600 text-white hover:bg-indigo-500"
                }`}
              >
                {converting ? "⏳ 转换中..." : "📦 原样转为项目（100%还原）"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
