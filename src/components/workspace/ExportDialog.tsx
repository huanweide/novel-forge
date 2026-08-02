"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

type ExportFormat = "markdown" | "txt" | "html" | "docx" | "epub";

const FORMATS: { key: ExportFormat; label: string; hint: string }[] = [
  { key: "docx", label: "Word 文档", hint: ".docx · 投稿首选" },
  { key: "epub", label: "电子书", hint: ".epub · 阅读器" },
  { key: "html", label: "网页 HTML", hint: "可打印 PDF" },
  { key: "markdown", label: "Markdown", hint: ".md · 可再编辑" },
  { key: "txt", label: "纯文本", hint: ".txt · 极简" },
];

interface ChapterOption {
  id: string;
  title: string;
}

export function ExportDialog({
  projectId,
  projectName,
  chapters,
  onClose,
}: {
  projectId: string;
  projectName: string;
  chapters: ChapterOption[];
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("docx");
  const [range, setRange] = useState<"all" | "selected">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeOutline, setIncludeOutline] = useState(true);
  const [author, setAuthor] = useState("");

  const toggleChapter = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const doExport = () => {
    const params = new URLSearchParams({ format });
    if (!includeOutline) params.set("includeOutline", "false");
    if (author.trim()) params.set("author", author.trim());
    if (range === "selected" && selected.size > 0) {
      params.set("chapterIds", [...selected].join(","));
    }
    window.open(`/api/projects/${projectId}/export?${params.toString()}`, "_blank");
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="surface-floating max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)]">导出小说</h3>
            <p className="mt-0.5 text-xs text-[var(--nv-text-tertiary)]">{projectName}</p>
          </div>
          <button onClick={onClose} className="shrink-0 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]" aria-label="关闭">
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* 格式 */}
        <div className="mb-4">
          <div className="mb-2 text-[11px] text-[var(--nv-text-tertiary)]">导出格式</div>
          <div className="grid grid-cols-2 gap-2">
            {FORMATS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFormat(f.key)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                  format === f.key
                    ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]"
                    : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] hover:border-[var(--nv-border-3)]"
                }`}
              >
                <Icon name="file" size={15} className={format === f.key ? "text-[var(--nv-primary)]" : "text-[var(--nv-text-tertiary)]"} />
                <div>
                  <div className="text-xs font-medium text-[var(--nv-text-primary)]">{f.label}</div>
                  <div className="text-[9px] text-[var(--nv-text-tertiary)]">{f.hint}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 范围 */}
        <div className="mb-4">
          <div className="mb-2 text-[11px] text-[var(--nv-text-tertiary)]">导出范围</div>
          <div className="flex gap-2">
            <button
              onClick={() => setRange("all")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                range === "all" ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)]"
              }`}
            >
              全书
            </button>
            <button
              onClick={() => setRange("selected")}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                range === "selected" ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)]"
              }`}
            >
              选章（{selected.size}）
            </button>
          </div>
          {range === "selected" && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2">
              {chapters.length === 0 && (
                <div className="px-1 py-2 text-[10px] text-[var(--nv-text-muted)]">暂无章节可选</div>
              )}
              {chapters.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-[var(--nv-surface-2)]">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleChapter(c.id)}
                    className="accent-[var(--nv-primary)]"
                  />
                  <span className="truncate text-[var(--nv-text-secondary)]">{c.title}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* 选项 */}
        <div className="mb-4 space-y-2">
          <label className="flex items-center gap-2 text-xs text-[var(--nv-text-secondary)]">
            <input type="checkbox" checked={includeOutline} onChange={(e) => setIncludeOutline(e.target.checked)} className="accent-[var(--nv-primary)]" />
            包含章节大纲
          </label>
          <div>
            <div className="mb-1 text-[11px] text-[var(--nv-text-tertiary)]">作者署名（可选）</div>
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="如：樊斯瑞"
              className="input-glass w-full rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        <Button onClick={doExport} className="btn-primary h-9 w-full text-sm">
          <Icon name="upload" size={14} /> 导出 {FORMATS.find((f) => f.key === format)?.label}
        </Button>
      </div>
    </div>
  );
}
