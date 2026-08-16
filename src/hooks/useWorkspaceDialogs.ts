import { useState, useEffect } from "react";
import type { CharacterData, LorebookData } from "@/components/workspace/types";
import type { OutlineItem } from "@/components/workspace/BatchWriteDialog";
import { toastError, toastSuccess, toastInfo } from "@/components/ui/toast";

export interface BatchWriteState {
  open: boolean;
  phase: "input" | "running" | "review";
  count: number;
  note: string;
  progress: { done: number; total: number; pct: number };
  outlines: OutlineItem[];
  checked: Set<string>;
  taskId: string | null;
  writeTaskId: string | null;
  startedAt: number | null;
  elapsedSec: number;
  confirming: boolean;
  capsuleHidden: boolean;
}

export interface UseWorkspaceDialogsOptions {
  /** 已有章节时大纲对话框默认「追加模式」（替代原 useState(existingChapterCount > 0) 派生初值） */
  defaultOutlineAppend?: boolean;
}

/**
 * 工作台弹窗状态中心（v2.50.1 上帝组件拆解第一刀）。
 * 集中所有对话框开关 state + 批量写作状态，并把「章纲轮询 / 实时耗时」两个纯弹窗内轮询
 * 收敛进来；正文任务轮询因依赖 loadProject 仍留在 WorkspacePage。
 * 返回字段名与原 page 内 useState 变量名保持一致，便于 WorkspacePage 近乎零改名地改用 `d.xxx`。
 */
export function useWorkspaceDialogs(opts: UseWorkspaceDialogsOptions = {}) {
  // ── 角色/词条编辑弹窗 ──────────────────────
  const [editingCharacter, setEditingCharacter] = useState<CharacterData | null>(null);
  const [editingLore, setEditingLore] = useState<LorebookData | null>(null);
  const [showNewCharacter, setShowNewCharacter] = useState(false);

  // ── 弹窗状态 ──────────────────────────────
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importWizardMode, setImportWizardMode] = useState<"auto" | "settings" | "quick">("auto");
  const [showAutomationSettings, setShowAutomationSettings] = useState(false);
  const [showBuildConfig, setShowBuildConfig] = useState(false);
  const [showMemoryDecay, setShowMemoryDecay] = useState(false);
  const [showProjectConfig, setShowProjectConfig] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);

  // ── 大纲生成对话框 ────────────────────────
  const [showOutlineDialog, setShowOutlineDialog] = useState(false);
  const [outlineChapterCount, setOutlineChapterCount] = useState(8);
  const [outlineCustomChapterCount, setOutlineCustomChapterCount] = useState("");
  const [outlineCustomPrompt, setOutlineCustomPrompt] = useState("");
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [outlineGenRunning, setOutlineGenRunning] = useState(false);
  const [outlineCapsuleHidden, setOutlineCapsuleHidden] = useState(false);
  const [outlinePreviewChapters, setOutlinePreviewChapters] = useState<
    { title: string; summary: string; coreConflict: string; characters: string[] }[]
  >([]);
  const [outlineRaw, setOutlineRaw] = useState("");
  const [outlineError, setOutlineError] = useState("");
  const [outlineAppendMode, setOutlineAppendMode] = useState(opts.defaultOutlineAppend ?? false);

  // ── 批量写作（A4 后台任务，受控统一入口）────────
  const [batchWrite, setBatchWrite] = useState<BatchWriteState>({
    open: false,
    phase: "input",
    count: 3,
    note: "",
    progress: { done: 0, total: 0, pct: 0 },
    outlines: [],
    checked: new Set(),
    taskId: null,
    writeTaskId: null,
    startedAt: null,
    elapsedSec: 0,
    confirming: false,
    capsuleHidden: false,
  });

  // 章纲任务轮询：完成 → 自动重开弹窗展示章纲（review）；失败 → 回到 input
  useEffect(() => {
    if (!batchWrite.taskId || batchWrite.phase !== "running") return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/babylore/fill-task/${batchWrite.taskId}`);
        const t = await r.json();
        setBatchWrite((s) => ({ ...s, progress: { done: t.done || 0, total: t.total || 0, pct: t.progress || 0 } }));
        if (t.status === "completed") {
          clearInterval(timer);
          const items: OutlineItem[] = Array.isArray(t.result?.outlines) ? t.result.outlines : [];
          if (items.length === 0) {
            setBatchWrite((s) => ({ ...s, phase: "input", open: true, taskId: null, startedAt: null, progress: { done: 0, total: 0, pct: 0 } }));
            toastError("章纲生成失败：未返回任何章纲，请重试");
            return;
          }
          setBatchWrite((s) => ({
            ...s,
            phase: "review",
            open: true,
            taskId: null,
            startedAt: null,
            outlines: items,
            checked: new Set(items.map((i) => i.nodeId)),
            progress: { done: items.length, total: items.length, pct: 100 },
          }));
          toastSuccess(`章纲生成完成：${items.length} 章，可逐章查看/编辑后确认生成正文`);
        } else if (t.status === "failed") {
          clearInterval(timer);
          setBatchWrite((s) => ({ ...s, phase: "input", open: true, taskId: null, startedAt: null, progress: { done: 0, total: 0, pct: 0 } }));
          toastError("章纲生成失败：" + (t.error || "未知错误"));
        }
      } catch { /* 下轮重试 */ }
    }, 2500);
    return () => clearInterval(timer);
  }, [batchWrite.taskId, batchWrite.phase]);

  // 实时运行耗时（running 阶段每秒刷新）
  useEffect(() => {
    if (batchWrite.phase !== "running" || !batchWrite.startedAt) return;
    const timer = setInterval(() => {
      setBatchWrite((s) => (s.startedAt ? { ...s, elapsedSec: Math.floor((Date.now() - s.startedAt) / 1000) } : s));
    }, 1000);
    return () => clearInterval(timer);
  }, [batchWrite.phase, batchWrite.startedAt]);

  // ── 导出/备份弹窗 ──
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);

  // ── 冲突推演 ──
  const [showConflict, setShowConflict] = useState(false);

  return {
    editingCharacter, setEditingCharacter,
    editingLore, setEditingLore,
    showNewCharacter, setShowNewCharacter,
    showStyleEditor, setShowStyleEditor,
    showImportWizard, setShowImportWizard,
    importWizardMode, setImportWizardMode,
    showAutomationSettings, setShowAutomationSettings,
    showBuildConfig, setShowBuildConfig,
    showMemoryDecay, setShowMemoryDecay,
    showProjectConfig, setShowProjectConfig,
    showProjectSettings, setShowProjectSettings,
    showOutlineDialog, setShowOutlineDialog,
    outlineChapterCount, setOutlineChapterCount,
    outlineCustomChapterCount, setOutlineCustomChapterCount,
    outlineCustomPrompt, setOutlineCustomPrompt,
    outlineGenerating, setOutlineGenerating,
    outlineGenRunning, setOutlineGenRunning,
    outlineCapsuleHidden, setOutlineCapsuleHidden,
    outlinePreviewChapters, setOutlinePreviewChapters,
    outlineRaw, setOutlineRaw,
    outlineError, setOutlineError,
    outlineAppendMode, setOutlineAppendMode,
    batchWrite, setBatchWrite,
    showExportDialog, setShowExportDialog,
    showBackupDialog, setShowBackupDialog,
    showConflict, setShowConflict,
  };
}
