"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { getTemplate } from "@/core/templates";

export function Toolbar({
  projectName, onBack, onGenerateOutline, onSummarize, onImportSettings, onImportChapters,
  onEditStyle, onOpenExport, onBackup, isGenerating, outlineGenerating, summarizing,
  projectId, styleTemplateId,
  onOpenAutomation, onOpenToolbox,
}: {
  projectName: string; onBack: () => void; onGenerateOutline: () => void;
  onSummarize: () => void; onImportSettings: () => void; onImportChapters: () => void;
  onEditStyle: () => void; onOpenExport: () => void; onBackup: () => void;
  isGenerating: boolean; outlineGenerating?: boolean; summarizing: boolean;
  projectId: string; styleTemplateId?: string;
  onOpenAutomation: () => void;
  onOpenToolbox: () => void;
}) {
  const [copying, setCopying] = useState(false);
  const [copyTip, setCopyTip] = useState<string | null>(null);

  const activeStyle = getTemplate(styleTemplateId || "");
  const activeStyleLabel = activeStyle ? `${activeStyle.icon} ${activeStyle.name}` : "✏️ 自定义文风";

  const handleCopyMarkdown = async () => {
    setCopying(true);
    setCopyTip(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/export?format=markdown`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      await navigator.clipboard.writeText(text);
      setCopyTip("已复制全文 Markdown ✓");
    } catch {
      setCopyTip("复制失败，请改用导出文件");
    } finally {
      setCopying(false);
      setTimeout(() => setCopyTip(null), 2200);
    }
  };

  return (
    <header className="relative flex h-12 shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)] px-4">
      <div className="flex min-w-0 items-center gap-3">
        <button onClick={onBack} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]" aria-label="返回">
          <Icon name="arrowLeft" size={16} />
        </button>
        <span className="shrink-0 text-[var(--nv-border-3)]">|</span>
        <span className="truncate text-sm font-medium">{projectName}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <button onClick={onEditStyle} disabled={isGenerating}
          className="flex shrink-0 items-center gap-1.5 rounded border border-[var(--nv-accent)]/40 bg-[var(--nv-accent-soft)] px-2 py-1 text-xs text-[var(--nv-accent)] transition-colors hover:bg-[var(--nv-accent)]/20 disabled:opacity-50"
          title="文风与质量控制（点击打开统一风格中枢）">
          <Icon name="palette" size={13} />
          <span className="max-w-[100px] truncate">{activeStyleLabel}</span>
        </button>
        <span className="mx-0.5 text-[var(--nv-border-3)]">|</span>
        <button onClick={onGenerateOutline} disabled={isGenerating || outlineGenerating}
          className="flex h-7 items-center gap-1 rounded border border-[var(--nv-border-2)] px-2.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">
          {outlineGenerating ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="bot" size={12} />} 大纲
        </button>
        <Button size="sm" variant="outline" onClick={onSummarize} disabled={isGenerating || summarizing}
          className="flex h-7 items-center gap-1 text-xs">{summarizing ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="package" size={12} />} 摘要</Button>
        <Button size="sm" variant="outline" onClick={onImportSettings} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-primary)]"><Icon name="clipboard" size={12} /> 设定</Button>
        <Button size="sm" variant="outline" onClick={onImportChapters} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-creative)]"><Icon name="download" size={12} /> 导入</Button>
        <Button size="sm" variant="outline" onClick={onOpenAutomation} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-primary)]"><Icon name="bot" size={12} /> 自动化</Button>
        <Button size="sm" variant="outline" onClick={onOpenToolbox} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-creative)]"><Icon name="sparkles" size={12} /> 工具箱</Button>
        <Button size="sm" variant="outline" onClick={onOpenExport} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs"><Icon name="upload" size={12} /> 导出</Button>
        <Button size="sm" variant="outline" onClick={onBackup} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-accent)]" title="导出整本备份包 .nfproject（章节+角色+世界书+规则+文风，可导入还原）"><Icon name="package" size={12} /> 备份包</Button>
        <Button size="sm" variant="outline" onClick={handleCopyMarkdown} disabled={copying || isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-text-secondary)]"><Icon name="clipboard" size={12} />{copying ? "复制中…" : "复制全文"}</Button>
        {copyTip && <span className="shrink-0 self-center text-xs text-[var(--nv-accent)]">{copyTip}</span>}
      </div>
    </header>
  );
}
