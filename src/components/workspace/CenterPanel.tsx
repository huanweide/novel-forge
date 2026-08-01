"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "./MarkdownViewer";
import { Icon } from "@/components/ui/icons";
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
  genStep: string; genStepLabels: Record<string, { icon: React.ReactNode; label: string }>;
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

  // 底部状态栏数据（字数沿用项目约定 = 字符数 content.length，随生成实时更新）
  const currentWords = displayContent.length;
  const lineCount = displayContent ? displayContent.split("\n").length : 0;
  const targetReached = targetWordCount > 0 && currentWords >= targetWordCount;
  const progressPct = targetWordCount > 0 ? Math.min(100, Math.round((currentWords / targetWordCount) * 100)) : 0;

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--nv-void)]">
      {selectedNode ? (
        <>
          {/* 控制栏 */}
          <div className="border-b border-[var(--nv-border-2)] px-4 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">{selectedNode.title}</h2>
              <span className="text-xs text-[var(--nv-text-tertiary)]">
                {selectedNode.status === "completed" ? <span className="flex items-center gap-1"><Icon name="check" size={11} className="text-[var(--nv-success)]" /> 已完成</span> : selectedNode.status === "reviewing" ? <span className="flex items-center gap-1"><Icon name="alert" size={11} className="text-[var(--nv-accent)]" /> 待修改</span> : <span className="flex items-center gap-1"><Icon name="pencil" size={11} /> 草稿</span>}{" "}
                · {selectedNode.wordCount || 0} 字
              </span>
            </div>
            {/* 大纲编辑 */}
            <div className="mb-2">
              {editingOutline ? (
                <div className="flex gap-2">
                  <textarea className="input-glass flex-1 rounded px-2 py-1 text-xs resize-none" rows={2}
                    value={outlineDraft} onChange={(e) => setOutlineDraft(e.target.value)} placeholder="输入本节点大纲..." />
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { onEditOutline(outlineDraft); setEditingOutline(false); }} className="text-xs text-[var(--nv-success)] hover:text-[var(--nv-success)]/70">保存</button>
                    <button onClick={() => setEditingOutline(false)} className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)]">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div onClick={() => { setOutlineDraft(selectedNode.outline || ""); setEditingOutline(true); }}
                    className="flex-1 text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] cursor-pointer italic">
                    {selectedNode.outline || "点击设置本节点大纲..."}
                  </div>
                  {!isGenerating && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {chapterOutlineStatus === "generating" ? (
                        <span className="text-[10px] text-[var(--nv-primary)] animate-pulse px-1 flex items-center gap-0.5"><Icon name="loader" size={10} className="animate-spin" /> 章纲生成中...</span>
                      ) : chapterOutlineStatus === "done" ? (
                        <span className="text-[10px] text-[var(--nv-success)] font-medium px-1 flex items-center gap-0.5"><Icon name="check" size={10} /> 章纲完成</span>
                      ) : chapterOutlineStatus === "error" ? (
                        <span className="text-[10px] text-[var(--nv-danger)] px-1 flex items-center gap-0.5"><Icon name="x" size={10} /> 章纲失败</span>
                      ) : (
                        <>
                          <input value={chapterOutlinePrompt} onChange={(e) => onChapterOutlinePromptChange(e.target.value)}
                            placeholder="Flash 轻量预览提示词（留空自动生成）"
                            className="input-glass w-32 rounded px-1.5 py-0.5 text-[10px] focus:border-[var(--nv-primary)]" />
                          <button onClick={() => onGenerateChapterOutline(chapterOutlinePrompt)}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] transition-colors"
                            title="Flash 轻量预览——用 V4 Flash 快速生成本章草稿章纲（不绑定角色，可随时重生成）"><Icon name="sparkles" size={10} /> Flash 章纲</button>
                          <button onClick={onDrawChapterOutline}
                            className="text-[10px] px-1.5 py-0.5 rounded border border-[var(--nv-primary)]/50 text-[var(--nv-primary)] hover:bg-[var(--nv-primary-soft)] transition-colors font-medium"
                            title="正式 Outline——并行抽 3-5 条不同路线并自动选角，采用后写入带角色/剧情的正式章纲"><Icon name="grid" size={13} className="mr-1" />抽卡分镜</button>
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
                  <Button size="sm" onClick={onStop} className="btn-danger h-7 text-xs"><Icon name="stop" size={11} /> 停止生成</Button>
                ) : (
                  <>
                    {!refineMode && (
                      <Button size="sm" onClick={onWrite} className="btn-primary h-7 text-xs"><Icon name="pencil" size={11} /> 生成/重写</Button>
                    )}
                    {refineMode && (
                      <Button size="sm" onClick={onRefine} className="btn-ghost h-7 text-xs flex items-center gap-1 text-[var(--nv-accent)] border-[var(--nv-accent)]/40"><Icon name="wrench" size={11} /> 微调</Button>
                    )}
                    <button onClick={onToggleRefineMode}
                      className={`text-xs px-2 py-1 h-7 rounded border transition-colors ${refineMode ? "border-[var(--nv-accent)]/50 text-[var(--nv-accent)] bg-[var(--nv-accent-soft)] hover:bg-[var(--nv-accent)]/20" : "border-[var(--nv-border-2)] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)]"}`}
                      title={refineMode ? "切换到生成模式" : "切换到微调模式"}>
                      {refineMode ? <span className="flex items-center gap-1"><Icon name="wrench" size={11} /> 微调中</span> : <span className="flex items-center gap-1"><Icon name="wrench" size={11} /> 微调</span>}
                    </button>
                    {!isGenerating && (
                      <button onClick={onOpenGame}
                        className="text-xs px-2 py-1 h-7 rounded border border-[var(--nv-creative)]/40 text-[var(--nv-creative)] bg-[var(--nv-creative-soft)] hover:bg-[var(--nv-creative)]/20 hover:border-[var(--nv-creative)] transition-colors"
                        title="互动游戏模式——像文字RPG一样创作本章">
                        <Icon name="gamepad" size={14} />
                      </button>
                    )}
                  </>
                )}
                <input type="number" value={targetWordCount} onChange={(e) => onTargetWordCountChange(parseInt(e.target.value) || 800)}
                  className="input-glass w-16 rounded px-2 py-1 text-xs text-center" title="目标字数" />
                <span className="text-xs text-[var(--nv-text-tertiary)]">字</span>
                <input placeholder={refineMode ? "微调指令（改对话/加描写/续写500字）..." : "作者指令（高优先级）..."}
                  value={refineMode ? refineInstruction : authorNote}
                  onChange={(e) => refineMode ? onRefineInstructionChange(e.target.value) : onAuthorNoteChange(e.target.value)}
                  className="input-glass flex-1 min-w-0 rounded px-2 py-1 text-xs" />
              </div>
              {refineMode && !isGenerating && (
                <p className="text-[10px] text-[var(--nv-accent)]/70">微调模式：不重写正文，按指令修改现有内容或续写补长。字数不够会自动补，中途打断可续写。</p>
              )}
            </div>
          </div>
          {/* 正文显示区 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4">
            {displayContent ? (
              <div className="max-w-[700px] mx-auto">
                {/* 章节标题 */}
                {selectedNode?.title && (
                  <h1 className="text-xl font-bold text-[var(--nv-text-primary)] text-center mb-6 mt-2 tracking-wide">
                    {selectedNode.title}
                  </h1>
                )}
                <MarkdownViewer content={displayContent} projectId={projectId} isStreaming={isGenerating} />
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-[var(--nv-text-tertiary)] text-sm">
                {(isGenerating || genStep) ? (
                  <div className="text-center space-y-3">
                    {genStep && (
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                        genStep === "error" ? "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)] border border-[var(--nv-danger)]/50"
                        : genStep === "done" ? "bg-[var(--nv-success-soft)] text-[var(--nv-success)] border border-[var(--nv-success)]/50"
                        : "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] border border-[var(--nv-primary)]/50"
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
                              <div className={`w-2 h-2 rounded-full transition-colors ${i <= stepIdx ? "bg-[var(--nv-primary)]" : "bg-[var(--nv-border-3)]"}`} />
                              {i < 4 && <div className={`w-3 h-0.5 ${i < stepIdx ? "bg-[var(--nv-primary)]" : "bg-[var(--nv-border-3)]"}`} />}
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
          {/* 底部状态栏：行 / 字 / 目标进度 / 编码 */}
          <div className="shrink-0 flex items-center justify-between border-t border-[var(--nv-border-2)] bg-[var(--nv-abyss)] px-4 py-1.5 text-[11px] text-[var(--nv-text-tertiary)]">
            <div className="flex items-center gap-4">
              <span>{lineCount} 行</span>
              <span>{currentWords.toLocaleString()} 字</span>
              <span className={targetReached ? "text-[var(--nv-success)]" : "text-[var(--nv-text-secondary)]"}>
                目标 {targetWordCount} 字 · {progressPct}%
              </span>
            </div>
            <span className="flex items-center gap-1"><Icon name="file" size={11} /> UTF-8</span>
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-[var(--nv-text-tertiary)]">
          <div className="text-center">
            <p className="text-lg mb-2">欢迎使用 Novel Forge</p>
            <p className="text-sm">从左侧大纲树选择节点开始写作，或先生成大纲</p>
          </div>
        </div>
      )}
    </main>
  );
}
