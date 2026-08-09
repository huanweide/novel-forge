"use client";

import { useState, useEffect, useCallback } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/States";
import { toastError, toastSuccess, toastCreated } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { computeStorylineProgress, groupStorylinesByMain } from "@/lib/storyline-progress";
import type { StorylineData } from "./StorylineList";
import { DialogField, DialogInput } from "./DialogUI";

const ELEMENTS: {
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
  { key: "ending", icon: "check", label: "结局" },
];

export function StorylineWorkbench({
  projectId,
  initialId,
  onClose,
  onRefresh,
}: {
  projectId: string;
  initialId?: string | null;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [list, setList] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<StorylineData>>({});
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

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
      const lines = data.storylines as StorylineData[];
      setList(lines);
      const main = lines.find((s) => s.type === "main");
      if (main) setSelectedId(main.id);
      toastCreated(main?.title || "故事线", "故事线");
      onRefresh();
    } catch (err) {
      toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`);
    } finally {
      setGenerating(false);
    }
  };

  const startEdit = (s: StorylineData) => {
    setEditing(true);
    setForm({
      title: s.title,
      description: s.description,
      status: s.status,
      desire: s.desire,
      obstacle: s.obstacle,
      action: s.action,
      result: s.result,
      twist: s.twist,
      turn: s.turn,
      ending: s.ending,
    });
  };
  const updateField = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/storylines/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
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
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--nv-creative)]/40 bg-[var(--nv-creative-soft)] px-3 py-1.5 text-xs font-medium text-[var(--nv-creative)] transition-colors hover:bg-[var(--nv-creative)]/20 disabled:opacity-50"
          >
            {generating ? (
              <>
                <Icon name="loader" size={14} className="animate-spin" /> 生成中…
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
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {/* 主体：左导航 + 右详情 */}
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
            /* 编辑态（与查看态整合在同一面板，不另开弹窗） */
            <div className="space-y-3">
              <div className="mb-1 flex items-center gap-2">
                <span
                  className={`rounded px-2 py-0.5 text-[10px] ${
                    selected.type === "main"
                      ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]"
                      : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)]"
                  }`}
                >
                  {selected.type === "main" ? "主线" : "支线"}
                </span>
                <span className="text-[10px] text-[var(--nv-text-tertiary)]">编辑中</span>
              </div>
              <DialogField label="标题">
                <DialogInput value={form.title || ""} onChange={(v) => updateField("title", v)} />
              </DialogField>
              <DialogField label="简述">
                <DialogInput value={form.description || ""} onChange={(v) => updateField("description", v)} />
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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {ELEMENTS.map(({ key, label }) => (
                  <DialogField key={key} label={label}>
                    <DialogInput
                      rows={2}
                      value={(form as unknown as Record<string, string>)[key] || ""}
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
                    title={selected.status === "completed" ? "已完结——点击重新开启" : "点击打勾标记完成"}
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
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>

              {/* 七要素网格 */}
              <div>
                <div className="mb-2 text-xs font-medium text-[var(--nv-text-tertiary)]">七要素 · 完整过程</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {ELEMENTS.map(({ key, icon, label }) => {
                    const val = selected[key];
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3"
                      >
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-secondary)]">
                          <Icon name={icon} size={14} /> {label}
                        </div>
                        <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--nv-text-primary)]">
                          {val || <span className="text-[var(--nv-text-tertiary)]">—</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 章节进展时间轴 */}
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)]">
                  <Icon name="history" size={14} /> 章节进展时间轴（自动记录大事件）
                </div>
                {Array.isArray(selected.chapterBindings) && selected.chapterBindings.length > 0 ? (
                  <ol className="relative space-y-3 border-l border-[var(--nv-border-2)] pl-4">
                    {selected.chapterBindings
                      .slice()
                      .reverse()
                      .map((b: { element: string; chapterOrder?: number; note: string }, i: number) => {
                        const meta = ELEMENTS.find((e) => e.key === b.element);
                        return (
                          <li key={i} className="relative">
                            <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-[var(--nv-accent)] ring-2 ring-[var(--nv-surface-1)]" />
                            <div className="text-xs text-[var(--nv-text-tertiary)]">
                              第{(b.chapterOrder !== undefined ? b.chapterOrder + 1 : "?")}章 ·{" "}
                              {meta ? meta.label : b.element}
                            </div>
                            <div className="text-sm leading-relaxed text-[var(--nv-text-secondary)]">{b.note}</div>
                          </li>
                        );
                      })}
                  </ol>
                ) : (
                  <p className="text-xs text-[var(--nv-text-tertiary)]">
                    暂无章节进展记录（写作时会自动回写大事件）
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
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
            background: s.type === "main" ? "var(--nv-accent)" : "var(--nv-text-tertiary)",
          }}
        />
      </div>
    </button>
  );
}
