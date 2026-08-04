"use client";

import { useState, useEffect, useCallback, useRef, useId } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useProjectStore } from "@/store";
import { invalidateQueries } from "@/hooks/useApi";
export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { StyleEditor } from "@/components/editor/StyleEditor";
import { ImportWizard } from "@/components/editor/ImportWizard";
import { PostGenPanel } from "@/components/workspace/PostGenPanel";
import { Toolbar } from "@/components/workspace/Toolbar";
import { ToolboxDialog, type ToolboxItem } from "@/components/workspace/ToolboxDialog";
import { ExportDialog } from "@/components/workspace/ExportDialog";
import { BackupDialog } from "@/components/workspace/BackupDialog";
import { ConflictPanel } from "@/components/workspace/ConflictPanel";
import { SaveConflictModal } from "@/components/workspace/SaveConflictModal";
import { LeftPanel } from "@/components/workspace/LeftPanel";
import { CenterPanel } from "@/components/workspace/CenterPanel";
import { RightPanel } from "@/components/workspace/RightPanel";
import { CharacterDialog } from "@/components/workspace/CharacterDialog";
import { LorebookEditDialog } from "@/components/workspace/LorebookEditDialog";
import { BatchProgressPanel } from "@/components/workspace/BatchProgressPanel";
import { OutlineDialog } from "@/components/workspace/OutlineDialog";
import { AutomationSettingsDialog } from "@/components/workspace/AutomationSettingsDialog";
import { PreGenConfirm } from "@/components/workspace/PreGenConfirm";
import { DrawCards } from "@/components/workspace/DrawCards";
import { BuildConfigDialog } from "@/components/workspace/BuildConfigDialog";
import { MemoryDecayDialog } from "@/components/workspace/MemoryDecayDialog";
import { ProjectConfigPanel } from "@/components/workspace/ProjectConfigPanel";
import { OnboardingModal } from "@/components/workspace/OnboardingModal";
import type { ProjectData, CharacterData, LorebookData, StoryNodeData, ReviewIssue, SSEEvent } from "@/components/workspace/types";
import { confirmDialog, promptDialog, toastError, toastSuccess, toastInfo } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ui/ErrorBoundary";
import { useConfirmDelete } from "@/components/workspace/useConfirmDelete";
import { useShortcut } from "@/components/ShortcutProvider";
import { useFocusTrap } from "@/hooks/use-focus-trap";

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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<StoryNodeData | null>(null);

  const handleSelectNode = (node: StoryNodeData) => {
    if (selectedNode?.id !== node.id) {
      setStreamContent("");
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
    if (tab) setLeftPanel(tab as "characters" | "world" | "outline" | "storylines" | "rules");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, searchParams]);

  // ── 生成状态 ──────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
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
  const [leftPanel, setLeftPanel] = useState<"characters" | "world" | "outline" | "storylines" | "rules">("outline");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
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

  // ── 角色/词条编辑弹窗 ──────────────────────
  const [editingCharacter, setEditingCharacter] = useState<CharacterData | null>(null);
  const [editingLore, setEditingLore] = useState<LorebookData | null>(null);
  const [showNewCharacter, setShowNewCharacter] = useState(false);

  // ── 弹窗状态 ──────────────────────────────
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importWizardMode, setImportWizardMode] = useState<"auto" | "chapters" | "settings" | "quick">("auto");
  const [showAutomationSettings, setShowAutomationSettings] = useState(false);
  const [showBuildConfig, setShowBuildConfig] = useState(false);
  const [showMemoryDecay, setShowMemoryDecay] = useState(false);
  const [showProjectConfig, setShowProjectConfig] = useState(false);
  const [showToolbox, setShowToolbox] = useState(false);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [conflict, setConflict] = useState<{
    nodeId: string;
    mine: Record<string, unknown>;
    server: { editVersion: number; title?: string | null; outline?: string | null; content?: string | null; notes?: string | null };
  } | null>(null);
  const [viewMode, setViewMode] = useState<"volume" | "flat" | "timeline">("volume");

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

  // FE-N6：保存节点世界时间标记（worldTime），复用乐观锁 expectedVersion 与冲突转交
  const handleSaveWorldTime = async (wt: string) => {
    if (!selectedNode) return;
    const prevWt = selectedNode.worldTime;
    setSelectedNode({ ...selectedNode, worldTime: wt } as any);
    const body = { worldTime: wt || null, expectedVersion: selectedNode.editVersion };
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
        setSelectedNode({ ...selectedNode, worldTime: prevWt } as any);
        toastError(d.error || `时间标记保存失败（${res.status}）`);
      } else {
        const saved = await res.json();
        setSelectedNode({ ...selectedNode, ...saved } as any);
      }
    } catch (err) {
      setSelectedNode({ ...selectedNode, worldTime: prevWt } as any);
      toastError("时间标记保存失败：" + (err instanceof Error ? err.message : "网络错误"));
    }
  };

  useShortcut("save-node", "mod+s", "保存当前章节", () => { void handleSaveNode(); }, { allowInEditable: true });
  useShortcut("new-chapter", "n", "新建章节", () => { void handleAddSection(); });
  useShortcut("toggle-right", "]", "切换右侧栏", () => setRightPanelOpen((v) => !v));
  useShortcut("toggle-left", "[", "切换左侧栏", () => setLeftCollapsed((v) => !v));

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

  // ── 批量生成 ──────────────────────────────
  const [batchMode, setBatchMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Map<string, { status: string; error?: string }>>(new Map());
  const [batchAbort, setBatchAbort] = useState(false);

  // ── 大纲生成对话框 ────────────────────────
  const [showOutlineDialog, setShowOutlineDialog] = useState(false);
  const [outlineChapterCount, setOutlineChapterCount] = useState(8);
  const [outlineCustomChapterCount, setOutlineCustomChapterCount] = useState("");
  const [outlineCustomPrompt, setOutlineCustomPrompt] = useState("");
  const [outlineGenerating, setOutlineGenerating] = useState(false);
  const [outlinePreviewChapters, setOutlinePreviewChapters] = useState<
    { title: string; summary: string; coreConflict: string; characters: string[] }[]
  >([]);
  const [outlineRaw, setOutlineRaw] = useState("");
  const [outlineError, setOutlineError] = useState("");
  const existingChapterCount = project?.storyNodes.filter(n => n.type === "chapter" && !n.parentId).length || 0;
  const [outlineAppendMode, setOutlineAppendMode] = useState(existingChapterCount > 0);

  // ── 抽卡模式 ──────────────────────────────
  const [showDrawCards, setShowDrawCards] = useState(false);

  const handleDrawChapterOutline = () => {
    if (!selectedNode || !project) { toastInfo("请先选中一个章节节点"); return; }
    setShowDrawCards(true);
  };

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
    setPreGenOpen(false); setGenStep("generating"); setOutlineGenerating(true);
    setOutlineError(""); setOutlinePreviewChapters([]); setOutlineRaw("");
    const { chapterCount, customPrompt } = outlineGenConfig;
    try {
      const res = await fetch("/api/generate/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapterCount, customPrompt: customPrompt || undefined, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); setOutlineError(err.error || `HTTP ${res.status}`); return; }
      const data = await res.json();
      const chapters = data.chapters || [];
      if (chapters.length === 0) { setOutlineError("未生成任何章节，请检查角色和世界书是否有内容"); return; }
      setOutlinePreviewChapters(chapters); setOutlineRaw(data.rawOutline || "");
      setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
    } catch (err) { setGenStep("error"); setOutlineError(err instanceof Error ? err.message : "网络错误"); }
    finally { setOutlineGenerating(false); }
  };

  const handleConfirmOutline = async () => {
    if (!project || outlinePreviewChapters.length === 0) return;
    setOutlineGenerating(true);
    try {
      const putRes = await fetch("/api/generate/outline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapters: outlinePreviewChapters, replaceAll: !outlineAppendMode }) });
      if (!putRes.ok) { const err = await putRes.json().catch(() => ({ error: "创建失败" })); toastError("创建章节节点失败: " + (err.error || putRes.status)); return; }
      setShowOutlineDialog(false); setOutlinePreviewChapters([]); setOutlineCustomPrompt("");
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

  // 本地蒸馏累计数据（在 SSE 流中逐步累积）
  const distillAccum = useRef<{
    entityCount: number; stateChangeCount: number; foreshadowCount: number;
    consistencyIssueCount: number; elapsedMs: number;
    foreshadowCreated: number; foreshadowUpdated: number;
    entitiesAutoCreated: number; entitiesSkipped: number;
  }>({ entityCount: 0, stateChangeCount: 0, foreshadowCount: 0, consistencyIssueCount: 0, elapsedMs: 0, foreshadowCreated: 0, foreshadowUpdated: 0, entitiesAutoCreated: 0, entitiesSkipped: 0 });

  const streamSSE = async (url: string, body: Record<string, unknown>, onDone?: () => void) => {
    const controller = new AbortController();
    abortRef.current = controller;
    let accumulated = "";
    // 重置蒸馏累计
    distillAccum.current = { entityCount: 0, stateChangeCount: 0, foreshadowCount: 0, consistencyIssueCount: 0, elapsedMs: 0, foreshadowCreated: 0, foreshadowUpdated: 0, entitiesAutoCreated: 0, entitiesSkipped: 0 };
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
            if (event.type === "token") { accumulated += event.content; setStreamContent((prev) => prev + event.content); }
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
                toastSuccess(`宝宝流自动填表完成：本回抽取 ${event.operations ?? 0} 条操作，已写入 ${event.applied ?? 0} 行结构化表格。`);
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
              if (n > 0) toastInfo(`宝宝流记忆召回 ${n} 条（世界书/结构化表格），已注入本轮写作上下文。`);
            }
            else if (event.type === "done") {
              setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
              // 把本地蒸馏累计数据写入 state（触发 UI 通知）
              setDistillSummary({ ...distillAccum.current });
              const finalContent = accumulated + (event.content || "");
              setLastChapterContent(finalContent);
              setLastChapterTitle(selectedNode?.title || "");
              toastSuccess("正文已生成并保存 ✓");
              loadProject();
              autoExtractChapter(finalContent, selectedNode?.title || "");
              onDone?.();
            }
            else if (event.type === "error") { setGenStep("error"); console.error("生成错误:", event.content); }
          } catch { /* 忽略解析失败 */ }
        }
      }
    } catch (err: unknown) { if (err instanceof Error && err.name !== "AbortError") { setGenStep("error"); console.error("生成失败:", err); } }
    finally { abortRef.current = null; }
  };

  const handleWriteConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setIsGenerating(true); setStreamContent(""); setReviewResult(null);
    await streamSSE("/api/generate/write", { projectId: project.id, nodeId: selectedNode.id, authorNote: finalAuthorNote || undefined, targetWordCount, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars });
    setIsGenerating(false);
  };

  const handleRefineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setIsGenerating(true); setStreamContent(""); setReviewResult(null);
    await streamSSE("/api/generate/refine", { projectId: project.id, nodeId: selectedNode.id, instruction: refineInstruction || "续写本章，补充细节和描写，自然推进剧情", targetWords: targetWordCount, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars, authorNote: finalAuthorNote || authorNote || undefined });
    setIsGenerating(false);
  };

  const handleContinueConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false); setGenStep("generating"); setContinueLoading(true); setStreamContent(""); setReviewResult(null);
    await streamSSE("/api/generate/continue", { projectId: project.id, currentNodeId: selectedNode.id, styleTemplateId, authorNote: finalAuthorNote || authorNote || undefined, autoOutline: true, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars }, () => setContextRefreshKey((k) => k + 1));
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
      if (res.ok) await loadProject();
      else { const d = await res.json().catch(() => ({ error: "未知错误" })); toastError("新建节点失败：" + (d.error || `HTTP ${res.status}`)); }
    } catch (err) { console.error("创建节点失败:", err); toastError("新建节点失败（网络错误）：" + (err instanceof Error ? err.message : "请重试")); }
  };

  const { deletingId, remove: deleteNode } = useConfirmDelete({
    title: "删除章节节点",
    description: (id) => {
      const node = project?.storyNodes.find((n) => n.id === id);
      return `确定删除「${node?.title || "此节点"}」？\n删除后后续章节将自动重新编号。`;
    },
    deleteFn: async (nodeId) => {
      const res = await fetch(`/api/story/nodes/${nodeId}`, { method: "DELETE" });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(err.error || `HTTP ${res.status}`); }
    },
    onSuccess: (nodeId) => {
      if (selectedNode?.id === nodeId) { setSelectedNode(null); setStreamContent(""); setReviewResult(null); }
      loadProject();
    },
    errorPrefix: "删除失败",
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

  // ═══════════════════════════════════════════
  // 批量生成
  // ═══════════════════════════════════════════

  const toggleChapterSelect = (id: string) => { setSelectedChapterIds((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; }); };
  const selectAllChapters = () => { if (!project) return; const chapters = project.storyNodes.filter((n) => n.type === "chapter" && n.status !== "completed"); setSelectedChapterIds(new Set(chapters.map((c) => c.id))); };
  const clearSelection = () => setSelectedChapterIds(new Set());

  const handleBatchGenerate = async () => {
    if (!project || selectedChapterIds.size === 0) return;
    setBatchGenerating(true); setBatchAbort(false);
    const ids = [...selectedChapterIds].sort((a, b) => { const na = project.storyNodes.find((n) => n.id === a); const nb = project.storyNodes.find((n) => n.id === b); return (na?.order || 0) - (nb?.order || 0); });
    const progress = new Map<string, { status: string; error?: string }>();
    ids.forEach((id) => progress.set(id, { status: "pending" }));
    setBatchProgress(new Map(progress));
    for (const nodeId of ids) {
      if (batchAbort) break;
      const node = project.storyNodes.find((n) => n.id === nodeId);
      if (!node || node.status === "completed") continue;
      progress.set(nodeId, { status: "generating" }); setBatchProgress(new Map(progress));
      try {
        const controller = new AbortController();
        const res = await fetch("/api/generate/write", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, nodeId, authorNote: authorNote || undefined, targetWordCount }), signal: controller.signal });
        if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); progress.set(nodeId, { status: "failed", error: err.error || `HTTP ${res.status}` }); setBatchProgress(new Map(progress)); continue; }
        const reader = res.body?.getReader();
        if (!reader) { progress.set(nodeId, { status: "failed", error: "无法获取响应流" }); setBatchProgress(new Map(progress)); continue; }
        const decoder = new TextDecoder(); let buffer = ""; let failed = false;
        while (true) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
          for (const line of lines) { const trimmed = line.trim(); if (!trimmed.startsWith("data: ")) continue;
            try { const event = JSON.parse(trimmed.slice(6)); if (event.type === "error") { failed = true; progress.set(nodeId, { status: "failed", error: event.content }); } if (event.type === "done" && !failed) { progress.set(nodeId, { status: "done" }); } } catch { /* */ } }
        }
        if (!failed && progress.get(nodeId)?.status !== "failed") progress.set(nodeId, { status: "done" });
      } catch (err) { progress.set(nodeId, { status: "failed", error: err instanceof Error ? err.message : "网络错误" }); }
      setBatchProgress(new Map(progress));
    }
    setBatchGenerating(false); setBatchMode(false); setSelectedChapterIds(new Set());
    await loadProject();
  };

  // ═══════════════════════════════════════════
  // 导出
  // ═══════════════════════════════════════════

  // ── 导出弹窗状态 ──
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [showConflict, setShowConflict] = useState(false);

  // ── 工具箱能力清单（收拢分散入口，按用途分类）──
  const toolboxItems: ToolboxItem[] = [
    { id: "write", label: "续写 / 微调", desc: "选中章节后让 AI 接着写或润色本章", icon: "pencil", category: "write", action: () => { if (!selectedNode) { toastInfo("请先在左侧大纲选中一个章节"); return; } handleWrite(); } },
    { id: "outline", label: "生成大纲", desc: "AI 规划整本书的章节结构与走向", icon: "bot", category: "write", action: () => setShowOutlineDialog(true) },
    { id: "batch", label: "批量生成", desc: "一次勾选多章、批量产出草稿", icon: "package", category: "write", action: () => setBatchMode(true) },
    { id: "summarize", label: "章节摘要", desc: "为当前章生成要点摘要，便于长文回顾", icon: "clipboard", category: "write", action: () => handleSummarize() },
    { id: "draw", label: "抽卡选章纲", desc: "用色子抽取剧情走向，选定本章路线", icon: "sparkles", category: "generate", action: () => handleDrawChapterOutline() },
    { id: "character", label: "新建角色", desc: "添加一张角色卡，定义人设与关系", icon: "user", category: "generate", action: () => setShowNewCharacter(true) },
    { id: "workshop", label: "创意工坊", desc: "预设 / 角色卡 / 导入导出分享社区预设", icon: "book", category: "generate", action: () => router.push("/workshop") },
    { id: "tables", label: "结构化表格", desc: "宝宝流数据库，查看已抽取的设定与伏笔", icon: "chart", category: "analyze", action: () => router.push(`/workspace/${project?.id ?? ""}/tables`) },
    { id: "recall", label: "记忆召回", desc: "查看本轮已注入写作的设定、人设与伏笔", icon: "search", category: "analyze", action: () => setRightPanelOpen(true) },
    { id: "conflict", label: "冲突推演", desc: "给定局势，AI 出≥3 个发展选项（仅供参考由你决定）", icon: "lightbulb", category: "analyze", badge: "AI", action: () => { setShowConflict(true); } },
  ];

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════

  if (loading) return (
    <div className="h-screen bg-[var(--nv-void)] flex items-center justify-center">
      <span className="inline-flex items-center gap-2 text-[var(--nv-text-muted)]">
        <span className="w-1.5 h-1.5 bg-[var(--nv-primary)] rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-[var(--nv-primary)] rounded-full animate-pulse delay-150" />
        <span className="w-1.5 h-1.5 bg-[var(--nv-primary)] rounded-full animate-pulse delay-300" />
      </span>
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
    <div className="h-screen bg-[var(--nv-void)] text-foreground flex flex-col overflow-hidden">
      <OnboardingModal />
      <div inert={leftDrawerOpen || rightDrawerOpen}>
      <Toolbar
        projectName={project.name} onBack={() => router.push("/")}
        onGenerateOutline={() => setShowOutlineDialog(true)} onSummarize={handleSummarize}
        onImportSettings={() => { setImportWizardMode("settings"); setShowImportWizard(true); }} onImportChapters={() => { setImportWizardMode("chapters"); setShowImportWizard(true); }}
        onEditStyle={() => setShowStyleEditor(true)}
        isGenerating={isGenerating || continueLoading} outlineGenerating={outlineGenerating} summarizing={summarizing}
        projectId={project.id} styleTemplateId={styleTemplateId}
        onOpenAutomation={() => setShowAutomationSettings(true)}
        onOpenToolbox={() => setShowToolbox(true)}
        onOpenExport={() => setShowExportDialog(true)}
        onBackup={() => setShowBackupDialog(true)}
      />
      </div>

      <div className="px-4 py-2 border-b border-[var(--nv-border-2)] flex items-center gap-2" inert={leftDrawerOpen || rightDrawerOpen}>
        <button onClick={() => setLeftDrawerOpen(o => !o)} className="lg:hidden text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="切换大纲栏（窄屏）">
          <Icon name="book" size={13} /> 大纲
        </button>
        <button onClick={() => setRightDrawerOpen(o => !o)} className="lg:hidden text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="切换侧栏（窄屏）">
          <Icon name="grid" size={13} /> 侧栏
        </button>
        <button onClick={() => setShowBuildConfig(true)} className="text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="小说骨架设定：题材 / 受众 / 剧情结构 / 力量体系 / 金手指 / 风格标签">
          <Icon name="settings" size={13} /> 项目设定
        </button>
        <button onClick={() => setShowMemoryDecay(true)} className="text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="设定记忆衰减：控制旧设定在写作上下文中的淡出节奏">
          <Icon name="hourglass" size={13} /> 记忆衰减
        </button>
        <button onClick={() => setShowProjectConfig(true)} className="text-xs btn-ghost px-3 py-1.5 rounded-xl flex items-center gap-1.5" title="项目配置：书名 / 模型 / LLM 参数 / 作者注">
          <Icon name="settings" size={13} /> 项目配置
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
          ${leftCollapsed ? "lg:hidden" : ""}`}
        >
          <h2 id={leftDrawerTitleId} className="sr-only">大纲栏</h2>
        <ErrorBoundary name="大纲">
        <LeftPanel activeTab={leftPanel} onTabChange={setLeftPanel}
          selectedNode={selectedNode} onSelectNode={handleSelectNode}
          onAddSection={handleAddSection} onEditCharacter={setEditingCharacter} onEditLore={setEditingLore}
          onNewCharacter={() => setShowNewCharacter(true)}
          viewMode={viewMode} onSetViewMode={setViewMode} loadProject={loadProject}
          batchMode={batchMode} onToggleBatchMode={() => { setBatchMode(!batchMode); setSelectedChapterIds(new Set()); }}
          selectedChapterIds={selectedChapterIds} onToggleChapterSelect={toggleChapterSelect}
          onSelectAll={selectAllChapters} onClearSelection={clearSelection}
          batchGenerating={batchGenerating} onBatchGenerate={handleBatchGenerate} onDeleteNode={deleteNode} deletingNodeId={deletingId}
          onLoadSample={loadSample} />
        </ErrorBoundary>
        </div>

        {/* 中间列：正文 + 分析面板 */}
        <ErrorBoundary name="编辑器">
        <div className="flex flex-col flex-1 overflow-hidden" inert={leftDrawerOpen || rightDrawerOpen}>
          <CenterPanel selectedNode={selectedNode} worldTime={selectedNode?.worldTime ?? null} onWorldTimeBlur={handleSaveWorldTime} streamContent={streamContent}
            isGenerating={isGenerating || continueLoading} reviewResult={reviewResult}
            authorNote={authorNote} onAuthorNoteChange={handleAuthorNoteChange}
            targetWordCount={targetWordCount} onTargetWordCountChange={setTargetWordCount}
            todayWords={monitorTodayWords}
            onWrite={handleWrite} onStop={handleStop}
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
          />

          {/* 宝宝流记忆召回面板（写作闭环透明度：本轮已自动呼应的设定/人设阶段） */}
          {recallMemories.length > 0 && selectedNode && (
            <div className="px-6 pb-4 max-w-[700px] mx-auto w-full">
              <div className="surface-elevated rounded-2xl p-4 border border-[var(--nv-primary)]/20">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="w-1.5 h-5 rounded-full bg-[var(--nv-primary)]/60" />
                  <h3 className="text-sm font-semibold text-[var(--nv-text-secondary)]">宝宝流记忆召回（已注入本轮写作）</h3>
                </div>
                <ul className="space-y-2.5">
                  {recallMemories.map((m, i) => (
                    <li key={i} className="text-xs">
                      <span className="text-[var(--nv-primary)] font-medium">{m.source === "lorebook" ? "世界书" : "结构化表格"}｜{m.title}</span>
                      <p className="text-[var(--nv-text-tertiary)] mt-1 whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* 统一分析面板（替代旧版浮动横幅+弹窗+按钮） */}
          {(extractionData || distillSummary || forbiddenScanResult || logicCheckResult || reviewResult) && selectedNode && (
            <div className="px-6 pb-4 max-w-[700px] mx-auto w-full">
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

        {rightPanelOpen && (
          <div
            ref={rightDrawerRef}
            tabIndex={-1}
            role={rightDrawerOpen ? "dialog" : undefined}
            aria-modal={rightDrawerOpen ? "true" : undefined}
            aria-labelledby={rightDrawerOpen ? rightDrawerTitleId : undefined}
            className={`fixed inset-y-0 right-0 z-40 w-80 max-w-[85vw] h-full transition-transform duration-200
            ${rightDrawerOpen ? "translate-x-0" : "translate-x-full"}
            lg:static lg:z-auto lg:h-auto lg:shrink-0 lg:w-80 lg:translate-x-0 lg:transition-none`}
          >
            <h2 id={rightDrawerTitleId} className="sr-only">侧栏</h2>
          <ErrorBoundary name="侧栏">
        <RightPanel selectedNode={selectedNode}
            onClose={() => setRightPanelOpen(false)} contextRefreshKey={contextRefreshKey} authorNote={authorNote}
            selectedText={selectedText || undefined}
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
        )}
      {/* 窄屏抽屉遮罩 */}
      {(leftDrawerOpen || rightDrawerOpen) && (
        <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => { setLeftDrawerOpen(false); setRightDrawerOpen(false); }} />
      )}
      </div>

      {/* 弹窗 */}
      {editingCharacter && <CharacterDialog character={editingCharacter} projectId={project.id} onClose={() => setEditingCharacter(null)} onSave={refreshAfterMutate} />}
      {showNewCharacter && <CharacterDialog projectId={project.id} onClose={() => setShowNewCharacter(false)} onSave={refreshAfterMutate} />}
      {editingLore && <LorebookEditDialog entry={editingLore} projectId={project.id} onClose={() => setEditingLore(null)} onSave={refreshAfterMutate} />}
      {showStyleEditor && <StyleEditor projectId={project.id} currentStyleId={styleTemplateId} onSaved={(id) => setStyleTemplateId(id)} onClose={() => setShowStyleEditor(false)} chapterContent={selectedNode?.content} />}
      {showImportWizard && <ImportWizard projectId={project.id} initialMode={importWizardMode} onClose={() => setShowImportWizard(false)} onImported={refreshAfterMutate} />}
      {batchGenerating && <BatchProgressPanel progress={batchProgress} nodes={project.storyNodes} onAbort={() => setBatchAbort(true)} />}

      {/* 大纲生成对话框 */}
      {showOutlineDialog && (
        <OutlineDialog projectName={project.name} chapterCount={outlineChapterCount}
          customChapterCount={outlineCustomChapterCount} customPrompt={outlineCustomPrompt}
          previewChapters={outlinePreviewChapters} rawOutline={outlineRaw}
          error={outlineError} isGenerating={outlineGenerating} onChapterCountChange={setOutlineChapterCount}
          onCustomChapterCountChange={setOutlineCustomChapterCount} onCustomPromptChange={setOutlineCustomPrompt}
          onGenerate={handleGenerateOutlinePreview}
          onConfirm={handleConfirmOutline} onUpdateChapter={updatePreviewChapter}
          appendMode={outlineAppendMode} onAppendModeChange={setOutlineAppendMode}
          hasExistingChapters={existingChapterCount > 0}
          onClose={() => { setShowOutlineDialog(false); setOutlinePreviewChapters([]); setOutlineError(""); setOutlineRaw(""); }} />
      )}
      {showAutomationSettings && project && (
        <AutomationSettingsDialog projectId={project.id} projectName={project.name} onClose={() => setShowAutomationSettings(false)} />
      )}

      {showBuildConfig && project && (
        <BuildConfigDialog
          projectId={project.id}
          buildConfig={project.buildConfig as any}
          onSaved={(cfg) => useProjectStore.getState().patchProject({ buildConfig: cfg as any })}
          onClose={() => setShowBuildConfig(false)}
        />
      )}

      {showMemoryDecay && project && (
        <MemoryDecayDialog projectId={project.id} projectName={project.name} onClose={() => setShowMemoryDecay(false)} />
      )}

      {showProjectConfig && project && (
        <ProjectConfigPanel
          projectId={project.id}
          project={project}
          onSaved={(patch) => useProjectStore.getState().patchProject(patch)}
          onClose={() => setShowProjectConfig(false)}
        />
      )}

      {/* 工具箱入口 */}
      {showToolbox && <ToolboxDialog items={toolboxItems} onClose={() => setShowToolbox(false)} />}

      {/* 导出弹窗 */}
      {showExportDialog && project && (
        <ExportDialog
          projectId={project.id}
          projectName={project.name}
          chapters={project.storyNodes.filter((n) => n.type === "chapter").map((n) => ({ id: n.id, title: n.title }))}
          onClose={() => setShowExportDialog(false)}
        />
      )}
      {showBackupDialog && project && (
        <BackupDialog
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowBackupDialog(false)}
        />
      )}

      {/* D4 冲突推演 */}
      {showConflict && project && (
        <ConflictPanel
          open={showConflict}
          projectId={project.id}
          projectName={project.name}
          onClose={() => setShowConflict(false)}
          onApplied={loadProject}
          onOpenCharacter={(id) => { const c = project.characters.find((x) => x.id === id); if (c) setEditingCharacter(c); }}
        />
      )}

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

      {/* 抽卡模式——章纲路线选择 */}
      {showDrawCards && selectedNode && (
        <DrawCards projectId={project.id} nodeId={selectedNode.id}
          authorNote={authorNote} chapterOutlinePrompt={chapterOutlinePrompt}
          nodeTitle={selectedNode.title}
          storylineId={project.storylines?.find((s: any) => s.status === "active" || s.type === "main")?.id}
          onSelect={handleDrawSelect} onClose={() => setShowDrawCards(false)} />
      )}

      {/* 生成前角色确认弹窗 */}
      {preGenOpen && (
        <PreGenConfirm projectId={project.id} nodeId={preGenMode === "outline" ? undefined : selectedNode?.id} presetCharacterIds={drawSelectedCharIds}
          authorNote={authorNote}
          title={preGenMode === "write" ? "生成前确认——角色调度" : preGenMode === "refine" ? "微调前确认——角色调度" : preGenMode === "continue" ? "续写前确认——角色调度" : "大纲生成前确认——角色调度"}
          onAuthorNoteChange={handleAuthorNoteChange}
          onConfirm={(cards, notes, newChars, finalAuthorNote) => {
            switch (preGenMode) {
              case "write": handleWriteConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "refine": handleRefineConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "continue": handleContinueConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "outline": handleOutlineConfirmed(cards, notes, newChars, finalAuthorNote); break;
            }
          }}
          onCancel={() => { setPreGenOpen(false); setOutlineGenConfig(null); }} />
      )}

    </div>
    </ErrorBoundary>
  );
}
