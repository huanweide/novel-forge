"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "./MarkdownViewer";
import type { StoryNodeData, ReviewIssue } from "./types";

export function CenterPanel({
  selectedNode, streamContent, isGenerating, reviewResult,
  authorNote, onAuthorNoteChange, targetWordCount, onTargetWordCountChange,
  onWrite, onStop, onEditOutline, onGenerateChapterOutline, onDrawChapterOutline,
  projectId,
  refineMode, onToggleRefineMode, refineInstruction, onRefineInstructionChange, onRefine,
  chapterOutlinePrompt, onChapterOutlinePromptChange,
  genStep, genStepLabels, chapterOutlineStatus,
  onOpenGame,
}: {
  selectedNode: StoryNodeData | null; streamContent: string; isGenerating: boolean;
  reviewResult: { passed: boolean; issues: ReviewIssue[] } | null;
  authorNote: string; onAuthorNoteChange: (v: string) => void;
  targetWordCount: number; onTargetWordCountChange: (v: number) => void;
  onWrite: () => void; onStop: () => void;
  onEditOutline: (outline: string) => void;
  onGenerateChapterOutline: (flashPrompt: string) => void;
  onDrawChapterOutline: () => void;
  chapterOutlinePrompt: string; onChapterOutlinePromptChange: (v: string) => void;
  projectId: string;
  refineMode: boolean; onToggleRefineMode: () => void;
  refineInstruction: string; onRefineInstructionChange: (v: string) => void;
  onRefine: () => void;
  onOpenGame: () => void;
  genStep: string; genStepLabels: Record<string, { icon: string; label: string }>;
  chapterOutlineStatus: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState("");

  useEffect(() => {
    if (contentRef.current && isGenerating) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent, isGenerating]);

  const displayContent = streamContent || selectedNode?.content || "";

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      {selectedNode ? (
        <>
          {/* 控制栏 */}
          <div className="border-b border-zinc-800 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">{selectedNode.title}</h2>
              <span className="text-xs text-zinc-600">
                {selectedNode.status === "completed" ? "✅ 已完成" : selectedNode.status === "reviewing" ? "⚠️ 待修改" : "📝 草稿"}{" "}
                · {selectedNode.wordCount || 0} 字
              </span>
            </div>
            {/* 大纲编辑 */}
            <div className="mb-2">
              {editingOutline ? (
                <div className="flex gap-2">
                  <textarea className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs resize-none" rows={2}
                    value={outlineDraft} onChange={(e) => setOutlineDraft(e.target.value)} placeholder="输入本节点大纲..." />
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { onEditOutline(outlineDraft); setEditingOutline(false); }} className="text-xs text-green-400 hover:text-green-300">保存</button>
                    <button onClick={() => setEditingOutline(false)} className="text-xs text-zinc-500 hover:text-zinc-400">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div onClick={() => { setOutlineDraft(selectedNode.outline || ""); setEditingOutline(true); }}
                    className="flex-1 text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer italic">
                    {selectedNode.outline || "点击设置本节点大纲..."}
                  </div>
                  {!isGenerating && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {chapterOutlineStatus === "generating" ? (
                        <span className="text-[10px] text-indigo-400 animate-pulse px-1">⏳ 章纲生成中...</span>
                      ) : chapterOutlineStatus === "done" ? (
                        <span className="text-[10px] text-emerald-400 font-medium px-1">✅ 章纲完成</span>
                      ) : chapterOutlineStatus === "error" ? (
                        <span className="text-[10px] text-red-400 px-1">❌ 章纲失败</span>
                      ) : (
                        <>
                          <input value={chapterOutlinePrompt} onChange={(e) => onChapterOutlinePromptChange(e.target.value)}
                            placeholder="Flash提示词（留空自动生成）"
                            className="w-32 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] placeholder:text-zinc-600 focus:outline-none focus:border-cyan-700" />
                          <button onClick={() => onGenerateChapterOutline(chapterOutlinePrompt)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-800 text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                            title="用 V4 Flash 为本章生成章纲">⚡生成</button>
                          <button onClick={onDrawChapterOutline}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-purple-800 text-purple-400 hover:bg-purple-950/30 transition-colors"
                            title="抽卡模式——并行生成3-5条不同路线">🎴抽卡</button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* 生成控制 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isGenerating ? (
                  <Button size="sm" onClick={onStop} className="bg-red-600 hover:bg-red-500 h-7 text-xs">⏹ 停止生成</Button>
                ) : (
                  <>
                    {!refineMode && (
                      <Button size="sm" onClick={onWrite} className="bg-indigo-600 hover:bg-indigo-500 h-7 text-xs">▶ 生成/重写</Button>
                    )}
                    {refineMode && (
                      <Button size="sm" onClick={onRefine} className="bg-amber-600 hover:bg-amber-500 h-7 text-xs">🔧 微调</Button>
                    )}
                    <button onClick={onToggleRefineMode}
                      className={`text-xs px-2 py-1 h-7 rounded border transition-colors ${refineMode ? "border-amber-700 text-amber-400 bg-amber-950/20 hover:bg-amber-950/40" : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"}`}
                      title={refineMode ? "切换到生成模式" : "切换到微调模式"}>
                      {refineMode ? "🔧 微调中" : "🔧 微调"}
                    </button>
                    {!isGenerating && (
                      <button onClick={onOpenGame}
                        className="text-xs px-2 py-1 h-7 rounded border border-violet-700 text-violet-400 bg-violet-950/20 hover:bg-violet-950/40 hover:border-violet-600 transition-colors"
                        title="互动游戏模式——像文字RPG一样创作本章">
                        🎮
                      </button>
                    )}
                  </>
                )}
                <input type="number" value={targetWordCount} onChange={(e) => onTargetWordCountChange(parseInt(e.target.value) || 800)}
                  className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-center" title="目标字数" />
                <span className="text-xs text-zinc-600">字</span>
                <input placeholder={refineMode ? "微调指令（改对话/加描写/续写500字）..." : "作者指令（高优先级）..."}
                  value={refineMode ? refineInstruction : authorNote}
                  onChange={(e) => refineMode ? onRefineInstructionChange(e.target.value) : onAuthorNoteChange(e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600" />
              </div>
              {refineMode && !isGenerating && (
                <p className="text-[10px] text-amber-600/70">微调模式：不重写正文，按指令修改现有内容或续写补长。字数不够会自动补，中途打断可续写。</p>
              )}
            </div>
          </div>
          {/* 正文显示区 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4">
            {displayContent ? (
              <div className="max-w-[700px] mx-auto">
                {/* 章节标题 */}
                {selectedNode?.title && (
                  <h1 className="text-xl font-bold text-zinc-200 text-center mb-6 mt-2 tracking-wide">
                    {selectedNode.title}
                  </h1>
                )}
                <MarkdownViewer content={displayContent} projectId={projectId} isStreaming={isGenerating} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                {(isGenerating || genStep) ? (
                  <div className="text-center space-y-3">
                    {genStep && (
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                        genStep === "error" ? "bg-red-950/40 text-red-400 border border-red-900/50"
                        : genStep === "done" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
                        : "bg-indigo-950/40 text-indigo-400 border border-indigo-900/50"
                      }`}>
                        <span className="text-lg">{genStepLabels[genStep]?.icon}</span>
                        <span className={genStep === "generating" ? "animate-pulse" : ""}>{genStepLabels[genStep]?.label || "处理中..."}</span>
                      </div>
                    )}
                    {genStep && genStep !== "done" && genStep !== "error" && (
                      <div className="flex items-center gap-1 justify-center">
                        {["loading-cards", "confirming", "generating", "reviewing", "summarizing"].map((s, i) => {
                          const stepIdx = ["loading-cards", "confirming", "generating", "reviewing", "summarizing"].indexOf(genStep);
                          return (
                            <div key={s} className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full transition-colors ${i <= stepIdx ? "bg-indigo-500" : "bg-zinc-700"}`} />
                              {i < 4 && <div className={`w-3 h-0.5 ${i < stepIdx ? "bg-indigo-500" : "bg-zinc-700"}`} />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isGenerating && !genStep && <span className="animate-pulse">生成中...</span>}
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="mb-2">选择左侧大纲节点，设置大纲后点击「生成」</p>
                    <p className="text-xs">或先让 AI 生成大纲</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center">
            <p className="text-lg mb-2">欢迎使用 Novel Forge</p>
            <p className="text-sm">从左侧大纲树选择节点开始写作，或先生成大纲</p>
          </div>
        </div>
      )}
    </main>
  );
}
