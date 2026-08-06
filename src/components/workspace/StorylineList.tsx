"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import { Collapse } from "@/components/ui/collapse";
import { EmptyState } from "@/components/ui/States";
import { confirmDialog, toastError, toastSuccess, toastInfo, toastCreated } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { StorylinesModal } from "@/components/workspace/StorylinesModal";

export interface StorylineData {
  id: string; projectId: string;
  type: "main" | "side"; parentId?: string | null;
  title: string; order: number; status: string; description: string;
  desire: string; obstacle: string; action: string; result: string;
  twist: string; turn: string; ending: string;
  chapterBindings: { element: string; chapterId: string; note: string }[];
}

const ELEMENT_LABELS: Record<string, { icon: IconName; label: string }> = {
  desire: { icon: "gem", label: "欲望" },
  obstacle: { icon: "shield", label: "阻碍" },
  action: { icon: "sword", label: "行动" },
  result: { icon: "chart", label: "结果" },
  twist: { icon: "sparkles", label: "意外" },
  turn: { icon: "arrowRight", label: "转折" },
  ending: { icon: "check", label: "结局" },
};

export function StorylineList({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
  const [storylines, setStorylines] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StorylineData>>({});
  const [showFull, setShowFull] = useState(false); // v1.6.0 全屏故事线总览


  const load = async (signal?: AbortSignal) => {
    setLoading(true); setLoadError(null);
    try {
      const res = await fetch(`/api/storylines?projectId=${projectId}`, { signal });
      if (res.ok) setStorylines(await res.json());
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); setLoadError(d.error || `加载失败（HTTP ${res.status}）`); }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("加载故事线失败:", err);
      setLoadError("加载故事线失败：" + (err instanceof Error ? err.message : "网络错误，请稍后重试"));
    }
    finally { setLoading(false); }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [projectId]);

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

  const handleSave = async (id: string) => {
    try {
      const res = await fetch(`/api/storylines/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("故事线保存失败：" + (d.error || `HTTP ${res.status}`)); return; }
      setEditingId(null);
      load();
    } catch (err) { toastError("故事线保存失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  // v1.5.0 一键完成打勾：卡片上点击状态图标在「活跃 ↔ 已完结」间切换（PUT status）
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
      load();
      onRefresh();
    } catch (err) { toastError("状态更新失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  const { deletingId, remove: deleteStoryline } = useConfirmDelete({
    title: "删除故事线",
    description: "确定删除这条故事线？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/storylines/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); }
    },
    onSuccess: () => load(),
    errorPrefix: "删除失败",
  });

  const startEdit = (s: StorylineData) => {
    setEditingId(s.id);
    setEditForm({ title: s.title, description: s.description, desire: s.desire, obstacle: s.obstacle, action: s.action, result: s.result, twist: s.twist, turn: s.turn, ending: s.ending, status: s.status });
  };

  const updateField = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const mainLine = storylines.find(s => s.type === "main");
  const sideLines = storylines.filter(s => s.type === "side");

  if (loading) return <div className="py-4 text-center text-xs text-[var(--nv-text-tertiary)]">加载中...</div>;

  return (
    <div className="space-y-2 p-1">
      {/* 工具栏 */}
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] text-[var(--nv-text-tertiary)]">{storylines.length} 条故事线</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowFull(true)}
            className="flex items-center gap-1 rounded border border-[var(--nv-border-2)] px-2 py-1 text-[10px] text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-primary)]/50 hover:text-[var(--nv-primary)]"
            title="全屏查看全部故事线的完整过程（七要素 + 章节进展时间轴）"
          >
            <Icon name="grid" size={11} /> 全屏
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1 rounded border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)] px-2 py-1 text-[10px] text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-creative-soft)] disabled:opacity-50"
          >
            {generating ? <><Icon name="loader" size={11} className="animate-spin" /> 生成中...</> : <><Icon name="bot" size={11} /> AI生成</>}
          </button>
        </div>
      </div>

      {/* 主线 */}
      {mainLine && (
        <div className="overflow-hidden rounded-lg border border-[var(--nv-accent)]/30 bg-[var(--nv-accent-soft)]">
          <div className="flex items-center gap-1 bg-[var(--nv-accent-soft)] px-2 py-1.5">
            <Icon name="star" size={11} className="text-[var(--nv-accent)]" />
            <span className="flex-1 truncate text-xs font-medium text-[var(--nv-accent)]">{mainLine.title}</span>
            <button
              onClick={() => handleToggleComplete(mainLine)}
              className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-accent)]"
              title={mainLine.status === "completed" ? "已完结——点击重新开启" : "点击打勾标记完成（主线完成后自动缝合新主线）"}
            >
              {mainLine.status === "completed" ? <Icon name="check" size={11} className="text-[var(--nv-success)]" /> : <Icon name="circle" size={11} />}
            </button>
          </div>
          <StorylineDetail storyline={mainLine} expanded={expandedId === mainLine.id}
            onToggle={() => setExpandedId(expandedId === mainLine.id ? null : mainLine.id)}
            onEdit={() => startEdit(mainLine)} onDelete={() => deleteStoryline(mainLine.id)} deletingId={deletingId} />
        </div>
      )}

      {/* 支线 */}
      {sideLines.map(s => (
        <div key={s.id} className="overflow-hidden rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <Icon name="arrowRight" size={11} className="text-[var(--nv-text-tertiary)]" />
            <span className="flex-1 truncate text-xs text-[var(--nv-text-primary)]">{s.title}</span>
            <button
              onClick={() => handleToggleComplete(s)}
              className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-accent)]"
              title={s.status === "completed" ? "已完结——点击重新开启" : "点击打勾标记完成"}
            >
              {s.status === "completed" ? <Icon name="check" size={11} className="text-[var(--nv-success)]" /> : <Icon name="circle" size={11} />}
            </button>
          </div>
          <StorylineDetail storyline={s} expanded={expandedId === s.id}
            onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
            onEdit={() => startEdit(s)} onDelete={() => deleteStoryline(s.id)} deletingId={deletingId} />
        </div>
      ))}

      {loadError && !loading && (
        <div className="px-4 py-6 text-center text-xs text-[var(--nv-danger)]">
          <p className="mb-2">{loadError}</p>
          <button onClick={() => load()} className="text-[10px] text-[var(--nv-primary)] hover:text-[var(--nv-creative)]">重试</button>
        </div>
      )}
      {storylines.length === 0 && !loading && !loadError && (
        <EmptyState
          icon="bookmarked"
          title="还没有故事线"
          action={
            <button onClick={handleGenerate} disabled={generating}
              className="btn-ghost text-[11px]">
              {generating ? "AI 生成中..." : "点击 AI 自动生成"}
            </button>
          }
        />
      )}

      {/* 全屏故事线总览（v1.6.0） */}
      {showFull && (
        <StorylinesModal
          projectId={projectId}
          onClose={() => setShowFull(false)}
          onRefresh={() => { void load(); onRefresh(); }}
        />
      )}

      {/* 编辑弹窗 */}
      {editingId && (
        <Modal open onClose={() => setEditingId(null)} bare panelClassName="max-h-[85vh] w-full max-w-xl overflow-y-auto" labelledBy="storyline-edit-title">
          <div className="p-5">
            <h3 id="storyline-edit-title" className="mb-4 text-lg font-semibold text-[var(--nv-text-primary)]">编辑故事线</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">标题</label>
                <input className="input-glass w-full rounded px-3 py-1.5 text-sm"
                  value={editForm.title || ""} onChange={e => updateField("title", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">简述</label>
                <input className="input-glass w-full rounded px-3 py-1.5 text-sm"
                  value={editForm.description || ""} onChange={e => updateField("description", e.target.value)} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-[var(--nv-text-tertiary)]">状态</label>
                <select className="input-glass w-full rounded px-3 py-1.5 text-sm"
                  value={editForm.status || "active"}
                  onChange={e => updateField("status", e.target.value)}>
                  <option value="active">活跃中</option>
                  <option value="completed">已完结</option>
                  <option value="abandoned">已废弃</option>
                </select>
              </div>
              {Object.entries(ELEMENT_LABELS).map(([key, { icon, label }]) => (
                <Collapse key={key} size="sm" title={label} icon={icon}>
                  <textarea className="input-glass w-full resize-none rounded px-3 py-1.5 text-sm"
                    rows={2} value={(editForm as any)[key] || ""}
                    onChange={e => updateField(key, e.target.value)} />
                </Collapse>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditingId(null)} className="btn-ghost">取消</Button>
              <Button onClick={() => handleSave(editingId)} className="btn-primary">保存</Button>
          </div>
        </div>
      </Modal>
    )}
    </div>
  );
}

export function StorylineDetail({ storyline, expanded, onToggle, onEdit, onDelete, deletingId }: {
  storyline: StorylineData; expanded: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
  deletingId: string | null;
}) {
  if (!expanded) {
    return (
      <div className="flex items-center gap-2 px-2 pb-1.5">
        <button onClick={onToggle} className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]">展开 ▼</button>
        <button onClick={onEdit} className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="编辑"><Icon name="pencil" size={12} /></button>
        <button onClick={onDelete} disabled={deletingId === storyline.id} className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] disabled:opacity-40" aria-label="删除"><Icon name="x" size={12} /></button>
        {storyline.description && <span className="flex-1 truncate text-[10px] text-[var(--nv-text-tertiary)]">{storyline.description}</span>}
      </div>
    );
  }

  return (
    <div className="space-y-1 px-2 pb-2">
      <div className="mb-1 flex items-center gap-2">
        <button onClick={onToggle} className="text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]">收起 ▲</button>
        <button onClick={onEdit} className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="编辑"><Icon name="pencil" size={12} /> 编辑</button>
        <button onClick={onDelete} disabled={deletingId === storyline.id} className="flex items-center gap-1 text-[10px] text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)] disabled:opacity-40" aria-label="删除"><Icon name="x" size={12} /> 删除</button>
      </div>
      {Object.entries(ELEMENT_LABELS).map(([key, { icon, label }]) => {
        const value = (storyline as any)[key] as string;
        if (!value) return null;
        return (
          <div key={key} className="text-[10px] leading-relaxed">
            <span className="flex items-center gap-1 text-[var(--nv-text-tertiary)]"><Icon name={icon} size={11} /> {label}：</span>
            <span className="text-[var(--nv-text-secondary)]">{value}</span>
          </div>
        );
      })}
      {/* v1.5.0 章节进展留痕（每章自动回写的大事件） */}
      {Array.isArray(storyline.chapterBindings) && storyline.chapterBindings.length > 0 && (
        <div className="mt-1 border-t border-[var(--nv-border-2)] pt-1">
          <div className="mb-0.5 text-[10px] text-[var(--nv-text-tertiary)] flex items-center gap-1"><Icon name="history" size={10} /> 章节进展（自动记录）：</div>
          {storyline.chapterBindings.slice(-8).reverse().map((b, i) => {
            const meta = ELEMENT_LABELS[b.element as keyof typeof ELEMENT_LABELS];
            return (
              <div key={i} className="text-[10px] text-[var(--nv-text-secondary)] leading-relaxed">
                <span className="text-[var(--nv-text-tertiary)]">{meta ? `${meta.label} · ` : ""}第{(b as any).chapterOrder !== undefined ? (b as any).chapterOrder + 1 : "?"}章</span>：{b.note}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
