"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Modal } from "@/components/ui/Modal";
import { Icon, type IconName } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { toastError, toastSuccess, toastCreated } from "@/components/ui/toast";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { computeStorylineProgress, groupStorylinesByMain, sortChildrenByStatusThenOrder, buildCausalChain } from "@/lib/storyline-progress";
import type { StorylineData } from "./StorylineList";
import { DialogField, DialogInput } from "./DialogUI";

const UNKNOWN_ERROR = "请求失败，请稍后重试";
const MAX_POLLS = 240; // 轮询兜底上限（≈6min，1.5s/次）

export interface StorylineSuggestion {
  type: "main" | "side" | "thread";
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

type ElementKey =
  | "desire" | "obstacle" | "action" | "result" | "twist" | "turn" | "ending"
  | "origin" | "process";
interface ElementMeta {
  key: ElementKey;
  icon: IconName;
  label: string;
  hint: string;
}
type SevenKey = "desire" | "obstacle" | "action" | "result" | "twist" | "turn" | "ending";
interface SevenMeta {
  key: SevenKey;
  icon: IconName;
  label: string;
  hint: string;
}

// 支线：七要素（完整骨架）—— 支线盘子小，七要素写得下
const ELEMENT_META: SevenMeta[] = [
  { key: "desire", icon: "gem", label: "欲望", hint: "这条线里角色最想要什么" },
  { key: "obstacle", icon: "shield", label: "阻碍", hint: "挡在欲望前面的力量或人" },
  { key: "action", icon: "sword", label: "行动", hint: "角色为越过阻碍做了什么" },
  { key: "result", icon: "chart", label: "结果", hint: "行动带来的直接后果" },
  { key: "twist", icon: "sparkles", label: "意外", hint: "打乱预期的反转事件" },
  { key: "turn", icon: "arrowRight", label: "转折", hint: "角色立场或局势的关键变化" },
  { key: "ending", icon: "check", label: "结局", hint: "收束时的最终状态（写时再定，不预填）" },
];

// 主线：三要素（起因 / 经过 / 结果）—— 主线线索太多、事件太密，七要素写不下，改用三要素
const THREE_ELEMENTS: ElementMeta[] = [
  { key: "origin", icon: "gem", label: "起因", hint: "这条主线因何而起、最初的引子" },
  { key: "process", icon: "arrowRight", label: "经过", hint: "主线推进的关键过程与转折" },
  { key: "result", icon: "chart", label: "结果", hint: "主线目前的走向与阶段性结果" },
];

// 按类型返回要素集合：主线三要素、支线七要素
function elementsFor(type: string | undefined): ElementMeta[] {
  return type === "main" ? THREE_ELEMENTS : ELEMENT_META;
}
// 只保留当前类型允许的要素 key（主线清掉七要素残留，支线清掉三要素残留）
function stripElements(
  se: Record<string, string | null | undefined>,
  type: string,
): Record<string, string | null> {
  const allowed = new Set(elementsFor(type).map((e) => e.key));
  const out: Record<string, string | null> = {};
  for (const k of Object.keys(se)) {
    if (allowed.has(k as ElementKey)) out[k] = se[k] ?? "";
  }
  return out;
}

export function StorylineWorkbench({
  projectId,
  initialId,
  initialSuggestions,
  initialTaskId,
  onClose,
  onRefresh,
  onTaskSettled,
  onWriteChapter,
}: {
  projectId: string;
  initialId?: string | null;
  initialSuggestions?: StorylineSuggestion[] | null;
  initialTaskId?: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onTaskSettled?: () => void;
  onWriteChapter?: (storylineId?: string, opts?: { diffuseCompleted?: boolean }) => void;
}) {
  const [list, setList] = useState<StorylineData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // 主线收起态（B 任务：主线下的支线可收起）
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // 清理废弃故事线确认框
  const [showCleanup, setShowCleanup] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(initialId ?? null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"elements" | "timeline" | "clues" | "causal">("elements");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  // AI 生成中间态
  const [genSuggestions, setGenSuggestions] = useState<StorylineSuggestion[] | null>(initialSuggestions ?? null);
  const [genExtra, setGenExtra] = useState("");
  const [committing, setCommitting] = useState(false);

  // 真后台生成任务轮询态（v1.8.6 #174）：创建 task 后轮询，关页面不影响服务端任务
  const [genTask, setGenTask] = useState<{ taskId: string; status: string; progress: number; error?: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const netErrCount = useRef(0); // IMP-008：连续网络错误计数
  const pollCount = useRef(0); // IMP-008：轮询次数计数（兜底上限）

  // 组件卸载（关闭工作台）时清理轮询定时器，避免泄漏（服务端任务不受影响，继续跑）
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // v1.8.7：把内联轮询逻辑抽成独立回调，供「工作台内 AI 生成」与「列表入口挂载即轮询」共用
  const startPolling = useCallback(
    async (taskId: string) => {
      // IMP-009：开新轮询前先清理可能残留的旧 interval，避免双重轮询叠加
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      netErrCount.current = 0;
      pollCount.current = 0;
      setGenerating(true);
      // 轮询任务直到 done / failed（关页面不影响服务端任务，重新进页面可再次轮询）
      pollRef.current = setInterval(async () => {
        pollCount.current += 1;
        // IMP-008：最大轮询次数兜底（≈6min），防止极端情况下无限轮询
        if (pollCount.current > MAX_POLLS) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setGenerating(false);
          toastError("生成状态同步超时，请重试");
          return;
        }
        try {
          const r = await fetch(`/api/generation-tasks/${taskId}`);
          const t = await r.json();
          if (!r.ok) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGenTask({ taskId, status: "failed", progress: 0, error: t.error ?? "获取生成结果失败" });
            setGenerating(false);
            toastError(`生成任务失败：${t.error ?? "获取生成结果失败"}`);
            return;
          }
          setGenTask({ taskId, status: t.status, progress: t.progress, error: t.error });
          if (t.status === "done") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            const suggestions = (t.result?.suggestions as StorylineSuggestion[] | undefined) ?? [];
            if (suggestions.length > 0) {
              setGenSuggestions(suggestions);
              setGenExtra("");
            } else {
              toastError("生成结果为空，请重试");
            }
            setGenTask(null);
            setGenerating(false);
            onTaskSettled?.(); // IMP-010：任务已结算，通知父级清理 genTaskId，避免陈旧 id 残留
          } else if (t.status === "failed") {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            toastError(`生成失败：${t.error ?? UNKNOWN_ERROR}`);
            setGenTask(null);
            setGenerating(false);
            onTaskSettled?.(); // IMP-010：同上
          }
        } catch {
          // IMP-008：网络抖动累计计数，超阈值后停轮询并报错，避免无限空转卡死
          netErrCount.current += 1;
          if (netErrCount.current > 5) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setGenerating(false);
            toastError("生成状态同步失败，请重试");
          }
        }
      }, 1500);
    },
    [toastError],
  );

  // 从列表点「AI 生成」后：组件挂载时若已带任务 ID，则立即开始轮询（等价原同步路径的可感知行为）
  useEffect(() => {
    if (initialTaskId) {
      void startPolling(initialTaskId);
    }
  }, [initialTaskId, startPolling]);

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
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
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
  const orphanSides = sides.filter((s) => !resolveParent(s));
  // 自动排序（B 任务）：主线按 order 升序；子线按 状态+order（完结沉底）保证一致呈现
  const sortedMains = [...mains].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const abandonedCount = list.filter((s) => s.status === "abandoned").length;

  const events = selected?.events || [];
  const timelineEvents = events
    .filter((e) => e.kind !== "CLUE")
    .sort((a, b) => a.position - b.position);
  const ownClues = events.filter((e) => e.kind === "CLUE");
  // 主线线索集最深最大：自身 CLUE ∪ 所有子支线的 CLUE，按来源标注
  const aggregatedClues: { clue: (typeof ownClues)[number]; source: string | null }[] =
    selected && selected.type === "main"
      ? [
          ...ownClues.map((c) => ({ clue: c, source: null as string | null })),
          ...list
            .filter((s) => s.parentId === selected.id)
            .flatMap((s) =>
              (s.events || [])
                .filter((e) => e.kind === "CLUE")
                .map((e) => ({ clue: e, source: s.title })),
            ),
        ]
      : ownClues.map((c) => ({ clue: c, source: null as string | null }));

  // ── v1.9 因果链：选中线的事件按时间轴串成因果叙事链（纯函数见 storyline-progress） ──
  const causalNodes = buildCausalChain(list, selectedId);
  const causalClues = selected
    ? selected.type === "main"
      ? aggregatedClues
      : ownClues.map((c) => ({ clue: c, source: null as string | null }))
    : [];

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
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
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
        toastError(`创建生成任务失败：${data.error ?? UNKNOWN_ERROR}`);
        setGenerating(false);
        return;
      }
      const taskId = data.taskId as string;
      setGenTask({ taskId, status: "pending", progress: 0 });
      // 收敛为统一轮询入口（与列表入口挂载即轮询共用 startPolling）
      startPolling(taskId);
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
        toastError("保存失败：" + ((data as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      toastCreated("故事线");
      setGenSuggestions(null);
      setGenExtra("");
      void load();
      onRefresh();
    } catch (err) {
      toastError("保存失败（网络错误）：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setCommitting(false);
    }
  };

  const startEdit = (s: StorylineData) => {
    setEditing(true);
    const se = s.sevenElements && typeof s.sevenElements === "object" ? s.sevenElements : {};
    const isMain = s.type === "main";
    setForm({
      title: s.title,
      description: s.description,
      status: s.status,
      type: s.type,
      parentId: s.parentId ?? "",
      ...(isMain
        ? {
            origin: (se as Record<string, string>).origin || "",
            process: (se as Record<string, string>).process || "",
            result: (se as Record<string, string>).result || "",
          }
        : {
            desire: (se as Record<string, string>).desire || "",
            obstacle: (se as Record<string, string>).obstacle || "",
            action: (se as Record<string, string>).action || "",
            result: (se as Record<string, string>).result || "",
            twist: (se as Record<string, string>).twist || "",
            turn: (se as Record<string, string>).turn || "",
            ending: (se as Record<string, string>).ending || "",
          }),
    });
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const isMain = form.type === "main";
      const sevenElements = isMain
        ? {
            origin: form.origin || "",
            process: form.process || "",
            result: form.result || "",
          }
        : {
            desire: form.desire || "",
            obstacle: form.obstacle || "",
            action: form.action || "",
            result: form.result || "",
            twist: form.twist || "",
            turn: form.turn || "",
            ending: form.ending ? form.ending : null,
          };
      const payload = {
        title: form.title,
        description: form.description,
        status: form.status,
        type: form.type,
        parentId: isMain ? null : form.parentId || null,
        sevenElements,
      };
      const res = await fetch(`/api/storylines/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
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

  // 清理废弃故事线（B 任务）：批量删除所有 status=abandoned 的线
  const cleanupAbandoned = async () => {
    const ids = list.filter((s) => s.status === "abandoned").map((s) => s.id);
    if (ids.length === 0) return;
    setCleaning(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/storylines/${id}`, { method: "DELETE" });
        if (!res.ok) {
          const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
          throw new Error((d as { error?: string }).error || `HTTP ${res.status}`);
        }
      }
      toastSuccess(`已清理 ${ids.length} 条废弃故事线`);
      setShowCleanup(false);
      void load();
      onRefresh();
    } catch (err) {
      toastError("清理失败：" + (err instanceof Error ? err.message : "请重试"));
    } finally {
      setCleaning(false);
    }
  };

  const { deletingId, remove: deleteStoryline } = useConfirmDelete({
    title: "删除故事线",
    description: "确定删除这条故事线？此操作不可恢复。",
    deleteFn: async (id) => {
      const res = await fetch(`/api/storylines/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
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
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
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
      const res = await fetch(`/api/storyline-events/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
        toastError("更新线索失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      void load();
    } catch (err) {
      toastError("更新线索失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };
  const handleClueDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/storyline-events/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
        toastError("删除线索失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      void load();
    } catch (err) {
      toastError("删除线索失败：" + (err instanceof Error ? err.message : "请重试"));
    }
  };

  // 七要素 inline 单字段 PATCH：查看态点卡片即改，无需进入 11 字段大表单
  const handleElementPatch = async (key: string, val: string | null) => {
    if (!selected) return;
    const cur =
      selected.sevenElements && typeof selected.sevenElements === "object"
        ? (selected.sevenElements as Record<string, string | null>)
        : {};
    const next = { ...cur, [key]: val };
    // 按类型过滤：主线只留三要素、支线只留七要素，清掉历史残留字段
    const cleaned = stripElements(next, selected.type);
    try {
      const res = await fetch(`/api/storylines/${selected.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: selected.title,
          description: selected.description ?? "",
          status: selected.status,
          type: selected.type,
          parentId: selected.type === "main" ? null : (selected.parentId ?? null),
          sevenElements: cleaned,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({ error: UNKNOWN_ERROR }));
        toastError("保存失败：" + ((d as { error?: string }).error || `HTTP ${res.status}`));
        return;
      }
      void load();
      onRefresh();
    } catch (err) {
      toastError("保存失败（网络错误）：" + (err instanceof Error ? err.message : "请重试"));
    }
  };

  // 七要素卡片失焦 / ⌘Enter 提交当前编辑
  const commitElement = () => {
    const k = editingKey;
    if (!k || k === "ending") {
      setEditingKey(null);
      return;
    }
    setEditingKey(null);
    handleElementPatch(k, draft);
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
    <>
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
          {abandonedCount > 0 && (
            <button
              onClick={() => setShowCleanup(true)}
              className="flex items-center gap-1.5 rounded-lg border border-[var(--nv-danger)]/40 px-3 py-1.5 text-xs font-medium text-[var(--nv-danger)] transition-colors hover:bg-[var(--nv-danger-soft)]"
              title="删除所有已废弃的故事线"
            >
              <Icon name="trash" size={14} /> 清理废弃({abandonedCount})
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating || !!genSuggestions}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--nv-creative-fill)] px-3 py-1.5 text-xs font-medium text-[#F0EEE8] transition-colors hover:opacity-90 disabled:opacity-50"
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
            <Icon name="bot" size={16} /> AI 生成草稿（可改，确认后保存）
          </div>
          <DialogField label="对下一次生成的补充要求（可选，本次不发送）">
            <DialogInput value={genExtra} onChange={setGenExtra} placeholder="例如：增加一条感情支线" />
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
                    {s.type === "main" ? "主线" : s.type === "thread" ? "伏笔" : "支线"}
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
                  {ELEMENT_META.map(({ key, label }) =>
                    key === "ending" ? (
                      // IMP-018：AI 中间态草稿的「结局」不可编辑——落库时被强制 null 静默丢弃，故改为只读提示
                      <DialogField key={key} label={label}>
                        <div className="rounded-lg border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-3 py-2 text-xs leading-relaxed text-[var(--nv-text-tertiary)]">
                          结局先不填——写完这章、确定走向后再「标记收束」
                        </div>
                      </DialogField>
                    ) : (
                      <DialogField key={key} label={label}>
                        <DialogInput
                          rows={2}
                          value={s.sevenElements[key] || ""}
                          onChange={(v) => updateSuggestionElement(idx, key, v)}
                        />
                      </DialogField>
                    ),
                  )}
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
            >
              放弃
            </Button>
            <Button onClick={handleCommitGen} disabled={committing} className="btn-primary">
              {committing ? (
                <>
                  <Icon name="loader" size={14} className="animate-spin" /> 保存中…
                </>
              ) : (
                "保存到故事线"
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
              <ErrorState
                title="加载失败"
                description={error}
                action={<Button variant="outline" onClick={() => void load()}>重试</Button>}
              />
            )}
            {!loading && !error && list.length === 0 && (
              <EmptyState
                icon="bookmarked"
                title="还没有故事线"
                description="让 AI 基于你的大纲自动规划主线与支线，填充七要素框架"
                action={
                  <button onClick={handleGenerate} disabled={generating} className="btn-ghost text-xs">
                    {generating ? "生成中…" : "AI 自动生成"}
                  </button>
                }
              />
            )}
            {!loading && !error && list.length > 0 && (
              <div className="space-y-1">
                {sortedMains.map((m) => {
                  const children = sortChildrenByStatusThenOrder([
                    ...sides.filter((s) => resolveParent(s)?.id === m.id),
                  ]);
                  const isCollapsed = collapsed.has(m.id);
                  return (
                    <div key={m.id}>
                      <LineNav
                        s={m}
                        selected={selectedId === m.id}
                        onSelect={() => {
                          setSelectedId(m.id);
                          setEditing(false);
                        }}
                        onToggle={() => handleToggleComplete(m)}
                        collapsible
                        collapsed={isCollapsed}
                        childCount={children.length}
                        onToggleCollapse={() =>
                          setCollapsed((prev) => {
                            const n = new Set(prev);
                            if (n.has(m.id)) n.delete(m.id);
                            else n.add(m.id);
                            return n;
                          })
                        }
                      />
                      {!isCollapsed &&
                        children.map((s) => (
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
                  );
                })}
                {/* 独立支线：无归属主线，与主线并列呈现（B 任务） */}
                {orphanSides.length > 0 && (
                  <>
                    <p className="px-1 pt-2 text-[10px] uppercase tracking-wider text-[var(--nv-text-tertiary)]">
                      独立支线
                    </p>
                    {sortChildrenByStatusThenOrder([...orphanSides]).map((s) => (
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
                  </>
                )}
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
                      <option value="thread">伏笔</option>
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
                {/* 支线/伏笔归属主线 */}
                {(form.type === "side" || form.type === "thread") && (
                  <DialogField label="所属主线">
                    <select
                      className="input-glass w-full rounded-lg px-3 py-2 text-sm"
                      value={form.parentId || ""}
                      onChange={(e) => updateField("parentId", e.target.value)}
                    >
                        <option value="">（无归属）</option>
                        {sortedMains.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.title}
                          </option>
                        ))}
                    </select>
                  </DialogField>
                )}
              {/* 七要素改走查看态 inline 编辑，编辑表单只保留元数据字段 */}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setEditing(false)}>
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
                        {selected.type === "main" ? "主线" : selected.type === "thread" ? "伏笔" : "支线"}
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
                          <Icon name="check" size={14} className="text-[var(--nv-success)]" /> 重新开启
                        </>
                      ) : selected.status === "abandoned" ? (
                        <>
                          <Icon name="check" size={14} className="text-[var(--nv-success)]" /> 重新启用
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
                    {onWriteChapter && (
                      <button
                        onClick={() =>
                          onWriteChapter(selected.id, {
                            diffuseCompleted: selected.status === "completed",
                          })
                        }
                        className="flex items-center gap-1 rounded-lg border border-[var(--nv-primary)]/40 px-2.5 py-1.5 text-xs text-[var(--nv-primary)] transition-colors hover:bg-[var(--nv-primary-soft)]"
                        title="据此续写一章"
                      >
                        <Icon name="pencil" size={14} /> 据此续写
                      </button>
                    )}
                  </div>
                </div>

                {/* sticky 子标签导航：把三块变可切换视图，核心七要素常驻为默认标签，不再被埋在底部 */}
                <div className="sticky top-0 z-10 -mx-5 mb-3 border-b border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-5 py-2 backdrop-blur-md">
                  <div className="flex gap-1">
                    {(["elements", "timeline", "clues", "causal"] as const).map((t) => {
                      const labels: Record<"elements" | "timeline" | "clues" | "causal", string> = {
                        elements: selected.type === "main" ? "总纲·三要素" : "总纲·七要素",
                        timeline: "章节时间轴",
                        clues: `线索集 (${aggregatedClues.length})`,
                        causal: `因果链 (${causalNodes.length})`,
                      };
                      const active = activeTab === t;
                      return (
                        <button
                          key={t}
                          onClick={() => setActiveTab(t)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "bg-[var(--nv-primary)] text-white"
                              : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-1)]"
                          }`}
                        >
                          {labels[t]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeTab === "elements" && (
                  <div>
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-[var(--nv-text-tertiary)]">
                      <span>{selected.type === "main" ? "三要素 · 主线总纲" : "七要素 · 总纲"}</span>
                      {selected.status === "completed" && (
                        <span className="rounded-full border border-[var(--nv-success)] px-2 py-0.5 text-[11px] font-medium text-[var(--nv-success)]">
                          已完结 · 要素已自动补齐 ✓
                        </span>
                      )}
                    </div>
                    <p className="mb-2 text-[11px] text-[var(--nv-text-tertiary)]">
                      {selected.type === "main"
                        ? "主线线索密、事件多，用起因 / 经过 / 结果三要素提纲挈领。点任意卡片即可直接改。"
                        : "七要素是这条线的骨架。点任意卡片即可直接改，也可以先写几章、让 AI 在写作后自动回填进展。"}
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {elementsFor(selected.type).map(({ key, icon, label, hint }) => {
                        const se =
                          selected.sevenElements && typeof selected.sevenElements === "object"
                            ? selected.sevenElements
                            : {};
                        const val = (se as Record<string, string | null | undefined>)[key] || "";
                        const isEnding = key === "ending";
                        const isEditing = editingKey === key;
                        return (
                          <div
                            key={key}
                            className={`rounded-xl border bg-[var(--nv-surface-1)] p-3 ${
                              isEditing ? "border-[var(--nv-primary)]" : "border-[var(--nv-border-2)]"
                            }`}
                          >
                            <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-secondary)]">
                              <Icon name={icon} size={14} /> {label}
                            </div>
                            {!isEnding && !isEditing && (
                              <p className="mb-1 text-[11px] text-[var(--nv-text-tertiary)]">{hint}</p>
                            )}
                            {isEnding ? (
                              <div className="flex items-center gap-2">
                                {val ? (
                                  <span className="text-sm text-[var(--nv-success)]">已收束 ✓</span>
                                ) : (
                                  <span className="text-sm text-[var(--nv-text-tertiary)]">待收束</span>
                                )}
                                <button
                                  onClick={() => handleElementPatch("ending", val ? null : "已收束")}
                                  className="ml-auto rounded-lg border border-[var(--nv-border-2)] px-2.5 py-1 text-xs text-[var(--nv-text-secondary)] transition-colors hover:border-[var(--nv-success)]/50 hover:text-[var(--nv-success)]"
                                >
                                  {val ? "取消收束" : "标记收束"}
                                </button>
                              </div>
                            ) : isEditing ? (
                              <textarea
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onBlur={commitElement}
                                onKeyDown={(e) => {
                                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                                    e.preventDefault();
                                    commitElement();
                                  } else if (e.key === "Escape") {
                                    setEditingKey(null);
                                  }
                                }}
                                rows={3}
                                className="w-full resize-none rounded-md border border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] p-2 text-sm leading-relaxed text-[var(--nv-text-primary)] outline-none focus:border-[var(--nv-primary)]"
                              />
                            ) : (
                              <div
                                role="button"
                                tabIndex={0}
                                onClick={() => {
                                  setEditingKey(key);
                                  setDraft(val);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    setEditingKey(key);
                                    setDraft(val);
                                  }
                                }}
                                className="min-h-[1.5rem] cursor-text whitespace-pre-wrap rounded-md text-sm leading-relaxed text-[var(--nv-text-primary)]"
                              >
                                {val || <span className="text-[var(--nv-text-tertiary)]">点击填写</span>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeTab === "timeline" && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)]">
                      <Icon name="history" size={14} />
                      {selected.type === "main"
                        ? "主线时间轴（简略 · 可滚动浏览全貌）"
                        : "章节进展时间轴（写作自动记录关键情节节点）"}
                    </div>
                    {timelineEvents.length > 0 ? (
                      selected.type === "main" ? (
                        // 主线：紧凑竖向、可滚动，只列发生了什么
                        <ol className="max-h-[320px] space-y-1.5 overflow-y-auto pr-1">
                          {timelineEvents.map((b) => (
                            <li
                              key={b.id}
                              className="flex gap-2 border-l-2 border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-1 pl-2.5 text-xs leading-relaxed text-[var(--nv-text-secondary)]"
                            >
                              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--nv-accent)]" />
                              <span className="line-clamp-2">
                                <span className="font-medium text-[var(--nv-text-primary)]">
                                  {b.title || (b.kind === "MILESTONE" ? "里程碑" : "事件")}
                                </span>
                                {b.content ? `：${(b.content || "").slice(0, 60)}` : ""}
                              </span>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        // 支线：详细时间轴，完整呈现
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
                      )
                    ) : (
                      <EmptyState
                        icon="history"
                        title="还没写这一线的章节"
                        description="时间轴会在你写作时自动记录关键情节节点——先去写一章，回来就能看到它长出来。"
                        action={
                          onWriteChapter ? (
                            <button onClick={() => onWriteChapter()} className="btn-ghost text-xs">
                              去写一章
                            </button>
                          ) : undefined
                        }
                      />
                    )}
                  </div>
                )}

                {activeTab === "clues" && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)]">
                      <Icon name="tag" size={14} />
                      {selected.type === "main" ? "主线线索集 · 汇聚本线与所有支线" : "线索集 · 你埋下的坑（伏笔/物证/人物备注）"}
                      <span className="rounded bg-[var(--nv-surface-2)] px-1 text-[9px]">{aggregatedClues.length}</span>
                    </div>
                    {aggregatedClues.length === 0 && (
                      <p className="mb-2 text-xs text-[var(--nv-text-tertiary)]">还没埋线索。伏笔、物证、人物备注都可以记在这里——写的时候随时回看，别漏掉自己挖的坑。</p>
                    )}
                    <div className="space-y-2">
                      {aggregatedClues.map(({ clue, source }) => (
                        <div key={clue.id}>
                          {source && (
                            <div className="mb-1 text-[10px] text-[var(--nv-text-tertiary)]">来自支线：{source}</div>
                          )}
                          <ClueRow clue={clue} onPatch={handleCluePatch} onDelete={handleClueDelete} />
                        </div>
                      ))}
                      {/* 新增线索 */}
                      <div className="rounded-xl border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <DialogInput
                            value={newClueTag}
                            onChange={setNewClueTag}
                            placeholder="标签（如：关键道具 / 人物线索）"
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
                          <Button variant="outline" onClick={handleAddClue} className="text-[11px]">
                            <Icon name="plus" size={12} /> 添加线索
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === "causal" && (
                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-text-tertiary)]">
                      <Icon name="gitBranch" size={14} />
                      {selected.type === "main"
                        ? "因果链 · 汇聚本线与所有支线/伏笔的事件流向"
                        : "因果链 · 本条线的事件因果流向"}
                    </div>
                    <p className="mb-3 text-[11px] leading-relaxed text-[var(--nv-text-secondary)]">
                      把写作自动记录的关键节点按时间串成一条因果叙事：上一个是「因」、下一个是「果」。跨线事件标注归属，可见主线如何牵动支线、伏笔如何兑现。
                    </p>

                    {/* 悬而未决的因：未兑现线索 */}
                    {causalClues.length > 0 && (
                      <div className="mb-3 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2.5">
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--nv-warning)]">
                          <Icon name="link" size={13} /> 悬而未决的因 · 未兑现线索 ({causalClues.length})
                        </div>
                        <ul className="space-y-1">
                          {causalClues.map(({ clue, source }) => (
                            <li key={clue.id} className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--nv-text-secondary)]">
                              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[var(--nv-warning)]" />
                              <span>
                                {clue.tag && <span className="text-[var(--nv-text-muted)]">[{clue.tag}] </span>}
                                <span className="text-[var(--nv-text-primary)]">{clue.title || "（未命名线索）"}</span>
                                {source && <span className="text-[var(--nv-text-muted)]"> · 来自 {source}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* 因果链主体 */}
                    {causalNodes.length > 0 ? (
                      <ol className="relative space-y-0 border-l-2 border-[var(--nv-border-1)] pl-4">
                        {causalNodes.map((node, i) => (
                          <li key={node.event.id} className="relative pb-4 last:pb-0">
                            <span
                              className={`absolute -left-[23px] top-1 h-3 w-3 rounded-full ring-2 ring-[var(--nv-surface-1)] ${
                                node.isMain
                                  ? "bg-[var(--nv-primary)]"
                                  : node.lineType === "thread"
                                    ? "bg-[var(--nv-info)]"
                                    : "bg-[var(--nv-accent)]"
                              }`}
                            />
                            <div className="rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-2.5 transition-colors hover:border-[var(--nv-border-1)] hover:bg-[var(--nv-surface-2)]">
                              <div className="mb-1 flex items-center gap-1.5">
                                <span
                                  className={`rounded bg-[var(--nv-surface-2)] px-1.5 py-0.5 text-[10px] font-medium ${
                                    node.isMain
                                      ? "text-[var(--nv-primary)]"
                                      : node.lineType === "thread"
                                        ? "text-[var(--nv-info)]"
                                        : "text-[var(--nv-accent)]"
                                  }`}
                                >
                                  {node.isMain ? "主线" : node.lineType === "thread" ? "伏笔" : "支线"}
                                </span>
                                <span className="truncate text-xs text-[var(--nv-text-muted)]">{node.lineTitle}</span>
                                <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--nv-text-muted)]">#{i + 1}</span>
                              </div>
                              <div className="text-sm font-medium text-[var(--nv-text-primary)]">
                                <Icon
                                  name={node.event.kind === "MILESTONE" ? "star" : "arrowRight"}
                                  size={12}
                                  className="inline-block align-text-bottom"
                                />{" "}
                                {node.event.title || (node.event.kind === "MILESTONE" ? "里程碑" : "事件")}
                              </div>
                              {node.event.content && (
                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed text-[var(--nv-text-secondary)]">
                                  {node.event.content}
                                </p>
                              )}
                            </div>
                            {i < causalNodes.length - 1 && (
                              <div className="ml-1 mt-1 flex items-center gap-1 text-[10px] text-[var(--nv-text-secondary)]">
                                <Icon name="arrowDown" size={11} /> 因 → 果
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <EmptyState
                        icon="gitBranch"
                        title="这条线还没有事件"
                        description="写一章，写作会自动记录关键情节节点，因果链就会长出来。"
                        action={
                          onWriteChapter ? (
                            <button onClick={() => onWriteChapter()} className="btn-ghost text-xs">
                              去写一章
                            </button>
                          ) : undefined
                        }
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
    {showCleanup && (
      <Modal open onClose={() => setShowCleanup(false)} bare panelClassName="max-w-sm" labelledBy="cleanup-title">
        <div className="p-5">
          <h3 id="cleanup-title" className="flex items-center gap-2 text-base font-semibold text-[var(--nv-text-primary)]">
            <Icon name="trash" size={16} className="text-[var(--nv-danger)]" /> 清理废弃故事线
          </h3>
          <p className="mt-2 text-sm text-[var(--nv-text-secondary)]">
            将永久删除 {abandonedCount} 条「已废弃」的故事线，此操作不可恢复。确定继续？
          </p>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowCleanup(false)}>取消</Button>
            <Button onClick={cleanupAbandoned} disabled={cleaning} className="bg-[var(--nv-danger)] text-white hover:opacity-90">
              {cleaning ? "清理中…" : "删除"}
            </Button>
          </div>
        </div>
      </Modal>
    )}
    </>
  );
}

function LineNav({
  s,
  selected,
  onSelect,
  onToggle,
  collapsible,
  collapsed,
  childCount,
  onToggleCollapse,
}: {
  s: StorylineData;
  selected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  collapsible?: boolean;
  collapsed?: boolean;
  childCount?: number;
  onToggleCollapse?: () => void;
}) {
  const p = computeStorylineProgress(s);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`${s.title}${selected ? "，已选中" : ""}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      className={`group w-full cursor-pointer rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-[var(--nv-accent)]/50 bg-[var(--nv-accent-soft)]"
          : "border-transparent hover:bg-[var(--nv-surface-2)]"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <Icon
          name={s.type === "main" ? "star" : s.type === "thread" ? "link" : "gitBranch"}
          size={13}
          className={s.type === "main" ? "text-[var(--nv-accent)]" : s.type === "thread" ? "text-[var(--nv-info)]" : "text-[var(--nv-text-tertiary)]"}
        />
        <span
          className={`flex-1 line-clamp-2 text-xs ${
            selected
              ? "font-medium text-[var(--nv-accent)]"
              : s.type === "main"
                ? "font-semibold text-[var(--nv-text-primary)]"
                : "font-normal text-[var(--nv-text-secondary)]"
          }`}
        >
          {s.title}
          {collapsible && collapsed && childCount ? (
            <span className="ml-1 text-[9px] text-[var(--nv-text-tertiary)]">({childCount})</span>
          ) : null}
        </span>
        {s.status === "completed" && (
          <span className="rounded bg-[var(--nv-success)]/15 px-1 text-[9px] text-[var(--nv-success)]">
            完结
          </span>
        )}
        {collapsible && (
          <button
            type="button"
            aria-label={collapsed ? "展开支线" : "收起支线"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleCollapse?.();
            }}
            className="shrink-0 rounded-full p-0.5 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-accent)]"
            title={collapsed ? "展开支线" : "收起支线"}
          >
            <Icon name={collapsed ? "chevronRight" : "chevronDown"} size={13} />
          </button>
        )}
        <button
          type="button"
          aria-label={s.status === "completed" ? "取消完结" : "标记完结"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="shrink-0 rounded-full text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-accent)] focus-visible:ring-2 focus-visible:ring-ring/50"
          title="标记完结"
        >
          {s.status === "completed" ? (
            <Icon name="check" size={12} className="text-[var(--nv-success)]" />
          ) : (
            <Icon name="circle" size={12} />
          )}
        </button>
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
    </div>
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
                aria-label="编辑线索"
                className="rounded p-1 text-[var(--nv-text-tertiary)] hover:text-[var(--nv-primary)]"
                title="编辑线索"
              >
                <Icon name="pencil" size={12} />
              </button>
              <button
                onClick={() => onDelete(clue.id)}
                aria-label="删除线索"
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
