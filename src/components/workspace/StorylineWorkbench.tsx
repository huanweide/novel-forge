"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/States";
import { toastError, toastSuccess, toastCreated } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { computeStorylineProgress, groupStorylinesByMain } from "@/lib/storyline-progress";
import type { StorylineData } from "./StorylineList";
import { DialogField, DialogInput } from "./DialogUI";

export interface StorylineSuggestion {
  type: "main" | "side";
  title: string;
  description: string;
  sevenElements: {
    desire: string;
    obstacle: string;
    action: string;
    result: string;
    twist: string;
    turn: string;
    ending: string | null;
  };
}

const ELEMENT_META: {
  key: "desire" | "obstacle" | "action" | "result" | "twist" | "turn" | "ending";
  icon: IconName;
  label: string;
}[] = [
  { key: "desire", icon: "gem", label: "欲望" },
  { key: "obstacle", icon: "shield", label: "阻碍" },
  { key: "action", icon: "sword", label: "行动" },
  { key: "result", icon: "chart", label: "结果" },
  { key: "twist", icon: "sparkles", label: "意外" },
  { key: "turn", icon: "arrowRight", label: "转折" },
  { key: "ending", icon: "check", label: "结局（待收束）" },
];

export function StorylineWorkbench({
  projectId,
  initialId,
  initialSuggestions,
  onClose,
  onRefresh,
}: {
  projectId: string;
  initialId?: string | null;
  initialSuggestions?: StorylineSuggestion[] | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [list, setList] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cluesExpanded, setCluesExpanded] = useState(true);

  // AI 生成中间态
  const [genSuggestions, setGenSuggestions] = useState<StorylineSuggestion[] | null>(initialSuggestions ?? null);
  const [genExtra, setGenExtra] = useState("");
  const [committing, setCommitting] = useState(false);

  // 真后台生成任务轮询态（v1.8.6 #174）：创建 task 后轮询，关页面不影响服务端任务
  const [genTask, setGenTask] = useState<{ taskId: string; status: string; progress: number; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载（关闭工作台）时清理轮询定时器，避免泄漏（服务端任务不受影响，继续跑）
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/storylines?projectId=${projectId}`);
      if (res.ok) {
        const data = (await res.json()) as StorylineData[];
        setList(data);
        setSelectedId((prev) => prev ?? data[0]?.id ?? null);
      } else {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        setError((d as { error?: string }).error || `加载失败（HTTP ${res.status}）`);
      }
    } catch (err) {
      setError("加载故事线失败：" + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = list.find((s) => s.id === selectedId) || null;
  const { mains, sides, resolveParent } = groupStorylinesByMain(list);
  const orphanSides = sides.filter((s) => !resolveParent(s) || resolveParent(s)?.id === s.id);

  const events = selected?.events || [];
  const timelineEvents = events
    .filter((e) => e.kind !== "CLUE")
    .sort((a, b) => a.position - b.position);
  const clues = events.filter((e) => e.kind === "CLUE");

  const updateField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleToggleComplete = async (s: StorylineData) => {
    const next = s.status === "completed" ? "active" : "completed";
    try {
      const res = await fetch(`/api/storylines/${s.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        toastError("状态更新失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      toastSuccess(next === "completed" ? `「${s.title}」已完结 ✓` : `「${s.title}」已重新开启`);
      void load();
      onRefresh();
    } catch (err) {
      toastError("状态更新失败（网络错误）：" + (err instanceof Error ? err.message : "请重试"));
    }
  };

  const handleGenerate = async () => {
    setGenerating(true);
    setGenTask(null);
    try {
      const res = await fetch("/api/generation-tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, prompt: genExtra }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError(`创建生成任务失败：${data.error ?? "未知错误"}`);
        setGenerating(false);
        return;
      }
      const taskId = data.taskId as string;
      setGenTask({ taskId, status: "pending", progress: 0 });

      // 轮询任务直到 done / failed（关页面不影响服务端任务，重新进页面可再次轮询）
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/generation-tasks/${taskId}`);
          const t = await r.json();
          if (!r.ok) {
            if (pollRef.current) clearInterval(pollRef.current);
            setGenTask({ taskId, status: "failed", progress: 0, error: t.error ?? "轮询失败" });
            setGenerating(false);
            toastError(`生成任务失败：${t.error ?? "轮询失败"}`);
            return;
          }
          setGenTask({ taskId, status: t.status, progress: t.progress, error: t.error });
          if (t.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            const suggestions = (t.result?.suggestions as StorylineSuggestion[] | undefined) ?? [];
            if (suggestions.length > 0) {
              setGenSuggestions(suggestions);
              setGenExtra("");
            } else {
              toastError("生成结果为空，请重试");
            }
            setGenTask(null);
            setGenerating(false);
          } else if (t.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            toastError(`生成失败：${t.error ?? "未知错误"}`);
            setGenTask(null);
            setGenerating(false);
          }
        } catch {
          // 网络抖动：继续保持轮询，下一拍再试
        }
      }, 1500);
    } catch (err) {
      toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`);
      setGenerating(false);
    }
  };

  const handleCommitGen = async () => {
    if (!genSuggestions || genSuggestions.length === 0) return;
    setCommitting(true);
    try {
      const res = await fetch("/api/storylines/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, commit: true, suggestions: genSuggestions }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("落库失败：" + ((data as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      toastCreated("故事线", "故事线");
      setGenSuggestions(null);
      setGenExtra("");
      void load();
      onRefresh();
    } catch (err) {
      toastError("落库失败（网络错误）：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setCommitting(false);
    }
  };

  const startEdit = (s: StorylineData) => {
    setEditing(true);
    const se = s.sevenElements && typeof s.sevenElements === "object" ? s.sevenElements : {};
    setForm({
      title: s.title,
      description: s.description,
      status: s.status,
      type: s.type,
      parentId: s.parentId ?? "",
      desire: se.desire || "",
      obstacle: se.obstacle || "",
      action: se.action || "",
      result: se.result || "",
      twist: se.twist || "",
      turn: se.turn || "",
      ending: se.ending || "",
    });
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        status: form.status,
        type: form.type,
        parentId: form.type === "main" ? null : form.parentId || null,
        sevenElements: {
          desire: form.desire || "",
          obstacle: form.obstacle || "",
          action: form.action || "",
          result: form.result || "",
          twist: form.twist || "",
          turn: form.turn || "",
          ending: form.ending ? form.ending : null,
        },
      };
      const res = await fetch(`/api/storylines/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        toastError("保存失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      setEditing(false);
      void load();
      onRefresh();
    } catch (err) {
      toastError("保存失败（网络错误）：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setSaving(false);
    }
  };

  const { deletingId, remove: deleteStoryline } = useConfirmDelete({
    title: "删除故事线",
    description: "确定删除这条故事线？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/storylines/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
      }
    },
    onSuccess: () => {
      void load();
      onRefresh();
    },
    errorPrefix: "删除失败",
  });

  // 线索集（CLUE）增删改
  const [newClueTag, setNewClueTag] = useState("");
  const [newClueContent, setNewClueContent] = useState("");
  const handleAddClue = async () => {
    if (!selected) return;
    if (!newClueContent.trim()) {
      toastError("线索内容不能为空");
      return;
    }
    try {
      const res = await fetch(`/api/storylines/${selected.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "CLUE", tag: newClueTag.trim(), content: newClueContent.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: "未知错误" }));
        toastError("新增线索失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      setNewClueTag("");
      setNewClueContent("");
      void load();
    } catch (err) {
      toastError("新增线索失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };
  const handleCluePatch = async (id: string, patch: Record<string, string>) => {
    try {
      await fetch(`/api/storyline-events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      void load();
    } catch (err) {
      toastError("更新线索失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };
  const handleClueDelete = async (id: string) => {
    try {
      await fetch(`/api/storyline-events/${id}`, { method: "DELETE" });
      void load();
    } catch (err) {
      toastError("删除线索失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };

  // —— AI 中间态草稿编辑 ——
  const updateSuggestion = (idx: number, patch: Partial<StorylineSuggestion>) => {
    setGenSuggestions((prev) =>
      prev ? prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)) : prev,
    );
  };
  const updateSuggestionElement = (idx: number, key: string, val: string) => {
    setGenSuggestions((prev) =>
      prev
        ? prev.map((s, i) =>
            i === idx ? { ...s, sevenElements: { ...s.sevenElements, [key]: val } } : s,
          )
        : prev,
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      bare
      panelClassName="max-w-5xl w-full max-h-[92vh] flex flex-col overflow-hidden"
      labelledBy="workbench-title"
    >
      {/* 头部 */}
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--nv-border-2)] px-5 py-3">
        <h2
          id="workbench-title"
          className="flex items-center gap-2 text-lg font-semibold text-[var(--nv-text-primary)]"
        >
          <Icon name="bookmarked" size={18} className="text-[var(--nv-accent)]" /> 故事线工作台
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating || !!genSuggestions}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)] px-3 py-1.5 text-xs font-medium text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-creative)]/20 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Icon name="loader" size={14} className="animate-spin" />
                {genTask?.status === "running" ? `生成中… ${genTask.progress}%` : "生成中…"}
              </>
            ) : (
              <>
                <Icon name="bot" size={14} /> AI 生成
              </>
            )}
          </button>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            aria-label="关闭"
            title="关闭"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {/* AI 生成中间态编辑器（覆盖主体） */}
      {genSuggestions ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium text-[var(--nv-creative)]">
            <Icon name="bot" size={16} /> AI 生成结果 · 中间编辑态（可修改后再落库）
          </div>
          <DialogField label="额外要求（可选，仅作提示，不影响已生成内容）">
            <DialogInput value={genExtra} onChange={setGenExtra} placeholder="例如：增加一条复仇支线" />
          </DialogField>

          <div className="mt-3 space-y-3">
            {genSuggestions.map((s, idx) => (
              <div key={idx} className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] ${
                      s.type === "main"
                        ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]"
                        : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)]"
                    }`}
                  >
                    {s.type === "main" ? "主线" : "支线"}
                  </span>
                  <DialogInput
                    value={s.title}
                    onChange={(v) => updateSuggestion(idx, { title: v })}
                    className="flex-1"
                  />
                </div>
                <DialogField label="简述">
                  <DialogInput
                    value={s.description}
                    onChange={(v) => updateSuggestion(idx, { description: v })}
                  />
                </DialogField>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ELEMENT_META.map(({ key, label }) => (
                    <DialogField key={key} label={label}>
                      <DialogInput
                        rows={2}
                        value={s.sevenElements[key] || ""}
                        onChange={(v) => updateSuggestionElement(idx, key, v)}
                      />
                    </DialogField>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setGenSuggestions(null);
                setGenExtra("");
              }}
              className="btn-ghost"
            >
              放弃
            </Button>
            <Button onClick={handleCommitGen} disabled={committing} className="btn-primary">
              {committing ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" /> 落库中…
                </>
              ) : (
                "采用并落库"
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* 正常主体：左导航 + 右详情 */
        <div className="flex min-h-0 flex-1">
          {/* 左列：主线/支线导航 */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2.5">
            {loading && <div className="py-8 text-center text-xs text-[var(--nv-text-tertiary)]">加载中…</div>}
            {error && !loading && (
              <div className="py-6 text-center text-xs text-[var(--nv-danger)]">
                <p className="mb-2">{error}</p>
                <button onClick={() => void load()} className="text-[var(--nv-primary)]">
                  重试
                </button>
              </div>
            )}
            {!loading && !error && list.length === 0 && (
              <EmptyState
                icon="bookmarked"
                title="还没有故事线"
                action={
                  <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-xs">
                    {generating ? "生成中…" : "AI 自动生成"}
                  </button>
                }
              />
            )}
            {!loading && !error && list.length > 0 && (
              <div className="space-y-1">
                {mains.map((m) => (
                  <div key={m.id}>
                    <LineNav
                      s={m}
                      selected={selectedId === m.id}
                      onSelect={() => {
                        setSelectedId(m.id);
                        setEditing(false);
                      }}
                      onToggle={() => handleToggleComplete(m)}
                    />
                    {sides
                      .filter((s) => resolveParent(s)?.id === m.id)
                      .map((s) => (
                        <div key={s.id} className="ml-3">
                          <LineNav
                            s={s}
                            selected={selectedId === s.id}
                            onSelect={() => {
                              setSelectedId(s.id);
                              setEditing(false);
                            }}
                            onToggle={() => handleToggleComplete(s)}
                          />
                        </div>
                      ))}
                  </div>
                ))}
                {orphanSides.map((s) => (
                  <LineNav
                    key={s.id}
                    s={s}
                    selected={selectedId === s.id}
                    onSelect={() => {
                      setSelectedId(s.id);
                      setEditing(false);
                    }}
                    onToggle={() => handleToggleComplete(s)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* 右列：选中线详情 */}
          <div className="min-w-0 flex-1 overflow-y-auto p-5">
            {!selected ? (
              <div className="flex h-full items-center justify-center text-xs text-[var(--nv-text-tertiary)]">
                从左侧选择一条故事线查看详情
              </div>
            ) : editing ? (
              /* 编辑态 */
              <div className="space-y-3">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-[10px] text-[var(--nv-text-tertiary)]">编辑中</span>
                </div>
                <DialogField label="标题">
                  <DialogInput value={form.title || ""} onChange={(v) => updateField("title", v)} />
                </DialogField>
                <DialogField label="简述">
                  <DialogInput value={form.description || ""} onChange={(v) => updateField("description", v)} />
                </DialogField>
                <div className="grid grid-cols-2 gap-3">
                  <DialogField label="类型（主线/支线可互换）">
                    <select
                      className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                      value={form.type || "side"}
                      onChange={(e) => updateField("type", e.target.value)}
                    >
                      <option value="main">主线</option>
                      <option value="side">支线</option>
                    </select>
                  </DialogField>
                  <DialogField label="状态">
                    <select
                      className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                      value={form.status || "active"}
                      onChange={(e) => updateField("status", e.target.value)}
                    >
                      <option value="active">活跃中</option>
                      <option value="completed">已完结</option>
                      <option value="abandoned">已废弃</option>
                    </select>
                  </DialogField>
                </div>
                {/* 支线归属主线 */}
                {form.type === "side" && (
                  <DialogField label="所属主线">
                    <select
                      className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                      value={form.parentId || ""}
                      onChange={(e) => updateField("parentId", e.target.value)}
                    >
                      <option value="">（无归属）</option>
                      {mains.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </DialogField>
                )}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {ELEMENT_META.map(({ key, label }) => (
                    <DialogField key={key} label={label}>
                      <DialogInput
                        rows={2}
                        value={form[key] || ""}
                        onChange={(v) => updateField(key, v)}
                      />
                    </DialogField>
                  ))}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditing(false)} className="btn-ghost">
                    取消
                  </Button>
                  <Button onClick={handleSave} disabled={saving} className="btn-primary">
                    {saving ? (
                      <>
                        <Icon name="loader" size={14} className="animate-spin" /> 保存中…
                      </>
                    ) : (
                      "保存"
                    )}
                  </Button>
                </div>
              </div>
            ) : (
              /* 查看态 */
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] ${
                          selected.type === "main"
                            ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]"
                            : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)]"
                        }`}
                      >
                        {selected.type === "main" ? "主线" : "支线"}
                      </span>
                      <h3 className="truncate text-lg font-semibold text-[var(--nv-text-primary)]">
                        {selected.title}
                      </h3>
                    </div>
                    {selected.description && (
                      <p className="mt-1 text-sm text-[var(--nv-text-secondary)]">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      onClick={() => handleToggleComplete(selected)}
                      className="flex items-center gap-1 rounded-lg border border-[var(--nv-border-2)] px-2.5 py-1.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-success)]/50 hover:text-[var(--nv-success)]"
                    >
                      {selected.status === "completed" ? (
                        <>
                          <Icon name="check" size={14} className="text-[var(--nv-success)]" /> 已完结
                        </>
                      ) : (
                        <>
                          <Icon name="circle" size={14} /> 标记完结
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => startEdit(selected)}
                      className="flex items-center gap-1 rounded-lg border border-[var(--nv-border-2)] px-2.5 py-1.5 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-primary)]/50 hover:text-[var(--nv-primary)]"
                    >
                      <Icon name="pencil" size={14} /> 编辑
                    </button>
                    <button
                      onClick={() => deleteStoryline(selected.id)}
                      disabled={deletingId === selected.id}
                      className="rounded-lg border border-[var(--nv-border-2)] px-2.5 py-1.5 text-xs text-[var(--nv-text-tertiary)] transition-colors hover:border-[var(--nv-danger)]/50 hover:text-[var(--nv-danger)] disabled:opacity-40"
                      title="删除"
                      aria-label="删除"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                {/* 七要素网格（总纲） */}
                <div>
                  <div className="mb-2 text-xs font-medium text-[var(--nv-text-tertiary)]">
                    七要素 · 总纲（结局不预填，仅标记收束）
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {ELEMENT_META.map(({ key, icon, label }) => {
                      const se = selected.sevenElements || {};
                      const val = (se as Record<string, string | null | undefined>)[key];
                      return (
                        <div
                          key={key}
                          className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3"
                        >
                          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-secondary)]">
                            <Icon name={icon} size={14} /> {label}
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text-primary)]">
                            {val ? (
                              val
                            ) : key === "ending" ? (
                              <span className="text-[var(--nv-text-tertiary)]">待收束</span>
                            ) : (
                              <span className="text-[var(--nv-text-tertiary)]">—</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 章节进展时间轴（自动记录大事件） */}
                <div>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)]">
                    <Icon name="history" size={14} /> 章节进展时间轴（写作自动记录大事件）
                  </div>
                  {timelineEvents.length > 0 ? (
                    <ol className="relative space-y-3 border-l border-[var(--nv-border-2)] pl-4">
                      {timelineEvents.map((b) => (
                        <li key={b.id} className="relative">
                          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--nv-accent)] ring-2 ring-[var(--nv-surface-1)]" />
                          <div className="text-xs text-[var(--nv-text-tertiary)]">
                            {b.title || (b.kind === "MILESTONE" ? "里程碑" : "事件")}
                          </div>
                          <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text-secondary)]">
                            {b.content}
                          </div>
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p className="text-xs text-[var(--nv-text-tertiary)]">
                      暂无章节进展记录（写作时会自动回写大事件）
                    </p>
                  )}
                </div>

                {/* 线索集（CLUE） */}
                <div>
                  <button
                    onClick={() => setCluesExpanded((v) => !v)}
                    className="mb-2 flex w-full items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-secondary)]"
                  >
                    <Icon name="tag" size={14} />
                    线索集 / 纸集（融合龙王寨、菜市场注释、尸检报告等）
                    <Icon name={cluesExpanded ? "chevronDown" : "chevronRight"} size={12} className="ml-auto" />
                    <span className="rounded bg-[var(--nv-surface-2)] px-1 text-[9px]">{clues.length}</span>
                  </button>
                  {cluesExpanded && (
                    <div className="space-y-2">
                      {clues.length === 0 && (
                        <p className="text-xs text-[var(--nv-text-tertiary)]">暂无线索，可在下方添加。</p>
                      )}
                      {clues.map((c) => (
                        <ClueRow key={c.id} clue={c} onPatch={handleCluePatch} onDelete={handleClueDelete} />
                      ))}
                      {/* 新增线索 */}
                      <div className="rounded-xl border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <DialogInput
                            value={newClueTag}
                            onChange={setNewClueTag}
                            placeholder="标签（如：龙王寨 / 尸检报告）"
                            className="w-40"
                          />
                        </div>
                        <DialogInput
                          rows={2}
                          value={newClueContent}
                          onChange={setNewClueContent}
                          placeholder="线索内容（可无限延伸、每条可编辑）"
                        />
                        <div className="mt-2 flex justify-end">
                          <Button variant="outline" onClick={handleAddClue} className="btn-ghost text-[11px]">
                            <Icon name="plus" size={12} /> 添加线索
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function LineNav({
  s,
  selected,
  onSelect,
  onToggle,
}: {
  s: StorylineData;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const p = computeStorylineProgress(s);
  return (
    <button
      onClick={onSelect}
      className={`group w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-[var(--nv-accent)]/50 bg-[var(--nv-accent-soft)]"
          : "border-transparent hover:bg-[var(--nv-surface-2)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name={s.type === "main" ? "star" : "arrowRight"}
          size={13}
          className={s.type === "main" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]"}
        />
        <span
          className={`flex-1 line-clamp-2 text-xs ${
            selected
              ? "font-medium text-[var(--nv-accent)]"
              : s.type === "main"
                ? "font-medium text-[var(--nv-text-primary)]"
                : "text-[var(--nv-text-primary)]"
          }`}
        >
          {s.title}
        </span>
        {s.status === "completed" && (
          <span className="rounded bg-[var(--nv-success)]/15 px-1 text-[9px] text-[var(--nv-success)]">
            完结
          </span>
        )}
        <span
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-accent)]"
          title="标记完结"
        >
          {s.status === "completed" ? (
            <Icon name="check" size={12} className="text-[var(--nv-success)]" />
          ) : (
            <Icon name="circle" size={12} />
          )}
        </span>
      </div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--nv-surface-2)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${p.overallPercent}%`,
            background: s.type === "main" ? "var(--nv-accent)" : "var(--nv-primary)",
          }}
        />
      </div>
    </button>
  );
}

function ClueRow({
  clue,
  onPatch,
  onDelete,
}: {
  clue: { id: string; tag: string; content: string };
  onPatch: (id: string, patch: Record<string, string>) => void;
  onDelete: (id: string) => void;
}) {
  const [tag, setTag] = useState(clue.tag);
  const [content, setContent] = useState(clue.content);
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
      <div className="mb-1.5 flex items-center gap-2">
        {editing ? (
          <DialogInput value={tag} onChange={setTag} className="w-32" placeholder="标签" />
        ) : (
          <span className="rounded bg-[var(--nv-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--nv-accent)]">
            {clue.tag || "未分类"}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={() => {
                  onPatch(clue.id, { tag, content });
                  setEditing(false);
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--nv-success)] hover:bg-[var(--nv-success)]/10"
              >
                保存
              </button>
              <button
                onClick={() => {
                  setTag(clue.tag);
                  setContent(clue.content);
                  setEditing(false);
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-[var(--nv-text-tertiary)] hover:bg-[var(--nv-surface-2)]"
              >
                取消
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditing(true)}
                className="rounded p-1 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-primary)]"
                title="编辑线索"
              >
                <Icon name="pencil" size={12} />
              </button>
              <button
                onClick={() => onDelete(clue.id)}
                className="rounded p-1 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-danger)]"
                title="删除线索"
              >
                <Icon name="trash" size={12} />
              </button>
            </>
          )}
        </div>
      </div>
      {editing ? (
        <DialogInput rows={2} value={content} onChange={setContent} />
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text-primary)]">
          {clue.content}
        </div>
      )}
    </div>
  );
}
