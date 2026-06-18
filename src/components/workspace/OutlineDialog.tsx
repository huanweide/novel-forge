"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function OutlineDialog({
  projectName, chapterCount, customChapterCount, customPrompt, useFlash,
  previewChapters, modelUsed, rawOutline, error, isGenerating,
  onChapterCountChange, onCustomChapterCountChange, onCustomPromptChange,
  onUseFlashChange, onGenerate, onConfirm, onUpdateChapter, onClose,
  appendMode, onAppendModeChange, hasExistingChapters,
}: {
  projectName: string; chapterCount: number; customChapterCount: string;
  customPrompt: string; useFlash: boolean;
  previewChapters: { title: string; summary: string; coreConflict: string; characters: string[] }[];
  modelUsed: string; rawOutline: string; error: string; isGenerating: boolean;
  onChapterCountChange: (n: number) => void; onCustomChapterCountChange: (s: string) => void;
  onCustomPromptChange: (s: string) => void; onUseFlashChange: (v: boolean) => void;
  onGenerate: () => void; onConfirm: () => void;
  onUpdateChapter: (index: number, field: string, value: string) => void;
  onClose: () => void; appendMode: boolean; onAppendModeChange: (v: boolean) => void;
  hasExistingChapters: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasPreview = previewChapters.length > 0;

  const chapterOptions = [
    { value: 4, label: "4 章" }, { value: 8, label: "8 章" },
    { value: 12, label: "12 章" }, { value: -1, label: "自定义" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div>
            <h2 className="text-lg font-semibold">🤖 AI 生成大纲</h2>
            <p className="text-xs text-zinc-500 mt-0.5">《{projectName}》</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 章节数选择 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">章节数量</label>
            <div className="flex gap-2 flex-wrap">
              {chapterOptions.map((opt) => (
                <button key={opt.value} onClick={() => onChapterCountChange(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${chapterCount === opt.value ? "bg-indigo-600 text-white" : "bg-white/[0.04] text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"}`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {chapterCount === -1 && (
              <input type="number" min={1} max={30} value={customChapterCount}
                onChange={(e) => onCustomChapterCountChange(e.target.value)}
                placeholder="输入章节数 (1-30)"
                className="mt-2 w-32 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500" />
            )}
          </div>
          {/* 提示词 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 flex items-center gap-3">
              <span>自定义提示词（可选）</span>
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                <input type="checkbox" checked={useFlash} onChange={(e) => onUseFlashChange(e.target.checked)} className="rounded" />
                用 V4 Flash
              </label>
            </label>
            <textarea value={customPrompt} onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder={`不填则自动基于角色、世界书、总纲用 V4 Pro 生成。\n\n填写则按你的提示词生成章纲。例如：\n"重点写主角从懦弱到勇敢的转变过程，前三章铺垫，中间爆发，最后两章收尾"`}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500"
              rows={3} disabled={isGenerating} />
            <p className="text-xs text-zinc-600 mt-1">有提示词 → {useFlash ? "V4 Flash" : "V4 Pro"} 快速响应 · 无提示词 → V4 Pro 深度创作</p>
          </div>
          {/* 追加/替换 */}
          {hasExistingChapters && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input type="checkbox" checked={appendMode} onChange={(e) => onAppendModeChange(e.target.checked)} className="rounded accent-indigo-500" />
                <span>{appendMode ? "📎 追加到已有章节末尾" : "🔄 替换全部已有大纲"}</span>
              </label>
              <span className="text-[10px] text-zinc-600">{appendMode ? "新章节从最后一章后面继续编号" : "删除已有章节，重新从第一章开始"}</span>
            </div>
          )}
          {/* 错误 */}
          {error && <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-sm text-red-400">{error}</div>}
          {/* 生成按钮 */}
          <div className="flex items-center gap-3">
            <Button onClick={onGenerate} disabled={isGenerating || (chapterCount === -1 && !customChapterCount)} className="bg-indigo-600 hover:bg-indigo-500 text-white">
              {isGenerating ? "⏳ 生成中..." : "🚀 生成大纲预览"}
            </Button>
            {modelUsed && <span className="text-xs text-zinc-500">模型：<span className={modelUsed === "v4-pro" ? "text-purple-400" : "text-cyan-400"}>{modelUsed}</span></span>}
          </div>
          {/* 总览文本 */}
          {rawOutline && (
            <div className="bg-zinc-800/50 border border-white/[0.08] rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">📋 大纲总览</p>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{rawOutline}</p>
            </div>
          )}
          {/* 章节预览 */}
          {hasPreview && (
            <div>
              <p className="text-sm text-zinc-400 mb-2">📖 章节预览（{previewChapters.length} 章 · 点击可编辑）</p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {previewChapters.map((ch, i) => (
                  <div key={i} className={`border rounded-lg p-3 transition-colors ${editingIndex === i ? "border-indigo-600 bg-indigo-950/20" : "border-white/[0.06] bg-white/[0.02] backdrop-blur-sm hover:border-white/[0.08]"}`}>
                    {editingIndex === i ? (
                      <div className="space-y-2">
                        <input className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                          value={ch.title} onChange={(e) => onUpdateChapter(i, "title", e.target.value)} autoFocus />
                        <textarea className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-sm text-zinc-300 resize-none focus:outline-none focus:border-indigo-500"
                          rows={3} value={ch.summary} onChange={(e) => onUpdateChapter(i, "summary", e.target.value)} placeholder="本章梗概..." />
                        <div className="flex gap-2">
                          <input className="flex-1 bg-white/[0.04] border border-white/[0.08] rounded px-2 py-1 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500"
                            value={ch.coreConflict} onChange={(e) => onUpdateChapter(i, "coreConflict", e.target.value)} placeholder="核心冲突（可选）" />
                          <Button size="sm" variant="outline" onClick={() => setEditingIndex(null)} className="text-xs border-white/[0.08] h-7">完成</Button>
                        </div>
                      </div>
                    ) : (
                      <div onClick={() => setEditingIndex(i)} className="cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-zinc-200">{ch.title}</h4>
                          <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">点击编辑</span>
                        </div>
                        {ch.summary && <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{ch.summary}</p>}
                        {ch.coreConflict && <p className="text-xs text-amber-600 mt-1">冲突：{ch.coreConflict}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {hasPreview && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-white/[0.06] shrink-0 bg-zinc-900">
            <p className="text-xs text-zinc-500">可点击章节编辑标题和梗概，确认后写入大纲树</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { onClose(); }} className="border-white/[0.08] text-sm">取消</Button>
              <Button onClick={onConfirm} disabled={isGenerating} className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm">✅ 确认写入 ({previewChapters.length} 章)</Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export interface OutlineChapter {
  title: string;
  summary: string;
  coreConflict: string;
  characters: string[];
}
