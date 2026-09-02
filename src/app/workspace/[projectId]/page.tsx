"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useProjectStore, useWriterStore } from "@/store";
import { invalidateQueries } from "@/hooks/useApi";
import { NODE_TYPE } from "@/core/node-type";
import { chapterNodesOf, allConfirmedOf, narrativeStageOf } from "@/core/workspace-derive";
export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { PostGenPanel } from "@/components/workspace/PostGenPanel";
import { Toolbar } from "@/components/workspace/Toolbar";
import type { ToolboxItem } from "@/components/workspace/ToolboxDialog";
import { SaveConflictModal } from "@/components/workspace/SaveConflictModal";
import { LeftPanel } from "@/components/workspace/LeftPanel";
import { CenterPanel } from "@/components/workspace/CenterPanel";
import { RightPanel } from "@/components/workspace/RightPanel";
import { type OutlineItem } from "@/components/workspace/BatchWriteDialog";
import { PreGenConfirm } from "@/components/workspace/PreGenConfirm";
import { DrawCards } from "@/components/workspace/DrawCards";
import { OnboardingModal } from "@/components/workspace/OnboardingModal";
import type { ProjectData, CharacterData, LorebookData, StoryNodeData, ReviewIssue, SSEEvent } from "@/components/workspace/types";
import { confirmDialog, promptDialog, toastError, toastSuccess, toastInfo, toastWarning } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { RefineDiffModal } from "@/components/workspace/RefineDiffModal";
import { useShortcut } from "@/components/ShortcutProvider";
import { useFocusTrap } from "@/hooks/use-focus-trap";
import { useWorkspaceDialogs } from "@/hooks/useWorkspaceDialogs";
import { WorkspaceDialogs } from "@/components/workspace/WorkspaceDialogs";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  // ── 生成步骤状态 ──────────────────────────
  const [genStep, setGenStep] = useState<"" | "loading-cards" | "confirming" | "generating" | "reviewing" | "summarizing" | "done" | "error">("");
  // 宝宝流记忆召回面板：写章节/微调/续写时实时展示已注入写作的记忆（含当前生效人设阶段）
  const [recallMemories, setRecallMemories] = useState<any[]>([]);
  const genStepLabels: Record<string, { icon: React.ReactNode; label: string }> = {
    "loading-cards": { icon: <Icon name="search" size={14} className="animate-pulse" />, label: "AI 正在分析角色调度..." },
    "confirming": { icon: <Icon name="clipboard" size={14} />, label: "等待确认角色选择" },
    "generating": { icon: <Icon name="pencil" size={14} className="animate-pulse" />, label: "AI 正在写作..." },
    "reviewing": { icon: <Icon name="search" size={14} className="animate-pulse" />, label: "AI 正在审校..." },
    "summarizing": { icon: <Icon name="package" size={14} />, label: "生成章节摘要..." },
    "done": { icon: <Icon name="check" size={14} className="text-success" />, label: "生成完成" },
    "error": { icon: <Icon name="alert" size={14} className="text-danger" />, label: "生成出错" },
  };
  const [chapterOutlineStatus, setChapterOutlineStatus] = useState<"" | "generating" | "done" | "error">("");

  // ── 项目数据 ──────────────────────────────
  // FE-8：project 数据统一收口到 useProjectStore（loadProject 写入，面板直接读取），消除本地 project 与 store 并存
  const project = useProjectStore((s) => s.project);
  // v2.50.1：弹窗状态集中到 useWorkspaceDialogs（早于所有弹窗引用，规避 TDZ）
  const existingChapterCount = project?.storyNodes.filter((n) => n.type === NODE_TYPE.CHAPTER && !n.parentId).length || 0;
  const dialogs = useWorkspaceDialogs({ defaultOutlineAppend: existingChapterCount > 0 });
  // 解构弹窗状态，下方原有引用（setShowOutlineDialog / batchWrite / outlineChapterCount 等）零改动
  const {
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
  } = dialogs;
  // 确认流程：全书确认进度派生值
  const chapterNodes = chapterNodesOf(project);
  const allConfirmed = allConfirmedOf(chapterNodes);
  const projectConfirmedAt = project?.confirmedAt || null;
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<StoryNodeData | null>(null);
  // v2.50.2：专注写作模式（Zen）——隐藏侧栏/工具栏，只留正文 + 打字机滚动
  const [zenMode, setZenMode] = useState(false);
  // P2-2：被动展示叙事阶段名——基于当前章在全书章节列表中的进度位置推导，复用 computeNarrativeStage。
  // 主线被标记 completed 时视为收尾；否则不靠章数硬判（用户可写数百章而不被提前结局）。
  const narrativeStage = narrativeStageOf(selectedNode?.id, chapterNodes, project?.storylines);

  const handleSelectNode = (node: StoryNodeData) => {
    if (selectedNode?.id !== node.id) {
      useWriterStore.getState().resetStream();
      setReviewResult(null);
      setChapterOutlinePrompt("");
      if (typeof window !== "undefined" && projectId) localStorage.removeItem(`novel-forge-flash-prompt-${projectId}`);
    }
    setSelectedNode(node);
  };

  // 命令面板（Cmd/Ctrl+K）跳转参数：?node / ?editCharacter / ?editLore / ?tab
  const searchParams = useSearchParams();
  useEffect(() => {
    if (!project) return;
    const nodeId = searchParams.get("node");
    if (nodeId && (project as any).storyNodes) {
      const n = (project as any).storyNodes.find((x: any) => x.id === nodeId);
      if (n) handleSelectNode(n);
    }
    const ec = searchParams.get("editCharacter");
    if (ec && (project as any).characters) {
      const c = (project as any).characters.find((x: any) => x.id === ec);
      if (c) setEditingCharacter(c);
    }
    const el = searchParams.get("editLore");
    if (el && (project as any).lorebookEntries) {
      const l = (project as any).lorebookEntries.find((x: any) => x.id === el);
      if (l) setEditingLore(l);
    }
    const tab = searchParams.get("tab");
    if (tab) setLeftPanel(tab as "characters" | "world" | "outline" | "storylines" | "rules" | "digest");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, searchParams]);

  // ── 生成状态 ──────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [reviewResult, setReviewResult] = useState<{ passed: boolean; issues: ReviewIssue[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── 选中文本（传给 AI 对话栏） ──────────
  const [selectedText, setSelectedText] = useState("");

  // ── 作者指令（临时态：跳转即丢，不持久化） ──
  const [authorNote, setAuthorNote] = useState("");
  const handleAuthorNoteChange = (v: string) => {
    setAuthorNote(v);
  };
  const [targetWordCount, setTargetWordCount] = useState(3000);

  // ── 面板状态 ──────────────────────────────
  const [leftPanel, setLeftPanel] = useState<"characters" | "world" | "outline" | "storylines" | "rules" | "digest">("outline");
  // v2.0.14：右侧栏最小化由父组件控制（true=最小化竖条，false=完整面板），保证关闭后仍可从竖条随时拉回；展开时自动收起左栏（互斥，桌面只一侧可见）
  const [rightMinimized, setRightMinimized] = useState(false);
  // 窄屏左右栏抽屉开合（桌面端由 lg: 断点复位为内联，此状态仅在 <lg 生效）
  const [leftDrawerOpen, setLeftDrawerOpen] = useState(false);
  const [rightDrawerOpen, setRightDrawerOpen] = useState(false);
  // 无障碍：窄屏模态抽屉（此处为 div 实现）的焦点陷阱（仅抽屉打开时激活，桌面常驻侧栏不受影响）
  const leftDrawerRef = useRef<HTMLDivElement>(null);
  const rightDrawerRef = useRef<HTMLDivElement>(null);
  const leftDrawerTitleId = useId();
  const rightDrawerTitleId = useId();
  useFocusTrap(leftDrawerRef, leftDrawerOpen, () => setLeftDrawerOpen(false));
  useFocusTrap(rightDrawerRef, rightDrawerOpen, () => setRightDrawerOpen(false));
  // FE-N5：桌面端左栏折叠（[ 触发）
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  // ── 弹窗状态已迁移至 useWorkspaceDialogs（v2.50.1）──
  const [extractionData, setExtractionData] = useState<any>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [conflict, setConflict] = useState<{
    nodeId: string;
    mine: Record<string, unknown>;
    server: { editVersion: number; title?: string | null; outline?: string | null; content?: string | null; notes?: string | null };
  } | null>(null);
  const [viewMode, setViewMode] = useState<"volume" | "flat">("volume");

  // ── FE-N5 全局快捷键 ─────────────────────
  // 保存当前章节：PUT 回写 selectedNode.content（与编辑器落库同源端点）
  const handleSaveNode = async () => {
    if (!selectedNode) {
      toastInfo("请先选中一个章节再保存");
      return;
    }
    const body = { content: selectedNode.content, expectedVersion: selectedNode.editVersion };
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const node = await res.json();
        setSelectedNode(node);
        // FE-8 一致性：保存成功后把服务端权威节点同步回 store，避免「本地选中新、store 旧」的脏数据
        useProjectStore.getState().updateNode(node.id, node);
        toastSuccess("已保存 ✓");
      } else if (res.status === 409) {
        const d = (await res.json().catch(() => ({} as any)));
        if (d.conflict) setConflict({ nodeId: selectedNode.id, mine: body, server: d.server });
        else toastError(d.error || `保存失败（${res.status}）`);
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || `保存失败（${res.status}）`);
      }
    } catch (err) {
      toastError("保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  // FE-N8：保存冲突解决——以服务端当前版本为基准重新提交，或采用库里版本
  const resolveConflict = async (action: "mine" | "theirs" | "both") => {
    if (!conflict) return;
    const { nodeId, mine, server } = conflict;
    if (action === "theirs") {
      setSelectedNode((prev: any) =>
        prev ? { ...prev, editVersion: server.editVersion, title: server.title, outline: server.outline, content: server.content } : prev
      );
      setConflict(null);
      toastInfo("已采用库里版本");
      return;
    }
    const payload: Record<string, unknown> = { ...mine, expectedVersion: server.editVersion };
    if (action === "both") {
      const stamp = new Date().toISOString().slice(0, 10);
      const memo = `\n【本地未保存版本备份 ${stamp}】\n大纲：\n${(mine.outline as string) ?? ""}\n正文：\n${((mine.content as string) ?? "").slice(0, 2000)}`;
      payload.notes = (server.notes ? server.notes + "\n" : "") + memo;
    }
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const node = await res.json();
        setSelectedNode(node);
        // FE-8 一致性：解决冲突后同样同步回 store
        useProjectStore.getState().updateNode(node.id, node);
        setConflict(null);
        toastSuccess(action === "both" ? "已保留双方（库里版本存为备注，您的版本已覆盖）" : "已用您的版本覆盖");
      } else {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || "解决冲突失败");
      }
    } catch (err) {
      toastError("解决冲突失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  // v1.4.0：世界时间已删除（不再手动维护，交 LLM 判断）

  useShortcut("save-node", "mod+s", "保存当前章节", () => { void handleSaveNode(); }, { allowInEditable: true });
  useShortcut("new-chapter", "n", "新建章节", () => { void handleAddSection(); });
  // v2.0.14：右侧栏快捷键改为 toggle 最小化（默认=false=展开），展开时自动收起左栏（互斥，只一侧可见）
  useShortcut("toggle-right", "]", "切换右侧栏", () => setRightMinimized((v) => { const next = !v; if (!next) setLeftCollapsed(true); return next; }));
  useShortcut("toggle-left", "[", "切换左侧栏", () => setLeftCollapsed((v) => !v));
  useShortcut("zen-mode", "mod+.", "专注写作模式（禅模式）", () => setZenMode((v) => !v));

  // ── 文风模板 ──────────────────────────────
  const [styleTemplateId, setStyleTemplateId] = useState<string | undefined>();

  // ── 续写状态 ──────────────────────────────
  const [continueLoading, setContinueLoading] = useState(false);

  // ── 微调状态 ──────────────────────────────
  const [refineMode, setRefineMode] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const handleRefineInstructionChange = (v: string) => {
    setRefineInstruction(v);
  };
  // #124 精修 diff 预览：精修完成后对比原/新正文，需用户显式「应用」或「撤销」
  const [refineDiff, setRefineDiff] = useState<{ old: string; new: string } | null>(null);

  // ── 章纲提示词（临时态：跳转即丢，不持久化） ──
  const [chapterOutlinePrompt, setChapterOutlinePrompt] = useState("");
  const handleChapterOutlinePromptChange = (v: string) => {
    setChapterOutlinePrompt(v);
  };

  // ── 章节更新系统 ──────────────────────────
  const [lastChapterContent, setLastChapterContent] = useState("");
  const [lastChapterTitle, setLastChapterTitle] = useState("");
  // 本地蒸馏结果（SSE 推送 → PostGenPanel 展示）
  const [distillSummary, setDistillSummary] = useState<{
    entityCount: number; stateChangeCount: number; foreshadowCount: number;
    consistencyIssueCount: number; elapsedMs: number;
    foreshadowCreated: number; foreshadowUpdated: number;
    entitiesAutoCreated: number; entitiesSkipped: number;
  } | null>(null);
  // 废词扫描结果（SSE 推送）
  const [forbiddenScanResult, setForbiddenScanResult] = useState<{
    passed: boolean; qualityScore: number; fuzzyDensity: number;
    bySeverity: Record<string, number>; byCategory: Record<string, number>;
    matches: any[]; totalMatches: number; summary: string;
  } | null>(null);
  // 逻辑自查结果（SSE 推送）
  const [logicCheckResult, setLogicCheckResult] = useState<{
    passed: boolean; issues: any[]; summary: string;
  } | null>(null);

  // ── 批量写作状态已迁移至 useWorkspaceDialogs（v2.50.1）──

  // ── 大纲生成状态已迁移至 useWorkspaceDialogs（v2.50.1）──

  // ── 抽卡模式 ──────────────────────────────
  const [showDrawCards, setShowDrawCards] = useState(false);

  const handleDrawChapterOutline = () => {
    if (!selectedNode || !project) { toastInfo("请先选中一个章节节点"); return; }
    setShowDrawCards(true);
  };

  // v1.5.0 批量写作：启动后台任务 + 轮询进度（可关窗口，任务继续）
  // v2.0.4：受控改造——弹窗状态全在 batchWrite 上；轮询放父层，章纲完成后自动重开弹窗。
  const openBatchWrite = () => {
    if (!project) return;
    setBatchWrite((s) => ({ ...s, open: true, phase: "input" }));
  };

  // 阶段1：启动章纲生成（mode:"outline"）
  const startBatchOutline = async () => {
    if (!project) return;
    setBatchWrite((s) => ({
      ...s,
      phase: "running",
      progress: { done: 0, total: s.count, pct: 0 },
      startedAt: Date.now(),
      elapsedSec: 0,
      capsuleHidden: false,
    }));
    try {
      const res = await fetch("/api/story/batch-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          count: batchWrite.count,
          authorNote: batchWrite.note || undefined,
          mode: "outline",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.taskId) {
        toastError(d.error || "启动失败");
        setBatchWrite((s) => ({ ...s, phase: "input" }));
        return;
      }
      setBatchWrite((s) => ({ ...s, taskId: d.taskId }));
      toastInfo("章纲生成已启动（后台运行），完成后自动回到本窗口");
    } catch (e) {
      toastError("启动失败：" + (e instanceof Error ? e.message : "网络错误"));
      setBatchWrite((s) => ({ ...s, phase: "input" }));
    }
  };

  // 阶段2：保存编辑后的章纲 → 启动正文生成（mode:"write"），后台运行，右下角看进度
  const confirmBatchWrite = async () => {
    if (!project) return;
    const ids = batchWrite.outlines.filter((i) => batchWrite.checked.has(i.nodeId)).map((i) => i.nodeId);
    if (ids.length === 0) {
      toastError("请至少勾选一章");
      return;
    }
    setBatchWrite((s) => ({ ...s, confirming: true }));
    try {
      // 逐章保存编辑后的章纲（只有勾选的才发，省请求）
      for (const item of batchWrite.outlines) {
        if (!batchWrite.checked.has(item.nodeId)) continue;
        await fetch(`/api/story/nodes/${item.nodeId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ outline: item.outline }),
        });
      }
      const res = await fetch("/api/story/batch-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          nodeIds: ids,
          authorNote: batchWrite.note || undefined,
          mode: "write",
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (!d.taskId) {
        toastError(d.error || "启动失败");
        setBatchWrite((s) => ({ ...s, confirming: false }));
        return;
      }
      setBatchWrite((s) => ({
        ...s,
        confirming: false,
        open: false,
        writeTaskId: d.taskId,
        taskId: null,
        phase: "review",
        outlines: [],
        checked: new Set(),
        capsuleHidden: false,
      }));
      toastInfo("正文生成已启动（后台运行），进度在右下角查看");
    } catch (e) {
      toastError("启动失败：" + (e instanceof Error ? e.message : "网络错误"));
      setBatchWrite((s) => ({ ...s, confirming: false }));
    }
  };

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

  // 正文任务轮询：完成 → toast + 刷新项目；失败 → toast
  useEffect(() => {
    if (!batchWrite.writeTaskId) return;
    const timer = setInterval(async () => {
      try {
        const r = await fetch(`/api/babylore/fill-task/${batchWrite.writeTaskId}`);
        const t = await r.json();
        setBatchWrite((s) => ({ ...s, progress: { done: t.done || 0, total: t.total || 0, pct: t.progress || 0 } }));
        if (t.status === "completed") {
          clearInterval(timer);
          toastSuccess(`批量写作完成：${t.done}/${t.total} 章已生成`);
          void loadProject();
          setBatchWrite((s) => ({ ...s, writeTaskId: null, capsuleHidden: true }));
        } else if (t.status === "failed") {
          clearInterval(timer);
          toastError("批量写作失败：" + (t.error || "未知错误"));
          setBatchWrite((s) => ({ ...s, writeTaskId: null, capsuleHidden: true }));
        }
      } catch { /* 下轮重试 */ }
    }, 3000);
    return () => clearInterval(timer);
  }, [batchWrite.writeTaskId]);

  const handleDrawSelect = async (card: { outline: string; characters: string[]; coreConflict: string; mood: string; cardLabel?: string }, storylineId?: string, characterIds?: string[]) => {
    if (!selectedNode) return;
    setShowDrawCards(false);
    try {
      const body = { outline: card.outline, activeCharacters: characterIds || [], expectedVersion: selectedNode.editVersion };
      const res = await fetch(`/api/story/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 409) {
        const d = (await res.json().catch(() => ({} as any)));
        if (d.conflict) { setConflict({ nodeId: selectedNode.id, mine: body, server: d.server }); return; }
      }
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toastError(d.error || "章纲保存失败，请重试");
        return;
      }
      const saved = await res.json();
      setSelectedNode({ ...selectedNode, ...saved } as any);
      setDrawSelectedCharIds(characterIds || []);
      // 色子（抽卡）采用结果持久化关联到活跃剧情线：写入 chapterBindings（标记 preset），
      // 使生成前剧情规划(plan-chapter)能读到「用户用色子选定的走向」作为剧情预设。
      if (storylineId) {
        const sl = project?.storylines?.find((s: any) => s.id === storylineId);
        const existing: any[] = ((sl as any)?.chapterBindings as any[]) || [];
        const entry = {
          element: "preset",
          chapterId: selectedNode.id,
          note: `🎴${card.cardLabel || "抽卡路线"}｜${card.coreConflict || ""}｜🎭${card.mood || ""}`,
          characterIds: characterIds || [],
        };
        // 同 node 重采用时更新而非堆叠：先移除旧 preset，再追加
        const next = [...existing.filter((e) => !(e?.element === "preset" && e?.chapterId === selectedNode.id)), entry];
        fetch(`/api/storylines/${storylineId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chapterBindings: next }),
        }).catch(() => {});
      }
      setReviewResult({
        passed: true,
        issues: [{
          type: "info", severity: "minor",
          description: `🎴 已采用「${card.cardLabel || "抽卡路线"}」章纲 · ${card.characters.length}角色出场 · ${card.coreConflict || ""} · 🎭${card.mood || ""}`,
        }],
      });
      setChapterOutlineStatus("done");
      setTimeout(() => { setChapterOutlineStatus(""); setReviewResult(null); }, 5000);
    } catch (err) {
      toastError("章纲保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  // ── 生成前确认 ────────────────────────────
  const [drawSelectedCharIds, setDrawSelectedCharIds] = useState<string[]>([]);
  const [preGenOpen, setPreGenOpen] = useState(false);
  const [preGenMode, setPreGenMode] = useState<"write" | "refine" | "continue" | "outline">("write");
  const [outlineGenConfig, setOutlineGenConfig] = useState<{ chapterCount: number; customPrompt: string } | null>(null);

  // ═══════════════════════════════════════════
  // 数据加载
  // ═══════════════════════════════════════════

  // 今日已写字数（来自 monitor 接口，与统计面板同源；保存后自动刷新，形成闭环）
  const [monitorTodayWords, setMonitorTodayWords] = useState(0);
  const refreshMonitorToday = useCallback(async () => {
    try {
      const res = await fetch(`/api/stats/monitor?projectId=${projectId}`);
      if (res.ok) {
        const d = await res.json();
        const todayStr = new Date().toISOString().slice(0, 10);
        const tw = d.dailyWords?.find((x: { date: string; words: number }) => x.date === todayStr)?.words || 0;
        setMonitorTodayWords(tw);
      }
    } catch {
      /* 非关键：统计失败不影响写作 */
    }
  }, [projectId]);

  const loadProject = useCallback(async () => {
    setLoadError(null);
    try {
      const [projRes, styleRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/style`).catch(() => null),
      ]);
      if (projRes.ok) {
        const data = await projRes.json();
        if (styleRes?.ok) {
          const styleData = await styleRes.json();
          if (!styleData.error) {
            data.styleCard = styleData;
            if (styleData.styleTemplateId) setStyleTemplateId(styleData.styleTemplateId);
          }
        }
        useProjectStore.getState().setProjectData(data);
        refreshMonitorToday();
        setSelectedNode((prev) => {
          if (prev && data.storyNodes?.some((n: StoryNodeData) => n.id === prev.id)) {
            const updated = data.storyNodes.find((n: StoryNodeData) => n.id === prev.id);
            return updated || prev;
          }
          if (data.storyNodes?.length > 0) {
            const firstDraft = data.storyNodes.find((n: StoryNodeData) => n.status !== "completed");
            return firstDraft || data.storyNodes[0];
          }
          return null;
        });
      } else if (projRes.status === 404) {
        router.push("/");
      } else {
        setLoadError(`加载项目失败（HTTP ${projRes.status}），请检查后端服务是否已启动并连接数据库。`);
      }
    } catch (err) {
      console.error("加载项目失败:", err);
      setLoadError("加载项目失败：" + (err instanceof Error ? err.message : "网络错误，请检查后端服务是否已启动并连接数据库。"));
    } finally { setLoading(false); }
  }, [projectId, router, refreshMonitorToday]);

  // ── 自动提取（12 维度，生成完成后自动运行）──
  const autoExtractChapter = useCallback(async (content: string, title: string) => {
    if (!content || content.length < 200 || !projectId) return;
    setLastChapterContent(content); setLastChapterTitle(title || "");
    setExtractionLoading(true);
    try {
      const res = await fetch("/api/agent/extract-chapter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, chapterContent: content, chapterTitle: title || "", nodeId: selectedNode?.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `服务器错误 ${res.status}`);
      setExtractionData(data);
    } catch (err) {
      console.error("自动提取失败:", err);
      toastError("章节自动提取失败：" + (err instanceof Error ? err.message : "请重试"));
    } finally { setExtractionLoading(false); }
  }, [projectId, selectedNode?.id]);

  useEffect(() => { loadProject(); }, [loadProject]);

  // FE-9：任何会改变项目数据的保存/导入完成后，除刷新本页 store 外，同时让仪表盘项目列表 query 失效，回到新鲜
  const refreshAfterMutate = useCallback(() => {
    loadProject();
    invalidateQueries("projects");
  }, [loadProject]);

  // ═══════════════════════════════════════════
  // 大纲生成
  // ═══════════════════════════════════════════

  const getEffectiveChapterCount = () => {
    if (outlineChapterCount === -1) { const n = parseInt(outlineCustomChapterCount); return isNaN(n) || n < 1 ? 4 : Math.min(n, 30); }
    return outlineChapterCount;
  };

  const handleGenerateOutlinePreview = async () => {
    if (!project) return;
    setGenStep("confirming");
    setOutlineGenConfig({ chapterCount: getEffectiveChapterCount(), customPrompt: outlineCustomPrompt });
    setPreGenMode("outline");
    setPreGenOpen(true);
  };

  const handleOutlineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], _finalAuthorNote: string) => {
    if (!project || !outlineGenConfig) return;
    setPreGenOpen(false); setGenStep("generating"); setOutlineGenerating(true); setOutlineGenRunning(true); setOutlineCapsuleHidden(false);
    setOutlineError(""); setOutlinePreviewChapters([]); setOutlineRaw("");
    const { chapterCount, customPrompt } = outlineGenConfig;
    try {
      const res = await fetch("/api/generate/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapterCount, customPrompt: customPrompt || undefined, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); setOutlineError(err.error || `HTTP ${res.status}`); return; }
      const data = await res.json();
      const chapters = data.chapters || [];
      if (chapters.length === 0) { setOutlineError("未生成任何章节，请检查角色和世界书是否有内容"); return; }
      setOutlinePreviewChapters(chapters); setOutlineRaw(data.rawOutline || "");
      // v2.0.14：后台生成完成——即使此前已关闭弹窗，也自动重开展示预览，关窗不丢结果
      setShowOutlineDialog(true);
      setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
      toastSuccess(`大纲生成完成：${chapters.length} 章预览已就绪`);
    } catch (err) { setGenStep("error"); setOutlineError(err instanceof Error ? err.message : "网络错误"); }
    finally { setOutlineGenerating(false); setOutlineGenRunning(false); }
  };

  const handleConfirmOutline = async () => {
    if (!project || outlinePreviewChapters.length === 0) return;
    setOutlineGenerating(true);
    try {
      const putRes = await fetch("/api/generate/outline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapters: outlinePreviewChapters, replaceAll: !outlineAppendMode }) });
      if (!putRes.ok) { const err = await putRes.json().catch(() => ({ error: "创建失败" })); toastError("创建章节节点失败: " + (err.error || putRes.status)); return; }
      const createdCount = outlinePreviewChapters.length;
      setShowOutlineDialog(false); setOutlinePreviewChapters([]); setOutlineCustomPrompt("");
      toastSuccess(`已创建 ${createdCount} 章`);
      await loadProject();
    } catch (err) { toastError("写入大纲出错: " + (err instanceof Error ? err.message : "网络错误")); }
    finally { setOutlineGenerating(false); }
  };

  const updatePreviewChapter = (index: number, field: string, value: string) => {
    setOutlinePreviewChapters((prev) => prev.map((ch, i) => (i === index ? { ...ch, [field]: value } : ch)));
  };

  // ═══════════════════════════════════════════
  //  SSE 流式生成处理 (write/refine/continue)
  // ═══════════════════════════════════════════

  const handleWrite = async () => { if (!selectedNode || !project) return; setGenStep("confirming"); setPreGenMode("write"); setPreGenOpen(true); };
  const handleRefine = async () => { if (!selectedNode || !project) return; setGenStep("confirming"); setPreGenMode("refine"); setPreGenOpen(true); };
  const handleContinue = async () => { if (!selectedNode || !project) return; setGenStep("confirming"); setPreGenMode("continue"); setPreGenOpen(true); };

  // MaxLoop R2 #34：故事线工作台「据此续写 / 去写一章」→ 复用既有写作流（PreGen 确认）
  // 优先已选中章节节点；否则仅打开写作入口，storylineId 作 UX 聚焦提示（不改服务端）
  const writeFromStorylineId = useRef<string | null>(null);
  const writeFromStorylineOpts = useRef<{ diffuseCompleted?: boolean }>({});
  const handleWriteFromStoryline = (storylineId?: string, opts?: { diffuseCompleted?: boolean }) => {
    writeFromStorylineId.current = storylineId ?? null;
    writeFromStorylineOpts.current = opts ?? {};
    setGenStep("confirming"); setPreGenMode("write"); setPreGenOpen(true);
  };

  // 本地蒸馏累计数据（在 SSE 流中逐步累积）
  const distillAccum = useRef<{
    entityCount: number; stateChangeCount: number; foreshadowCount: number;
    consistencyIssueCount: number; elapsedMs: number;
    foreshadowCreated: number; foreshadowUpdated: number;
    entitiesAutoCreated: number; entitiesSkipped: number;
  }>({ entityCount: 0, stateChangeCount: 0, foreshadowCount: 0, consistencyIssueCount: 0, elapsedMs: 0, foreshadowCreated: 0, foreshadowUpdated: 0, entitiesAutoCreated: 0, entitiesSkipped: 0 });

  // 本次生成自动填表信息（Max Loop Round6·toast 收敛：合并进 done toast，避免填表/召回/完成三连弹）
  const lastFillInfoRef = useRef<string | null>(null);

  // v2.49：生成完成后局部刷新单节点（仅 GET 当前章节，替代整本 loadProject 重载——大书保存卡顿根因）
  const refreshNodeAfterGen = async (nodeId: string): Promise<boolean> => {
    if (!nodeId) return false;
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`);
      if (!res.ok) return false;
      const node = await res.json();
      if (node?.error) return false;
      useProjectStore.getState().updateNode(node.id, node);
      setSelectedNode((prev) => (prev && prev.id === nodeId ? node : prev));
      refreshMonitorToday();
      return true;
    } catch {
      return false;
    }
  };

  const streamSSE = async (url: string, body: Record<string, unknown>, onDone?: () => void) => {
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    // 重置蒸馏累计
    distillAccum.current = { entityCount: 0, stateChangeCount: 0, foreshadowCount: 0, consistencyIssueCount: 0, elapsedMs: 0, foreshadowCreated: 0, foreshadowUpdated: 0, entitiesAutoCreated: 0, entitiesSkipped: 0 };
    lastFillInfoRef.current = null; // 重置填表合并信息
    setRecallMemories([]); // 新一轮生成重置宝宝流记忆面板
    try {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const reader = res.body?.getReader();
      if (!reader) throw new Error("无法获取响应流");
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;
          try {
            const event: SSEEvent = JSON.parse(trimmed.slice(6));
            if (event.type === "token") { accumulated += event.content; useWriterStore.getState().appendContent(event.content); }
            else if (event.type === "review_start") setGenStep("reviewing");
            else if (event.type === "summarize_start") setGenStep("summarizing");
            else if (event.type === "review_result") setReviewResult({ passed: event.passed ?? false, issues: event.issues || [] });
            // ── 本地蒸馏事件 ──
            else if (event.type === "distill_local_start") setGenStep("summarizing");
            else if (event.type === "distill_local_done" && event.stats) {
              distillAccum.current.entityCount = event.stats.entityCount;
              distillAccum.current.stateChangeCount = event.stats.stateChangeCount;
              distillAccum.current.foreshadowCount = event.stats.foreshadowCount;
              distillAccum.current.consistencyIssueCount = event.stats.consistencyIssueCount;
              distillAccum.current.elapsedMs = event.stats.totalElapsedMs;
            }
            // ── 伏笔更新 ──
            else if (event.type === "foreshadow_update") {
              distillAccum.current.foreshadowCreated = (event.created || []).length;
              distillAccum.current.foreshadowUpdated = (event.updated || []).length;
            }
            // ── 实体自动创建 ──
            else if (event.type === "entity_auto_created") {
              distillAccum.current.entitiesAutoCreated = (event.created as any[])?.length || 0;
            }
            else if (event.type === "entity_auto_skip" && event.content) {
              distillAccum.current.entitiesSkipped = event.content.split("、").length;
            }
            // ── 废词扫描 v3 ──
            else if (event.type === "forbidden_scan_v3") {
              setForbiddenScanResult({
                passed: event.passed ?? false,
                qualityScore: event.qualityScore ?? 100,
                fuzzyDensity: event.fuzzyDensity ?? 0,
                bySeverity: event.bySeverity || {},
                byCategory: event.byCategory || {},
                matches: event.matches || [],
                totalMatches: event.totalMatches || 0,
                summary: event.content || "",
              });
            }
            // ── 逻辑自查 ──
            else if (event.type === "logic_check_done") {
              setLogicCheckResult({
                passed: event.passed ?? false,
                issues: event.issues || [],
                summary: event.content || "",
              });
            }
            // ── 宝宝流自动填表（写作闭环回收） ──
            else if (event.type === "babylore_fill") {
              if (event.ok) {
                // toast 收敛（Max Loop Round6）：填表成功信息合并进 done toast，减少打断
                lastFillInfoRef.current = `自动填表：抽取 ${event.operations ?? 0} 条，写入 ${event.applied ?? 0} 行`;
              } else if (event.skipped) {
                // 主动跳过（频率未到 / 最近章）：避免刷屏，不弹提示
              } else if (event.error) {
                toastError(`宝宝流自动填表失败：${event.error}。可前往「结构化表格」页手动重试。`);
              }
            }
            else if (event.type === "babylore_recall") {
              const items = Array.isArray(event.items) ? event.items : [];
              const n = items.length;
              setRecallMemories(items);
              // toast 收敛（Max Loop Round6）：召回信息已展示在「宝宝流记忆召回面板」，不重复弹 toast
            }
            else if (event.type === "notice") {
              // #124：精修预算超上限提醒——明确告知用户将截断，并给出「分段精修 / 提高预算」建议
              if (event.kind === "budget_capped") {
                const add = (event.requested || 0) - (event.existingLen || 0);
                toastWarning(
                  `⚠️ 精修预算超上限：已有 ${event.existingLen} 字 + 续写 ${add} 字 > 上限 ${event.ceiling} 字，输出将被截断。建议改为「分段精修」（分多次精修）或「提高预算上限」。`,
                );
              }
            }
            else if (event.type === "done") {
              setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
              // 把本地蒸馏累计数据写入 state（触发 UI 通知）
              setDistillSummary({ ...distillAccum.current });
              const finalContent = accumulated + (event.content || "");
              setLastChapterContent(finalContent);
              setLastChapterTitle(selectedNode?.title || "");
              lastFillInfoRef.current = null;

              // #124：精修（修改/续写已有正文）完成后，先展示 diff 预览，由用户显式「应用」或「撤销」，不直接落库刷新
              const isRefineWithExisting = event.mode === "refine" && !!selectedNode?.content && (selectedNode.content || "").trim().length > 0;
              if (isRefineWithExisting && finalContent.trim().length > 0) {
                setRefineDiff({ old: selectedNode.content || "", new: finalContent });
                onDone?.();
                return;
              }

              toastSuccess(lastFillInfoRef.current ? `正文已生成并保存 ✓（${lastFillInfoRef.current}）` : "正文已生成并保存 ✓");
              // v2.49：done 后局部刷新当前节点（单节点 GET），失败兜底全量 loadProject
              const refreshed = await refreshNodeAfterGen(selectedNode?.id ?? "");
              if (!refreshed) { await loadProject(); }
              autoExtractChapter(finalContent, selectedNode?.title || "");
              onDone?.();
            }
            else if (event.type === "error") {
              setGenStep("error");
              console.error("生成错误:", event.content, event.hint ?? "");
              const errMsg = event.hint
                ? `${event.content}（${event.hint}）`
                : (event.content || "生成失败，请查看日志");
              toastError(errMsg);
            }
            else if (event.type === "postprocess_skip") {
              // IMP-023：后处理（摘要/审校）失败被静默降级时给出非阻塞提示，不阻塞正文交付主流程
              toastWarning(`后处理（摘要/审校）已跳过：${event.content || "未知原因"}。正文已生成并保存，可稍后手动重试。`);
            }
          } catch { /* 忽略解析失败 */ }
        }
      }
    } catch (err: unknown) { if (err instanceof Error && err.name !== "AbortError") { setGenStep("error"); console.error("生成失败:", err); } }
    finally { abortRef.current = null; }
  };

  const handleWriteConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string, storylineId?: string, diffuseCompleted?: boolean) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setIsGenerating(true); useWriterStore.getState().resetStream(); setReviewResult(null);
    await streamSSE("/api/generate/write", { projectId: project.id, nodeId: selectedNode.id, authorNote: finalAuthorNote || undefined, targetWordCount, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars, storylineId, diffuseCompleted: !!diffuseCompleted });
    setIsGenerating(false);
  };

  const handleRefineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string, storylineId?: string, diffuseCompleted?: boolean) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setIsGenerating(true); useWriterStore.getState().resetStream(); setReviewResult(null);
    // #124：精修的「续写字数」收敛为合理增量（≤1500），避免传入全本 targetWordCount（星辰=30万）导致预算恒超上限、
    // 长章静默失效。仅当章节本身已很长（>上限-增量）时才触发 cap 告警，提示用户「分段精修」。
    const refineTarget = Math.min(targetWordCount, 1500);
    await streamSSE("/api/generate/refine", { projectId: project.id, nodeId: selectedNode.id, instruction: refineInstruction || "续写本章，补充细节和描写，自然推进剧情", targetWords: refineTarget, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars, selectedText: selectedText || undefined, authorNote: finalAuthorNote || authorNote || undefined, storylineId, diffuseCompleted: !!diffuseCompleted });
    setIsGenerating(false);
  };

  // #124 精修 diff 预览：应用 = 刷新采用已落库的新正文；撤销 = PUT 还原精修前的原正文
  const applyRefine = () => {
    setRefineDiff(null);
    toastSuccess("已应用精修结果");
    loadProject();
    if (refineDiff) autoExtractChapter(refineDiff.new, selectedNode?.title || "");
  };
  const undoRefine = async () => {
    const target = refineDiff;
    setRefineDiff(null);
    if (!target || !selectedNode?.id) { loadProject(); return; }
    try {
      const res = await fetch(`/api/story/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: target.old, wordCount: (target.old || "").length, undo: true }),
      });
      if (res.ok) toastSuccess("已撤销，恢复原正文");
      else toastError("撤销失败");
    } catch {
      toastError("撤销失败");
    } finally {
      loadProject();
    }
  };

  const handleContinueConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string, storylineId?: string, diffuseCompleted?: boolean) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setContinueLoading(true); useWriterStore.getState().resetStream(); setReviewResult(null);
    await streamSSE("/api/generate/continue", { projectId: project.id, currentNodeId: selectedNode.id, styleTemplateId, authorNote: finalAuthorNote || authorNote || undefined, autoOutline: true, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars, storylineId, diffuseCompleted: !!diffuseCompleted }, () => setContextRefreshKey((k) => k + 1));
    setContinueLoading(false);
  };

  const handleStop = () => { abortRef.current?.abort(); };

  // ═══════════════════════════════════════════
  // 节点操作
  // ═══════════════════════════════════════════

  const handleAddSection = async (parentId: string | null = null) => {
    if (!project) return;
    const isChapter = !parentId;
    let defaultTitle = "";
    if (isChapter) { const chapters = project.storyNodes.filter((n) => n.type === "chapter"); const chapterNum = chapters.length + 1; defaultTitle = `第${chapterNum}章：`; }
    const title = await promptDialog({
      title: isChapter ? "新建章节" : "新建小节",
      description: isChapter
        ? `已有 ${project.storyNodes.filter((n) => n.type === "chapter").length} 章，自动编号为第 ${project.storyNodes.filter((n) => n.type === "chapter").length + 1} 章。可修改标题后确定：`
        : "请输入小节标题：",
      defaultValue: defaultTitle || "",
      placeholder: isChapter ? "第N章：标题" : "小节标题",
      confirmText: "创建",
    });
    if (!title) return;
    try {
      const res = await fetch("/api/story/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, parentId, type: parentId ? "section" : "chapter", title, order: project.storyNodes.length }) });
      if (res.ok) { await loadProject(); toastSuccess(`已新建「${title}」`); }
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("新建节点失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { console.error("创建节点失败:", err); toastError("新建节点失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  const { deletingId, remove: deleteNode } = useConfirmDelete({
    title: "删除章节节点",
    description: (id) => {
      const node = project?.storyNodes.find((n) => n.id === id);
      return `确定删除「${node?.title || "此节点"}」？\n删除后移入回收站（可在回收站恢复），后续章节将自动重新编号。`;
    },
    deleteFn: async (nodeId) => {
      const res = await fetch(`/api/story/nodes/${nodeId}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(err.error || `HTTP ${res.status}`); }
    },
    onSuccess: (nodeId) => {
      if (selectedNode?.id === nodeId) { setSelectedNode(null); useWriterStore.getState().resetStream(); setReviewResult(null); }
      loadProject();
    },
    errorPrefix: "删除失败",
    successMessage: "已移入回收站",
    // #123 撤销期：删除后立即可通过 toast 按钮恢复（清空 deletedAt）
    undo: {
      label: "撤销",
      run: async (nodeId) => {
        const res = await fetch(`/api/story/nodes/${nodeId}/restore`, { method: "POST" });
        if (res.ok) { loadProject(); toastSuccess("已恢复"); }
        else { toastError("恢复失败"); }
      },
    },
  });

  // B3 引导：空态「看示例」——载入内置示范小说（幂等），成功跳转其工作区
  const loadSample = async () => {
    try {
      const res = await fetch("/api/seed/sample-project", { method: "POST" });
      const d = await res.json();
      if (res.ok && d.id) {
        toastSuccess("示例项目已载入");
        router.push(`/workspace/${d.id}`);
      } else {
        toastError(d.error || "载入示例失败");
      }
    } catch {
      toastError("载入示例失败");
    }
  };

  const handleSummarize = async () => {
    if (!selectedNode || !project) return;
    if (!selectedNode.content) { toastInfo("该节点还没有内容，无法摘要"); return; }
    // v0.46.58：摘要前明确范围与产出，避免误触
    const ok = window.confirm(
      `为本章生成摘要？\n\n【范围】仅本章《${selectedNode.title}》正文（前文窗口与角色卡不变）\n【产出】①章节摘要 ②关键事件 ③角色状态快照 ④事件重要度（S/A/B/C，供记忆衰减分级）\n\n摘要将写入记忆系统，供后续章节的上下文引用。确认生成？`
    );
    if (!ok) return;
    setSummarizing(true);
    try {
      const res = await fetch("/api/generate/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapterId: selectedNode.id }) });
      if (res.ok) { const data = await res.json(); toastSuccess(`摘要完成！\n${data.summary.summary}\n\n关键事件：\n${data.keyEvents.join("\n")}`); loadProject(); }
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("摘要失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { console.error("摘要失败:", err); toastError("摘要失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
    finally { setSummarizing(false); }
  };

  // [2.0] 前台串行批量生成已移除，统一走 A4 后台任务（BatchWriteDialog → POST /api/story/batch-write）

  // [2.0] 批量确认本卷（前台选择 UI）随 A5 前台批量一并移除；质量护栏保留于后端 /api/story/nodes/batch-confirm，后续可并入 A4 对话框

  // ═══════════════════════════════════════════
  // 导出
  // ═══════════════════════════════════════════

  // ── 导出/备份/冲突推演弹窗状态已迁移至 useWorkspaceDialogs（v2.50.1）──

  // ── 工具箱能力清单（收拢分散入口，按用途分类）──
  const toolboxItems: ToolboxItem[] = [
    { id: "write", label: "续写 / 微调", desc: "选中章节后让 AI 接着写或润色本章", icon: "pencil", category: "write", action: () => { if (!selectedNode) { toastInfo("请先在左侧大纲选中一个章节"); return; } handleWrite(); } },
    { id: "outline", label: "生成大纲", desc: "AI 规划整本书的章节结构与走向", icon: "bot", category: "write", action: () => setShowOutlineDialog(true) },
    { id: "batch", label: "批量写作", desc: "后台批量产出多章草稿，可关窗继续", icon: "package", category: "write", action: () => openBatchWrite() },
    { id: "draw", label: "抽卡选章纲", desc: "用色子抽取剧情走向，选定本章路线", icon: "sparkles", category: "generate", action: () => handleDrawChapterOutline() },
    { id: "character", label: "新建角色", desc: "添加一张角色卡，定义人设与关系", icon: "user", category: "generate", action: () => setShowNewCharacter(true) },
    { id: "workshop", label: "创意工坊", desc: "预设 / 角色卡 / 导入导出分享社区预设", icon: "book", category: "generate", action: () => router.push("/workshop") },
    { id: "tables", label: "结构化表格", desc: "宝宝流数据库，查看已抽取的设定与未收尾线索", icon: "chart", category: "analyze", action: () => router.push(`/workspace/${project?.id ?? ""}/tables`) },
    { id: "conflict", label: "冲突推演", desc: "给定局势，AI 出≥3 个发展选项（仅供参考由你决定）", icon: "lightbulb", category: "analyze", badge: "AI", action: () => { setShowConflict(true); } },
  ];

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════

  if (loading) return (
    <div className="h-screen bg-[var(--nv-void)] text-foreground flex flex-col overflow-hidden">
      {/* 顶栏骨架 */}
      <div className="shrink-0 border-b border-[var(--nv-border-2)] px-6 py-3 flex items-center justify-between gap-4">
        <div className="relative h-5 w-40 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
        <div className="flex items-center gap-2">
          <div className="relative h-7 w-20 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
          <div className="relative h-7 w-7 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
        </div>
      </div>
      {/* 三栏骨架：左大纲 / 中正文 / 右面板（贴合真实工作台风貌，告别黑屏） */}
      <div className="flex-1 grid grid-cols-[260px_1fr_320px] gap-4 p-6 min-h-0">
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="relative h-4 rounded-md bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="relative h-6 w-1/2 rounded-lg bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="relative h-3 rounded bg-[var(--nv-surface-2)] overflow-hidden" style={{ width: `${60 + ((i * 13) % 35)}%` }}><span className="absolute inset-0 shimmer-line" /></div>
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="relative h-16 rounded-xl bg-[var(--nv-surface-2)] overflow-hidden"><span className="absolute inset-0 shimmer-line" /></div>
          ))}
        </div>
      </div>
      <div className="shrink-0 border-t border-[var(--nv-border-2)] px-6 py-2 text-center text-[11px] text-[var(--nv-text-muted)]">
        正在载入你的小说宇宙…
      </div>
    </div>
  );
  if (loadError) return (
    <div className="h-screen bg-[var(--nv-void)] flex flex-col items-center justify-center text-[var(--nv-text-secondary)] gap-4">
      <div className="text-danger text-lg font-semibold"><Icon name="alert" size={15} className="inline-block align-text-bottom shrink-0" /> 项目加载失败</div>
      <div className="text-[var(--nv-text-muted)] text-sm max-w-md text-center px-6">{loadError}</div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => { setLoadError(null); loadProject(); }}>重试</Button>
        <Button variant="outline" onClick={() => router.push("/")}>返回首页</Button>
      </div>
    </div>
  );
  if (!project) return (
    <div className="h-screen bg-[var(--nv-void)] flex items-center justify-center text-[var(--nv-text-muted)]">
      项目不存在
      <Button variant="outline" onClick={() => router.push("/")} className="ml-4">返回首页</Button>
    </div>
  );

  return (
    <ErrorBoundary name="工作台">
    <div className="h-screen bg-[var(--nv-void)] text-foreground flex flex-col overflow-hidden animate-in fade-in">
      <OnboardingModal />
      <div inert={leftDrawerOpen || rightDrawerOpen} className={`${zenMode ? "hidden" : ""}`}>
      <Toolbar
        projectName={project.name} onBack={() => router.push("/")}
        onGenerateOutline={() => setShowOutlineDialog(true)}
        onImportChapters={() => { setImportWizardMode("auto"); setShowImportWizard(true); }}
        onEditStyle={() => setShowStyleEditor(true)}
        isGenerating={isGenerating || continueLoading} outlineGenerating={outlineGenerating}
        projectId={project.id} styleTemplateId={styleTemplateId}
        onOpenAutomation={() => setShowAutomationSettings(true)}
        onOpenExport={() => setShowExportDialog(true)}
        onBackup={() => setShowBackupDialog(true)}
      />
      </div>

      <div className={`px-4 py-2 border-b border-[var(--nv-border-2)] flex items-center gap-2 ${zenMode ? "hidden" : ""}`} inert={leftDrawerOpen || rightDrawerOpen}>
        <button onClick={() => setLeftDrawerOpen(o => !o)} className="lg:hidden text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="切换大纲栏（窄屏）">
          <Icon name="book" size={13} /> 大纲
        </button>
        <button onClick={() => setRightDrawerOpen(o => !o)} className="lg:hidden text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="切换侧栏（窄屏）">
          <Icon name="grid" size={13} /> 侧栏
        </button>
        <button onClick={() => setShowProjectSettings(true)} className="text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="项目设定：骨架 / 配置 / 记忆衰减 / 确认交付，统一入口">
          <Icon name="settings" size={13} /> 项目设定
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden" onMouseUp={() => {
        const sel = window.getSelection()?.toString()?.trim();
        if (sel && sel.length > 0) setSelectedText(sel);
      }}>
        <div
          ref={leftDrawerRef}
          tabIndex={-1}
          role={leftDrawerOpen ? "dialog" : undefined}
          aria-modal={leftDrawerOpen ? "true" : undefined}
          aria-labelledby={leftDrawerOpen ? leftDrawerTitleId : undefined}
          className={`fixed inset-y-0 left-0 z-40 w-64 max-w-[85vw] h-full transition-transform duration-200
          ${leftDrawerOpen ? "translate-x-0" : "-translate-x-full"}
          lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-64 lg:translate-x-0 lg:transition-none
          ${leftCollapsed ? "lg:hidden" : ""} ${zenMode ? "hidden" : ""}`}
        >
          <h2 id={leftDrawerTitleId} className="sr-only">大纲栏</h2>
        <ErrorBoundary name="大纲">
        <LeftPanel activeTab={leftPanel} onTabChange={setLeftPanel}
          selectedNode={selectedNode} onSelectNode={handleSelectNode}
          onAddSection={handleAddSection} onEditCharacter={setEditingCharacter} onEditLore={setEditingLore}
          onNewCharacter={() => setShowNewCharacter(true)}
          viewMode={viewMode} onSetViewMode={setViewMode} loadProject={loadProject}
          onDeleteNode={deleteNode} deletingNodeId={deletingId}
          onLoadSample={loadSample} onWriteChapter={handleWriteFromStoryline}
          onSummarizeCurrent={handleSummarize} summarizing={summarizing} />
        </ErrorBoundary>
        </div>

        {/* 中间列：正文 + 分析面板 */}
        <ErrorBoundary name="编辑器">
        <div className="flex flex-col flex-1 overflow-hidden" inert={leftDrawerOpen || rightDrawerOpen}>
          <CenterPanel zen={zenMode} onEnterZen={() => setZenMode(true)} selectedNode={selectedNode}
            isGenerating={isGenerating || continueLoading} reviewResult={reviewResult}
            narrativeStage={narrativeStage}
            authorNote={authorNote} onAuthorNoteChange={handleAuthorNoteChange}
            targetWordCount={targetWordCount} onTargetWordCountChange={setTargetWordCount}
            todayWords={monitorTodayWords}
            onWrite={handleWrite} onStop={handleStop}
            onBatchWrite={() => openBatchWrite()}
            onEditOutline={async (outline) => {
              if (!selectedNode) return;
              const prev = selectedNode;
              setSelectedNode({ ...selectedNode, outline });
              const body = { outline, expectedVersion: selectedNode.editVersion };
              try {
                const res = await fetch(`/api/story/nodes/${selectedNode.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(body),
                });
                if (res.status === 409) {
                  const d = (await res.json().catch(() => ({} as any)));
                  if (d.conflict) { setConflict({ nodeId: selectedNode.id, mine: body, server: d.server }); return; }
                }
                if (!res.ok) {
                  const d = (await res.json().catch(() => ({}))) as { error?: string };
                  setSelectedNode(prev);
                  toastError(d.error || `大纲保存失败（${res.status}）`);
                } else {
                  const saved = await res.json();
                  setSelectedNode({ ...selectedNode, ...saved });
                  toastSuccess("大纲已保存 ✓");
                }
              } catch (err) {
                setSelectedNode(prev);
                toastError("大纲保存失败：" + (err instanceof Error ? err.message : "网络错误"));
              }
            }}
            onDrawChapterOutline={handleDrawChapterOutline}
            onGenerateChapterOutline={async (flashPrompt: string) => {
              if (!selectedNode || !project) { toastInfo("请先选中一个章节节点"); return; }
              setChapterOutlineStatus("generating");
              try {
                const res = await fetch("/api/generate/chapter-outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, nodeId: selectedNode.id, prompt: flashPrompt || undefined, authorNote: authorNote || undefined }) });
                const data = await res.json();
                if (!res.ok || data.error) { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); toastError(`章纲生成失败：${data.error || `HTTP ${res.status}`}`); return; }
                if (data.outline) {
                  setChapterOutlineStatus("done"); setTimeout(() => setChapterOutlineStatus(""), 4000);
                  setSelectedNode({ ...selectedNode, outline: data.outline });
                  const selectedInfo = data.selectedCharacters?.length ? `\nAI 选角（${data.selectedCharacters.length}/${data.totalCharacters}人）：${data.selectedCharacters.map((c: any) => c.name).join("、")}${data.selectionReason ? `\n选角理由：${data.selectionReason}` : ""}` : "";
                  setReviewResult({ passed: true, issues: [{ type: "info", severity: "minor", description: `章纲已生成${selectedInfo}。点击大纲文字可编辑。` }] });
                  await loadProject();
                } else { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); toastError("API 返回空内容，请重试"); }
              } catch (err) { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); toastError(`网络错误：${err instanceof Error ? err.message : "请重试"}`); }
            }}
            projectId={project.id}
            refineMode={refineMode} onToggleRefineMode={() => setRefineMode(!refineMode)}
            refineInstruction={refineInstruction} onRefineInstructionChange={handleRefineInstructionChange} onRefine={handleRefine}
            chapterOutlinePrompt={chapterOutlinePrompt} onChapterOutlinePromptChange={handleChapterOutlinePromptChange}
            genStep={genStep} genStepLabels={genStepLabels} chapterOutlineStatus={chapterOutlineStatus}
            onOpenGame={() => {
              if (selectedNode?.id) {
                router.push(`/workspace/${project.id}/game/${selectedNode.id}`);
              }
            }}
            onEditCharacter={(id) => { const c = project.characters.find((x) => x.id === id); if (c) setEditingCharacter(c); }}
            onEditLore={(id) => { const l = project.lorebookEntries.find((x) => x.id === id); if (l) setEditingLore(l); }}
            loadProject={loadProject}
            onExitZen={() => setZenMode(false)}
          />

          {/* P1-3：宝宝流记忆召回面板已合并入右栏「统计 → 上下文监控」（单一记忆透出组件），此处不再重复渲染 */}

          {/* 确认流程已收口到「项目设定」弹窗——正文区不再常驻确认栏，阅读不被遮挡 */}

          {/* 统一分析面板（替代旧版浮动横幅+弹窗+按钮） */}
          {(extractionData || distillSummary || forbiddenScanResult || logicCheckResult || reviewResult) && selectedNode && (
            <div className={`px-6 pb-4 max-w-[700px] mx-auto w-full ${zenMode ? "hidden" : ""}`}>
              <PostGenPanel
                projectId={project.id}
                nodeId={selectedNode.id}
                chapterTitle={lastChapterTitle || selectedNode.title || ""}
                chapterContent={selectedNode.content || lastChapterContent || ""}
                extractionData={extractionData}
                extractionLoading={extractionLoading}
                distillSummary={distillSummary}
                forbiddenScanResult={forbiddenScanResult}
                logicCheckResult={logicCheckResult}
                reviewResult={reviewResult}
                onApplyExtraction={async (selected: any) => {
                  const res = await fetch("/api/agent/apply-extraction", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ projectId: project.id, nodeId: selectedNode.id, chapterTitle: lastChapterTitle || selectedNode.title || "", selected }),
                  });
                  return res.json();
                }}
                onContinueWriting={handleContinue}
                onClose={() => { setExtractionData(null); setDistillSummary(null); setForbiddenScanResult(null); setLogicCheckResult(null); setReviewResult(null); }}
                onRefresh={loadProject}
              />
            </div>
          )}
        </div>
        </ErrorBoundary>

        <div
            ref={rightDrawerRef}
            tabIndex={-1}
            role={rightDrawerOpen ? "dialog" : undefined}
            aria-modal={rightDrawerOpen ? "true" : undefined}
            aria-labelledby={rightDrawerOpen ? rightDrawerTitleId : undefined}
            className={`fixed inset-y-0 right-0 z-40 ${rightMinimized ? "w-10" : "w-80"} max-w-[85vw] h-full transition-all duration-200
            ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"}
            lg:static lg:z-auto lg:h-auto lg:shrink-0 ${rightMinimized ? "lg:w-10" : "lg:w-80"} lg:translate-x-0 lg:transition-all ${zenMode ? "hidden" : ""}`}
          >
            <h2 id={rightDrawerTitleId} className="sr-only">侧栏</h2>
          <ErrorBoundary name="侧栏">
        <RightPanel selectedNode={selectedNode}
            minimized={rightMinimized}
            onMinimize={() => setRightMinimized(true)}
            onExpand={() => { setRightMinimized(false); setLeftCollapsed(true); }}
            contextRefreshKey={contextRefreshKey} authorNote={authorNote}
            selectedText={selectedText || undefined}
            toolboxItems={toolboxItems}
            recallMemories={recallMemories}
            isGenerating={isGenerating || continueLoading}
            onEditCharacter={(id) => {
              const c = project.characters.find((x) => x.id === id);
              if (c) setEditingCharacter(c);
            }}
            onEditLore={(id) => {
              const l = project.lorebookEntries.find((x) => x.id === id);
              if (l) setEditingLore(l);
            }}
          />
        </ErrorBoundary>
        </div>
      {/* 窄屏抽屉遮罩 */}
      {(leftDrawerOpen || rightDrawerOpen) && (
        <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
      )}
      </div>

      {/* 弹窗（v2.50.1 已抽离至 WorkspaceDialogs 组件） */}
      <WorkspaceDialogs
        dialogs={dialogs}
        project={project}
        selectedNode={selectedNode}
        allConfirmed={allConfirmed}
        projectConfirmedAt={projectConfirmedAt}
        refreshAfterMutate={refreshAfterMutate}
        loadProject={loadProject}
        setReviewResult={setReviewResult}
        styleTemplateId={styleTemplateId}
        onStyleSaved={(id) => setStyleTemplateId(id)}
        storyNodes={project?.storyNodes}
        onSelectChapter={(id) => {
          const node = project?.storyNodes.find((n) => n.id === id);
          if (node) setSelectedNode(node);
          dialogs.setEditingCharacter(null);
        }}
        handlers={{ handleGenerateOutlinePreview, handleConfirmOutline, updatePreviewChapter, startBatchOutline, confirmBatchWrite }}
      />

      {/* FE-N8 保存冲突解决面板 */}
      {conflict && selectedNode && (
        <SaveConflictModal
          open={!!conflict}
          nodeTitle={selectedNode.title ?? "未命名章节"}
          mine={conflict.mine as { outline?: string; content?: string }}
          server={conflict.server}
          onClose={() => setConflict(null)}
          onResolve={resolveConflict}
        />
      )}

      {/* #124 精修 diff 预览：应用 / 撤销（恢复原正文） */}
      <RefineDiffModal
        open={!!refineDiff}
        oldContent={refineDiff?.old || ""}
        newContent={refineDiff?.new || ""}
        onApply={applyRefine}
        onUndo={undoRefine}
        onClose={() => { setRefineDiff(null); loadProject(); }}
      />

      {/* 抽卡模式——章纲路线选择 */}
      {showDrawCards && selectedNode && (
        <DrawCards projectId={project.id} nodeId={selectedNode.id}
          authorNote={authorNote} chapterOutlinePrompt={chapterOutlinePrompt}
          nodeTitle={selectedNode.title}
          storylineId={project.storylines?.find((s: any) => s.status === "active")?.id ?? project.storylines?.find((s: any) => s.type === "main" && s.status !== "abandoned")?.id}
          onSelect={handleDrawSelect} onClose={() => setShowDrawCards(false)} />
      )}

      {/* 生成前角色确认弹窗 */}
      {preGenOpen && (() => {
        const skipConfirm =
          typeof window !== "undefined" &&
          window.localStorage.getItem(`pregen-skip-${project.id}`) === "1";
        return (
        <PreGenConfirm projectId={project.id} nodeId={preGenMode === "outline" ? undefined : selectedNode?.id} presetCharacterIds={drawSelectedCharIds}
          authorNote={authorNote}
          storylineId={writeFromStorylineId.current ?? undefined}
          autoConfirm={skipConfirm}
          title={preGenMode === "write" ? "生成前确认——角色调度" : preGenMode === "refine" ? "微调前确认——角色调度" : preGenMode === "continue" ? "续写前确认——角色调度" : "大纲生成前确认——角色调度"}
          onAuthorNoteChange={handleAuthorNoteChange}
          onConfirm={(cards, notes, newChars, finalAuthorNote, storylineId) => {
            // R2-004：单章 PreGen 确认后，把用户选定的角色卡 / 新角色请求持久化到 localStorage，
            // 作为「批量写作」(handleBatchWrite 经 A4 后台任务) 角色约束的默认来源。此前全代码库无写入端，
            // 批量章恒为空约束（confirmedCardIds 退回 drawSelectedCharIds、newCharacterRequests 恒为空）。
            // 来源说明：cards/newChars 即用户在 PreGenConfirm 弹窗中勾选/输入的约束，写入即批量主路径的约束来源。
            if (project) {
              try {
                localStorage.setItem(
                  `pregen-conf-${project.id}`,
                  JSON.stringify({ selected: cards, newChars }),
                );
              } catch {
                /* localStorage 不可用（隐私模式等）时静默降级，批量退回 drawSelectedCharIds */
              }
            }
            const diffuseCompleted = writeFromStorylineOpts.current?.diffuseCompleted ?? false;
            switch (preGenMode) {
              case "write": handleWriteConfirmed(cards, notes, newChars, finalAuthorNote, storylineId, diffuseCompleted); break;
              case "refine": handleRefineConfirmed(cards, notes, newChars, finalAuthorNote, storylineId, diffuseCompleted); break;
              case "continue": handleContinueConfirmed(cards, notes, newChars, finalAuthorNote, storylineId, diffuseCompleted); break;
              case "outline": handleOutlineConfirmed(cards, notes, newChars, finalAuthorNote); break;
            }
          }}
          onCancel={() => { setPreGenOpen(false); setOutlineGenConfig(null); }} />
        );
      })()}

    </div>
    </ErrorBoundary>
  );
}
