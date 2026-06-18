"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { SettingsImporter } from "@/components/dashboard/SettingsImporter";
import { StyleEditor } from "@/components/editor/StyleEditor";
import { ImportWizard } from "@/components/editor/ImportWizard";
import { PostGenPanel } from "@/components/workspace/PostGenPanel";
import { Toolbar } from "@/components/workspace/Toolbar";
import { LeftPanel } from "@/components/workspace/LeftPanel";
import { CenterPanel } from "@/components/workspace/CenterPanel";
import { RightPanel } from "@/components/workspace/RightPanel";
import { CharacterEditDialog } from "@/components/workspace/CharacterEditDialog";
import { CharacterCreateDialog } from "@/components/workspace/CharacterCreateDialog";
import { LorebookEditDialog } from "@/components/workspace/LorebookEditDialog";
import { LorebookCreateDialog } from "@/components/workspace/LorebookCreateDialog";
import { BatchProgressPanel } from "@/components/workspace/BatchProgressPanel";
import { OutlineDialog } from "@/components/workspace/OutlineDialog";
import { PreGenConfirm } from "@/components/workspace/PreGenConfirm";
import { DrawCards } from "@/components/workspace/DrawCards";
import type { ProjectData, CharacterData, LorebookData, StoryNodeData, ReviewIssue, SSEEvent } from "@/components/workspace/types";
import type { StyleTemplate } from "@/core/templates";

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  // ── 生成步骤状态 ──────────────────────────
  const [genStep, setGenStep] = useState<"" | "loading-cards" | "confirming" | "generating" | "reviewing" | "summarizing" | "done" | "error">("");
  const genStepLabels: Record<string, { icon: React.ReactNode; label: string }> = {
    "loading-cards": { icon: <Icon name="search" size={14} className="animate-pulse" />, label: "AI 正在分析角色调度..." },
    "confirming": { icon: <Icon name="clipboard" size={14} />, label: "等待确认角色选择" },
    "generating": { icon: <Icon name="pencil" size={14} className="animate-pulse" />, label: "AI 正在写作..." },
    "reviewing": { icon: <Icon name="search" size={14} className="animate-pulse" />, label: "AI 正在审校..." },
    "summarizing": { icon: <Icon name="package" size={14} />, label: "生成章节摘要..." },
    "done": { icon: <Icon name="check" size={14} className="text-emerald-400" />, label: "生成完成" },
    "error": { icon: <Icon name="alert" size={14} className="text-rose-400" />, label: "生成出错" },
  };
  const [chapterOutlineStatus, setChapterOutlineStatus] = useState<"" | "generating" | "done" | "error">("");

  // ── 项目数据 ──────────────────────────────
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
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

  // ── 生成状态 ──────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [reviewResult, setReviewResult] = useState<{ passed: boolean; issues: ReviewIssue[] } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── 选中文本（传给 AI 对话栏） ──────────
  const [selectedText, setSelectedText] = useState("");

  // ── 作者指令 ──────────────────────────────
  const [authorNote, setAuthorNote] = useState("");
  const authorNoteSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleAuthorNoteChange = (v: string) => {
    setAuthorNote(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-author-note-${projectId}`, v);
    if (authorNoteSaveTimer.current) clearTimeout(authorNoteSaveTimer.current);
    authorNoteSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/projects/${projectId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authorNote: v }),
        });
      } catch { /* 静默保存 */ }
    }, 1500);
  };
  const [targetWordCount, setTargetWordCount] = useState(800);

  // ── 面板状态 ──────────────────────────────
  const [leftPanel, setLeftPanel] = useState<"characters" | "world" | "lorebook" | "outline" | "storylines" | "rules">("outline");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // ── 角色/词条编辑弹窗 ──────────────────────
  const [editingCharacter, setEditingCharacter] = useState<CharacterData | null>(null);
  const [editingLore, setEditingLore] = useState<LorebookData | null>(null);
  const [showNewCharacter, setShowNewCharacter] = useState(false);
  const [showNewLore, setShowNewLore] = useState(false);

  // ── 弹窗状态 ──────────────────────────────
  const [showSettingsImport, setShowSettingsImport] = useState(false);
  const [showStyleEditor, setShowStyleEditor] = useState(false);
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [extractionData, setExtractionData] = useState<any>(null);
  const [extractionLoading, setExtractionLoading] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [contextRefreshKey, setContextRefreshKey] = useState(0);
  const [volumeView, setVolumeView] = useState(true);

  // ── 文风模板 ──────────────────────────────
  const [styleTemplateId, setStyleTemplateId] = useState<string | undefined>();

  // ── 续写状态 ──────────────────────────────
  const [continueLoading, setContinueLoading] = useState(false);

  // ── 微调状态 ──────────────────────────────
  const [refineMode, setRefineMode] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`novel-forge-refine-${projectId}`) || "";
  });
  const handleRefineInstructionChange = (v: string) => {
    setRefineInstruction(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-refine-${projectId}`, v);
  };

  // ── Flash 章纲提示词 ──────────────────────
  const [chapterOutlinePrompt, setChapterOutlinePrompt] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`novel-forge-flash-prompt-${projectId}`) || "";
  });
  const handleChapterOutlinePromptChange = (v: string) => {
    setChapterOutlinePrompt(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-flash-prompt-${projectId}`, v);
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
  const [outlineModelUsed, setOutlineModelUsed] = useState("");
  const [outlineRaw, setOutlineRaw] = useState("");
  const [outlineError, setOutlineError] = useState("");
  const [outlineUseFlash, setOutlineUseFlash] = useState(false);
  const existingChapterCount = project?.storyNodes.filter(n => n.type === "chapter" && !n.parentId).length || 0;
  const [outlineAppendMode, setOutlineAppendMode] = useState(existingChapterCount > 0);

  // ── 抽卡模式 ──────────────────────────────
  const [showDrawCards, setShowDrawCards] = useState(false);

  const handleDrawChapterOutline = () => {
    if (!selectedNode || !project) { alert("请先选中一个章节节点"); return; }
    setShowDrawCards(true);
  };

  const handleDrawSelect = async (card: { outline: string; characters: string[]; coreConflict: string; mood: string; cardLabel?: string }) => {
    if (!selectedNode) return;
    setShowDrawCards(false);
    try {
      await fetch(`/api/story/nodes/${selectedNode.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outline: card.outline }),
      });
    } catch { /* 乐观更新已生效，保存失败后续刷新会体现 */ }
    setSelectedNode({ ...selectedNode, outline: card.outline });
    setReviewResult({
      passed: true,
      issues: [{
        type: "info", severity: "minor",
        description: `🎴 已采用「${card.cardLabel || "抽卡路线"}」章纲 · ${card.characters.length}角色出场 · ${card.coreConflict || ""} · 🎭${card.mood || ""}`,
      }],
    });
    setChapterOutlineStatus("done");
    setTimeout(() => { setChapterOutlineStatus(""); setReviewResult(null); }, 5000);
  };

  // ── 生成前确认 ────────────────────────────
  const [preGenOpen, setPreGenOpen] = useState(false);
  const [preGenMode, setPreGenMode] = useState<"write" | "refine" | "continue" | "outline">("write");
  const [outlineGenConfig, setOutlineGenConfig] = useState<{ chapterCount: number; customPrompt: string; useFlash: boolean } | null>(null);

  // ═══════════════════════════════════════════
  // 数据加载
  // ═══════════════════════════════════════════

  const loadProject = useCallback(async () => {
    try {
      const [projRes, styleRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/style`).catch(() => null),
      ]);
      if (projRes.ok) {
        const data = await projRes.json();
        if (styleRes?.ok) {
          const styleData = await styleRes.json();
          if (!styleData.error) data.styleCard = styleData;
        }
        setProject(data);
        if (data.authorNote && data.authorNote.trim()) {
          setAuthorNote(data.authorNote);
          if (typeof window !== "undefined") localStorage.setItem(`novel-forge-author-note-${projectId}`, data.authorNote);
        }
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
      } else { router.push("/"); }
    } catch (err) { console.error("加载项目失败:", err); }
    finally { setLoading(false); }
  }, [projectId, router]);

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
    } finally { setExtractionLoading(false); }
  }, [projectId, selectedNode?.id]);

  useEffect(() => { loadProject(); }, [loadProject]);

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
    setOutlineGenConfig({ chapterCount: getEffectiveChapterCount(), customPrompt: outlineCustomPrompt, useFlash: outlineUseFlash || outlineCustomPrompt.trim().length > 0 });
    setPreGenMode("outline");
    setPreGenOpen(true);
  };

  const handleOutlineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], _finalAuthorNote: string) => {
    if (!project || !outlineGenConfig) return;
    setPreGenOpen(false); setGenStep("generating"); setOutlineGenerating(true);
    setOutlineError(""); setOutlinePreviewChapters([]); setOutlineRaw(""); setOutlineModelUsed("");
    const { chapterCount, customPrompt, useFlash } = outlineGenConfig;
    try {
      const res = await fetch("/api/generate/outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapterCount, customPrompt: customPrompt || undefined, useFlash, confirmedCardIds: cards, cardNotes: notes, newCharacterRequests: newChars }) });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: "未知错误" })); setOutlineError(err.error || `HTTP ${res.status}`); return; }
      const data = await res.json();
      const chapters = data.chapters || [];
      if (chapters.length === 0) { setOutlineError("未生成任何章节，请检查角色和世界书是否有内容"); return; }
      setOutlinePreviewChapters(chapters); setOutlineRaw(data.rawOutline || ""); setOutlineModelUsed(data.modelUsed || "未知");
      setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
    } catch (err) { setGenStep("error"); setOutlineError(err instanceof Error ? err.message : "网络错误"); }
    finally { setOutlineGenerating(false); }
  };

  const handleConfirmOutline = async () => {
    if (!project || outlinePreviewChapters.length === 0) return;
    setOutlineGenerating(true);
    try {
      const putRes = await fetch("/api/generate/outline", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapters: outlinePreviewChapters, replaceAll: !outlineAppendMode }) });
      if (!putRes.ok) { const err = await putRes.json().catch(() => ({ error: "创建失败" })); alert("创建章节节点失败: " + (err.error || putRes.status)); return; }
      setShowOutlineDialog(false); setOutlinePreviewChapters([]); setOutlineCustomPrompt("");
      await loadProject();
    } catch (err) { alert("写入大纲出错: " + (err instanceof Error ? err.message : "网络错误")); }
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
            else if (event.type === "done") {
              setGenStep("done"); setTimeout(() => setGenStep(""), 5000);
              // 把本地蒸馏累计数据写入 state（触发 UI 通知）
              setDistillSummary({ ...distillAccum.current });
              const finalContent = accumulated + (event.content || "");
              setLastChapterContent(finalContent);
              setLastChapterTitle(selectedNode?.title || "");
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
    const title = prompt(isChapter ? `新建章节（已有${project.storyNodes.filter(n => n.type === "chapter").length}章，自动编号为第${project.storyNodes.filter(n => n.type === "chapter").length + 1}章）：` : "请输入小节标题：", defaultTitle || undefined);
    if (!title) return;
    try {
      const res = await fetch("/api/story/nodes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, parentId, type: parentId ? "section" : "chapter", title, order: project.storyNodes.length }) });
      if (res.ok) await loadProject();
    } catch (err) { console.error("创建节点失败:", err); }
  };

  const handleDeleteNode = async (nodeId: string) => {
    if (!project) return;
    const node = project.storyNodes.find(n => n.id === nodeId);
    if (!confirm(`确定删除「${node?.title || "此节点"}」？\n删除后后续章节将自动重新编号。`)) return;
    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`, { method: "DELETE" });
      if (res.ok) { if (selectedNode?.id === nodeId) { setSelectedNode(null); setStreamContent(""); setReviewResult(null); } await loadProject(); }
      else { const err = await res.json().catch(() => ({ error: "未知错误" })); alert("删除失败: " + (err.error || "请重试")); }
    } catch (err) { console.error("删除节点失败:", err); }
  };

  const handleSummarize = async () => {
    if (!selectedNode || !project) return;
    if (!selectedNode.content) { alert("该节点还没有内容，无法摘要"); return; }
    setSummarizing(true);
    try {
      const res = await fetch("/api/generate/summarize", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, chapterId: selectedNode.id }) });
      if (res.ok) { const data = await res.json(); alert(`摘要完成！\n${data.summary.summary}\n\n关键事件：\n${data.keyEvents.join("\n")}`); loadProject(); }
    } catch (err) { console.error("摘要失败:", err); }
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

  const handleExport = (format: "markdown" | "txt") => { window.open(`/api/projects/${projectId}/export?format=${format}`, "_blank"); };

  // ═══════════════════════════════════════════
  // 渲染
  // ═══════════════════════════════════════════

  if (loading) return (
    <div className="h-screen bg-zinc-950 flex items-center justify-center">
      <span className="inline-flex items-center gap-2 text-zinc-500">
        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse" />
        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-150" />
        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-pulse delay-300" />
      </span>
    </div>
  );
  if (!project) return (
    <div className="h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
      项目不存在
      <Button variant="outline" onClick={() => router.push("/")} className="ml-4">返回首页</Button>
    </div>
  );

  return (
    <div className="h-screen bg-zinc-950 text-zinc-100 flex flex-col overflow-hidden">
      <Toolbar
        projectName={project.name} onBack={() => router.push("/")}
        onGenerateOutline={() => setShowOutlineDialog(true)} onSummarize={handleSummarize}
        onImportSettings={() => setShowSettingsImport(true)} onImportChapters={() => setShowImportWizard(true)}
        onEditStyle={() => setShowStyleEditor(true)} onExport={handleExport}
        isGenerating={isGenerating || continueLoading} outlineGenerating={outlineGenerating} summarizing={summarizing}
        projectId={project.id} styleTemplateId={styleTemplateId}
        onStyleSelect={(t: StyleTemplate) => setStyleTemplateId(t.id)} styleCard={project.styleCard}
      />

      <div className="flex flex-1 overflow-hidden" onMouseUp={() => {
        const sel = window.getSelection()?.toString()?.trim();
        if (sel && sel.length > 0) setSelectedText(sel);
      }}>
        <LeftPanel project={project} activeTab={leftPanel} onTabChange={setLeftPanel}
          selectedNode={selectedNode} onSelectNode={handleSelectNode}
          onAddSection={handleAddSection} onEditCharacter={setEditingCharacter} onEditLore={setEditingLore}
          onNewCharacter={() => setShowNewCharacter(true)} onNewLore={() => setShowNewLore(true)}
          loadProject={loadProject} volumeView={volumeView} onToggleVolumeView={() => setVolumeView(!volumeView)}
          batchMode={batchMode} onToggleBatchMode={() => { setBatchMode(!batchMode); setSelectedChapterIds(new Set()); }}
          selectedChapterIds={selectedChapterIds} onToggleChapterSelect={toggleChapterSelect}
          onSelectAll={selectAllChapters} onClearSelection={clearSelection}
          batchGenerating={batchGenerating} onBatchGenerate={handleBatchGenerate} onDeleteNode={handleDeleteNode} />

        {/* 中间列：正文 + 分析面板 */}
        <div className="flex flex-col flex-1 overflow-hidden">
          <CenterPanel selectedNode={selectedNode} streamContent={streamContent}
            isGenerating={isGenerating || continueLoading} reviewResult={reviewResult}
            authorNote={authorNote} onAuthorNoteChange={handleAuthorNoteChange}
            targetWordCount={targetWordCount} onTargetWordCountChange={setTargetWordCount}
            onWrite={handleWrite} onStop={handleStop}
            onEditOutline={async (outline) => { if (!selectedNode) return; setSelectedNode({ ...selectedNode, outline }); try { await fetch(`/api/story/nodes/${selectedNode.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outline }) }); } catch { /* 乐观更新已生效 */ } }}
            onDrawChapterOutline={handleDrawChapterOutline}
            onGenerateChapterOutline={async (flashPrompt: string) => {
              if (!selectedNode || !project) { alert("请先选中一个章节节点"); return; }
              setChapterOutlineStatus("generating");
              try {
                const res = await fetch("/api/generate/chapter-outline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectId: project.id, nodeId: selectedNode.id, prompt: flashPrompt || undefined, authorNote: authorNote || undefined }) });
                const data = await res.json();
                if (!res.ok || data.error) { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); alert(`章纲生成失败：${data.error || `HTTP ${res.status}`}`); return; }
                if (data.outline) {
                  setChapterOutlineStatus("done"); setTimeout(() => setChapterOutlineStatus(""), 4000);
                  setSelectedNode({ ...selectedNode, outline: data.outline });
                  const selectedInfo = data.selectedCharacters?.length ? `\n📋 AI 选角（${data.selectedCharacters.length}/${data.totalCharacters}人）：${data.selectedCharacters.map((c: any) => c.name).join("、")}${data.selectionReason ? `\n💬 ${data.selectionReason}` : ""}` : "";
                  setReviewResult({ passed: true, issues: [{ type: "info", severity: "minor", description: `✅ 章纲已生成（${data.modelUsed || "v4-flash"}）${selectedInfo}。点击大纲文字可编辑。` }] });
                  await loadProject();
                } else { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); alert("API 返回空内容，请重试"); }
              } catch (err) { setChapterOutlineStatus("error"); setTimeout(() => setChapterOutlineStatus(""), 4000); alert(`网络错误：${err instanceof Error ? err.message : "请重试"}`); }
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
          />

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

        {rightPanelOpen && (
          <RightPanel selectedNode={selectedNode} project={project}
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
        )}
      </div>

      {/* 弹窗 */}
      {editingCharacter && <CharacterEditDialog character={editingCharacter} projectId={project.id} onClose={() => setEditingCharacter(null)} onSave={loadProject} />}
      {showNewCharacter && <CharacterCreateDialog projectId={project.id} onClose={() => setShowNewCharacter(false)} onSave={loadProject} />}
      {editingLore && <LorebookEditDialog entry={editingLore} projectId={project.id} onClose={() => setEditingLore(null)} onSave={loadProject} />}
      {showNewLore && <LorebookCreateDialog projectId={project.id} onClose={() => setShowNewLore(false)} onSave={loadProject} />}
      {showSettingsImport && <SettingsImporter projectId={project.id} onClose={() => setShowSettingsImport(false)} onImported={loadProject} />}
      {showStyleEditor && <StyleEditor projectId={project.id} currentStyleId={styleTemplateId} onSaved={(id) => setStyleTemplateId(id)} onClose={() => setShowStyleEditor(false)} chapterContent={selectedNode?.content} />}
      {showImportWizard && <ImportWizard projectId={project.id} onClose={() => setShowImportWizard(false)} onImported={loadProject} />}
      {batchGenerating && <BatchProgressPanel progress={batchProgress} nodes={project.storyNodes} onAbort={() => setBatchAbort(true)} />}

      {/* 大纲生成对话框 */}
      {showOutlineDialog && (
        <OutlineDialog projectName={project.name} chapterCount={outlineChapterCount}
          customChapterCount={outlineCustomChapterCount} customPrompt={outlineCustomPrompt} useFlash={outlineUseFlash}
          previewChapters={outlinePreviewChapters} modelUsed={outlineModelUsed} rawOutline={outlineRaw}
          error={outlineError} isGenerating={outlineGenerating} onChapterCountChange={setOutlineChapterCount}
          onCustomChapterCountChange={setOutlineCustomChapterCount} onCustomPromptChange={setOutlineCustomPrompt}
          onUseFlashChange={setOutlineUseFlash} onGenerate={handleGenerateOutlinePreview}
          onConfirm={handleConfirmOutline} onUpdateChapter={updatePreviewChapter}
          appendMode={outlineAppendMode} onAppendModeChange={setOutlineAppendMode}
          hasExistingChapters={existingChapterCount > 0}
          onClose={() => { setShowOutlineDialog(false); setOutlinePreviewChapters([]); setOutlineError(""); setOutlineRaw(""); }} />
      )}

      {/* 抽卡模式——章纲路线选择 */}
      {showDrawCards && selectedNode && (
        <DrawCards projectId={project.id} nodeId={selectedNode.id}
          authorNote={authorNote} chapterOutlinePrompt={chapterOutlinePrompt}
          nodeTitle={selectedNode.title}
          onSelect={handleDrawSelect} onClose={() => setShowDrawCards(false)} />
      )}

      {/* 生成前角色确认弹窗 */}
      {preGenOpen && (
        <PreGenConfirm projectId={project.id} nodeId={preGenMode === "outline" ? undefined : selectedNode?.id}
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
  );
}
