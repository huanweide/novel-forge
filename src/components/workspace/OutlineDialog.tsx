"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { Switch } from "@/components/ui/switch";

export function OutlineDialog({
  projectName, chapterCount, customChapterCount, customPrompt,
  previewChapters, rawOutline, error, isGenerating,
  onChapterCountChange, onCustomChapterCountChange, onCustomPromptChange,
  onGenerate, onConfirm, onUpdateChapter, onClose,
  appendMode, onAppendModeChange, hasExistingChapters,
}: {
  projectName: string; chapterCount: number; customChapterCount: string;
  customPrompt: string;
  previewChapters: { title: string; summary: string; coreConflict: string; characters: string[] }[];
  rawOutline: string; error: string; isGenerating: boolean;
  onChapterCountChange: (n: number) => void; onCustomChapterCountChange: (s: string) => void;
  onCustomPromptChange: (s: string) => void;
  onGenerate: () => void; onConfirm: () => void;
  onUpdateChapter: (index: number, field: string, value: string) => void;
  onClose: () => void; appendMode: boolean; onAppendModeChange: (v: boolean) => void;
  hasExistingChapters: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [touched, setTouched] = useState(false); // v0.46.57：预览章纲被手动编辑过但未确认
  const hasPreview = previewChapters.length > 0;

  // 手动编辑预览章纲 → 标记 dirty；确认写入后清除
  const handleUpdateChapter = (index: number, field: string, value: string) => {
    setTouched(true);
    onUpdateChapter(index, field, value);
  };
  // 关闭前检查：有编辑未确认则询问（章纲编辑只进预览 state，不确认即丢）
  const handleClose = () => {
    if (touched && !window.confirm("章纲有编辑但尚未「确认写入」，关闭将丢失这些修改，确定关闭？")) return;
    setTouched(false);
    onClose();
  };
  const handleConfirm = () => {
    setTouched(false);
    onConfirm();
  };

  const chapterOptions = [
    { value: 4, label: "4 章" }, { value: 8, label: "8 章" },
    { value: 12, label: "12 章" }, { value: -1, label: "自定义" },
  ];

  return (
    <Modal open onClose={handleClose} bare ariaLabel="AI 生成大纲" panelClassName="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--nv-border-2)] shrink-0">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
              <Icon name="bot" size={18} className="text-[var(--nv-creative)]" /> AI 生成大纲
            </h2>
            <p className="text-xs text-[var(--nv-text-tertiary)] mt-0.5">《{projectName}》</p>
          </div>
          <button onClick={handleClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] text-lg transition-colors"><Icon name="x" size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 custom-scrollbar">
          {/* 章节数选择 */}
          <div>
            <label className="text-sm text-[var(--nv-text-secondary)] mb-2 block">章节数量</label>
            <div className="flex gap-2 flex-wrap">
              {chapterOptions.map((opt) => (
                <button key={opt.value} onClick={() => onChapterCountChange(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${chapterCount === opt.value ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {chapterCount === -1 && (
              <input type="number" min={1} max={30} value={customChapterCount}
                onChange={(e) => onCustomChapterCountChange(e.target.value)}
                placeholder="输入章节数 (1-30)"
                className="input-glass mt-2 w-32 rounded-lg px-3 py-2 text-sm focus:border-[var(--nv-primary)]" />
            )}
          </div>
          {/* 提示词 */}
          <div>
            <label className="text-sm text-[var(--nv-text-secondary)] mb-2 flex items-center gap-3">
              <span>自定义提示词（可选）</span>
            </label>
            <textarea value={customPrompt} onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder={`不填则自动基于角色、世界书、总纲用默认模型生成。\n\n填写则按你的提示词生成章纲。例如：\n"重点写主角从懦弱到勇敢的转变过程，前三章铺垫，中间爆发，最后两章收尾"`}
              className="input-glass w-full rounded-lg px-3 py-2 text-sm resize-none focus:border-[var(--nv-primary)]"
              rows={3} disabled={isGenerating} />
            <p className="text-xs text-[var(--nv-text-tertiary)] mt-1">有提示词 → 按你的指令生成 · 无提示词 → 默认模型深度创作</p>
          </div>
          {/* 追加/替换 */}
          {hasExistingChapters && (
            <div className="flex items-center justify-between gap-3">
              <span>
                <span className="text-xs text-[var(--nv-text-secondary)]">{appendMode ? "追加到已有章节末尾" : "替换全部已有大纲"}</span>
                <span className="block text-[10px] text-[var(--nv-text-tertiary)]">{appendMode ? "新章节从最后一章后面继续编号" : "删除已有章节，重新从第一章开始"}</span>
              </span>
              <Switch checked={appendMode} onCheckedChange={(next) => onAppendModeChange(next)} size="sm" />
            </div>
          )}
          {/* 错误 */}
          {error && <div className="bg-[var(--nv-danger-soft)] border border-[var(--nv-danger)]/60 rounded-lg p-3 text-sm text-[var(--nv-danger)]">{error}</div>}
          {/* 生成按钮 */}
          <div className="flex items-center gap-3">
            <Button onClick={onGenerate} disabled={isGenerating || (chapterCount === -1 && !customChapterCount)} className="btn-primary text-[var(--nv-text-primary)]">
              {isGenerating ? <><Icon name="loader" size={14} className="animate-spin" /> 生成中...</> : <><Icon name="sparkles" size={14} /> 生成大纲预览</>}
            </Button>
          </div>
          {/* 总览文本 */}
          {rawOutline && (
            <div className="bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg p-3">
              <p className="flex items-center gap-1 text-xs text-[var(--nv-text-tertiary)] mb-1"><Icon name="clipboard" size={12} /> 大纲总览</p>
              <p className="text-sm text-[var(--nv-text-secondary)] whitespace-pre-wrap leading-relaxed">{rawOutline}</p>
            </div>
          )}
          {/* 章节预览 */}
          {hasPreview && (
            <div>
              <p className="flex items-center gap-1 text-sm text-[var(--nv-text-secondary)] mb-2"><Icon name="book" size={14} /> 章节预览（{previewChapters.length} 章 · 点击可编辑）</p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                {previewChapters.map((ch, i) => (
                  <div key={i} className={`border rounded-lg p-3 transition-colors ${editingIndex === i ? "border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]" : "border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm hover:border-[var(--nv-border-3)]"}`}>
                    {editingIndex === i ? (
                      <div className="space-y-2">
                        <input className="input-glass w-full rounded px-2 py-1 text-sm text-[var(--nv-text-primary)] focus:border-[var(--nv-primary)]"
                          value={ch.title} onChange={(e) => handleUpdateChapter(i, "title", e.target.value)} autoFocus />
                        <textarea className="input-glass w-full rounded px-2 py-1 text-sm text-[var(--nv-text-secondary)] resize-none focus:border-[var(--nv-primary)]"
                          rows={3} value={ch.summary} onChange={(e) => handleUpdateChapter(i, "summary", e.target.value)} placeholder="本章梗概..." />
                        <div className="flex gap-2">
                          <input className="input-glass flex-1 rounded px-2 py-1 text-xs text-[var(--nv-text-secondary)] focus:border-[var(--nv-primary)]"
                            value={ch.coreConflict} onChange={(e) => handleUpdateChapter(i, "coreConflict", e.target.value)} placeholder="核心冲突（可选）" />
                          <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)} className="text-xs border-[var(--nv-border-2)] h-7">完成</Button>
                        </div>
                      </div>
                    ) : (
                      <div onClick={() => setEditingIndex(i)} className="cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-[var(--nv-text-primary)]">{ch.title}</h4>
                          <span className="text-[10px] text-[var(--nv-text-tertiary)] shrink-0 mt-0.5">点击编辑</span>
                        </div>
                        {ch.summary && <p className="text-xs text-[var(--nv-text-secondary)] mt-1 leading-relaxed">{ch.summary}</p>}
                        {ch.coreConflict && <p className="flex items-center gap-1 text-xs text-[var(--nv-accent)] mt-1"><Icon name="zap" size={11} /> 冲突：{ch.coreConflict}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {hasPreview && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--nv-border-2)] shrink-0 bg-[var(--nv-surface-2)]">
            <p className="text-xs text-[var(--nv-text-tertiary)]">可点击章节编辑标题和梗概，确认后写入大纲树</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose} className="border-[var(--nv-border-2)] text-sm">取消</Button>
              <Button onClick={handleConfirm} disabled={isGenerating} className="btn-primary text-[var(--nv-text-primary)] text-sm"><Icon name="check" size={14} /> 确认写入 ({previewChapters.length} 章)</Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

export interface OutlineChapter {
  title: string;
  summary: string;
  coreConflict: string;
  characters: string[];
}
