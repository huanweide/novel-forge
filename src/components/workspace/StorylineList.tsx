"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { toastError, toastCreated } from "@/components/ui/toast";
import { StorylineWorkbench, type StorylineSuggestion } from "@/components/workspace/StorylineWorkbench";
import { computeStorylineProgress, groupStorylinesByMain } from "@/lib/storyline-progress";

const UNKNOWN_ERROR = "请求失败，请稍后重试";

export interface StorylineEventData {
  id: string;
  kind: "MILESTONE" | "EVENT" | "CLUE";
  tag: string;
  title: string;
  content: string;
  position: number;
  sourceRefs: unknown[];
}

export interface StorylineData {
  id: string;
  projectId: string;
  type: "main" | "side";
  parentId?: string | null;
  title: string;
  order: number;
  status: string;
  description: string;
  sevenElements: {
    desire?: string;
    obstacle?: string;
    action?: string;
    result?: string;
    twist?: string;
    turn?: string;
    ending?: string | null;
  } | null;
  events: StorylineEventData[];
}

export function StorylineList({ projectId, onRefresh, onWriteChapter }: { projectId: string; onRefresh: () => void; onWriteChapter?: (storylineId?: string) => void }) {
  const [storylines, setStorylines] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [workbenchId, setWorkbenchId] = useState<string | null>(null); // v1.8 居中工作台
  const [genSuggestions, setGenSuggestions] = useState<StorylineSuggestion[] | null>(null); // AI 生成中间态草稿（保留，向后兼容）
  const [genTaskId, setGenTaskId] = useState<string | null>(null); // v1.8.7：统一真后台任务 ID
  const [expandedMains, setExpandedMains] = useState<Set<string>>(new Set()); // 支线默认收起
  const generatingRef = useRef(false); // IMP-011：防止连点创建多个游离生成任务

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/storylines?projectId=${projectId}`);
      if (res.ok) setStorylines(await res.json());
      else {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
        setLoadError((d as { error?: string }).error || `加载失败（HTTP ${res.status}）`);
      }
    } catch (err) {
      setLoadError("加载故事线失败：" + (err instanceof Error ? err.message : "网络错误，请稍后重试"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleGenerate = async () => {
    // IMP-011：连点锁——任务创建是异步的，批处理窗口内连点会创建多个游离任务
    if (generatingRef.current) return;
    generatingRef.current = true;
    setGenerating(true);
    try {
      // v1.8.7：收敛为统一真后台异步路径（与工作台内 AI 生成一致），不再走同步 generate
      const res = await fetch("/api/generation-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(`创建生成任务失败：${data.error ?? UNKNOWN_ERROR}`);
        return;
      }
      if (typeof data.taskId === "string" && data.taskId.length > 0) {
        setGenTaskId(data.taskId);
        setWorkbenchId("__task__"); // 占位，打开工作台并由其挂载即轮询
      } else {
        toastError("创建生成任务失败：未返回任务 ID");
      }
    } catch (err) {
      toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`);
    } finally {
      setGenerating(false);
      generatingRef.current = false;
    }
  };

  const toggleExpand = (mainId: string) => {
    setExpandedMains((prev) => {
      const next = new Set(prev);
      if (next.has(mainId)) next.delete(mainId);
      else next.add(mainId);
      return next;
    });
  };

  const { mains: mainLines, sides: sideLines, resolveParent } = groupStorylinesByMain(storylines);

  if (loading) return <div className="py-4 text-center text-xs text-[var(--nv-text-tertiary)]">加载中…</div>;

  return (
    <div className="space-y-2 p-1">
      {/* 工具栏 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-[var(--nv-text-tertiary)]">{storylines.length} 条故事线</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1 rounded bg-[var(--nv-creative-fill)] px-2 py-1 text-[10px] text-[#F0EEE8] transition-colors hover:opacity-90 disabled:opacity-50"
            title="AI 自动生成主线/支线（生成后可在工作台编辑再落库）"
          >
            {generating ? (
              <>
                <Icon name="loader" size={11} className="animate-spin" /> 生成中…
              </>
            ) : (
              <>
                <Icon name="bot" size={11} /> AI 生成
              </>
            )}
          </button>
        </div>
      </div>

      {loadError && !loading && (
        <div className="px-4 py-6 text-center text-xs text-[var(--nv-danger)]">
          <p className="mb-2">{loadError}</p>
          <button onClick={() => void load()} className="text-[10px] text-[var(--nv-text-primary)] hover:underline">
            重试
          </button>
        </div>
      )}

      {storylines.length === 0 && !loading && !loadError && (
        <EmptyState
          icon="bookmarked"
          title="还没有故事线"
          description="让 AI 基于你的大纲自动规划主线与支线，填充七要素框架"
          action={
            <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-[11px]">
              {generating ? "AI 生成中…" : "点击 AI 自动生成"}
            </button>
          }
        />
      )}

      {/* 主线 + 支线列表（左栏快速导航；点击 → 居中工作台查看/编辑/时间轴） */}
      {storylines.length > 0 && (
        <div className="space-y-1.5">
          {mainLines.map((mainLine) => {
            const childLines = sideLines.filter((s) => resolveParent(s)?.id === mainLine.id);
            const expanded = expandedMains.has(mainLine.id);
            const p = computeStorylineProgress(mainLine);
            return (
              <div key={mainLine.id} className="overflow-hidden rounded-lg border border-[var(--nv-accent)]/30 bg-[var(--nv-accent-soft)]">
                <div className="flex w-full items-center gap-1 px-2 py-1.5">
                  <button
                    onClick={() => setWorkbenchId(mainLine.id)}
                    className="flex flex-1 items-center gap-1 text-left transition-colors hover:bg-[var(--nv-accent)]/10"
                  >
                    <Icon name="star" size={11} className="shrink-0 text-[var(--nv-accent)]" />
                    <span className="flex-1 truncate text-xs font-medium text-[var(--nv-accent)]">{mainLine.title}</span>
                    {mainLine.status === "completed" && (
                      <span className="rounded bg-[var(--nv-success)]/15 px-1 text-[9px] text-[var(--nv-success)]">已完结</span>
                    )}
                  </button>
                  {/* 支线收起/展开（默认收起） */}
                  {childLines.length > 0 && (
                    <button
                      onClick={() => toggleExpand(mainLine.id)}
                      className="shrink-0 rounded px-1 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-accent)]"
                      title={expanded ? "收起支线" : `展开 ${childLines.length} 条支线`}
                    >
                      <Icon name={expanded ? "chevronDown" : "chevronRight"} size={12} />
                    </button>
                  )}
                </div>
                <div className="px-2 pb-1.5">
                  <div className="flex items-center justify-between text-[9px] text-[var(--nv-text-tertiary)]">
                    <span>故事线进度</span>
                    <span>{p.overallPercent}%</span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
                    <div className="h-full rounded-full" style={{ width: `${p.overallPercent}%`, background: "var(--nv-accent)" }} />
                  </div>
                </div>
                {expanded && childLines.length > 0 && (
                  <div className="space-y-1 px-2 pb-1.5">
                    {childLines.map((s) => {
                      const cp = computeStorylineProgress(s);
                      return (
                        <button
                          key={s.id}
                          onClick={() => setWorkbenchId(s.id)}
                          className="flex w-full items-center gap-1 rounded px-1.5 py-1 text-left transition-colors hover:bg-[var(--nv-surface-2)]"
                        >
                          <Icon name="arrowRight" size={10} className="shrink-0 text-[var(--nv-accent)]/70" />
                          <span className="flex-1 truncate text-[10px] text-[var(--nv-text-primary)]">{s.title}</span>
                          <span className="text-[9px] text-[var(--nv-text-tertiary)]">{cp.overallPercent}%</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* 无父支线 */}
          {sideLines
            .filter((s) => !resolveParent(s))
            .map((s) => {
              const cp = computeStorylineProgress(s);
              return (
                <button
                  key={s.id}
                  onClick={() => setWorkbenchId(s.id)}
                  className="flex w-full items-center gap-1 rounded-lg border border-[var(--nv-border-2)] px-2 py-1.5 text-left transition-colors hover:bg-[var(--nv-surface-2)]"
                >
                  <Icon name="arrowRight" size={11} className="shrink-0 text-[var(--nv-text-tertiary)]" />
                  <span className="flex-1 truncate text-xs text-[var(--nv-text-primary)]">{s.title}</span>
                  <span className="text-[9px] text-[var(--nv-text-tertiary)]">{cp.overallPercent}%</span>
                </button>
              );
            })}
        </div>
      )}

      {/* v1.8 居中工作台（点击列表项打开；AI 生成进入中间态） */}
      {workbenchId && (
        <StorylineWorkbench
          projectId={projectId}
          initialId={workbenchId === "__task__" ? null : workbenchId}
          initialTaskId={genTaskId ?? undefined}
          onClose={() => {
            setWorkbenchId(null);
            setGenSuggestions(null);
            // IMP-010：保留 genTaskId，关闭仅卸载 UI；重开工作台若仍有未完成任务则自动恢复轮询
          }}
          onTaskSettled={() => setGenTaskId(null)}
          onRefresh={() => {
            void load();
            onRefresh();
          }}
          onWriteChapter={onWriteChapter}
        />
      )}
    </div>
  );
}
