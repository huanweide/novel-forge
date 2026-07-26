"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { confirmDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";

export interface StorylineData {
  id: string; projectId: string;
  type: "main" | "side"; parentId?: string | null;
  title: string; order: number; status: string; description: string;
  desire: string; obstacle: string; action: string; result: string;
  twist: string; turn: string; ending: string;
  chapterBindings: { element: string; chapterId: string; note: string }[];
}

const ELEMENT_LABELS: Record<string, { emoji: string; label: string }> = {
  desire: { emoji: "🔥", label: "欲望" },
  obstacle: { emoji: "🧱", label: "阻碍" },
  action: { emoji: "⚔️", label: "行动" },
  result: { emoji: "📊", label: "结果" },
  twist: { emoji: "⚡", label: "意外" },
  turn: { emoji: "🔄", label: "转折" },
  ending: { emoji: "🏁", label: "结局" },
};

export function StorylineList({ projectId, onRefresh }: { projectId: string; onRefresh: () => void }) {
  const [storylines, setStorylines] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<StorylineData>>({});

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

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog({ title: "删除故事线", description: "确定删除这条故事线？此操作不可恢复。", danger: true }))) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/storylines/${id}`, { method: "DELETE" });
      if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("删除失败：" + (d.error || `HTTP ${res.status}`)); return; }
      load();
    } catch (err) { toastError("删除失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setDeletingId(null); }
  };

  const startEdit = (s: StorylineData) => {
    setEditingId(s.id);
    setEditForm({ title: s.title, description: s.description, desire: s.desire, obstacle: s.obstacle, action: s.action, result: s.result, twist: s.twist, turn: s.turn, ending: s.ending, status: s.status });
  };

  const updateField = (field: string, value: string) => {
    setEditForm(prev => ({ ...prev, [field]: value }));
  };

  const mainLine = storylines.find(s => s.type === "main");
  const sideLines = storylines.filter(s => s.type === "side");

  if (loading) return <div className="text-xs text-zinc-500 text-center py-4">加载中...</div>;

  return (
    <div className="space-y-2 p-1">
      {/* 工具栏 */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] text-zinc-600">{storylines.length} 条故事线</span>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-[10px] px-2 py-1 rounded bg-indigo-900/30 border border-indigo-800/50 text-indigo-400 hover:bg-indigo-900/50 disabled:opacity-50"
        >
          {generating ? "⏳ 生成中..." : "🤖 AI生成"}
        </button>
      </div>

      {/* 主线 */}
      {mainLine && (
        <div className="border border-amber-800/30 rounded-lg bg-amber-950/10 overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5 bg-amber-950/20">
            <span className="text-[10px]">⭐</span>
            <span className="text-xs font-medium text-amber-300 flex-1 truncate">{mainLine.title}</span>
            <span className="text-[10px] text-amber-600">{mainLine.status === "completed" ? "✓" : "○"}</span>
          </div>
          <StorylineDetail storyline={mainLine} expanded={expandedId === mainLine.id}
            onToggle={() => setExpandedId(expandedId === mainLine.id ? null : mainLine.id)}
            onEdit={() => startEdit(mainLine)} onDelete={() => handleDelete(mainLine.id)} deletingId={deletingId} />
        </div>
      )}

      {/* 支线 */}
      {sideLines.map(s => (
        <div key={s.id} className="border border-white/[0.06] rounded-lg bg-white/[0.02] backdrop-blur-sm overflow-hidden">
          <div className="flex items-center gap-1 px-2 py-1.5">
            <span className="text-[10px]">↳</span>
            <span className="text-xs text-zinc-300 flex-1 truncate">{s.title}</span>
            <span className="text-[10px] text-zinc-600">{s.status === "completed" ? "✓" : "○"}</span>
          </div>
          <StorylineDetail storyline={s} expanded={expandedId === s.id}
            onToggle={() => setExpandedId(expandedId === s.id ? null : s.id)}
            onEdit={() => startEdit(s)} onDelete={() => handleDelete(s.id)} deletingId={deletingId} />
        </div>
      ))}

      {loadError && !loading && (
        <div className="text-center text-rose-400 text-xs py-6 px-4">
          <p className="mb-2">⚠ {loadError}</p>
          <button onClick={() => load()} className="text-indigo-400 hover:text-indigo-300 text-[10px]">重试</button>
        </div>
      )}
      {storylines.length === 0 && !loading && !loadError && (
        <div className="text-center text-zinc-600 text-xs py-6">
          <p className="mb-2">还没有故事线</p>
          <button onClick={handleGenerate} disabled={generating}
            className="text-indigo-400 hover:text-indigo-300 text-[10px]">
            {generating ? "AI 生成中..." : "🤖 点击 AI 自动生成"}
          </button>
        </div>
      )}

      {/* 编辑弹窗 */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setEditingId(null)}>
          <div className="bg-zinc-900 border border-white/[0.08] rounded-2xl w-full max-w-xl max-h-[85vh] overflow-y-auto p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">编辑故事线</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">标题</label>
                <input className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  value={editForm.title || ""} onChange={e => updateField("title", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">简述</label>
                <input className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  value={editForm.description || ""} onChange={e => updateField("description", e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-zinc-400 block mb-1">状态</label>
                <select className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-1.5 text-sm"
                  value={editForm.status || "active"}
                  onChange={e => updateField("status", e.target.value)}>
                  <option value="active">活跃中</option>
                  <option value="completed">已完结</option>
                  <option value="abandoned">已废弃</option>
                </select>
              </div>
              {Object.entries(ELEMENT_LABELS).map(([key, { emoji, label }]) => (
                <div key={key}>
                  <label className="text-xs text-zinc-400 block mb-1">{emoji} {label}</label>
                  <textarea className="w-full bg-white/[0.04] border border-white/[0.08] rounded px-3 py-1.5 text-sm resize-none focus:outline-none focus:border-indigo-500"
                    rows={2} value={(editForm as any)[key] || ""}
                    onChange={e => updateField(key, e.target.value)} />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingId(null)} className="border-white/[0.08]">取消</Button>
              <Button onClick={() => handleSave(editingId)} className="bg-indigo-600 hover:bg-indigo-500">保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StorylineDetail({ storyline, expanded, onToggle, onEdit, onDelete, deletingId }: {
  storyline: StorylineData; expanded: boolean;
  onToggle: () => void; onEdit: () => void; onDelete: () => void;
  deletingId: string | null;
}) {
  if (!expanded) {
    return (
      <div className="px-2 pb-1.5 flex items-center gap-2">
        <button onClick={onToggle} className="text-[10px] text-zinc-500 hover:text-zinc-300">展开 ▼</button>
        <button onClick={onEdit} className="text-[10px] text-zinc-600 hover:text-zinc-400">✏️</button>
        <button onClick={onDelete} disabled={deletingId === storyline.id} className="text-[10px] text-zinc-600 hover:text-red-400 disabled:opacity-40">✕</button>
        {storyline.description && <span className="text-[10px] text-zinc-600 truncate flex-1">{storyline.description}</span>}
      </div>
    );
  }

  return (
    <div className="px-2 pb-2 space-y-1">
      <div className="flex items-center gap-2 mb-1">
        <button onClick={onToggle} className="text-[10px] text-zinc-500 hover:text-zinc-300">收起 ▲</button>
        <button onClick={onEdit} className="text-[10px] text-zinc-600 hover:text-zinc-400">✏️ 编辑</button>
        <button onClick={onDelete} disabled={deletingId === storyline.id} className="text-[10px] text-zinc-600 hover:text-red-400 disabled:opacity-40">✕ 删除</button>
      </div>
      {Object.entries(ELEMENT_LABELS).map(([key, { emoji, label }]) => {
        const value = (storyline as any)[key] as string;
        if (!value) return null;
        return (
          <div key={key} className="text-[10px] leading-relaxed">
            <span className="text-zinc-500">{emoji} {label}：</span>
            <span className="text-zinc-300">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
