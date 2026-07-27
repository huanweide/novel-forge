"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
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
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onBack} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--nv-text-tertiary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--nv-text-primary)]" aria-label="返回">
          <Icon name="arrowLeft" size={16} />
        </button>
        <span className="shrink-0 text-[var(--nv-border-3)]">|</span>
        <span className="truncate text-sm font-medium">{projectName}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {styleCard?.styleDescription && (
          <button onClick={onEditStyle} disabled={isGenerating}
            className="flex shrink-0 items-center gap-1.5 rounded border border-[var(--nv-accent)]/40 bg-[var(--nv-accent-soft)] px-2 py-1 text-xs text-[var(--nv-accent)] transition-colors hover:bg-[var(--nv-accent-soft)] disabled:opacity-50"
            title={`${styleCard.styleDescription}\n${povLabel(styleCard.povType)} · 对话${((styleCard.dialogueRatio||0)*100).toFixed(0)}% · 描写${((styleCard.descriptionRatio||0)*100).toFixed(0)}%`}>
            <Icon name="palette" size={13} />
            <span className="max-w-[80px] truncate">{styleCard.styleDescription}</span>
            <span className="text-[var(--nv-text-tertiary)]">·</span>
            <span className="whitespace-nowrap text-[var(--nv-text-secondary)]">{povLabel(styleCard.povType)}</span>
          </button>
        )}
        {!styleCard?.styleDescription && (
          <Button size="sm" variant="outline" onClick={onEditStyle} disabled={isGenerating}
            className="flex h-7 items-center gap-1 text-xs" title="文风卡（未设定）"><Icon name="palette" size={13} /> 文风</Button>
        )}
        <span className="mx-0.5 text-[var(--nv-border-3)]">|</span>
        <StyleSelector projectId={projectId} currentStyleId={styleTemplateId} onSelect={onStyleSelect} />
        <button onClick={onGenerateOutline} disabled={isGenerating || outlineGenerating}
          className="flex h-7 items-center gap-1 rounded border border-[var(--nv-border-2)] px-2.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-white/[0.04] hover:text-[var(--nv-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">
          {outlineGenerating ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="bot" size={12} />} 大纲
        </button>
        <Button size="sm" variant="outline" onClick={onSummarize} disabled={isGenerating || summarizing}
          className="flex h-7 items-center gap-1 text-xs">{summarizing ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="package" size={12} />} 摘要</Button>
        <Button size="sm" variant="outline" onClick={onImportSettings} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-primary)]"><Icon name="clipboard" size={12} /> 设定</Button>
        <Button size="sm" variant="outline" onClick={onImportChapters} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-creative)]"><Icon name="download" size={12} /> 导入</Button>
        <div className="relative">
          <Button size="sm" variant="outline" onClick={() => setShowExport(!showExport)}
            disabled={isGenerating} className="flex h-7 items-center gap-1 text-xs"><Icon name="upload" size={12} /> 导出</Button>
          {showExport && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-abyss)] shadow-xl">
                <button onClick={() => { onExport("markdown"); setShowExport(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--nv-text-secondary)] transition-colors hover:bg-white/[0.04]"><Icon name="file" size={12} className="mr-1 inline" />Markdown (.md)</button>
                <button onClick={() => { onExport("txt"); setShowExport(false); }}
                  className="w-full px-3 py-2 text-left text-xs text-[var(--nv-text-secondary)] transition-colors hover:bg-white/[0.04]"><Icon name="file" size={12} className="mr-1 inline" />纯文本 (.txt)</button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
