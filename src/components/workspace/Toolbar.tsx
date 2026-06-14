"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StyleSelector } from "@/components/editor/StyleSelector";
import type { StyleTemplate } from "@/core/templates";
import type { ProjectData } from "./types";

export function Toolbar({
  projectName, onBack, onGenerateOutline, onSummarize, onImportSettings, onImportChapters,
  onEditStyle, onExport, isGenerating, outlineGenerating, summarizing,
  projectId, styleTemplateId, onStyleSelect, styleCard,
}: {
  projectName: string; onBack: () => void; onGenerateOutline: () => void;
  onSummarize: () => void; onImportSettings: () => void; onImportChapters: () => void;
  onEditStyle: () => void; onExport: (format: "markdown" | "txt") => void;
  isGenerating: boolean; outlineGenerating?: boolean; summarizing: boolean;
  projectId: string; styleTemplateId?: string; onStyleSelect: (t: StyleTemplate) => void;
  styleCard?: ProjectData["styleCard"];
}) {
  const [showExport, setShowExport] = useState(false);

  const povLabel = (p?: string) => {
    if (!p) return "";
    if (p === "first_person") return "第一人称";
    if (p === "third_person_limited") return "第三人称限制";
    if (p === "third_person_omniscient") return "第三人称全知";
    return p;
  };

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0 relative">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 text-sm shrink-0">← 返回</button>
        <span className="text-zinc-700 shrink-0">|</span>
        <span className="font-medium text-sm truncate">{projectName}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {styleCard?.styleDescription && (
          <button onClick={onEditStyle} disabled={isGenerating}
            className="flex items-center gap-1.5 text-xs border border-amber-700/50 rounded px-2 py-1 bg-amber-950/20 hover:bg-amber-950/40 transition-colors shrink-0"
            title={`${styleCard.styleDescription}\n${povLabel(styleCard.povType)} · 对话${((styleCard.dialogueRatio||0)*100).toFixed(0)}% · 描写${((styleCard.descriptionRatio||0)*100).toFixed(0)}%`}>
            <span>🎨</span>
            <span className="text-amber-300 max-w-[80px] truncate">{styleCard.styleDescription}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 whitespace-nowrap">{povLabel(styleCard.povType)}</span>
          </button>
        )}
        {!styleCard?.styleDescription && (
          <Button size="sm" variant="outline" onClick={onEditStyle} disabled={isGenerating}
            className="text-xs border-zinc-700 h-7" title="文风卡（未设定）">🎨 文风</Button>
        )}
        <span className="text-zinc-800 mx-0.5">|</span>
        <StyleSelector projectId={projectId} currentStyleId={styleTemplateId} onSelect={onStyleSelect} />
        <button onClick={onGenerateOutline} disabled={isGenerating || outlineGenerating}
          className="text-xs border border-zinc-700 rounded px-2.5 h-7 text-zinc-300 hover:bg-zinc-700/80 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
          {outlineGenerating ? "⏳" : "🤖"} 大纲
        </button>
        <Button size="sm" variant="outline" onClick={onSummarize} disabled={isGenerating || summarizing}
          className="text-xs border-zinc-700 h-7">{summarizing ? "⏳" : "📦"} 摘要</Button>
        <Button size="sm" variant="outline" onClick={onImportSettings} disabled={isGenerating}
          className="text-xs border-indigo-700 text-indigo-400 hover:text-indigo-300 h-7">📋 设定</Button>
        <Button size="sm" variant="outline" onClick={onImportChapters} disabled={isGenerating}
          className="text-xs border-purple-700 text-purple-400 hover:text-purple-300 h-7">📥 导入</Button>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setShowExport(!showExport)}
            disabled={isGenerating} className="text-xs border-zinc-700 h-7">📤 导出</Button>
          {showExport && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden w-36">
                <button onClick={() => { onExport("markdown"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors">📝 Markdown (.md)</button>
                <button onClick={() => { onExport("txt"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors">📄 纯文本 (.txt)</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
