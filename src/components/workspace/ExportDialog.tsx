"use client";

import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Modal } from "@/components/ui/Modal";
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
  const [checking, setChecking] = useState(false);
  const [pendingHits, setPendingHits] = useState<{
    total: number;
    hits: { word: string; chapter: string; context: string }[];
  } | null>(null);

  const toggleChapter = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const buildParams = (withCheck: boolean) => {
    const params = new URLSearchParams({ format });
    if (withCheck) params.set("check", "1");
    if (!includeOutline) params.set("includeOutline", "false");
    if (author.trim()) params.set("author", author.trim());
    if (range === "selected" && selected.size > 0) {
      params.set("chapterIds", [...selected].join(","));
    }
    return params;
  };

  // 真正触发下载（不带 check）
  const proceedExport = () => {
    window.open(`/api/projects/${projectId}/export?${buildParams(false).toString()}`, "_blank");
    setPendingHits(null);
    onClose();
  };

  // FE-N7：导出前先跑违禁词预检，命中则弹确认清单
  const doExport = async () => {
    setChecking(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/export?${buildParams(true).toString()}`);
      if (!res.ok) {
        proceedExport();
        return;
      }
      const data = (await res.json()) as { total: number; hits: { word: string; chapter: string; context: string }[] };
      if (data.total > 0) {
        setPendingHits(data);
        return;
      }
      proceedExport();
    } catch {
      // 预检失败时退化为直接导出，不打断用户
      proceedExport();
    } finally {
      setChecking(false);
    }
  };

  return (
    <Modal open onClose={onClose} bare panelClassName="max-w-md max-h-[85vh] overflow-y-auto">
      <div className="p-5">
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

        <p className="mb-2 text-[10px] leading-relaxed text-[var(--nv-text-muted)]">
          导出前会自动跑一遍违禁词预检（可在「设置 → 违禁词」自定义词库）。
        </p>

        {pendingHits ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-[var(--nv-danger-soft)] bg-[var(--nv-danger-soft)]/40 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[var(--nv-danger)]">
                <Icon name="alert" size={16} /> 预检发现 {pendingHits.total} 处疑似违禁词
              </div>
              <p className="mt-1 text-[10px] text-[var(--nv-text-tertiary)]">
                以下为候选命中（仅显示前 {pendingHits.hits.length} 条），是否真违禁由你判断，工具不自动删改。
              </p>
            </div>
            <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2">
              {pendingHits.hits.map((h, i) => (
                <div key={i} className="rounded px-2 py-1.5 text-[11px]">
                  <span className="font-medium text-[var(--nv-danger)]">{h.word}</span>
                  <span className="text-[var(--nv-text-tertiary)]"> · {h.chapter}</span>
                  <p className="mt-0.5 truncate text-[var(--nv-text-secondary)]">…{h.context}…</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setPendingHits(null)} className="btn-ghost h-9 flex-1 text-sm">
                返回修改
              </Button>
              <Button onClick={proceedExport} className="btn-primary h-9 flex-1 text-sm">
                仍要导出
              </Button>
            </div>
          </div>
        ) : (
          <Button onClick={doExport} disabled={checking} className="btn-primary h-9 w-full text-sm">
            <Icon name="upload" size={14} /> {checking ? "预检中…" : `导出 ${FORMATS.find((f) => f.key === format)?.label}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
