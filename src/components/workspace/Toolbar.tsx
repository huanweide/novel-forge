"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { getTemplate } from "@/core/templates";

export function Toolbar({
  projectName, onBack, onGenerateOutline, onSummarize, onImportChapters,
  onEditStyle, onOpenExport, onBackup, isGenerating, outlineGenerating, summarizing,
  projectId, styleTemplateId,
  onOpenAutomation, onOpenToolbox,
}: {
  projectName: string; onBack: () => void; onGenerateOutline: () => void;
  onSummarize: () => void; onImportChapters: () => void;
  onEditStyle: () => void; onOpenExport: () => void; onBackup: () => void;
  isGenerating: boolean; outlineGenerating?: boolean; summarizing: boolean;
  projectId: string; styleTemplateId?: string;
  onOpenAutomation: () => void;
  onOpenToolbox: () => void;
}) {
  const [copying, setCopying] = useState(false);
  const [copyTip, setCopyTip] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);

  const activeStyle = getTemplate(styleTemplateId || "");
  const activeStyleLabel = activeStyle ? `${activeStyle.icon} ${activeStyle.name}` : "✏️ 自定义文风";

  const closeMenus = () => { setExportMenuOpen(false); setMoreMenuOpen(false); };

  const handleCopyMarkdown = async () => {
    setCopying(true);
    setCopyTip(null);
    setExportMenuOpen(false);
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
        <button onClick={onBack} title="退出写作页，返回首页" aria-label="返回首页" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] active:scale-[0.94]">
          <Icon name="arrowLeft" size={16} />
        </button>
        <span className="shrink-0 text-[var(--nv-border-3)]">|</span>
        <span className="truncate text-sm font-medium">{projectName}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {/* 文风与质量控制 */}
        <button onClick={onEditStyle} disabled={isGenerating}
          className="flex shrink-0 items-center gap-1.5 rounded border border-[var(--nv-accent)]/40 bg-[var(--nv-accent-soft)] px-2 py-1 text-xs text-[var(--nv-accent)] transition-colors hover:bg-[var(--nv-accent)]/20 disabled:opacity-50"
          title="文风与质量控制（点击打开统一风格中枢）">
          <Icon name="palette" size={13} />
          <span className="max-w-[100px] truncate">{activeStyleLabel}</span>
        </button>
        <span className="mx-0.5 text-[var(--nv-border-3)]">|</span>
        {/* 大纲 */}
        <button onClick={onGenerateOutline} disabled={isGenerating || outlineGenerating}
          className="flex h-7 items-center gap-1 rounded border border-[var(--nv-border-2)] px-2.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] disabled:cursor-not-allowed disabled:opacity-50">
          {outlineGenerating ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="bot" size={12} />} 大纲
        </button>
        {/* 摘要 */}
        <Button size="sm" variant="outline" onClick={onSummarize} disabled={isGenerating || summarizing}
          className="flex h-7 items-center gap-1 text-xs">{summarizing ? <Icon name="loader" size={12} className="animate-spin" /> : <Icon name="package" size={12} />} 摘要</Button>
        {/* 导入书稿 */}
        <Button size="sm" variant="outline" onClick={onImportChapters} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-creative)]" title="导入：粘贴文本后可在弹窗内选择「章节正文」（整本分章+抽卡）或「设定文本」（仅抽角色/世界观/风格三卡，不建章节）"><Icon name="download" size={12} /> 导入书稿</Button>

        {/* 导出下拉：导出文件 + 复制全文 */}
        <div className="relative z-50">
          <Button size="sm" variant="outline" onClick={() => { setMoreMenuOpen(false); setExportMenuOpen((o) => !o); }} disabled={isGenerating}
            className="flex h-7 items-center gap-1 text-xs"><Icon name="upload" size={12} /> 导出 <span className="text-[10px] opacity-70">▾</span></Button>
          {exportMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenus} aria-hidden />
              <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-1 shadow-xl">
                <button onClick={() => { setExportMenuOpen(false); onOpenExport(); }} disabled={isGenerating}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] disabled:opacity-50">
                  <Icon name="upload" size={13} /> 导出文件
                </button>
                <button onClick={handleCopyMarkdown} disabled={copying || isGenerating}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] disabled:opacity-50">
                  <Icon name="clipboard" size={13} /> {copying ? "复制中…" : "复制全文"}
                </button>
              </div>
            </>
          )}
        </div>

        {/* 备份包 */}
        <Button size="sm" variant="outline" onClick={onBackup} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-accent)]" title="导出整本备份包 .nfproject（章节+角色+世界书+规则+文风，可导入还原）"><Icon name="package" size={12} /> 备份包</Button>

        {/* 自动填表：常用功能独立入口（v1.2.0：不再藏进「更多」，改叫「自动填表」） */}
        <Button size="sm" variant="outline" onClick={onOpenAutomation} disabled={isGenerating}
          className="flex h-7 items-center gap-1 text-xs text-[var(--nv-creative)]" title="自动填表：设置每章自动抽取回填 + 一键追评所有未填表章节"><Icon name="bot" size={12} /> 自动填表</Button>

        {/* 更多▾：工具箱 */}
        <div className="relative z-50">
          <Button size="sm" variant="outline" onClick={() => { setExportMenuOpen(false); setMoreMenuOpen((o) => !o); }} disabled={isGenerating}
            className="flex h-7 items-center gap-1 text-xs"><Icon name="sliders" size={12} /> 更多 <span className="text-[10px] opacity-70">▾</span></Button>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={closeMenus} aria-hidden />
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-1 shadow-xl">
                <button onClick={() => { setMoreMenuOpen(false); onOpenToolbox(); }} disabled={isGenerating}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-surface-2)] disabled:opacity-50">
                  <Icon name="sparkles" size={13} /> 工具箱
                </button>
              </div>
            </>
          )}
        </div>

        {copyTip && <span className="shrink-0 self-center text-xs text-[var(--nv-accent)]">{copyTip}</span>}
      </div>
    </header>
  );
}
