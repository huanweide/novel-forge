"use client";

import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { toastError, toastCreated } from "@/components/ui/toast";
import { StorylineWorkbench } from "@/components/workspace/StorylineWorkbench";
import { computeStorylineProgress, groupStorylinesByMain } from "@/lib/storyline-progress";

export interface StorylineData {
  id: string;
  projectId: string;
  type: "main" | "side";
  parentId?: string | null;
  title: string;
  order: number;
  status: string;
  description: string;
  desire: string;
  obstacle: string;
  action: string;
  result: string;
  twist: string;
  turn: string;
  ending: string;
  chapterBindings: { element: string; chapterId: string; note: string }[];
}

export function StorylineList({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
  const [storylines, setStorylines] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [workbenchId, setWorkbenchId] = useState<string | null>(null); // v1.8 居中工作台

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/storylines?projectId=${projectId}`);
      if (res.ok) setStorylines(await res.json());
      else {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
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
    setGenerating(true);
    try {
      const res = await fetch("/api/storylines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(`生成失败：${data.error}`);
        return;
      }
      setStorylines(data.storylines);
      const mainTitle = (data.storylines as StorylineData[] | undefined)?.find((s) => s.type === "main")?.title || "故事线";
      toastCreated(mainTitle, "故事线");
      onRefresh();
    } catch (err) {
      toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`);
    } finally {
      setGenerating(false);
    }
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
            className="flex items-center gap-1 rounded border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)] px-2 py-1 text-[10px] text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-creative-soft)] disabled:opacity-50"
            title="AI 自动生成主线/支线"
          >
            {generating ? (
              <>
                <Icon name="loader" size={11} className="animate-spin" /> 生成中…
              </>
            ) : (
              <>
                <Icon name="bot" size={11} /> AI生成
              </>
            )}
          </button>
        </div>
      </div>

      {loadError && !loading && (
        <div className="px-4 py-6 text-center text-xs text-[var(--nv-danger)]">
          <p className="mb-2">{loadError}</p>
          <button onClick={() => void load()} className="text-[10px] text-[var(--nv-primary)] hover:text-[var(--nv-creative)]">
            重试
          </button>
        </div>
      )}

      {storylines.length === 0 && !loading && !loadError && (
        <EmptyState
          icon="bookmarked"
          title="还没有故事线"
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
            const p = computeStorylineProgress(mainLine);
            return (
              <div key={mainLine.id} className="overflow-hidden rounded-lg border border-[var(--nv-accent)]/30 bg-[var(--nv-accent-soft)]">
                <button
                  onClick={() => {
                    setWorkbenchId(mainLine.id);
                  }}
                  className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-[var(--nv-accent)]/10"
                >
                  <Icon name="star" size={11} className="shrink-0 text-[var(--nv-accent)]" />
                  <span className="flex-1 truncate text-xs font-medium text-[var(--nv-accent)]">{mainLine.title}</span>
                  {mainLine.status === "completed" && (
                    <span className="rounded bg-[var(--nv-success)]/15 px-1 text-[9px] text-[var(--nv-success)]">已完结</span>
                  )}
                  <Icon name="chevronRight" size={11} className="shrink-0 text-[var(--nv-text-tertiary)]" />
                </button>
                <div className="px-2 pb-1.5">
                  <div className="flex items-center justify-between text-[9px] text-[var(--nv-text-tertiary)]">
                    <span>主线进度</span>
                    <span>{p.overallPercent}%</span>
                  </div>
                  <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
                    <div className="h-full rounded-full" style={{ width: `${p.overallPercent}%`, background: "var(--nv-accent)" }} />
                  </div>
                </div>
                {childLines.length > 0 && (
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
                          <Icon name="chevronRight" size={10} className="shrink-0 text-[var(--nv-text-tertiary)]" />
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
            .filter((s) => !resolveParent(s) || resolveParent(s)?.id === s.id)
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
                  <Icon name="chevronRight" size={11} className="shrink-0 text-[var(--nv-text-tertiary)]" />
                </button>
              );
            })}
        </div>
      )}

      {/* v1.8 居中工作台（点击列表项打开） */}
      {workbenchId && (
        <StorylineWorkbench
          projectId={projectId}
          initialId={workbenchId}
          onClose={() => setWorkbenchId(null)}
          onRefresh={() => {
            void load();
            onRefresh();
          }}
        />
      )}
    </div>
  );
}
