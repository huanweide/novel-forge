"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import type { DimensionResult } from "@/core/dissect/types";
import { DIMENSION_LABELS, DIMENSION_ICONS } from "@/core/dissect/types";

interface DissectDimensionsProps {
  dimensions: Record<string, DimensionResult>;
  chapterList?: Array<{ index: number; title: string; summary?: string }>;
  onConvertToProject?: () => void;
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
  const [activeTab, setActiveTab] = useState(entries[0]?.[0] || "");
  const [showChapters, setShowChapters] = useState(false);

  if (entries.length === 0) {
    return (
      <div className="text-center py-12 text-zinc-500">
        <div className="text-4xl mb-3">📭</div>
        <p>尚无维度数据</p>
      </div>
    );
  }

  const active = dimensions[activeTab];

  return (
    <div className="flex flex-col h-full">
      {/* 维度标签栏 */}
      <div className="flex gap-1 overflow-x-auto pb-2 border-b border-zinc-800">
        {entries.map(([key, dim]) => (
          <button
            key={key}
            onClick={() => {
              setActiveTab(key);
              setShowChapters(false);
            }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
              activeTab === key && !showChapters
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <span>{DIMENSION_ICONS[key as keyof typeof DIMENSION_ICONS]}</span>
            <span>{dim.label}</span>
          </button>
        ))}

        {/* 章节摘要标签 */}
        {chapterList && chapterList.length > 0 && (
          <button
            onClick={() => setShowChapters(true)}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-colors ${
              showChapters
                ? "bg-indigo-600 text-white"
                : "text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <span>📑</span>
            <span>章节列表 ({chapterList.length})</span>
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto mt-3">
        {showChapters && chapterList ? (
          <div className="space-y-2">
            {chapterList.map((ch) => (
              <div
                key={ch.index}
                className="p-3 bg-zinc-900 border border-zinc-800 rounded-lg"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-zinc-500">#{ch.index}</span>
                  <span className="text-sm font-medium text-zinc-200">
                    {ch.title}
                  </span>
                </div>
                {ch.summary && (
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {ch.summary}
                  </p>
                )}
              </div>
            ))}
          </div>
        ) : active ? (
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown>{active.content || "（无内容）"}</ReactMarkdown>
          </div>
        ) : null}
      </div>

      {/* 转为项目按钮 */}
      {onConvertToProject && (
        <div className="pt-3 border-t border-zinc-800 mt-3">
          {convertedToProjectId ? (
            <a
              href={`/workspace/${convertedToProjectId}`}
              className="block w-full py-2.5 rounded-lg bg-green-600 text-white text-sm font-medium text-center hover:bg-green-500 transition-colors"
            >
              ✅ 已转为项目，点击进入工作区
            </a>
          ) : (
            <button
              onClick={onConvertToProject}
              disabled={converting}
              className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors ${
                converting
                  ? "bg-zinc-800 text-zinc-500 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-500"
              }`}
            >
              {converting ? "⏳ 转换中..." : "📦 转为 Novel Forge 项目"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
