"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/States";
import { toastError, toastSuccess, toastCreated } from "@/components/ui/toast";
import { StorylineDetail, type StorylineData } from "./StorylineList";

// v1.6.0 故事线全屏弹窗：展示全部主线/支线完整过程（七要素 + 章节进展时间轴），支持一键打勾完结、AI 生成
export function StorylinesModal({
  projectId,
  onClose,
  onRefresh,
}: {
  projectId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [storylines, setStorylines] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true); setLoadError(null);
    try {
      const res = await fetch(`/api/storylines?projectId=${projectId}`);
      if (res.ok) setStorylines(await res.json());
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); setLoadError(d.error || `加载失败（HTTP ${res.status}）`); }
    } catch (err) {
      setLoadError("加载故事线失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [projectId]);

  const handleToggleComplete = async (s: StorylineData) => {
    const next = s.status === "completed" ? "active" : "completed";
    try {
      const res = await fetch(`/api/storylines/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("状态更新失败：" + (d.error || `HTTP ${res.status}`)); return; }
      toastSuccess(next === "completed" ? `「${s.title}」已完结 ✓（主线完结将自动缝合新主线）` : `「${s.title}」已重新开启`);
      void load();
      onRefresh();
    } catch (err) { toastError("状态更新失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/storylines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) { toastError(`生成失败：${data.error}`); return; }
      setStorylines(data.storylines);
      const mainTitle = (data.storylines as StorylineData[] | undefined)?.find((s) => s.type === "main")?.title || "故事线";
      toastCreated(mainTitle, "故事线");
      onRefresh();
    } catch (err) { toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`); }
    finally { setGenerating(false); }
  };

  const mainLine = storylines.find((s) => s.type === "main");
  const sideLines = storylines.filter((s) => s.type === "side");
  const toggle = (id: string) => setExpandedId(expandedId === id ? null : id);

  return (
    <Modal open onClose={onClose} bare panelClassName="max-h-[88vh] w-full max-w-3xl overflow-y-auto" labelledBy="storylines-modal-title">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id="storylines-modal-title" className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]">
            <Icon name="bookmarked" size={18} className="text-[var(--nv-accent)]" /> 故事线总览
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-1 rounded border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)] px-2.5 py-1 text-xs text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-creative)]/20 disabled:opacity-50"
            >
              {generating ? <><Icon name="loader" size={12} className="animate-spin" /> 生成中...</> : <><Icon name="bot" size={12} /> AI 生成</>}
            </button>
            <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="关闭"><Icon name="x" size={18} /></button>
          </div>
        </div>

        {loading && <div className="py-10 text-center text-xs text-[var(--nv-text-tertiary)]">加载中...</div>}
        {loadError && !loading && (
          <div className="py-8 text-center text-xs text-[var(--nv-danger)]">
            <p className="mb-2">{loadError}</p>
            <button onClick={() => void load()} className="text-[var(--nv-primary)]">重试</button>
          </div>
        )}

        {!loading && !loadError && storylines.length === 0 && (
          <EmptyState
            icon="bookmarked"
            title="还没有故事线"
            action={
              <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-xs">
                {generating ? "AI 生成中..." : "点击 AI 自动生成"}
              </button>
            }
          />
        )}

        {!loading && !loadError && storylines.length > 0 && (
          <div className="space-y-3">
            {mainLine && (
              <div className="overflow-hidden rounded-xl border border-[var(--nv-accent)]/30 bg-[var(--nv-accent-soft)]">
                <div className="flex items-center gap-2 bg-[var(--nv-accent-soft)] px-3 py-2">
                  <Icon name="star" size={13} className="text-[var(--nv-accent)]" />
                  <span className="flex-1 truncate text-sm font-medium text-[var(--nv-accent)]">主线 · {mainLine.title}</span>
                  <button
                    onClick={() => handleToggleComplete(mainLine)}
                    className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-accent)]"
                    title={mainLine.status === "completed" ? "已完结——点击重新开启" : "点击打勾标记完成（主线完成后自动缝合新主线）"}
                  >
                    {mainLine.status === "completed" ? <span className="flex items-center gap-1 text-[var(--nv-success)]"><Icon name="check" size={13} /> 已完结</span> : <Icon name="circle" size={13} />}
                  </button>
                </div>
                <div className="px-2">
                  <StorylineDetail storyline={mainLine} expanded={expandedId === mainLine.id}
                    onToggle={() => toggle(mainLine.id)}
                    onEdit={() => { /* 左栏 tab 内可编辑，全屏弹窗保持简洁 */ }}
                    onDelete={() => { /* 删除走左栏 tab */ }} deletingId={null} />
                </div>
              </div>
            )}
            {sideLines.map((s) => (
              <div key={s.id} className="overflow-hidden rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]">
                <div className="flex items-center gap-2 px-3 py-2">
                  <Icon name="arrowRight" size={12} className="text-[var(--nv-text-tertiary)]" />
                  <span className="flex-1 truncate text-sm text-[var(--nv-text-primary)]">支线 · {s.title}</span>
                  <button
                    onClick={() => handleToggleComplete(s)}
                    className="text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-accent)]"
                    title={s.status === "completed" ? "已完结——点击重新开启" : "点击打勾标记完成"}
                  >
                    {s.status === "completed" ? <span className="flex items-center gap-1 text-[var(--nv-success)]"><Icon name="check" size={13} /> 已完结</span> : <Icon name="circle" size={13} />}
                  </button>
                </div>
                <div className="px-2">
                  <StorylineDetail storyline={s} expanded={expandedId === s.id}
                    onToggle={() => toggle(s.id)}
                    onEdit={() => { }} onDelete={() => { }} deletingId={null} />
                </div>
              </div>
            ))}
            <p className="pt-1 text-center text-[10px] text-[var(--nv-text-tertiary)]">
              每条故事线记录欲望 → 结局的完整过程与章节进展（只记大事件）；主线/支线完结打勾后不再详细续写，主线完结会自动缝合新主线。
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
