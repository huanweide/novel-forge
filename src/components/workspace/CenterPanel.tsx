"use client";

import { useState, useEffect, useRef, useMemo, useCallback, memo } from "react";
import { Button } from "@/components/ui/button";
import { MarkdownViewer } from "./MarkdownViewer";
import { Icon } from "@/components/ui/icons";
import { TTSPlayer } from "./TTSPlayer";
import { ENTITY_LEGEND } from "@/core/entity-highlighter";
import { Modal } from "@/components/ui/Modal";
import { toastSuccess, toastError } from "@/components/ui/toast";
import type { StoryNodeData, ReviewIssue } from "./types";
import { computeNarrativeStage, type NarrativeStage } from "@/core/pipeline/narrative-stage";
import { useWriterStore } from "@/store";

// 项目实体（名→颜色→id），用于章节实体彩色徽章与点击跳转
type ProjectEntity = {
  id: string; name: string; type: "character" | "lorebook"; color: string; category?: string;
};

/**
 * 流式正文节流：AI 逐 token 生成时，把高频变化的 value 合并到下一帧只提交一次，
 * 避免每个 token 都触发下游（ReactMarkdown 全量重解析）重渲染——大书越写越卡的根因。
 * - active=false（非流式）：直接透传最新值，保证最终状态精确无残留。
 * - active=true（流式）：多次更新合并到下一帧一次提交。
 */
function useRafThrottledValue(value: string, active: boolean): string {
  const [display, setDisplay] = useState(value);
  const latest = useRef(value);
  const raf = useRef<number | null>(null);
  latest.current = value;

  useEffect(() => {
    if (!active) {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
      setDisplay(value);
      return;
    }
    if (raf.current == null) {
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        setDisplay(latest.current);
      });
    }
    return () => {
      if (raf.current != null) {
        cancelAnimationFrame(raf.current);
        raf.current = null;
      }
    };
  }, [value, active]);

  return display;
}

/**
 * 流式正文显示区（标题 / 朗读 / 图例 / 实体徽章 / Markdown）。
 * 抽成 React.memo 子组件，props 均为稳定引用（content 仅随流式节流值变化），
 * 逐 token 更新时只有本子树重渲，外层面板（工具栏 / 侧栏 / 状态栏）不跟着每 token 重渲。
 */
const StreamingBody = memo(function StreamingBody({
  content,
  selectedNode,
  projectId,
  isStreaming,
  onEntityClick,
  showTTS,
  onShowTTSChange,
  projectEntities,
}: {
  content: string;
  selectedNode: StoryNodeData;
  projectId: string;
  isStreaming: boolean;
  onEntityClick: (id: string, type: "character" | "lorebook") => void;
  showTTS: boolean;
  onShowTTSChange: (v: boolean) => void;
  projectEntities: ProjectEntity[];
}) {
  // 章节实体彩色徽章：扫描本章正文匹配项目实体（随节流后的 content 变化）
  const chapterEntities = useMemo(() => {
    if (!content || projectEntities.length === 0) return [];
    const found = new Map<string, ProjectEntity>();
    for (const e of projectEntities) {
      if (e.name && content.includes(e.name) && !found.has(e.id)) found.set(e.id, e);
    }
    return Array.from(found.values());
  }, [content, projectEntities]);

  return (
    <>
      {/* 章节标题 */}
      {selectedNode?.title && (
        <h1 className="text-xl font-bold text-[var(--nv-text-primary)] text-center mb-6 mt-2 tracking-wide">
          {selectedNode.title}
        </h1>
      )}
      {/* AI 念书（语音朗读）：标题下方一键朗读本章正文 */}
      {content && (
        <div className="flex justify-center mb-5">
          {showTTS ? (
            <TTSPlayer text={content} title={selectedNode?.title ?? undefined} onClose={() => onShowTTSChange(false)} />
          ) : (
            <button
              onClick={() => onShowTTSChange(true)}
              className="flex items-center gap-1.5 h-8 px-3 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)] transition-colors"
              title="用浏览器语音朗读本章正文"
            >
              <Icon name="radio" size={13} /> 朗读本章
            </button>
          )}
        </div>
      )}
      {/* 固定色图例：角色 / 世界书各分类的标注色说明 */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mb-4 text-[10px] text-[var(--nv-text-tertiary)]">
        {ENTITY_LEGEND.map((it) => (
          <span key={it.key} className="inline-flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 rounded" style={{ backgroundColor: it.color }} aria-hidden="true" />
            {it.label}
          </span>
        ))}
      </div>
      {/* 章节实体彩色徽章：一眼看到本章涉及哪些角色 / 世界书 */}
      {chapterEntities.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
          {chapterEntities.map((e) => (
            <button
              key={e.id + "|" + e.name}
              onClick={() => onEntityClick(e.id, e.type)}
              className="text-[11px] px-2 py-0.5 rounded-full border transition-colors hover:brightness-125"
              style={{ color: e.color, borderColor: e.color + "59", backgroundColor: e.color + "1a" }}
              title={e.type === "character" ? "角色 · 点击查看 / 编辑" : "世界书 · 点击查看 / 编辑"}
            >
              {e.name}
            </button>
          ))}
        </div>
      )}
      <MarkdownViewer
        content={content}
        projectId={projectId}
        isStreaming={isStreaming}
        onEntityClick={onEntityClick}
      />
    </>
  );
});

export function CenterPanel({
  selectedNode, isGenerating, reviewResult,
  authorNote, onAuthorNoteChange, targetWordCount, onTargetWordCountChange,
  onWrite, onStop, onEditOutline, onGenerateChapterOutline, onDrawChapterOutline,
  projectId,
  refineMode, onToggleRefineMode, refineInstruction, onRefineInstructionChange, onRefine,
  chapterOutlinePrompt, onChapterOutlinePromptChange,
  genStep, genStepLabels, chapterOutlineStatus,
  onOpenGame,
  onBatchWrite,
  onEditCharacter, onEditLore,   todayWords = 0,
  loadProject,
  zen = false, onExitZen, onEnterZen,
  narrativeStage,
}: {
  selectedNode: StoryNodeData | null; isGenerating: boolean;
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
  onBatchWrite: () => void;
  genStep: string; genStepLabels: Record<string, { icon: React.ReactNode; label: string }>;
  chapterOutlineStatus: string;
  onEditCharacter?: (id: string) => void;
  onEditLore?: (id: string) => void;
  todayWords?: number;
  loadProject?: () => void | Promise<void>;
  zen?: boolean;
  onExitZen?: () => void;
  onEnterZen?: () => void;
  narrativeStage?: NarrativeStage | null;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  // v2.49：流式正文下沉到 useWriterStore，父组件（WorkspacePage）逐 token 不再重渲染，只这里局部更新
  const streamContent = useWriterStore((s) => s.generatedContent);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState("");
  const [outlineExpanded, setOutlineExpanded] = useState(false);
  // ── AI 念书（语音朗读）：标题下方「朗读本章」入口的展开态 ──
  const [showTTS, setShowTTS] = useState(false);

  // ── 正文内联编辑：点击「编辑正文」后页面外观不变，仅正文变为可编辑状态（无外框界面）──
  const [inlineEditing, setInlineEditing] = useState(false);
  const [inlineDraft, setInlineDraft] = useState("");
  const [savingInline, setSavingInline] = useState(false);
  const inlineRef = useRef<HTMLDivElement>(null);

  const startInlineEdit = () => {
    if (!selectedNode) return;
    setInlineDraft(displayContent);
    setInlineEditing(true);
  };
  const cancelInlineEdit = () => {
    setInlineEditing(false);
    setInlineDraft("");
  };
  const saveInlineEdit = async () => {
    if (!selectedNode || !inlineRef.current) return;
    const newContent = inlineRef.current.textContent ?? "";
    setSavingInline(true);
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: newContent,
          wordCount: newContent.length,
          editVersion: (selectedNode as any).editVersion,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toastSuccess("正文已保存");
      setInlineEditing(false);
      setInlineDraft("");
      if (loadProject) await loadProject();
    } catch (err: any) {
      toastError("保存失败：" + (err?.message || "请重试"));
    } finally {
      setSavingInline(false);
    }
  };

  // 进入编辑态时把原文写入 contentEditable（非受控，避免光标跳动）
  useEffect(() => {
    if (inlineEditing && inlineRef.current) {
      inlineRef.current.textContent = inlineDraft;
    }
  }, [inlineEditing]);

  useEffect(() => {
    if (contentRef.current && isGenerating) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent, isGenerating]);

  // v2.50.2 打字机滚动：专注模式下手动编辑正文时，把光标所在行滚动到视口中间
  useEffect(() => {
    if (!zen || !inlineEditing) return;
    const el = inlineRef.current;
    const sc = contentRef.current;
    if (!el || !sc) return;
    const scrollToCursor = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      const scRect = sc.getBoundingClientRect();
      const target = sc.scrollTop + (rect.top - scRect.top) - sc.clientHeight / 2 + 24;
      sc.scrollTo({ top: Math.max(0, target), behavior: "smooth" });
    };
    el.addEventListener("input", scrollToCursor);
    el.addEventListener("keyup", scrollToCursor);
    el.addEventListener("click", scrollToCursor);
    return () => {
      el.removeEventListener("input", scrollToCursor);
      el.removeEventListener("keyup", scrollToCursor);
      el.removeEventListener("click", scrollToCursor);
    };
  }, [zen, inlineEditing]);

  const displayContent = streamContent || selectedNode?.content || "";

  // 流式正文节流值：AI 逐 token 生成时合并到下一帧提交一次，喂给 StreamingBody / MarkdownViewer
  const throttledContent = useRafThrottledValue(displayContent, isGenerating);

  // 实体点击回调：稳定引用，避免 inline 箭头函数导致 StreamingBody memo 失效
  const handleEntityClick = useCallback(
    (id: string, type: "character" | "lorebook") => {
      if (type === "character") onEditCharacter?.(id);
      else onEditLore?.(id);
    },
    [onEditCharacter, onEditLore],
  );

  // 底部状态栏数据（字数沿用项目约定 = 字符数 content.length，随生成实时更新）
  const currentWords = displayContent.length;
  const lineCount = displayContent ? displayContent.split("\n").length : 0;
  const targetReached = targetWordCount > 0 && currentWords >= targetWordCount;
  const progressPct = targetWordCount > 0 ? Math.min(100, Math.round((currentWords / targetWordCount) * 100)) : 0;

  // 每日目标（与统计面板同源：localStorage nf-daily-goal-<projectId>）
  // 依赖 todayWords 触发重读：保存后目标即时同步，形成写作↔统计闭环
  const [dailyGoal, setDailyGoal] = useState(0);
  const dailyGoalKey = `nf-daily-goal-${projectId}`;
  useEffect(() => {
    const read = () => {
      const raw = typeof window !== "undefined" ? localStorage.getItem(dailyGoalKey) : null;
      const g = parseInt(raw || "0", 10);
      setDailyGoal(isNaN(g) ? 0 : g);
    };
    read();
    const onStorage = (e: StorageEvent) => { if (e.key === dailyGoalKey) read(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [dailyGoalKey, todayWords]);
  const dailyReached = dailyGoal > 0 && (todayWords || 0) >= dailyGoal;
  const dailyPct = dailyGoal > 0 ? Math.min(100, Math.round(((todayWords || 0) / dailyGoal) * 100)) : 0;

  // ── BE-1 版本历史抽屉 ──
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState<RevisionMeta[]>([]);
  const [revisionsLoading, setRevisionsLoading] = useState(false);
  const [previewRev, setPreviewRev] = useState<RevisionDetail | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [rollbacking, setRollbacking] = useState(false);

  type RevisionMeta = {
    id: string; version: number; wordCount: number;
    source: string; summary: string | null; createdAt: string;
  };
  type RevisionDetail = RevisionMeta & { content: string };

  const SOURCE_LABEL: Record<string, string> = {
    "ai-write": "AI 生成", "ai-rewrite": "AI 重写", "ai-polish": "AI 润色",
    manual: "手动保存", rollback: "回滚快照", "auto-fill": "自动填表", unknown: "未知",
  };

  const openRevisions = async () => {
    if (!selectedNode) return;
    setShowRevisions(true);
    setRevisionsLoading(true);
    setPreviewRev(null);
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}/revisions`);
      const data = await res.json();
      if (!res.ok) toastError(data.error || "获取版本历史失败");
      else setRevisions(data.revisions || []);
    } catch {
      toastError("网络错误");
    } finally {
      setRevisionsLoading(false);
    }
  };

  const previewRevision = async (revId: string) => {
    if (!selectedNode) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}/revisions/${revId}`);
      const data = await res.json();
      if (!res.ok) toastError(data.error || "获取版本失败");
      else setPreviewRev(data);
    } catch {
      toastError("网络错误");
    } finally {
      setPreviewLoading(false);
    }
  };

  const doRollback = async (revId: string) => {
    if (!selectedNode) return;
    if (!confirm("确定回滚到该版本？当前正文会先自动备份为可恢复快照。")) return;
    setRollbacking(true);
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}/rollback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: revId }),
      });
      const data = await res.json();
      if (!res.ok) toastError(data.error || "回滚失败");
      else {
        toastSuccess(`已回滚到第 ${data.rolledBackToVersion} 版 ✓`);
        setShowRevisions(false);
        if (loadProject) await loadProject();
      }
    } catch (err) {
      toastError("回滚失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setRollbacking(false);
    }
  };
  // 达成庆祝：每日仅一次，localStorage 去重，避免每次渲染重弹
  useEffect(() => {
    if (!dailyReached) return;
    const ck = `nf-daily-celebrated-${projectId}-${new Date().toISOString().slice(0, 10)}`;
    if (!localStorage.getItem(ck)) {
      localStorage.setItem(ck, "1");
      toastSuccess("今日目标达成 ✨ 继续保持节奏");
    }
  }, [dailyReached, projectId, todayWords]);

  // 章节实体彩色徽章：拉取项目实体（名→颜色→id），扫描本章正文匹配，点击跳详情
  const [projectEntities, setProjectEntities] = useState<Array<{
    id: string; name: string; type: "character" | "lorebook"; color: string; category?: string;
  }>>([]);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    fetch(`/api/entities/highlight?projectId=${encodeURIComponent(projectId)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d?.entities) setProjectEntities(d.entities); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  // 章节实体彩色徽章（chapterEntities）已下沉到 StreamingBody，随节流后的 content 计算。

  return (
    <>
    <main className="flex-1 flex flex-col overflow-hidden bg-[var(--nv-void)]">
      {/* F03：生成状态读屏实时播报——常驻 live region，避免可见 genStep 容器在流式（MarkdownViewer）分支不挂载时漏报；error 用 assertive，复用 toast 的 role=alert 模式 */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {genStep && genStep !== "error" ? genStepLabels[genStep]?.label : ""}
      </div>
      <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {genStep === "error" ? genStepLabels.error.label : ""}
      </div>
      {selectedNode ? (
        <>
          {/* 控制栏 / 专注顶栏 */}
          {zen ? (
            <div className="shrink-0 flex items-center justify-between border-b border-[var(--nv-border-2)] bg-[var(--nv-abyss)] px-4 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={onExitZen} title="退出专注（Ctrl/Cmd + .）" className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--nv-border-2)] px-2.5 text-xs text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] transition-colors">
                  <Icon name="x" size={13} /> 退出
                </button>
                <h2 className="text-sm font-medium truncate max-w-[50vw]">{selectedNode.title}</h2>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {inlineEditing ? (
                  <button onClick={saveInlineEdit} disabled={savingInline} className="flex h-7 items-center gap-1 rounded-lg border border-[var(--nv-success)]/50 text-[var(--nv-success)] bg-[var(--nv-success-soft)] px-2.5 text-xs hover:bg-[var(--nv-success)]/15 disabled:opacity-50"><Icon name="check" size={12} /> 完成</button>
                ) : (
                  <button onClick={startInlineEdit} className="flex h-7 items-center gap-1 rounded-lg border border-[var(--nv-border-2)] px-2.5 text-xs text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] transition-colors"><Icon name="pencil" size={12} /> 编辑</button>
                )}
                <span className="text-xs text-[var(--nv-text-tertiary)]">{currentWords.toLocaleString()} 字 · 目标 {targetWordCount}</span>
              </div>
            </div>
          ) : (
          <div className="border-b border-[var(--nv-border-2)] px-4 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">{selectedNode.title}</h2>
              <span className="text-xs text-[var(--nv-text-tertiary)] flex items-center gap-2 flex-wrap justify-end">
                {narrativeStage && (
                  <span className="flex items-center gap-1 rounded px-1.5 py-0.5 border border-[var(--nv-primary)]/30 bg-[var(--nv-primary)]/10 text-[var(--nv-primary)]" title="全书写作节奏阶段（基于本章在全书的进度自动推导，被动展示）">
                    <Icon name="compass" size={11} /> {narrativeStage.label} · {narrativeStage.percent}%
                  </span>
                )}
                {selectedNode.status === "completed" ? <span className="flex items-center gap-1"><Icon name="check" size={11} className="text-[var(--nv-success)]" /> 已完成</span> : selectedNode.status === "reviewing" ? <span className="flex items-center gap-1"><Icon name="alert" size={11} className="text-accent-label" /> 待修改</span> : <span className="flex items-center gap-1"><Icon name="pencil" size={11} /> 草稿</span>}{" "}
                · {selectedNode.wordCount || 0} 字
                <button onClick={openRevisions}
                  className="ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] transition-colors"
                  title="查看 / 回滚历史版本">
                  <Icon name="history" size={11} /> 历史
                </button>
              </span>
            </div>
            {/* 大纲编辑 */}
            <div className="mb-3 rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40 p-2.5">
              {editingOutline ? (
                <div className="flex gap-2">
                  <textarea className="input-glass flex-1 rounded-lg px-3 py-2 text-xs resize-none" rows={3}
                    value={outlineDraft} onChange={(e) => setOutlineDraft(e.target.value)} placeholder="输入本节点大纲…" />
                  <div className="flex flex-col gap-1">
                    <button onClick={() => { onEditOutline(outlineDraft); setEditingOutline(false); }} className="text-xs text-[var(--nv-success)] hover:text-[var(--nv-success)]/70 font-medium">保存</button>
                    <button onClick={() => setEditingOutline(false)} className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)]">取消</button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    {/* 章纲折叠按钮 */}
                    <button
                      type="button"
                      onClick={() => setOutlineExpanded((v) => !v)}
                      className={`shrink-0 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        selectedNode.outline
                          ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:bg-[var(--nv-primary)]/15"
                          : "bg-[var(--nv-surface-3)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-2)]"
                      }`}
                      title="展开 / 收起本章大纲"
                    >
                      <span className="text-[10px] leading-none">{outlineExpanded ? "▾" : "▸"}</span>
                      <Icon name="book" size={12} />
                      章纲{selectedNode.outline ? "·已设" : "·未设"}
                    </button>

                    {/* 章纲操作 */}
                    {!isGenerating && (
                      <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                        {chapterOutlineStatus === "generating" ? (
                          <span className="text-[10px] text-[var(--nv-primary)] animate-pulse px-2 py-1 flex items-center gap-1 rounded-lg bg-[var(--nv-primary-soft)]"><Icon name="loader" size={10} className="animate-spin" /> 章纲生成中…</span>
                        ) : chapterOutlineStatus === "done" ? (
                          <span className="text-[10px] text-[var(--nv-success)] font-medium px-2 py-1 flex items-center gap-1 rounded-lg bg-[var(--nv-success)]/10"><Icon name="check" size={10} /> 章纲完成</span>
                        ) : chapterOutlineStatus === "error" ? (
                          <span className="text-[10px] text-[var(--nv-danger)] px-2 py-1 flex items-center gap-1 rounded-lg bg-[var(--nv-danger-soft)]"><Icon name="x" size={10} /> 章纲失败</span>
                        ) : (
                          <>
                            <input value={chapterOutlinePrompt} onChange={(e) => onChapterOutlinePromptChange(e.target.value)}
                              placeholder="预览提示词（留空自动）"
                              className="input-glass w-36 rounded-lg px-2 py-1 text-[10px] focus:border-[var(--nv-primary)]" />
                            <button onClick={() => onGenerateChapterOutline(chapterOutlinePrompt)}
                              className="flex items-center gap-1 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-2 py-1 text-[10px] text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
                              title="快速预览——轻量生成本章草稿章纲，不绑定角色、可随时重生成，仅作写作前的快速参考（正式大纲请用「抽卡分镜」）"><Icon name="sparkles" size={10} /> 快速预览</button>
                            <button onClick={onDrawChapterOutline}
                              className="flex items-center gap-1 rounded-lg border border-[var(--nv-primary)]/40 bg-[var(--nv-primary-soft)] px-2 py-1 text-[10px] font-medium text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary)]/15"
                              title="正式 Outline——并行抽 3-5 条不同路线并自动选角，采用后写入带角色/剧情的正式章纲"><Icon name="grid" size={12} /> 抽卡分镜</button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                  {/* 展开时显示大纲文本（点击进入编辑） */}
                  {outlineExpanded && (
                    <div
                      onClick={() => { setOutlineDraft(selectedNode.outline || ""); setEditingOutline(true); }}
                      className="cursor-pointer rounded-lg border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] px-3 py-2 text-xs leading-relaxed text-[var(--nv-text-secondary)] hover:border-[var(--nv-primary)]/40 hover:text-[var(--nv-text-primary)] transition-colors"
                    >
                      {selectedNode.outline ? (
                        <span className="line-clamp-4">{selectedNode.outline}</span>
                      ) : (
                        <span className="italic text-[var(--nv-text-tertiary)]">点击设置本节点大纲…</span>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* 生成控制 */}
            <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)]/40 p-2.5 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isGenerating ? (
                  <Button size="sm" onClick={onStop} className="btn-danger h-8 text-xs rounded-lg"><Icon name="stop" size={11} /> 停止生成</Button>
                ) : (
                  <>
                    {!refineMode && (
                      <Button size="sm" onClick={onWrite} className="btn-primary h-8 text-xs rounded-lg"><Icon name="pencil" size={11} /> 生成/重写</Button>
                    )}
                    {refineMode && (
                      <Button size="sm" onClick={onRefine} className="btn-ghost h-8 text-xs flex items-center gap-1 rounded-lg text-[var(--nv-accent)] border-[var(--nv-accent)]/40"><Icon name="wrench" size={11} /> 微调</Button>
                    )}
                    <button onClick={onToggleRefineMode}
                      className={`flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border transition-colors ${refineMode ? "border-[var(--nv-accent)]/50 text-[var(--nv-accent)] bg-[var(--nv-accent-soft)] hover:bg-[var(--nv-accent)]/20" : "border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)]"}`}
                      title={refineMode ? "切换到生成模式" : "切换到微调模式"}>
                      <Icon name="wrench" size={11} /> {refineMode ? "微调中" : "微调"}
                    </button>
                    {!isGenerating && (
                      <button onClick={onBatchWrite}
                        className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-primary)]/40 text-[var(--nv-primary)] bg-[var(--nv-primary-soft)] hover:bg-[var(--nv-primary)]/15 transition-colors"
                        title="批量写作：后台连续生成 1-10 个新章节（自动写章名），可关窗口查看进度">
                        <Icon name="pencil" size={12} /> 批量写作
                      </button>
                    )}
                    {!isGenerating && (
                      <button onClick={onOpenGame}
                        className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)] transition-colors"
                        title="进入游戏模式：以互动叙事方式探索本章">
                        <Icon name="gamepad" size={12} /> 游戏模式
                      </button>
                    )}
                    {!isGenerating && !inlineEditing && (
                      <button onClick={startInlineEdit}
                        className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)] transition-colors"
                        title="编辑正文：页面不变，仅正文变为可直接修改的可编辑状态">
                        <Icon name="pencil" size={12} /> 编辑正文
                      </button>
                    )}
                    {!isGenerating && (
                      <button onClick={onEnterZen}
                        className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)] transition-colors"
                        title="进入专注写作模式：隐藏侧栏工具栏，只留正文，支持打字机滚动（Ctrl/Cmd + .）">
                        <Icon name="target" size={12} /> 专注
                      </button>
                    )}
                    {inlineEditing && (
                      <>
                        <button onClick={saveInlineEdit} disabled={savingInline}
                          className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-success)]/50 text-[var(--nv-success)] bg-[var(--nv-success-soft)] hover:bg-[var(--nv-success)]/15 transition-colors disabled:opacity-50">
                          <Icon name="check" size={12} /> {savingInline ? "保存中…" : "完成"}
                        </button>
                        <button onClick={cancelInlineEdit}
                          className="flex items-center gap-1 h-8 px-2.5 text-xs rounded-lg border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] hover:border-[var(--nv-border-3)] hover:bg-[var(--nv-surface-1)] transition-colors">
                          <Icon name="x" size={12} /> 取消
                        </button>
                      </>
                    )}
                  </>
                )}
                <div className="flex items-center gap-1 ml-auto">
                  <input type="number" value={targetWordCount} onChange={(e) => onTargetWordCountChange(parseInt(e.target.value) || 3000)}
                    className="input-glass w-16 h-8 rounded-lg px-2 text-xs text-center" title="目标字数" aria-label="目标字数" />
                  <span className="text-xs text-[var(--nv-text-tertiary)]">字</span>
                </div>
              </div>
              <input placeholder={refineMode ? "微调指令（改对话/加描写/续写500字）…" : "作者指令（高优先级）…"}
                value={refineMode ? refineInstruction : authorNote}
                onChange={(e) => refineMode ? onRefineInstructionChange(e.target.value) : onAuthorNoteChange(e.target.value)}
                className="input-glass w-full rounded-lg px-3 py-2 text-xs" />
              {refineMode && !isGenerating && (
                <p className="text-[10px] text-accent-label">微调模式：不重写正文，按指令修改现有内容或续写补长。字数不够会自动补，中途打断可续写。</p>
              )}
            </div>
          </div>
          )}
          {/* 正文显示区 */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 py-4">
            {displayContent ? (
              <div className="max-w-[700px] mx-auto">
                {inlineEditing ? (
                  // 内联编辑态：无外框，页面其余完全不变，仅正文变为可直接修改的可编辑区
                  <div
                    ref={inlineRef}
                    contentEditable
                    suppressContentEditableWarning
                    spellCheck={false}
                    className="max-w-[700px] mx-auto text-[15px] leading-relaxed text-[var(--nv-text-secondary)] whitespace-pre-wrap break-words outline-none rounded-lg px-2 -mx-2 min-h-[70vh] focus:bg-[var(--nv-surface-1)]/40"
                  />
                ) : (
                  <StreamingBody
                    content={throttledContent}
                    selectedNode={selectedNode}
                    projectId={projectId}
                    isStreaming={isGenerating}
                    onEntityClick={handleEntityClick}
                    showTTS={showTTS}
                    onShowTTSChange={setShowTTS}
                    projectEntities={projectEntities}
                  />
                )}
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
                        <span className={genStep === "generating" ? "animate-pulse" : ""}>{genStepLabels[genStep]?.label || "处理中…"}</span>
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
                    {isGenerating && !genStep && <span className="animate-pulse">生成中…</span>}
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
              {dailyGoal > 0 && (
                <span
                  className={
                    dailyReached
                      ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--nv-success)] bg-[var(--nv-success)]/10 animate-pulse"
                      : "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]"
                  }
                  title="每日目标进度（与统计面板同源，保存后同步）"
                >
                  <Icon name="target" size={11} /> 今日 {Math.round(todayWords || 0).toLocaleString()} / {dailyGoal.toLocaleString()} · {dailyPct}%
                </span>
              )}
              <span className={targetReached ? "text-[var(--nv-success)]" : "text-[var(--nv-text-secondary)]"}>
                目标 {targetWordCount} 字 · {progressPct}%
              </span>
            </div>
            <span className="flex items-center gap-2">
              {!zen && genStep === "generating" && (
                <span className="inline-flex items-center gap-1 text-[var(--nv-primary)]"><Icon name="loader" size={11} className="animate-spin" /> 草稿保存中…</span>
              )}
              {!zen && genStep === "done" && (
                <span className="inline-flex items-center gap-1 text-[var(--nv-success)]"><Icon name="check" size={11} /> 已落库 <Icon name="check" size={15} className="inline-block align-text-bottom shrink-0" />{selectedNode?.wordCount ? ` · 本章 ${selectedNode.wordCount} 字` : ""}</span>
              )}
              <span className="flex items-center gap-1"><Icon name="file" size={11} /> UTF-8</span>
            </span>
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

    {/* BE-1 版本历史抽屉 */}
    {showRevisions && selectedNode && (
      <Modal open={showRevisions} onClose={() => setShowRevisions(false)} bare
        panelClassName="w-[760px] max-w-[94vw] max-h-[88vh] flex flex-col"
        closeOnOverlay={false}
        labelledBy="revisions-modal-title">
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--nv-border-2)] shrink-0">
          <div className="flex items-center gap-2">
            <Icon name="history" size={16} className="text-[var(--nv-primary)]" />
            <h3 id="revisions-modal-title" className="text-sm font-semibold text-[var(--nv-text-primary)]">历史版本 · {selectedNode.title}</h3>
          </div>
          <button onClick={() => setShowRevisions(false)} aria-label="关闭"
            className="rounded-lg p-1.5 text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] transition-colors">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex flex-1 min-h-0">
          {/* 左：版本列表 */}
          <div className="w-56 shrink-0 border-r border-[var(--nv-border-2)] overflow-y-auto custom-scrollbar p-2 space-y-1.5">
            {revisionsLoading ? (
              <p className="text-xs text-[var(--nv-text-tertiary)] px-2 py-3 flex items-center gap-1.5">
                <Icon name="loader" size={12} className="animate-spin" /> 加载中…
              </p>
            ) : revisions.length === 0 ? (
              <p className="text-xs text-[var(--nv-text-tertiary)] px-2 py-3 leading-relaxed">
                暂无历史版本。<br />AI 生成 / 重写或手动保存正文时会自动留档。
              </p>
            ) : (
              revisions.map((r) => (
                <button key={r.id} onClick={() => previewRevision(r.id)}
                  className={`w-full text-left rounded-lg px-2.5 py-2 transition-colors border ${
                    previewRev?.id === r.id
                      ? "bg-[var(--nv-primary-soft)] border-[var(--nv-primary)]/40"
                      : "border-transparent hover:bg-[var(--nv-surface-2)]"
                  }`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[var(--nv-text-primary)]">第 {r.version} 版</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--nv-surface-2)] text-[var(--nv-text-tertiary)]">
                      {SOURCE_LABEL[r.source] || "未知"}
                    </span>
                  </div>
                  <div className="text-[10px] text-[var(--nv-text-tertiary)] mt-1">
                    {r.wordCount} 字 · {new Date(r.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </button>
              ))
            )}
          </div>
          {/* 右：预览 + 回滚 */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4">
              {previewLoading ? (
                <p className="text-xs text-[var(--nv-text-tertiary)] flex items-center gap-1.5">
                  <Icon name="loader" size={12} className="animate-spin" /> 加载版本内容…
                </p>
              ) : previewRev ? (
                <div>
                  <div className="flex items-center gap-2 mb-3 text-xs text-[var(--nv-text-tertiary)]">
                    <span className="px-1.5 py-0.5 rounded-full bg-[var(--nv-surface-2)]">第 {previewRev.version} 版</span>
                    <span>{SOURCE_LABEL[previewRev.source] || "未知"}</span>
                    <span>· {previewRev.wordCount} 字</span>
                    <span>· {new Date(previewRev.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}</span>
                  </div>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--nv-text-secondary)] max-w-[640px]">
                    {previewRev.content}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--nv-text-tertiary)]">从左侧选择一版查看内容预览。</p>
              )}
            </div>
            {previewRev && (
              <div className="shrink-0 border-t border-[var(--nv-border-2)] px-5 py-3 flex justify-end">
                <button onClick={() => doRollback(previewRev.id)} disabled={rollbacking}
                  className="text-xs px-3 py-1.5 rounded-lg bg-[var(--nv-primary)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity inline-flex items-center gap-1.5">
                  {rollbacking ? <><Icon name="loader" size={12} className="animate-spin" /> 回滚中…</> : <><Icon name="history" size={12} /> 回滚到此版本</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}
