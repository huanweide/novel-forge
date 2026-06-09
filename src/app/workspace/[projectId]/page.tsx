"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsImporter } from "@/components/dashboard/SettingsImporter";
import { StyleSelector } from "@/components/editor/StyleSelector";
import { StyleEditor } from "@/components/editor/StyleEditor";
import { EntityDetector } from "@/components/editor/EntityDetector";
import { ContextPreview } from "@/components/editor/ContextPreview";

import { ImportWizard } from "@/components/editor/ImportWizard";
import { CardUpdater } from "@/components/editor/CardUpdater";
import { CharacterList } from "@/components/workspace/CharacterList";
import { LorebookList } from "@/components/workspace/LorebookList";
import type { ProjectData, CharacterData, LorebookData, StoryNodeData, ReviewIssue, SSEEvent } from "@/components/workspace/types";
import { categoryLabel } from "@/components/workspace/types";
import type { StyleTemplate } from "@/core/templates";

// ─── 页面组件 ────────────────────────────────────────────────

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  // ── 生成步骤状态（进度可视化）──────────────────────────
  const [genStep, setGenStep] = useState<"" | "loading-cards" | "confirming" | "generating" | "reviewing" | "summarizing" | "done" | "error">("");
  const genStepLabels: Record<string, { icon: string; label: string }> = {
    "loading-cards": { icon: "🔍", label: "AI 正在分析角色调度..." },
    "confirming": { icon: "📋", label: "等待确认角色选择" },
    "generating": { icon: "✍️", label: "AI 正在写作..." },
    "reviewing": { icon: "🔍", label: "AI 正在审校..." },
    "summarizing": { icon: "📦", label: "生成章节摘要..." },
    "done": { icon: "✅", label: "生成完成" },
    "error": { icon: "❌", label: "生成出错" },
  };

  // 项目数据
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  // 选中节点
  const [selectedNode, setSelectedNode] = useState<StoryNodeData | null>(null);

  /** 切换章节——清空流内容和审校，确保每章独立 */
  const handleSelectNode = (node: StoryNodeData) => {
    if (selectedNode?.id !== node.id) {
      setStreamContent("");
      setReviewResult(null);
    }
    setSelectedNode(node);
  };

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    passed: boolean;
    issues: ReviewIssue[];
  } | null>(null);

  // 作者注释——持久化到 localStorage，不消失
  const [authorNote, setAuthorNote] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`novel-forge-author-note-${projectId}`) || "";
  });
  // 保存作者注释时同步写 localStorage
  const handleAuthorNoteChange = (v: string) => {
    setAuthorNote(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-author-note-${projectId}`, v);
  };
  const [targetWordCount, setTargetWordCount] = useState(800);

  // 面板状态
  const [leftPanel, setLeftPanel] = useState<"characters" | "lorebook" | "outline">("outline");
  const [rightPanelOpen, setRightPanelOpen] = useState(true);

  // 角色/词条编辑
  const [editingCharacter, setEditingCharacter] = useState<CharacterData | null>(null);
  const [editingLore, setEditingLore] = useState<LorebookData | null>(null);
  const [showNewCharacter, setShowNewCharacter] = useState(false);
  const [showNewLore, setShowNewLore] = useState(false);

  // 设定导入
  const [showSettingsImport, setShowSettingsImport] = useState(false);

  // 文风编辑弹窗
  const [showStyleEditor, setShowStyleEditor] = useState(false);

  // 摘要压缩中
  const [summarizing, setSummarizing] = useState(false);

  // 文风模板
  const [styleTemplateId, setStyleTemplateId] = useState<string | undefined>();

  // 续写状态
  const [continueLoading, setContinueLoading] = useState(false);

  // 微调模式
  const [refineMode, setRefineMode] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`novel-forge-refine-${projectId}`) || "";
  });
  const handleRefineInstructionChange = (v: string) => {
    setRefineInstruction(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-refine-${projectId}`, v);
  };

  // Flash 章纲提示词——持久化
  const [chapterOutlinePrompt, setChapterOutlinePrompt] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(`novel-forge-flash-prompt-${projectId}`) || "";
  });
  const handleChapterOutlinePromptChange = (v: string) => {
    setChapterOutlinePrompt(v);
    if (typeof window !== "undefined") localStorage.setItem(`novel-forge-flash-prompt-${projectId}`, v);
  };

  const handleRefine = async () => {
    if (!selectedNode || !project) return;
    setGenStep("confirming");
    setPreGenMode("refine");
    setPreGenOpen(true);
  };

  const handleRefineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false);
    setGenStep("generating");
    setIsGenerating(true);
    setStreamContent("");
    setReviewResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate/refine", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          nodeId: selectedNode.id,
          instruction: refineInstruction || "续写本章，补充细节和描写，自然推进剧情",
          targetWords: targetWordCount,
          confirmedCardIds: cards,
          cardNotes: notes,
          newCharacterRequests: newChars,
        }),
        signal: controller.signal,
      });

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
            if (event.type === "token") setStreamContent((prev) => prev + event.content);
            if (event.type === "done") {
              setGenStep("done");
              setTimeout(() => setGenStep(""), 5000);
              setLastChapterContent(streamContent);
              setLastChapterTitle(selectedNode?.title || "");
              loadProject();
              autoAnalyzeChapter(streamContent, selectedNode?.title || "");
            }
            if (event.type === "error") setGenStep("error");
          } catch { /* */ }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setGenStep("error");
        console.error("微调失败:", err);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  // 实体检测用——记录最近生成的文本
  const [lastGeneratedText, setLastGeneratedText] = useState("");

  // 上下文预览刷新键
  const [contextRefreshKey, setContextRefreshKey] = useState(0);

  // 导入向导
  const [showImportWizard, setShowImportWizard] = useState(false);

  // 分卷视图开关
  const [volumeView, setVolumeView] = useState(true);

  // 章节更新系统
  const [showCardUpdater, setShowCardUpdater] = useState(false);
  const [lastChapterContent, setLastChapterContent] = useState("");
  const [lastChapterTitle, setLastChapterTitle] = useState("");
  // 自动检测通知
  const [autoUpdateNotification, setAutoUpdateNotification] = useState<{
    summary: string; charCount: number; newCharCount: number; loreCount: number;
  } | null>(null);
  // 三卡更新待处理标记——关闭弹窗后显示浮动按钮
  const [cardUpdatePending, setCardUpdatePending] = useState(false);
  const [pendingCardUpdateNodeId, setPendingCardUpdateNodeId] = useState("");
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);

  // 生成中断控制
  const abortRef = useRef<AbortController | null>(null);

  // 批量生成
  const [batchMode, setBatchMode] = useState(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [batchProgress, setBatchProgress] = useState<Map<string, { status: "pending" | "generating" | "done" | "failed"; error?: string }>>(new Map());
  const [batchAbort, setBatchAbort] = useState(false);

  const toggleChapterSelect = (id: string) => {
    setSelectedChapterIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAllChapters = () => {
    if (!project) return;
    const chapters = project.storyNodes.filter((n) => n.type === "chapter" && n.status !== "completed");
    setSelectedChapterIds(new Set(chapters.map((c) => c.id)));
  };

  const clearSelection = () => setSelectedChapterIds(new Set());

  const handleBatchGenerate = async () => {
    if (!project || selectedChapterIds.size === 0) return;
    setBatchGenerating(true);
    setBatchAbort(false);

    // 按 order 排序，串行生成
    const ids = [...selectedChapterIds].sort((a, b) => {
      const na = project.storyNodes.find((n) => n.id === a);
      const nb = project.storyNodes.find((n) => n.id === b);
      return (na?.order || 0) - (nb?.order || 0);
    });

    const progress = new Map<string, { status: "pending" | "generating" | "done" | "failed"; error?: string }>();
    ids.forEach((id) => progress.set(id, { status: "pending" }));
    setBatchProgress(new Map(progress));

    for (const nodeId of ids) {
      if (batchAbort) break;

      const node = project.storyNodes.find((n) => n.id === nodeId);
      if (!node || node.status === "completed") continue;

      progress.set(nodeId, { status: "generating" });
      setBatchProgress(new Map(progress));

      try {
        const controller = new AbortController();
        const res = await fetch("/api/generate/write", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            nodeId,
            authorNote: authorNote || undefined,
            targetWordCount,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "未知错误" }));
          progress.set(nodeId, { status: "failed", error: err.error || `HTTP ${res.status}` });
          setBatchProgress(new Map(progress));
          continue;
        }

        // 消费 SSE 流直到完成
        const reader = res.body?.getReader();
        if (!reader) {
          progress.set(nodeId, { status: "failed", error: "无法获取响应流" });
          setBatchProgress(new Map(progress));
          continue;
        }

        const decoder = new TextDecoder();
        let buffer = "";
        let failed = false;

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
              const event = JSON.parse(trimmed.slice(6));
              if (event.type === "error") {
                failed = true;
                progress.set(nodeId, { status: "failed", error: event.content });
              }
              if (event.type === "done" && !failed) {
                progress.set(nodeId, { status: "done" });
              }
            } catch { /* */ }
          }
        }

        if (!failed && progress.get(nodeId)?.status !== "failed") {
          progress.set(nodeId, { status: "done" });
        }
      } catch (err) {
        progress.set(nodeId, { status: "failed", error: err instanceof Error ? err.message : "网络错误" });
      }
      setBatchProgress(new Map(progress));
    }

    setBatchGenerating(false);
    setBatchMode(false);
    setSelectedChapterIds(new Set());
    await loadProject();
  };

  // ─── 加载项目 ─────────────────────────────────────────────

  const loadProject = useCallback(async () => {
    try {
      const [projRes, styleRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/style`).catch(() => null),
      ]);
      if (projRes.ok) {
        const data = await projRes.json();
        // 加载风格卡
        if (styleRes?.ok) {
          const styleData = await styleRes.json();
          if (!styleData.error) data.styleCard = styleData;
        }
        setProject(data);
        // 保持当前选中章节——不跳走
        setSelectedNode((prev) => {
          if (prev && data.storyNodes?.some((n: StoryNodeData) => n.id === prev.id)) {
            // 更新同一节点的数据（含新生成的 content）
            const updated = data.storyNodes.find((n: StoryNodeData) => n.id === prev.id);
            return updated || prev;
          }
          // 没有选中或节点已删除 → 选第一个未完成的
          if (data.storyNodes?.length > 0) {
            const firstDraft = data.storyNodes.find(
              (n: StoryNodeData) => n.status !== "completed"
            );
            return firstDraft || data.storyNodes[0];
          }
          return null;
        });
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("加载项目失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  // ── 自动分析章节变化（生成完成后后台运行）──────

  const autoAnalyzeChapter = useCallback(async (content: string, title: string) => {
    if (!content || content.length < 200) return; // 太短不分析
    // 保存最新内容供 CardUpdater 使用，自动弹窗让用户确认
    setLastChapterContent(content);
    setLastChapterTitle(title || "");
    setCardUpdatePending(true);
    if (selectedNode?.id) setPendingCardUpdateNodeId(selectedNode.id);
    // 延迟一帧确保 state 更新后再弹窗
    setTimeout(() => setShowCardUpdater(true), 100);
  }, [projectId, selectedNode?.id]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // ─── 大纲生成对话框 ─────────────────────────────────────
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
  // 大纲追加模式：已有章节时默认追加而非替换
  const existingChapterCount = project?.storyNodes.filter(n => n.type === "chapter" && !n.parentId).length || 0;
  const [outlineAppendMode, setOutlineAppendMode] = useState(existingChapterCount > 0);

  /** 获取实际章节数（含自定义） */
  const getEffectiveChapterCount = () => {
    if (outlineChapterCount === -1) {
      const n = parseInt(outlineCustomChapterCount);
      return isNaN(n) || n < 1 ? 4 : Math.min(n, 30);
    }
    return outlineChapterCount;
  };

  /** 生成大纲预览（不写入DB） */
  const handleGenerateOutlinePreview = async () => {
    if (!project) return;
    // 保存配置，弹窗确认角色
    setGenStep("confirming");
    setOutlineGenConfig({
      chapterCount: getEffectiveChapterCount(),
      customPrompt: outlineCustomPrompt,
      useFlash: outlineUseFlash || outlineCustomPrompt.trim().length > 0,
    });
    setPreGenMode("outline");
    setPreGenOpen(true);
  };

  const handleOutlineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], _finalAuthorNote: string) => {
    if (!project || !outlineGenConfig) return;
    setPreGenOpen(false);
    setGenStep("generating");
    setOutlineGenerating(true);
    setOutlineError("");
    setOutlinePreviewChapters([]);
    setOutlineRaw("");
    setOutlineModelUsed("");

    const { chapterCount, customPrompt, useFlash } = outlineGenConfig;

    try {
      const res = await fetch("/api/generate/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          chapterCount,
          customPrompt: customPrompt || undefined,
          useFlash,
          confirmedCardIds: cards,
          cardNotes: notes,
          newCharacterRequests: newChars,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "未知错误" }));
        setOutlineError(err.error || `HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      const chapters = data.chapters || [];
      if (chapters.length === 0) {
        setOutlineError("未生成任何章节，请检查角色和世界书是否有内容");
        return;
      }
      setOutlinePreviewChapters(chapters);
      setOutlineRaw(data.rawOutline || "");
      setOutlineModelUsed(data.modelUsed || "未知");
      setGenStep("done");
      setTimeout(() => setGenStep(""), 5000);
    } catch (err) {
      setGenStep("error");
      setOutlineError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setOutlineGenerating(false);
    }
  };

  // ─── 章纲角色确认后 ─────────────────────────────────────────
  const handleChapterOutlineConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], _finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false);
    setGenStep("generating");

    try {
      setReviewResult({ passed: true, issues: [{ type: "info", severity: "minor", description: "⚡ V4 Flash 正在生成章纲..." }] });
      const res = await fetch("/api/generate/chapter-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          nodeId: selectedNode.id,
          prompt: chapterOutlineFlashPrompt || undefined,
          confirmedCardIds: cards,
          cardNotes: notes,
          newCharacterRequests: newChars,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        alert(`章纲生成失败：${data.error || `HTTP ${res.status}`}`);
        setReviewResult(null);
        return;
      }
      if (data.outline) {
        setGenStep("done");
        setTimeout(() => setGenStep(""), 5000);
        setSelectedNode({ ...selectedNode, outline: data.outline });
        setReviewResult({ passed: true, issues: [{ type: "info", severity: "minor", description: `✅ 章纲已生成（${data.modelUsed || "v4-flash"}）。点击大纲文字可编辑。` }] });
        await loadProject();
      } else {
        setGenStep("error");
        alert("API 返回空内容，请重试");
        setReviewResult(null);
      }
    } catch (err) {
      setGenStep("error");
      alert(`网络错误：${err instanceof Error ? err.message : "请重试"}`);
      setReviewResult(null);
    }
  };

  /** 确认写入大纲到DB */
  const handleConfirmOutline = async () => {
    if (!project || outlinePreviewChapters.length === 0) return;
    setOutlineGenerating(true);
    try {
      const putRes = await fetch("/api/generate/outline", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, chapters: outlinePreviewChapters, replaceAll: !outlineAppendMode }),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({ error: "创建失败" }));
        alert("创建章节节点失败: " + (err.error || putRes.status));
        return;
      }
      setShowOutlineDialog(false);
      setOutlinePreviewChapters([]);
      setOutlineCustomPrompt("");
      await loadProject();
    } catch (err) {
      alert("写入大纲出错: " + (err instanceof Error ? err.message : "网络错误"));
    } finally {
      setOutlineGenerating(false);
    }
  };

  /** 修改预览中的某一章 */
  const updatePreviewChapter = (index: number, field: string, value: string) => {
    setOutlinePreviewChapters((prev) =>
      prev.map((ch, i) => (i === index ? { ...ch, [field]: value } : ch))
    );
  };

  // ─── 生成前确认（统一入口） ─────────────────────────────
  const [preGenOpen, setPreGenOpen] = useState(false);
  const [preGenMode, setPreGenMode] = useState<"write" | "refine" | "continue" | "outline" | "chapter-outline">("write");
  // 大纲生成配置——在 PreGenConfirm 期间暂存
  const [outlineGenConfig, setOutlineGenConfig] = useState<{ chapterCount: number; customPrompt: string; useFlash: boolean } | null>(null);
  // Flash 章纲提示词暂存
  const [chapterOutlineFlashPrompt, setChapterOutlineFlashPrompt] = useState("");

  // ─── 正文生成 (SSE 流式) ──────────────────────────────────

  const handleWrite = async () => {
    if (!selectedNode || !project) return;
    setGenStep("confirming");
    setPreGenMode("write");
    setPreGenOpen(true);
  };

  const handleWriteConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false);

    setGenStep("generating");
    setIsGenerating(true);
    setStreamContent("");
    setReviewResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          nodeId: selectedNode.id,
          authorNote: finalAuthorNote || undefined,
          targetWordCount,
          confirmedCardIds: cards,
          cardNotes: notes,
          newCharacterRequests: newChars,
        }),
        signal: controller.signal,
      });

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

            if (event.type === "token") {
              setStreamContent((prev) => prev + event.content);
            } else if (event.type === "review_start") {
              setGenStep("reviewing");
            } else if (event.type === "summarize_start") {
              setGenStep("summarizing");
            } else if (event.type === "review_result") {
              setReviewResult({
                passed: event.passed ?? false,
                issues: event.issues || [],
              });
            } else if (event.type === "done") {
              setGenStep("done");
              setTimeout(() => setGenStep(""), 5000);
              // 保存最后生成的内容用于卡面更新
              const finalContent = streamContent + (event.content || "");
              setLastChapterContent(finalContent);
              setLastChapterTitle(selectedNode?.title || "");
              // 刷新数据但不跳转
              loadProject();
              // 自动检测章节变化
              autoAnalyzeChapter(finalContent, selectedNode?.title || "");
            } else if (event.type === "error") {
              setGenStep("error");
              console.error("生成错误:", event.content);
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setGenStep("error");
        console.error("生成失败:", err);
      }
    } finally {
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  // ─── 添加小节节点 ─────────────────────────────────────────

  const handleAddSection = async (parentId: string | null = null) => {
    if (!project) return;

    const title = prompt("请输入小节标题：");
    if (!title) return;

    try {
      const res = await fetch("/api/story/nodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          parentId,
          type: parentId ? "section" : "chapter",
          title,
          order: project.storyNodes.length,
        }),
      });
      if (res.ok) {
        await loadProject();
      }
    } catch (err) {
      console.error("创建节点失败:", err);
    }
  };

  // ─── 删除节点（章节自动重新编号） ──────────────────────────

  const handleDeleteNode = async (nodeId: string) => {
    if (!project) return;
    const node = project.storyNodes.find(n => n.id === nodeId);
    const label = node?.title || "此节点";
    if (!confirm(`确定删除「${label}」？\n删除后后续章节将自动重新编号。`)) return;

    try {
      const res = await fetch(`/api/story/nodes/${nodeId}`, { method: "DELETE" });
      if (res.ok) {
        // 如果删的是当前选中节点，清空选中
        if (selectedNode?.id === nodeId) {
          setSelectedNode(null);
          setStreamContent("");
          setReviewResult(null);
        }
        await loadProject();
      } else {
        const err = await res.json().catch(() => ({ error: "未知错误" }));
        alert("删除失败: " + (err.error || "请重试"));
      }
    } catch (err) {
      console.error("删除节点失败:", err);
    }
  };

  // ─── 章节摘要压缩 ─────────────────────────────────────────

  const handleSummarize = async () => {
    if (!selectedNode || !project) return;

    if (!selectedNode.content) {
      alert("该节点还没有内容，无法摘要");
      return;
    }

    setSummarizing(true);
    try {
      const res = await fetch("/api/generate/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          chapterId: selectedNode.id,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        alert(
          `摘要完成！\n${data.summary.summary}\n\n关键事件：\n${data.keyEvents.join("\n")}`
        );
        loadProject();
      }
    } catch (err) {
      console.error("摘要失败:", err);
    } finally {
      setSummarizing(false);
    }
  };

  // ─── 续写下一节 ───────────────────────────────────────────

  const handleContinue = async () => {
    if (!selectedNode || !project) return;
    setGenStep("confirming");
    setPreGenMode("continue");
    setPreGenOpen(true);
  };

  const handleContinueConfirmed = async (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => {
    if (!selectedNode || !project) return;
    setPreGenOpen(false);
    setGenStep("generating");
    setContinueLoading(true);
    setStreamContent("");
    setReviewResult(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/generate/continue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          currentNodeId: selectedNode.id,
          styleTemplateId,
          authorNote: finalAuthorNote || authorNote || undefined,
          autoOutline: true,
          confirmedCardIds: cards,
          cardNotes: notes,
          newCharacterRequests: newChars,
        }),
        signal: controller.signal,
      });

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
            if (event.type === "token") {
              setStreamContent((prev) => prev + event.content);
            } else if (event.type === "done") {
              setGenStep("done");
              setTimeout(() => setGenStep(""), 5000);
              // 保存最后生成的内容用于卡面更新
              setLastChapterContent(streamContent);
              setLastChapterTitle(selectedNode?.title || "");
              setLastGeneratedText((prev) => prev + streamContent);
              loadProject();
              setContextRefreshKey((k) => k + 1);
            } else if (event.type === "error") {
              setGenStep("error");
              console.error("续写错误:", event.content);
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
        setGenStep("error");
        console.error("续写失败:", err);
      }
    } finally {
      setContinueLoading(false);
      abortRef.current = null;
    }
  };

  // ─── 导出 ─────────────────────────────────────────────────

  const handleExport = (format: "markdown" | "txt") => {
    window.open(`/api/projects/${projectId}/export?format=${format}`, "_blank");
  };

  // ─── 渲染 ─────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        加载中...
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-500">
        项目不存在
        <Button variant="outline" onClick={() => router.push("/")} className="ml-4">
          返回首页
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col">
      {/* 顶部工具栏 */}
      <Toolbar
        projectName={project.name}
        onBack={() => router.push("/")}
        onGenerateOutline={() => setShowOutlineDialog(true)}
        onSummarize={handleSummarize}
        onImportSettings={() => setShowSettingsImport(true)}
        onImportChapters={() => setShowImportWizard(true)}
        onEditStyle={() => setShowStyleEditor(true)}
        onExport={handleExport}
        isGenerating={isGenerating || continueLoading}
        outlineGenerating={outlineGenerating}
        summarizing={summarizing}
        projectId={project.id}
        styleTemplateId={styleTemplateId}
        onStyleSelect={(t) => setStyleTemplateId(t.id)}
        styleCard={project.styleCard}
      />

      {/* 三栏主区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左栏：资源树 */}
        <LeftPanel
          project={project}
          activeTab={leftPanel}
          onTabChange={setLeftPanel}
          selectedNode={selectedNode}
          onSelectNode={handleSelectNode}
          onAddSection={handleAddSection}
          onEditCharacter={setEditingCharacter}
          onEditLore={setEditingLore}
          onNewCharacter={() => setShowNewCharacter(true)}
          onNewLore={() => setShowNewLore(true)}
          loadProject={loadProject}
          volumeView={volumeView}
          onToggleVolumeView={() => setVolumeView(!volumeView)}
          // 批量生成
          batchMode={batchMode}
          onToggleBatchMode={() => { setBatchMode(!batchMode); setSelectedChapterIds(new Set()); }}
          selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={toggleChapterSelect}
          onSelectAll={selectAllChapters}
          onClearSelection={clearSelection}
          batchGenerating={batchGenerating}
          onBatchGenerate={handleBatchGenerate}
          onDeleteNode={handleDeleteNode}
        />

        {/* 中栏：写作区 */}
        <CenterPanel
          selectedNode={selectedNode}
          streamContent={streamContent}
          isGenerating={isGenerating || continueLoading}
          reviewResult={reviewResult}
          authorNote={authorNote}
          onAuthorNoteChange={handleAuthorNoteChange}
          targetWordCount={targetWordCount}
          onTargetWordCountChange={setTargetWordCount}
          onWrite={handleWrite}
          onStop={handleStop}
          onContinue={handleContinue}
          onEditOutline={(outline) => {
            if (!selectedNode) return;
            fetch(`/api/story/nodes/${selectedNode.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ outline }),
            });
            setSelectedNode({ ...selectedNode, outline });
          }}
          onGenerateChapterOutline={(flashPrompt: string) => {
            if (!selectedNode || !project) {
              alert("请先选中一个章节节点");
              return;
            }
            // 弹窗确认角色调度
            setGenStep("confirming");
            setChapterOutlineFlashPrompt(flashPrompt);
            setPreGenMode("chapter-outline");
            setPreGenOpen(true);
          }}
          projectId={project.id}
          lastGeneratedText={lastGeneratedText}
          onEntitiesCreated={loadProject}
          onOpenCardUpdater={() => setShowCardUpdater(true)}
          refineMode={refineMode}
          onToggleRefineMode={() => setRefineMode(!refineMode)}
          refineInstruction={refineInstruction}
          onRefineInstructionChange={handleRefineInstructionChange}
          onRefine={handleRefine}
          chapterOutlinePrompt={chapterOutlinePrompt}
          onChapterOutlinePromptChange={handleChapterOutlinePromptChange}
          genStep={genStep}
          genStepLabels={genStepLabels}
          onReviewDismiss={() => setReviewResult(null)}
          onReviewExplain={(issue: ReviewIssue, note: string) => {
            setReviewResult((prev: typeof reviewResult) => prev ? {
              ...prev,
              issues: prev.issues.filter((_: ReviewIssue, j: number) => j !== prev.issues.indexOf(issue)),
              passed: prev.issues.length <= 1,
            } : null);
          }}
          onReviewFix={(issue: ReviewIssue, note: string) => {
            setRefineMode(true);
            setRefineInstruction(`修复：${issue.description}\n说明：${note}\n保留其他内容，只改有问题的地方。`);
            setReviewResult((prev: typeof reviewResult) => prev ? {
              ...prev,
              issues: prev.issues.filter((_: ReviewIssue, j: number) => j !== prev.issues.indexOf(issue)),
              passed: prev.issues.length <= 1,
            } : null);
          }}
        />

        {/* 右栏：上下文监控面板 */}
        {rightPanelOpen && (
          <RightPanel
            selectedNode={selectedNode}
            project={project}
            onClose={() => setRightPanelOpen(false)}
            contextRefreshKey={contextRefreshKey}
            authorNote={authorNote}
          />
        )}
      </div>

      {/* 角色编辑弹窗 */}
      {editingCharacter && (
        <CharacterEditDialog
          character={editingCharacter}
          projectId={project.id}
          onClose={() => setEditingCharacter(null)}
          onSave={loadProject}
        />
      )}

      {/* 新建角色弹窗 */}
      {showNewCharacter && (
        <CharacterCreateDialog
          projectId={project.id}
          onClose={() => setShowNewCharacter(false)}
          onSave={loadProject}
        />
      )}

      {/* 词条编辑弹窗 */}
      {editingLore && (
        <LorebookEditDialog
          entry={editingLore}
          projectId={project.id}
          onClose={() => setEditingLore(null)}
          onSave={loadProject}
        />
      )}

      {/* 新建词条弹窗 */}
      {showNewLore && (
        <LorebookCreateDialog
          projectId={project.id}
          onClose={() => setShowNewLore(false)}
          onSave={loadProject}
        />
      )}

      {/* 批量导入设定 */}
      {showSettingsImport && (
        <SettingsImporter
          projectId={project.id}
          onClose={() => setShowSettingsImport(false)}
          onImported={loadProject}
        />
      )}

      {/* 文风编辑器 */}
      {showStyleEditor && (
        <StyleEditor
          projectId={project.id}
          currentStyleId={styleTemplateId}
          onSaved={(id) => setStyleTemplateId(id)}
          onClose={() => setShowStyleEditor(false)}
        />
      )}

      {/* 智能导入向导 */}
      {showImportWizard && (
        <ImportWizard
          projectId={project.id}
          onClose={() => setShowImportWizard(false)}
          onImported={loadProject}
        />
      )}

      {/* 批量生成进度 */}
      {batchGenerating && (
        <BatchProgressPanel
          progress={batchProgress}
          nodes={project.storyNodes}
          onAbort={() => setBatchAbort(true)}
        />
      )}

      {/* 自动检测通知横幅 */}
      {autoUpdateNotification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-4 px-5 py-3 rounded-2xl bg-gradient-to-r from-indigo-950/95 to-purple-950/95 border border-indigo-700/60 shadow-2xl backdrop-blur">
            <div className="flex items-center gap-2">
              {autoAnalyzing ? (
                <div className="w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="text-lg">🔍</span>
              )}
              <div>
                <p className="text-sm text-zinc-200 font-medium">
                  {autoAnalyzing ? "正在分析本章变化..." : autoUpdateNotification.summary}
                </p>
                {!autoAnalyzing && (
                  <p className="text-xs text-zinc-500">
                    {autoUpdateNotification.charCount > 0 && `🔄 ${autoUpdateNotification.charCount}角色更新 `}
                    {autoUpdateNotification.newCharCount > 0 && `🆕 ${autoUpdateNotification.newCharCount}新角色 `}
                    {autoUpdateNotification.loreCount > 0 && `🌍 ${autoUpdateNotification.loreCount}新设定`}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setAutoUpdateNotification(null);
                  setShowCardUpdater(true);
                }}
                disabled={autoAnalyzing}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-colors disabled:opacity-50"
              >
                查看详情
              </button>
              <button
                onClick={() => setAutoUpdateNotification(null)}
                className="px-2 py-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                忽略
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 大纲生成对话框 */}
      {showOutlineDialog && (
        <OutlineDialog
          projectName={project.name}
          chapterCount={outlineChapterCount}
          customChapterCount={outlineCustomChapterCount}
          customPrompt={outlineCustomPrompt}
          useFlash={outlineUseFlash}
          previewChapters={outlinePreviewChapters}
          modelUsed={outlineModelUsed}
          rawOutline={outlineRaw}
          error={outlineError}
          isGenerating={outlineGenerating}
          onChapterCountChange={setOutlineChapterCount}
          onCustomChapterCountChange={setOutlineCustomChapterCount}
          onCustomPromptChange={setOutlineCustomPrompt}
          onUseFlashChange={setOutlineUseFlash}
          onGenerate={handleGenerateOutlinePreview}
          onConfirm={handleConfirmOutline}
          onUpdateChapter={updatePreviewChapter}
          appendMode={outlineAppendMode}
          onAppendModeChange={setOutlineAppendMode}
          hasExistingChapters={existingChapterCount > 0}
          onClose={() => {
            setShowOutlineDialog(false);
            setOutlinePreviewChapters([]);
            setOutlineError("");
            setOutlineRaw("");
          }}
        />
      )}

      {/* 生成前角色确认弹窗 */}
      {preGenOpen && (
        <PreGenConfirm
          projectId={project.id}
          nodeId={preGenMode === "outline" ? undefined : selectedNode?.id}
          authorNote={authorNote}
          title={
            preGenMode === "write" ? "生成前确认——角色调度"
            : preGenMode === "refine" ? "微调前确认——角色调度"
            : preGenMode === "continue" ? "续写前确认——角色调度"
            : preGenMode === "outline" ? "大纲生成前确认——角色调度"
            : "章纲生成前确认——角色调度"
          }
          onAuthorNoteChange={handleAuthorNoteChange}
          onConfirm={(cards, notes, newChars, finalAuthorNote) => {
            switch (preGenMode) {
              case "write": handleWriteConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "refine": handleRefineConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "continue": handleContinueConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "outline": handleOutlineConfirmed(cards, notes, newChars, finalAuthorNote); break;
              case "chapter-outline": handleChapterOutlineConfirmed(cards, notes, newChars, finalAuthorNote); break;
            }
          }}
          onCancel={() => { setPreGenOpen(false); setOutlineGenConfig(null); }}
        />
      )}

      {/* 三卡更新待处理浮动按钮——关闭弹窗后不消失 */}
      {cardUpdatePending && !showCardUpdater && (
        <div className="fixed bottom-6 right-6 z-50">
          <button
            onClick={() => {
              // 如果切到了其他节点，更新内容
              if (selectedNode?.id !== pendingCardUpdateNodeId) {
                setLastChapterContent(selectedNode?.content || "");
                setLastChapterTitle(selectedNode?.title || "");
                setPendingCardUpdateNodeId(selectedNode?.id || "");
              }
              setShowCardUpdater(true);
            }}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white shadow-2xl shadow-indigo-900/40 transition-all hover:scale-105 active:scale-95"
          >
            <span className="text-lg">🔍</span>
            <div className="text-left">
              <div className="text-sm font-medium">三卡待更新</div>
              <div className="text-[10px] text-white/60">点击分析本章变化</div>
            </div>
          </button>
        </div>
      )}

      {/* 三卡更新确认后清除浮动按钮 */}
      {showCardUpdater && (
        <CardUpdater
          projectId={project.id}
          chapterContent={selectedNode?.content || lastChapterContent}
          chapterTitle={selectedNode?.title || lastChapterTitle}
          chapterNumber={(() => {
            const m = (selectedNode?.title || "").match(/第([一二三四五六七八九十百千\d]+)章/);
            return m?.[1] || undefined;
          })()}
          onApplied={() => {
            loadProject();
            setAutoUpdateNotification(null);
            setCardUpdatePending(false);
          }}
          onClose={() => {
            setShowCardUpdater(false);
            // 不清除 cardUpdatePending——按钮持续显示
          }}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 子组件
// ═══════════════════════════════════════════════════════════════

// ─── 顶栏 ───────────────────────────────────────────────────

function Toolbar({
  projectName,
  onBack,
  onGenerateOutline,
  onSummarize,
  onImportSettings,
  onImportChapters,
  onEditStyle,
  onExport,
  isGenerating,
  outlineGenerating,
  summarizing,
  projectId,
  styleTemplateId,
  onStyleSelect,
  styleCard,
}: {
  projectName: string;
  onBack: () => void;
  onGenerateOutline: () => void;
  onSummarize: () => void;
  onImportSettings: () => void;
  onImportChapters: () => void;
  onEditStyle: () => void;
  onExport: (format: "markdown" | "txt") => void;
  isGenerating: boolean;
  outlineGenerating?: boolean;
  summarizing: boolean;
  projectId: string;
  styleTemplateId?: string;
  onStyleSelect: (t: StyleTemplate) => void;
  styleCard?: ProjectData["styleCard"];
}) {
  const [showExport, setShowExport] = useState(false);

  const povLabel = (p?: string) => {
    if (!p) return "";
    if (p === "first_person") return "第一人称";
    if (p === "third_person_limited") return "第三人称限制";
    if (p === "third_person_omniscient") return "第三人称全知";
    return p;
  };

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0 relative">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 text-sm shrink-0">
          ← 返回
        </button>
        <span className="text-zinc-700 shrink-0">|</span>
        <span className="font-medium text-sm truncate">{projectName}</span>
      </div>

      <div className="flex items-center gap-1.5">
        {/* 风格卡可视化指示器 */}
        {styleCard?.styleDescription && (
          <button
            onClick={onEditStyle}
            disabled={isGenerating}
            className="flex items-center gap-1.5 text-xs border border-amber-700/50 rounded px-2 py-1 bg-amber-950/20 hover:bg-amber-950/40 transition-colors shrink-0"
            title={`${styleCard.styleDescription}\n${povLabel(styleCard.povType)} · 对话${((styleCard.dialogueRatio||0)*100).toFixed(0)}% · 描写${((styleCard.descriptionRatio||0)*100).toFixed(0)}%`}
          >
            <span>🎨</span>
            <span className="text-amber-300 max-w-[80px] truncate">{styleCard.styleDescription}</span>
            <span className="text-zinc-500">·</span>
            <span className="text-zinc-400 whitespace-nowrap">{povLabel(styleCard.povType)}</span>
          </button>
        )}
        {!styleCard?.styleDescription && (
          <Button
            size="sm"
            variant="outline"
            onClick={onEditStyle}
            disabled={isGenerating}
            className="text-xs border-zinc-700 h-7"
            title="文风卡（未设定）"
          >
            🎨 文风
          </Button>
        )}

        <span className="text-zinc-800 mx-0.5">|</span>

        <StyleSelector
          projectId={projectId}
          currentStyleId={styleTemplateId}
          onSelect={onStyleSelect}
        />

        <button
          onClick={onGenerateOutline}
          disabled={isGenerating || outlineGenerating}
          className="text-xs border border-zinc-700 rounded px-2.5 h-7 text-zinc-300 hover:bg-zinc-700/80 hover:text-zinc-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {outlineGenerating ? "⏳" : "🤖"} 大纲
        </button>

        <Button
          size="sm"
          variant="outline"
          onClick={onSummarize}
          disabled={isGenerating || summarizing}
          className="text-xs border-zinc-700 h-7"
        >
          {summarizing ? "⏳" : "📦"} 摘要
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onImportChapters}
          disabled={isGenerating}
          className="text-xs border-purple-700 text-purple-400 hover:text-purple-300 h-7"
        >
          📥 导入
        </Button>

        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExport(!showExport)}
            disabled={isGenerating}
            className="text-xs border-zinc-700 h-7"
          >
            📤 导出
          </Button>
          {showExport && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowExport(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden w-36">
                <button
                  onClick={() => { onExport("markdown"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors"
                >
                  📝 Markdown (.md)
                </button>
                <button
                  onClick={() => { onExport("txt"); setShowExport(false); }}
                  className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-800 transition-colors"
                >
                  📄 纯文本 (.txt)
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── 左栏 ───────────────────────────────────────────────────

function LeftPanel({
  project,
  activeTab,
  onTabChange,
  selectedNode,
  onSelectNode,
  onAddSection,
  onEditCharacter,
  onEditLore,
  onNewCharacter,
  onNewLore,
  loadProject,
  volumeView,
  onToggleVolumeView,
  batchMode,
  onToggleBatchMode,
  selectedChapterIds,
  onToggleChapterSelect,
  onSelectAll,
  onClearSelection,
  batchGenerating,
  onBatchGenerate,
  onDeleteNode,
}: {
  project: ProjectData;
  activeTab: string;
  onTabChange: (tab: "characters" | "lorebook" | "outline") => void;
  selectedNode: StoryNodeData | null;
  onSelectNode: (node: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  onEditCharacter: (c: CharacterData) => void;
  onEditLore: (l: LorebookData) => void;
  onNewCharacter: () => void;
  onNewLore: () => void;
  loadProject: () => void;
  volumeView: boolean;
  onToggleVolumeView: () => void;
  batchMode: boolean;
  onToggleBatchMode: () => void;
  selectedChapterIds: Set<string>;
  onToggleChapterSelect: (id: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  batchGenerating: boolean;
  onBatchGenerate: () => void;
  onDeleteNode?: (id: string) => void;
}) {
  const tabs = [
    { key: "outline", label: "大纲" },
    { key: "characters", label: `角色 (${project.characters.length})` },
    { key: "lorebook", label: `世界书 (${project.lorebookEntries.length})` },
  ] as const;

  return (
    <aside className="w-64 border-r border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
      {/* Tab 切换 */}
      <div className="flex border-b border-zinc-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex-1 text-xs py-2 text-center transition-colors ${
              activeTab === t.key
                ? "text-indigo-400 border-b border-indigo-400 bg-indigo-400/5"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "outline" && (
          <>
            <div className="flex items-center justify-between px-1 mb-1 flex-wrap gap-1">
              <span className="text-[10px] text-zinc-600">
                {volumeView ? "分卷视图" : "平铺视图"}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={onToggleVolumeView}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    volumeView
                      ? "bg-indigo-900/40 text-indigo-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  {volumeView ? "📂 分卷" : "📄 平铺"}
                </button>
                <button
                  onClick={onToggleBatchMode}
                  disabled={batchGenerating}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    batchMode
                      ? "bg-amber-900/40 text-amber-400"
                      : "bg-zinc-800 text-zinc-500"
                  }`}
                >
                  ☑ 批量
                </button>
              </div>
            </div>
            {batchMode && (
              <div className="flex items-center gap-1 mb-1 px-1 flex-wrap">
                <button onClick={onSelectAll} className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded">
                  全选
                </button>
                <button onClick={onClearSelection} className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-zinc-800 px-1.5 py-0.5 rounded">
                  清除
                </button>
                <span className="text-[10px] text-zinc-600 ml-1">
                  {selectedChapterIds.size} 章
                </span>
                {selectedChapterIds.size > 0 && !batchGenerating && (
                  <button
                    onClick={onBatchGenerate}
                    className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 rounded font-medium ml-auto"
                  >
                    ▶ 批量生成
                  </button>
                )}
              </div>
            )}
            <OutlineTree
              nodes={project.storyNodes}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              onAddSection={onAddSection}
              volumeView={volumeView}
              batchMode={batchMode}
              selectedChapterIds={selectedChapterIds}
              onToggleChapterSelect={onToggleChapterSelect}
              onDeleteNode={onDeleteNode}
            />
          </>
        )}

        {activeTab === "characters" && (
          <CharacterList
            characters={project.characters}
            projectId={project.id}
            onEdit={onEditCharacter}
            onDelete={async (id) => {
              await fetch(`/api/characters/${id}`, { method: "DELETE" });
              loadProject();
            }}
            onNew={onNewCharacter}
            onExpanded={loadProject}
          />
        )}

        {activeTab === "lorebook" && (
          <LorebookList
            projectId={project.id}
            entries={project.lorebookEntries}
            onEdit={onEditLore}
            onDelete={async (id) => {
              await fetch(`/api/lorebook/${id}`, { method: "DELETE" });
              loadProject();
            }}
            onNew={onNewLore}
            onRefresh={loadProject}
          />
        )}
      </div>
    </aside>
  );
}

// ─── 大纲树 ─────────────────────────────────────────────────

function OutlineTree({
  nodes,
  selectedNode,
  onSelectNode,
  onAddSection,
  volumeView,
  batchMode,
  selectedChapterIds,
  onToggleChapterSelect,
  onDeleteNode,
}: {
  nodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  volumeView: boolean;
  batchMode?: boolean;
  selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
}) {
  const volumeNodes = nodes.filter((n) => n.type === "volume");
  const nonVolumeRoots = nodes.filter((n) => !n.parentId && n.type !== "volume");

  // 分卷视图：显示卷 → 章 → 节层次
  if (volumeView && volumeNodes.length > 0) {
    return (
      <div className="space-y-0.5">
        {volumeNodes.map((vol) => {
          const volChildren = nodes.filter((n) => n.parentId === vol.id);
          return (
            <VolumeGroup
              key={vol.id}
              volume={vol}
              children={volChildren}
              allNodes={nodes}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              onAddSection={onAddSection}
              batchMode={batchMode}
              selectedChapterIds={selectedChapterIds}
              onToggleChapterSelect={onToggleChapterSelect}
              onDeleteNode={onDeleteNode}
            />
          );
        })}

        {/* 没挂载在任何分卷下的根节点 */}
        {nonVolumeRoots.map((root) => (
          <NodeTreeItem
            key={root.id}
            node={root}
            allNodes={nodes}
            selectedNode={selectedNode}
            onSelectNode={onSelectNode}
            onAddSection={onAddSection}
            depth={0}
            batchMode={batchMode}
            selectedChapterIds={selectedChapterIds}
            onToggleChapterSelect={onToggleChapterSelect}
            onDeleteNode={onDeleteNode}
          />
        ))}

        <button
          onClick={() => onAddSection(null)}
          className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-1 px-2 mt-2"
        >
          + 添加章节/分卷
        </button>
      </div>
    );
  }

  // 平铺视图：隐藏卷节点，所有章节平铺
  const flatNodes = volumeView
    ? nonVolumeRoots
    : nodes.filter((n) => n.type !== "volume" && !(n.parentId && nodes.find((p) => p.id === n.parentId)?.type === "volume"));

  const roots = flatNodes.filter((n) => !n.parentId);

  if (roots.length === 0) {
    return (
      <div className="text-center text-zinc-600 text-xs py-8">
        还没有章节大纲
        <br />
        <button
          onClick={() => onAddSection(null)}
          className="text-indigo-400 hover:text-indigo-300 mt-2 block mx-auto"
        >
          + 手动添加章节
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {roots.map((root) => (
        <NodeTreeItem
          key={root.id}
          node={root}
          allNodes={nodes}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          onAddSection={onAddSection}
          depth={0}
          batchMode={batchMode}
          selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={onToggleChapterSelect}
          onDeleteNode={onDeleteNode}
        />
      ))}

      <button
        onClick={() => onAddSection(null)}
        className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-1 px-2 mt-2"
      >
        + 添加章节
      </button>
    </div>
  );
}

// ─── 分卷分组 ─────────────────────────────────────────────────

function VolumeGroup({
  volume,
  children,
  allNodes,
  selectedNode,
  onSelectNode,
  onAddSection,
  batchMode,
  selectedChapterIds,
  onToggleChapterSelect,
  onDeleteNode,
}: {
  volume: StoryNodeData;
  children: StoryNodeData[];
  allNodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  batchMode?: boolean;
  selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const totalWords = children.reduce((sum, c) => sum + (c.wordCount || 0), 0);

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-xs bg-amber-950/20 border border-amber-900/20 hover:border-amber-900/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span className="text-[10px]">{collapsed ? "▶" : "▼"}</span>
        <span className="text-amber-400/80 font-medium flex-1">📂 {volume.title}</span>
        <span className="text-zinc-600 text-[10px]">
          {children.length}章 · {totalWords}字
        </span>
      </div>

      {!collapsed && (
        <div className="ml-2 border-l border-amber-900/20 pl-2">
          {children.map((ch) => (
            <NodeTreeItem
              key={ch.id}
              node={ch}
              allNodes={allNodes}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              onAddSection={onAddSection}
              depth={1}
              batchMode={batchMode}
              selectedChapterIds={selectedChapterIds}
              onToggleChapterSelect={onToggleChapterSelect}
              onDeleteNode={onDeleteNode}
            />
          ))}
          <button
            onClick={(e) => { e.stopPropagation(); onAddSection(volume.id); }}
            className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-0.5 px-1.5"
            style={{ paddingLeft: "18px" }}
          >
            + 添加章节到此卷
          </button>
        </div>
      )}
    </div>
  );
}

function NodeTreeItem({
  node,
  allNodes,
  selectedNode,
  onSelectNode,
  onAddSection,
  depth,
  batchMode,
  selectedChapterIds,
  onToggleChapterSelect,
  onDeleteNode,
}: {
  node: StoryNodeData;
  allNodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  depth: number;
  batchMode?: boolean;
  selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void;
  onDeleteNode?: (id: string) => void;
}) {
  const children = allNodes.filter((n) => n.parentId === node.id);
  const isSelected = selectedNode?.id === node.id;
  const isImported = node.content?.includes("📥") || false;
  const isChapter = node.type === "chapter" || node.type === "section";
  const isChecked = selectedChapterIds?.has(node.id) || false;

  const typeIcon =
    node.type === "volume" ? "📂" :
    node.type === "chapter" ? "📖" :
    node.type === "section" ? "§" : "○";

  const statusIcon =
    node.status === "completed"
      ? "●"
      : node.status === "drafting"
      ? "◐"
      : node.status === "reviewing"
      ? "⚠"
      : "○";

  const statusColor =
    node.status === "completed"
      ? "text-green-400"
      : node.status === "reviewing"
      ? "text-yellow-400"
      : "text-zinc-600";

  return (
    <div>
      <div
        onClick={() => onSelectNode(node)}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-xs group ${
          isSelected
            ? "bg-indigo-500/20 text-indigo-300"
            : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
      >
        {batchMode && isChapter && (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={(e) => { e.stopPropagation(); onToggleChapterSelect?.(node.id); }}
            className="w-3 h-3 rounded shrink-0 accent-amber-500"
            onClick={(e) => e.stopPropagation()}
          />
        )}
        <span className="text-[10px]">{typeIcon}</span>
        <span className={`${statusColor} text-[10px]`}>{statusIcon}</span>
        <span className="flex-1 truncate">{node.title}</span>
        {isImported && (
          <span className="text-purple-400/70 text-[10px]" title="从导入文本创建">📥</span>
        )}
        {onDeleteNode && (node.type === "chapter" || node.type === "section") && (
          <button
            onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
            className="opacity-0 group-hover:opacity-100 text-red-500/60 hover:text-red-400 text-[12px] px-0.5 transition-opacity"
            title="删除此章节"
          >
            ✕
          </button>
        )}
        <span className="text-zinc-600 text-[10px]">
          {node.wordCount > 0 ? `${node.wordCount}字` : ""}
        </span>
      </div>

      {children.map((child) => (
        <NodeTreeItem
          key={child.id}
          node={child}
          allNodes={allNodes}
          selectedNode={selectedNode}
          onSelectNode={onSelectNode}
          onAddSection={onAddSection}
          depth={depth + 1}
          batchMode={batchMode}
          selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={onToggleChapterSelect}
          onDeleteNode={onDeleteNode}
        />
      ))}
    </div>
  );
}

// ─── 中栏：写作区 ───────────────────────────────────────────

function CenterPanel({
  selectedNode, streamContent, isGenerating, reviewResult,
  authorNote, onAuthorNoteChange, targetWordCount, onTargetWordCountChange,
  onWrite, onStop, onContinue, onEditOutline, onGenerateChapterOutline,
  projectId, lastGeneratedText, onEntitiesCreated, onOpenCardUpdater,
  refineMode, onToggleRefineMode, refineInstruction, onRefineInstructionChange, onRefine,
  onReviewDismiss, onReviewExplain, onReviewFix,
  chapterOutlinePrompt, onChapterOutlinePromptChange,
  genStep, genStepLabels,
}: {
  selectedNode: StoryNodeData | null;
  streamContent: string;
  isGenerating: boolean;
  reviewResult: { passed: boolean; issues: ReviewIssue[] } | null;
  authorNote: string;
  onAuthorNoteChange: (v: string) => void;
  targetWordCount: number;
  onTargetWordCountChange: (v: number) => void;
  onWrite: () => void;
  onStop: () => void;
  onContinue: () => void;
  onEditOutline: (outline: string) => void;
  onGenerateChapterOutline: (flashPrompt: string) => void;
  chapterOutlinePrompt: string;
  onChapterOutlinePromptChange: (v: string) => void;
  projectId: string;
  lastGeneratedText: string;
  onEntitiesCreated: () => void;
  onOpenCardUpdater: () => void;
  refineMode: boolean;
  onToggleRefineMode: () => void;
  refineInstruction: string;
  onRefineInstructionChange: (v: string) => void;
  onRefine: () => void;
  onReviewDismiss: () => void;
  onReviewExplain: (issue: ReviewIssue, note: string) => void;
  onReviewFix: (issue: ReviewIssue, note: string) => void;
  genStep: string;
  genStepLabels: Record<string, { icon: string; label: string }>;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [editingOutline, setEditingOutline] = useState(false);
  const [outlineDraft, setOutlineDraft] = useState("");

  // 流式输出时自动滚到底部
  useEffect(() => {
    if (contentRef.current && isGenerating) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [streamContent, isGenerating]);

  // 显示内容：优先流式输出，否则节点已有内容
  const displayContent = streamContent || selectedNode?.content || "";

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      {selectedNode ? (
        <>
          {/* 节点信息 + 控制栏 */}
          <div className="border-b border-zinc-800 px-4 py-3 shrink-0">
            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-sm">{selectedNode.title}</h2>
              <span className="text-xs text-zinc-600">
                {selectedNode.status === "completed"
                  ? "✅ 已完成"
                  : selectedNode.status === "reviewing"
                  ? "⚠️ 待修改"
                  : "📝 草稿"}{" "}
                · {selectedNode.wordCount || 0} 字
              </span>
            </div>

            {/* 大纲编辑 */}
            <div className="mb-2">
              {editingOutline ? (
                <div className="flex gap-2">
                  <textarea
                    className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs resize-none"
                    rows={2}
                    value={outlineDraft}
                    onChange={(e) => setOutlineDraft(e.target.value)}
                    placeholder="输入本节点大纲..."
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={() => {
                        onEditOutline(outlineDraft);
                        setEditingOutline(false);
                      }}
                      className="text-xs text-green-400 hover:text-green-300"
                    >
                      保存
                    </button>
                    <button
                      onClick={() => setEditingOutline(false)}
                      className="text-xs text-zinc-500 hover:text-zinc-400"
                    >
                      取消
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <div
                    onClick={() => {
                      setOutlineDraft(selectedNode.outline || "");
                      setEditingOutline(true);
                    }}
                    className="flex-1 text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer italic"
                  >
                    {selectedNode.outline || "点击设置本节点大纲..."}
                  </div>
                  {!isGenerating && (
                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <input
                        value={chapterOutlinePrompt}
                        onChange={(e) => onChapterOutlinePromptChange(e.target.value)}
                        placeholder="Flash提示词（留空自动生成）"
                        className="w-32 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[10px] placeholder:text-zinc-600 focus:outline-none focus:border-cyan-700"
                      />
                      <button
                        onClick={() => onGenerateChapterOutline(chapterOutlinePrompt)}
                        className="text-[10px] px-1.5 py-0.5 rounded border border-cyan-800 text-cyan-400 hover:bg-cyan-950/30 transition-colors"
                        title="用 V4 Flash 为本章生成章纲"
                      >
                        ⚡生成
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 生成控制 */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                {isGenerating ? (
                  <Button size="sm" onClick={onStop} className="bg-red-600 hover:bg-red-500 h-7 text-xs">
                    ⏹ 停止生成
                  </Button>
                ) : (
                  <>
                    {/* 生成/重写 按钮 */}
                    {!refineMode && (
                      <Button size="sm" onClick={onWrite} className="bg-indigo-600 hover:bg-indigo-500 h-7 text-xs">
                        ▶ 生成/重写
                      </Button>
                    )}
                    {/* 微调 按钮 */}
                    {refineMode && (
                      <Button size="sm" onClick={onRefine} className="bg-amber-600 hover:bg-amber-500 h-7 text-xs">
                        🔧 微调
                      </Button>
                    )}
                    {/* 模式切换 */}
                    <button
                      onClick={onToggleRefineMode}
                      className={`text-xs px-2 py-1 h-7 rounded border transition-colors ${
                        refineMode
                          ? "border-amber-700 text-amber-400 bg-amber-950/20 hover:bg-amber-950/40"
                          : "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
                      }`}
                      title={refineMode ? "切换到生成模式" : "切换到微调模式"}
                    >
                      {refineMode ? "🔧 微调中" : "🔧 微调"}
                    </button>
                  </>
                )}

                <input
                  type="number"
                  value={targetWordCount}
                  onChange={(e) => onTargetWordCountChange(parseInt(e.target.value) || 800)}
                  className="w-16 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-center"
                  title="目标字数"
                />
                <span className="text-xs text-zinc-600">字</span>

                <input
                  placeholder={refineMode ? "微调指令（改对话/加描写/续写500字）..." : "作者指令（高优先级）..."}
                  value={refineMode ? refineInstruction : authorNote}
                  onChange={(e) => refineMode ? onRefineInstructionChange(e.target.value) : onAuthorNoteChange(e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600"
                />
              </div>

              {/* 微调模式提示 */}
              {refineMode && !isGenerating && (
                <p className="text-[10px] text-amber-600/70">
                  微调模式：不重写正文，按指令修改现有内容或续写补长。字数不够会自动补，中途打断可续写。
                </p>
              )}
            </div>
          </div>

          {/* 正文显示区 */}
          <div
            ref={contentRef}
            className="flex-1 overflow-y-auto px-6 py-4"
          >
            {displayContent ? (
              <div className="max-w-2xl mx-auto">
                <div className="prose prose-invert prose-sm max-w-none">
                  <StreamingText content={displayContent} isStreaming={isGenerating} />
                </div>

                {/* 审校结果 */}
                {reviewResult && (
                  <ReviewPanel
                    reviewResult={reviewResult}
                    onDismiss={onReviewDismiss}
                    onExplain={onReviewExplain}
                    onFix={onReviewFix}
                  />
                )}

                {/* 生成完成后的操作区 */}
                {!isGenerating && displayContent && (
                  <div className="mt-6 space-y-4">
                    {/* 续写按钮 */}
                    <div className="flex justify-center">
                      <Button
                        onClick={onContinue}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium px-6 py-2 text-sm"
                      >
                        ✨ 继续写下一节
                      </Button>
                    </div>

                    {/* 卡面更新 */}
                    <div className="flex justify-center">
                      <Button
                        onClick={onOpenCardUpdater}
                        variant="outline"
                        className="text-xs border-amber-700 text-amber-400 hover:text-amber-300"
                      >
                        🔄 AI 分析本章变化 · 更新三卡
                      </Button>
                    </div>

                    {/* 实体检测 */}
                    <EntityDetector
                      projectId={projectId}
                      text={displayContent}
                      onCreated={onEntitiesCreated}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-zinc-600 text-sm">
                {(isGenerating || genStep) ? (
                  <div className="text-center space-y-3">
                    {/* 步骤指示器 */}
                    {genStep && (
                      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${
                        genStep === "error" ? "bg-red-950/40 text-red-400 border border-red-900/50"
                        : genStep === "done" ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/50"
                        : "bg-indigo-950/40 text-indigo-400 border border-indigo-900/50"
                      }`}>
                        <span className="text-lg">{genStepLabels[genStep]?.icon}</span>
                        <span className={genStep === "generating" ? "animate-pulse" : ""}>
                          {genStepLabels[genStep]?.label || "处理中..."}
                        </span>
                      </div>
                    )}
                    {/* 4步进度条 */}
                    {genStep && genStep !== "done" && genStep !== "error" && (
                      <div className="flex items-center gap-1 justify-center">
                        {["loading-cards", "confirming", "generating", "reviewing", "summarizing"].map((s, i) => {
                          const stepIdx = ["loading-cards", "confirming", "generating", "reviewing", "summarizing"].indexOf(genStep);
                          return (
                            <div key={s} className="flex items-center gap-1">
                              <div className={`w-2 h-2 rounded-full transition-colors ${
                                i <= stepIdx ? "bg-indigo-500" : "bg-zinc-700"
                              }`} />
                              {i < 4 && <div className={`w-3 h-0.5 ${i < stepIdx ? "bg-indigo-500" : "bg-zinc-700"}`} />}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {isGenerating && !genStep && <span className="animate-pulse">生成中...</span>}
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="mb-2">选择左侧大纲节点，设置大纲后点击「生成」</p>
                    <p className="text-xs">或先让 AI 生成大纲</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="flex-1 flex items-center justify-center text-zinc-600">
          <div className="text-center">
            <p className="text-lg mb-2">欢迎使用 Novel Forge</p>
            <p className="text-sm">从左侧大纲树选择节点开始写作，或先生成大纲</p>
          </div>
        </div>
      )}
    </main>
  );
}

// ─── 流式文本渲染 ───────────────────────────────────────────

function StreamingText({ content, isStreaming }: { content: string; isStreaming: boolean }) {
  return (
    <div className="whitespace-pre-wrap leading-relaxed text-sm text-zinc-200">
      {content}
      {isStreaming && <span className="inline-block w-2 h-4 bg-indigo-400 ml-0.5 animate-pulse" />}
    </div>
  );
}

// ─── 右栏：调试面板 ─────────────────────────────────────────

function RightPanel({
  selectedNode,
  project,
  onClose,
  contextRefreshKey,
  authorNote,
}: {
  selectedNode: StoryNodeData | null;
  project: ProjectData;
  onClose: () => void;
  contextRefreshKey: number;
  authorNote: string;
}) {
  return (
    <aside className="w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800">
        <span className="text-xs font-medium text-zinc-400">📊 上下文监控</span>
        <button onClick={onClose} className="text-zinc-600 hover:text-zinc-400 text-xs">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {selectedNode ? (
          <ContextPreview
            projectId={project.id}
            nodeId={selectedNode.id}
            authorNote={authorNote}
            refreshKey={contextRefreshKey}
          />
        ) : (
          <div className="text-xs text-zinc-600 p-4">选择大纲节点以预览上下文</div>
        )}

        {/* 项目统计 */}
        <div className="border-t border-zinc-800 mt-4 pt-3 space-y-1">
          <h4 className="text-xs font-medium text-zinc-500 mb-2 uppercase tracking-wider">项目统计</h4>
          <StatRow label="总字数" value={String(project.storyNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0))} />
          <StatRow label="角色" value={String(project.characters.length)} />
          <StatRow label="词条" value={String(project.lorebookEntries.length)} />
          <StatRow label="节点" value={String(project.storyNodes.length)} />
          <StatRow label="类型" value={project.genre.join("、") || "未设定"} />
          <StatRow label="基调" value={project.toneKeywords.join("、") || "未设定"} />
        </div>
      </div>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-medium text-zinc-500 mb-1.5 uppercase tracking-wider">{title}</h4>
      {children}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-600">{label}</span>
      <span className="text-zinc-300 truncate ml-2 max-w-[140px] text-right">{value || "—"}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 编辑弹窗
// ═══════════════════════════════════════════════════════════════

// ─── 角色编辑弹窗（完整模板字段）────────────────────────

function CharacterEditDialog({
  character,
  projectId,
  onClose,
  onSave,
}: {
  character: CharacterData;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  // 人格对象 → 可读文本
  const toText = (p: unknown) => {
    if (typeof p === "object" && p !== null && !Array.isArray(p)) {
      const o = p as Record<string, unknown>;
      const lines: string[] = [];
      if (o.dominant) lines.push(`主导：${o.dominant}`);
      if (o.drive) lines.push(`驱动：${o.drive}`);
      if (o.contradiction) lines.push(`矛盾：${o.contradiction}`);
      if (Array.isArray(o.habits) && o.habits.length) lines.push(`习惯：${(o.habits as string[]).join("、")}`);
      if (o.socialMask) lines.push(`面具：${o.socialMask}`);
      return lines.join("\n") || "";
    }
    if (Array.isArray(p)) return (p as string[]).join("、");
    return String(p || "");
  };
  // 可读文本 → 人格对象
  const fromText = (text: string): Record<string, unknown> => {
    const lines = text.split("\n");
    let dominant = "", drive = "", contradiction = "", habits: string[] = [], socialMask = "";
    for (const line of lines) {
      if (line.startsWith("主导：") || line.startsWith("主导:")) dominant = line.replace(/^主导[：:]\s*/, "").trim();
      else if (line.startsWith("驱动：") || line.startsWith("驱动:")) drive = line.replace(/^驱动[：:]\s*/, "").trim();
      else if (line.startsWith("矛盾：") || line.startsWith("矛盾:")) contradiction = line.replace(/^矛盾[：:]\s*/, "").trim();
      else if (line.startsWith("习惯：") || line.startsWith("习惯:")) habits = line.replace(/^习惯[：:]\s*/, "").split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      else if (line.startsWith("面具：") || line.startsWith("面具:")) socialMask = line.replace(/^面具[：:]\s*/, "").trim();
      else if (line.trim()) { if (!dominant) dominant = line.trim(); else habits.push(line.trim()); }
    }
    return { dominant, drive, contradiction, habits, socialMask };
  };

  const app = (character.appearance || {}) as Record<string, unknown>;
  const ds = (character.dialogueStyle || {}) as Record<string, unknown>;
  const rels = Array.isArray(character.relationships) ? character.relationships.map((r: any) =>
    [r.targetName, r.relation, r.dynamic].filter(Boolean).join("：")
  ).join("\n") : "";

  // 时间线 → 可读文本
  const timelineToText = (tl?: { age: number; event: string; era: string }[]) => {
    if (!tl || !tl.length) return "";
    return tl.map(t => `${t.age}岁：${t.event}（${t.era}）`).join("\n");
  };
  // 文本 → 时间线
  const textToTimeline = (text: string): { age: number; event: string; era: string }[] => {
    return text.split("\n").filter(Boolean).map(line => {
      const m = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+?)\s*[（(]([^)）]*)[)）]\s*$/);
      if (m) return { age: parseInt(m[1]), event: m[2].trim(), era: m[3].trim() };
      // 不完整格式也接受
      const m2 = line.match(/^(\d+)\s*岁\s*[：:]\s*(.+)$/);
      if (m2) return { age: parseInt(m2[1]), event: m2[2].trim(), era: "" };
      return { age: 0, event: line.trim(), era: "" };
    });
  };

  const [form, setForm] = useState({
    name: character.name || "",
    aliases: (character.aliases || []).join("、"),
    role: character.role || "supporting",
    age: character.age || "",
    gender: character.gender || "",
    // 外貌
    appearanceHair: String(app.hair || ""),
    appearanceEyes: String(app.eyes || ""),
    appearanceHeight: String(app.height || ""),
    appearanceBuild: String(app.build || ""),
    appearanceFeatures: String(app.features || ""),
    appearanceAttire: String(app.attire || ""),
    // 性格
    personality: toText(character.personality),
    // 背景
    background: character.background || "",
    // 能力
    abilities: (character.abilities || []).join("、"),
    // 隐藏动机
    hiddenMotives: (character.hiddenMotives || []).join("、"),
    // 关系
    relationships: rels,
    // 对话风格
    dialogueDesc: String(ds.description || ""),
    dialogueExamples: (Array.isArray(ds.examples) ? ds.examples as string[] : []).join("\n"),
    dialogueVocab: (Array.isArray(ds.vocabulary) ? ds.vocabulary as string[] : []).join("、"),
    dialoguePatterns: (Array.isArray(ds.speechPatterns) ? ds.speechPatterns as string[] : []).join("\n"),
    // 经历时间线
    timeline: timelineToText(character.timeline),
    // 弧光
    arcProgress: character.arcProgress || "",
    // 状态
    currentStatus: character.currentStatus || "alive",
  });

  const handleSave = async () => {
    const relLines = form.relationships.split("\n").filter(Boolean);
    const relationships = relLines.map(line => {
      const parts = line.split(/[：:]/);
      return { targetName: parts[0]?.trim() || "", relation: parts[1]?.trim() || "", dynamic: parts[2]?.trim() || "" };
    });

    await fetch(`/api/characters/${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        aliases: form.aliases.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        role: form.role,
        age: form.age,
        gender: form.gender,
        appearance: {
          hair: form.appearanceHair,
          eyes: form.appearanceEyes,
          height: form.appearanceHeight,
          build: form.appearanceBuild,
          features: form.appearanceFeatures,
          attire: form.appearanceAttire,
        },
        personality: fromText(form.personality),
        background: form.background,
        abilities: form.abilities.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        hiddenMotives: form.hiddenMotives.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
        relationships,
        dialogueStyle: {
          description: form.dialogueDesc,
          examples: form.dialogueExamples.split("\n").filter(Boolean),
          vocabulary: form.dialogueVocab.split(/[,，、]/).map(s => s.trim()).filter(Boolean),
          speechPatterns: form.dialoguePatterns.split("\n").filter(Boolean),
        },
        timeline: textToTimeline(form.timeline),
        arcProgress: form.arcProgress,
        currentStatus: form.currentStatus,
      }),
    });
    onSave();
    onClose();
  };

  const field = (label: string, value: string, set: (v: string) => void, opts?: { placeholder?: string; textarea?: boolean; rows?: number }) =>
    <DialogField label={label}>
      {opts?.textarea
        ? <textarea className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-y" style={{ minHeight: `${(opts.rows || 2) * 24}px` }} value={value} onChange={e => set(e.target.value)} placeholder={opts?.placeholder} />
        : <DialogInput value={value} onChange={set} placeholder={opts?.placeholder} />}
    </DialogField>;

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">编辑角色：{character.name}</h3>
      <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
        {/* 基本标识 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">基本标识</h4>
          <div className="space-y-2">
            {field("姓名", form.name, v => setForm({ ...form, name: v }))}
            {field("别名（逗号分隔）", form.aliases, v => setForm({ ...form, aliases: v }), { placeholder: "阿三, 剑圣, 老疯" })}
            <div className="grid grid-cols-3 gap-2">
              <DialogField label="角色定位">
                <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                  <option value="protagonist">主角</option>
                  <option value="antagonist">反派</option>
                  <option value="supporting">配角</option>
                  <option value="mentor">导师</option>
                  <option value="love_interest">恋爱对象</option>
                  <option value="background">背景角色</option>
                </select>
              </DialogField>
              {field("年龄", form.age, v => setForm({ ...form, age: v }), { placeholder: "25岁" })}
              {field("性别", form.gender, v => setForm({ ...form, gender: v }), { placeholder: "男" })}
            </div>
            <DialogField label="当前状态">
              <select className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm" value={form.currentStatus} onChange={e => setForm({ ...form, currentStatus: e.target.value })}>
                <option value="alive">存活</option>
                <option value="dead">死亡</option>
                <option value="missing">失踪</option>
                <option value="incapacitated">失去能力</option>
              </select>
            </DialogField>
          </div>
        </div>

        {/* 外貌 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">外貌</h4>
          <div className="grid grid-cols-3 gap-2">
            {field("发型发色", form.appearanceHair, v => setForm({ ...form, appearanceHair: v }), { placeholder: "黑长直" })}
            {field("眼睛", form.appearanceEyes, v => setForm({ ...form, appearanceEyes: v }), { placeholder: "丹凤眼" })}
            {field("身高", form.appearanceHeight, v => setForm({ ...form, appearanceHeight: v }), { placeholder: "178cm" })}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {field("体型", form.appearanceBuild, v => setForm({ ...form, appearanceBuild: v }), { placeholder: "修长偏瘦" })}
            {field("特殊印记", form.appearanceFeatures, v => setForm({ ...form, appearanceFeatures: v }), { placeholder: "左脸刀疤、虎口老茧" })}
          </div>
          <div className="mt-2">
            {field("标志性着装", form.appearanceAttire, v => setForm({ ...form, appearanceAttire: v }), { placeholder: "黑色劲装, 腰间佩剑, 银质护腕" })}
          </div>
        </div>

        {/* 性格 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">性格详析</h4>
          {field("性格特征", form.personality, v => setForm({ ...form, personality: v }), {
            textarea: true, rows: 5,
            placeholder: "主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠，对熟人话多",
          })}
        </div>

        {/* 背景 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">背景状态</h4>
          {field("背景", form.background, v => setForm({ ...form, background: v }), {
            textarea: true, rows: 4,
            placeholder: "1)所在位置与境遇：xxx\n2)当前短期目标：xxx\n3)长期欲望：xxx\n4)所持资源与限制：xxx\n5)卷入核心事件的方式与态度：xxx",
          })}
        </div>

        {/* 能力 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">能力/功法</h4>
          {field("能力（逗号分隔）", form.abilities, v => setForm({ ...form, abilities: v }), { placeholder: "剑气决·入门, 医术·精湛, 潜行·大师" })}
          {field("隐藏动机（逗号分隔）", form.hiddenMotives, v => setForm({ ...form, hiddenMotives: v }), { placeholder: "暗中寻找灭门仇人, 表面臣服实则谋反" })}
        </div>

        {/* 经历时间线 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">📅 经历时间线（防OOC——每行：X岁：事件（时间参照））</h4>
          {field("时间线", form.timeline, v => setForm({ ...form, timeline: v }), {
            textarea: true, rows: 5,
            placeholder: "0岁：出生于青云镇铁匠铺（故事开始前18年）\n12岁：拜入青云宗外门（故事开始前6年）\n16岁：觉醒剑灵血脉（故事开始前2年）\n18岁：故事起点——宗门大比夺冠（第一卷）",
          })}
          <p className="text-xs text-zinc-500 mt-1">设定角色人生关键时间点，防止AI把前期角色写成后期状态。age 填该事件时角色的年龄。</p>
        </div>

        {/* 关系 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">人际关系（每行：人物名：关系：动态）</h4>
          {field("关系", form.relationships, v => setForm({ ...form, relationships: v }), {
            textarea: true, rows: 3,
            placeholder: "张三：师徒：亦师亦友\n李四：宿敌：互相欣赏但立场对立\n王五：暗恋对象：尚未表白",
          })}
        </div>

        {/* 对话风格 */}
        <div className="border-b border-zinc-800 pb-3">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">对话风格</h4>
          {field("风格描述", form.dialogueDesc, v => setForm({ ...form, dialogueDesc: v }), { placeholder: "冷漠寡言，但关键时字字千钧" })}
          {field("典型台词（每行一句）", form.dialogueExamples, v => setForm({ ...form, dialogueExamples: v }), { textarea: true, rows: 2, placeholder: "哼，就这？\n我欠你一条命。" })}
          {field("用词特点（逗号分隔）", form.dialogueVocab, v => setForm({ ...form, dialogueVocab: v }), { placeholder: "古风, 简洁, 偶带讽刺" })}
          {field("句式模式（每行一种）", form.dialoguePatterns, v => setForm({ ...form, dialoguePatterns: v }), { textarea: true, rows: 2, placeholder: "多用反问句\n主语常省略\n偏爱四字短语" })}
        </div>

        {/* 弧光 */}
        <div className="pb-2">
          <h4 className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">人物弧光预登记</h4>
          {field("弧光进度", form.arcProgress, v => setForm({ ...form, arcProgress: v }), {
            textarea: true, rows: 2,
            placeholder: "信念动摇触发点：xxx\n蜕变方向：xxx→xxx\n堕落风险：xxx",
          })}
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-5 pt-3 border-t border-zinc-800">
        <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500">保存</Button>
      </div>
    </DialogOverlay>
  );
}

// ─── 角色创建弹窗 ───────────────────────────────────────────

function CharacterCreateDialog({
  projectId,
  onClose,
  onSave,
}: {
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    name: "",
    role: "supporting",
    age: "未知",
    gender: "未知",
    personality: "",
    currentStatus: "alive",
  });

  const handleSave = async () => {
    if (!form.name.trim()) return;
    // 文本 → 人格对象
    const lines = form.personality.split("\n");
    let dominant = "", drive = "", contradiction = "", habits: string[] = [], socialMask = "";
    for (const line of lines) {
      if (line.startsWith("主导：") || line.startsWith("主导:")) dominant = line.replace(/^主导[：:]\s*/, "").trim();
      else if (line.startsWith("驱动：") || line.startsWith("驱动:")) drive = line.replace(/^驱动[：:]\s*/, "").trim();
      else if (line.startsWith("矛盾：") || line.startsWith("矛盾:")) contradiction = line.replace(/^矛盾[：:]\s*/, "").trim();
      else if (line.startsWith("习惯：") || line.startsWith("习惯:")) habits = line.replace(/^习惯[：:]\s*/, "").split(/[,，、]/).map(s => s.trim()).filter(Boolean);
      else if (line.startsWith("面具：") || line.startsWith("面具:")) socialMask = line.replace(/^面具[：:]\s*/, "").trim();
      else if (line.trim()) { if (!dominant) dominant = line.trim(); else habits.push(line.trim()); }
    }
    const personalityObj = { dominant, drive, contradiction, habits, socialMask };

    await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: form.name,
        role: form.role,
        age: form.age,
        gender: form.gender,
        personality: personalityObj,
        currentStatus: form.currentStatus,
      }),
    });
    onSave();
    onClose();
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">创建新角色</h3>
      <div className="space-y-3">
        <DialogField label="姓名" required>
          <DialogInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} autoFocus />
        </DialogField>
        <DialogField label="角色定位">
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="protagonist">主角</option>
            <option value="antagonist">反派</option>
            <option value="supporting">配角</option>
            <option value="mentor">导师</option>
            <option value="love_interest">恋爱对象</option>
            <option value="catalyst">剧情催化剂</option>
            <option value="background">背景角色</option>
          </select>
        </DialogField>
        <DialogField label="性格特征（逗号分隔）">
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm min-h-[80px] resize-y"
            value={form.personality}
            onChange={(e) => setForm({ ...form, personality: e.target.value })}
            placeholder={`主导：外冷内热\n驱动：复仇执念\n矛盾：渴望认可但自尊极强\n习惯：咬指甲、自言自语\n面具：对外冷漠`}
          />
        </DialogField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500" disabled={!form.name.trim()}>创建</Button>
      </div>
    </DialogOverlay>
  );
}

// ─── 世界书词条编辑弹窗 ─────────────────────────────────────

function LorebookEditDialog({
  entry,
  projectId,
  onClose,
  onSave,
}: {
  entry: LorebookData;
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    title: entry.title,
    category: entry.category,
    keys: (entry.keys || []).join("、"),
    content: entry.content,
    enabled: entry.enabled,
    insertionOrder: 50,
  });

  const handleSave = async () => {
    await fetch(`/api/lorebook/${entry.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    onSave();
    onClose();
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">编辑词条：{entry.title}</h3>
      <div className="space-y-3">
        <DialogField label="词条标题">
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} />
        </DialogField>
        <DialogField label="分类">
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          >
            <option value="geography">地理</option>
            <option value="faction">势力/组织</option>
            <option value="magic_system">魔法体系</option>
            <option value="history">历史事件</option>
            <option value="culture">文化/风俗</option>
            <option value="creature">生物/种族</option>
            <option value="item">关键物品</option>
            <option value="custom">自定义</option>
          </select>
        </DialogField>
        <DialogField label="触发关键词（逗号分隔）">
          <DialogInput value={form.keys} onChange={(v) => setForm({ ...form, keys: v })} placeholder="魔法, 魔力, 法师" />
        </DialogField>
        <DialogField label="设定内容（≤200 Token）">
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none"
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
          />
        </DialogField>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            className="rounded"
          />
          启用此词条
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500">保存</Button>
      </div>
    </DialogOverlay>
  );
}

// ─── 世界书词条创建弹窗 ─────────────────────────────────────

function LorebookCreateDialog({
  projectId,
  onClose,
  onSave,
}: {
  projectId: string;
  onClose: () => void;
  onSave: () => void;
}) {
  const [form, setForm] = useState({
    title: "",
    category: "custom",
    keys: "",
    content: "",
  });

  const handleSave = async () => {
    if (!form.title.trim()) return;
    await fetch("/api/lorebook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        title: form.title,
        category: form.category,
        keys: form.keys.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
        content: form.content,
      }),
    });
    onSave();
    onClose();
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">创建世界观词条</h3>
      <div className="space-y-3">
        <DialogField label="词条标题" required>
          <DialogInput value={form.title} onChange={(v) => setForm({ ...form, title: v })} autoFocus />
        </DialogField>
        <DialogField label="触发关键词（逗号分隔）">
          <DialogInput value={form.keys} onChange={(v) => setForm({ ...form, keys: v })} placeholder="魔法, 魔力, 法师" />
        </DialogField>
        <DialogField label="设定内容">
          <textarea
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm resize-none"
            rows={4}
            value={form.content}
            onChange={(e) => setForm({ ...form, content: e.target.value })}
            placeholder="详细描述这个设定的内容..."
          />
        </DialogField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
        <Button variant="outline" onClick={onClose} className="border-zinc-700">取消</Button>
        <Button onClick={handleSave} className="bg-indigo-600 hover:bg-indigo-500" disabled={!form.title.trim()}>创建</Button>
      </div>
    </DialogOverlay>
  );
}

// ═══════════════════════════════════════════════════════════════
// 批量生成进度面板
// ═══════════════════════════════════════════════════════════════

function BatchProgressPanel({
  progress,
  nodes,
  onAbort,
}: {
  progress: Map<string, { status: string; error?: string }>;
  nodes: StoryNodeData[];
  onAbort: () => void;
}) {
  const entries = [...progress.entries()];
  const done = entries.filter(([, v]) => v.status === "done").length;
  const failed = entries.filter(([, v]) => v.status === "failed").length;
  const generating = entries.find(([, v]) => v.status === "generating");
  const total = entries.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900">
        <div>
          <span className="text-sm font-medium">📝 批量生成</span>
          <span className="text-xs text-zinc-500 ml-2">{done + failed}/{total}</span>
        </div>
        <button
          onClick={onAbort}
          className="text-xs text-red-400 hover:text-red-300 px-2 py-0.5 rounded border border-red-800 hover:border-red-700"
        >
          停止
        </button>
      </div>

      {/* 进度列表 */}
      <div className="max-h-64 overflow-y-auto px-3 py-2 space-y-1">
        {entries.map(([id, state]) => {
          const node = nodes.find((n) => n.id === id);
          const icon = state.status === "done" ? "✅" : state.status === "failed" ? "❌" : state.status === "generating" ? "⏳" : "○";
          return (
            <div key={id} className={`flex items-center gap-2 text-xs py-0.5 ${
              state.status === "generating" ? "text-amber-300" : state.status === "failed" ? "text-red-400" : "text-zinc-400"
            }`}>
              <span className="shrink-0">{icon}</span>
              <span className="truncate flex-1">{node?.title || id.slice(0, 8)}</span>
              {state.error && (
                <span className="text-red-500 text-[10px] truncate max-w-[100px]" title={state.error}>
                  {state.error.slice(0, 30)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* 底部统计 */}
      <div className="border-t border-zinc-800 px-4 py-2 flex items-center gap-3 text-xs text-zinc-500">
        <span>✅ {done}</span>
        <span>❌ {failed}</span>
        <span>○ {total - done - failed}</span>
        {generating && (
          <span className="text-amber-400 ml-auto animate-pulse">
            {nodes.find((n) => n.id === generating[0])?.title?.slice(0, 15)}...
          </span>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 大纲生成对话框
// ═══════════════════════════════════════════════════════════════

function OutlineDialog({
  projectName,
  chapterCount,
  customChapterCount,
  customPrompt,
  useFlash,
  previewChapters,
  modelUsed,
  rawOutline,
  error,
  isGenerating,
  onChapterCountChange,
  onCustomChapterCountChange,
  onCustomPromptChange,
  onUseFlashChange,
  onGenerate,
  onConfirm,
  onUpdateChapter,
  onClose,
  appendMode,
  onAppendModeChange,
  hasExistingChapters,
}: {
  projectName: string;
  chapterCount: number;
  customChapterCount: string;
  customPrompt: string;
  useFlash: boolean;
  previewChapters: { title: string; summary: string; coreConflict: string; characters: string[] }[];
  modelUsed: string;
  rawOutline: string;
  error: string;
  isGenerating: boolean;
  onChapterCountChange: (n: number) => void;
  onCustomChapterCountChange: (s: string) => void;
  onCustomPromptChange: (s: string) => void;
  onUseFlashChange: (v: boolean) => void;
  onGenerate: () => void;
  onConfirm: () => void;
  onUpdateChapter: (index: number, field: string, value: string) => void;
  onClose: () => void;
  appendMode: boolean;
  onAppendModeChange: (v: boolean) => void;
  hasExistingChapters: boolean;
}) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const hasPreview = previewChapters.length > 0;

  const chapterOptions = [
    { value: 4, label: "4 章" },
    { value: 8, label: "8 章" },
    { value: 12, label: "12 章" },
    { value: -1, label: "自定义" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">🤖 AI 生成大纲</h2>
            <p className="text-xs text-zinc-500 mt-0.5">《{projectName}》</p>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
        </div>

        {/* 内容区——可滚动 */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 章节数选择 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 block">章节数量</label>
            <div className="flex gap-2 flex-wrap">
              {chapterOptions.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => onChapterCountChange(opt.value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    chapterCount === opt.value
                      ? "bg-indigo-600 text-white"
                      : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {chapterCount === -1 && (
              <input
                type="number"
                min={1}
                max={30}
                value={customChapterCount}
                onChange={(e) => onCustomChapterCountChange(e.target.value)}
                placeholder="输入章节数 (1-30)"
                className="mt-2 w-32 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
              />
            )}
          </div>

          {/* 模型选择 + 提示词 */}
          <div>
            <label className="text-sm text-zinc-400 mb-2 flex items-center gap-3">
              <span>自定义提示词（可选）</span>
              <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useFlash}
                  onChange={(e) => onUseFlashChange(e.target.checked)}
                  className="rounded"
                />
                用 V4 Flash
              </label>
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => onCustomPromptChange(e.target.value)}
              placeholder={`不填则自动基于角色、世界书、总纲用 V4 Pro 生成。

填写则按你的提示词生成章纲。例如：
"重点写主角从懦弱到勇敢的转变过程，前三章铺垫，中间爆发，最后两章收尾"`}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:border-indigo-500"
              rows={3}
              disabled={isGenerating}
            />
            <p className="text-xs text-zinc-600 mt-1">
              有提示词 → {useFlash ? "V4 Flash" : "V4 Pro"} 快速响应 · 无提示词 → V4 Pro 深度创作
            </p>
          </div>

          {/* 追加/替换模式 */}
          {hasExistingChapters && (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={appendMode}
                  onChange={(e) => onAppendModeChange(e.target.checked)}
                  className="rounded accent-indigo-500"
                />
                <span>{appendMode ? "📎 追加到已有章节末尾" : "🔄 替换全部已有大纲"}</span>
              </label>
              <span className="text-[10px] text-zinc-600">
                {appendMode ? "新章节从最后一章后面继续编号" : "删除已有章节，重新从第一章开始"}
              </span>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-sm text-red-400">
              {error}
            </div>
          )}

          {/* 生成按钮 + 模型标注 */}
          <div className="flex items-center gap-3">
            <Button
              onClick={onGenerate}
              disabled={isGenerating || (chapterCount === -1 && !customChapterCount)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {isGenerating ? "⏳ 生成中..." : "🚀 生成大纲预览"}
            </Button>
            {modelUsed && (
              <span className="text-xs text-zinc-500">
                模型：<span className={modelUsed === "v4-pro" ? "text-purple-400" : "text-cyan-400"}>{modelUsed}</span>
              </span>
            )}
          </div>

          {/* 总览文本 */}
          {rawOutline && (
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-3">
              <p className="text-xs text-zinc-500 mb-1">📋 大纲总览</p>
              <p className="text-sm text-zinc-400 whitespace-pre-wrap leading-relaxed">{rawOutline}</p>
            </div>
          )}

          {/* 章节预览列表 */}
          {hasPreview && (
            <div>
              <p className="text-sm text-zinc-400 mb-2">
                📖 章节预览（{previewChapters.length} 章 · 点击可编辑）
              </p>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {previewChapters.map((ch, i) => (
                  <div
                    key={i}
                    className={`border rounded-lg p-3 transition-colors ${
                      editingIndex === i
                        ? "border-indigo-600 bg-indigo-950/20"
                        : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                    }`}
                  >
                    {editingIndex === i ? (
                      // 编辑模式
                      <div className="space-y-2">
                        <input
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                          value={ch.title}
                          onChange={(e) => onUpdateChapter(i, "title", e.target.value)}
                          autoFocus
                        />
                        <textarea
                          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 resize-none focus:outline-none focus:border-indigo-500"
                          rows={3}
                          value={ch.summary}
                          onChange={(e) => onUpdateChapter(i, "summary", e.target.value)}
                          placeholder="本章梗概..."
                        />
                        <div className="flex gap-2">
                          <input
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-400 focus:outline-none focus:border-indigo-500"
                            value={ch.coreConflict}
                            onChange={(e) => onUpdateChapter(i, "coreConflict", e.target.value)}
                            placeholder="核心冲突（可选）"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditingIndex(null)}
                            className="text-xs border-zinc-700 h-7"
                          >
                            完成
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // 预览模式
                      <div onClick={() => setEditingIndex(i)} className="cursor-pointer">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-zinc-200">{ch.title}</h4>
                          <span className="text-[10px] text-zinc-600 shrink-0 mt-0.5">点击编辑</span>
                        </div>
                        {ch.summary && (
                          <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{ch.summary}</p>
                        )}
                        {ch.coreConflict && (
                          <p className="text-xs text-amber-600 mt-1">冲突：{ch.coreConflict}</p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        {hasPreview && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-800 shrink-0 bg-zinc-900">
            <p className="text-xs text-zinc-500">
              可点击章节编辑标题和梗概，确认后写入大纲树
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  onClose();
                }}
                className="border-zinc-700 text-sm"
              >
                取消
              </Button>
              <Button
                onClick={onConfirm}
                disabled={isGenerating}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
              >
                ✅ 确认写入 ({previewChapters.length} 章)
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// 审校交互面板
// ═══════════════════════════════════════════════════════════════

function ReviewPanel({
  reviewResult,
  onDismiss,
  onExplain,
  onFix,
}: {
  reviewResult: { passed: boolean; issues: ReviewIssue[] };
  onDismiss: () => void;
  onExplain: (issue: ReviewIssue, note: string) => void;
  onFix: (issue: ReviewIssue, note: string) => void;
}) {
  const [activeIssueIndex, setActiveIssueIndex] = useState<number | null>(null);
  const [actionType, setActionType] = useState<"explain" | "fix" | null>(null);
  const [note, setNote] = useState("");

  const handleAction = (index: number, type: "explain" | "fix") => {
    if (activeIssueIndex === index && actionType === type) {
      // 执行
      const issue = reviewResult.issues[index];
      if (type === "explain") onExplain(issue, note);
      else onFix(issue, note);
      setActiveIssueIndex(null);
      setActionType(null);
      setNote("");
    } else {
      // 展开输入框
      setActiveIssueIndex(index);
      setActionType(type);
      setNote("");
    }
  };

  if (reviewResult.passed && reviewResult.issues.length === 0) {
    return (
      <div className="mt-6 border border-green-800 bg-green-900/20 rounded-lg p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-green-400">✅ 审校通过</span>
          <button onClick={onDismiss} className="text-xs text-zinc-600 hover:text-zinc-400">✕</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 border border-amber-800 bg-amber-950/10 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm text-amber-400">⚠️ 审校发现 {reviewResult.issues.length} 个问题</h3>
        <button onClick={onDismiss} className="text-xs text-zinc-500 hover:text-zinc-300">全部忽略 ✕</button>
      </div>
      {reviewResult.issues.map((issue, i) => (
        <div key={i} className="mb-2 last:mb-0">
          <div className="flex items-start gap-2 text-xs">
            <span className={`shrink-0 px-1 py-0.5 rounded ${
              issue.severity === "critical" ? "bg-red-900/50 text-red-400" :
              issue.severity === "major" ? "bg-yellow-900/50 text-yellow-400" :
              "bg-zinc-800 text-zinc-400"
            }`}>
              {issue.severity}
            </span>
            <span className="text-zinc-400 flex-1">{issue.description}</span>
          </div>
          <div className="flex gap-2 mt-1 ml-1">
            <button
              onClick={() => handleAction(i, "explain")}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                activeIssueIndex === i && actionType === "explain"
                  ? "border-indigo-600 text-indigo-400 bg-indigo-950/30"
                  : "border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700"
              }`}
            >
              📝 补充信息
            </button>
            <button
              onClick={() => handleAction(i, "fix")}
              className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
                activeIssueIndex === i && actionType === "fix"
                  ? "border-amber-600 text-amber-400 bg-amber-950/30"
                  : "border-zinc-800 text-zinc-600 hover:text-zinc-300 hover:border-zinc-700"
              }`}
            >
              🔧 修复
            </button>
          </div>
          {activeIssueIndex === i && (
            <div className="mt-1.5 flex gap-1.5">
              <input
                className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500"
                placeholder={actionType === "explain"
                  ? "说明为什么这不是问题（如：这个角色确实死了，之前有伏笔）"
                  : "说明正确的逻辑（如：A和B在第3章已经和好，这里应该体现）"}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleAction(i, actionType!); }}
                autoFocus
              />
              <button
                onClick={() => handleAction(i, actionType!)}
                className="text-[10px] px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white shrink-0"
              >
                确认
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── 通用弹窗组件 ───────────────────────────────────────────

function DialogOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-md p-5 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function DialogField({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm text-zinc-400 mb-1 block">
        {label}
        {required && <span className="text-red-400 ml-1">*</span>}
      </span>
      {children}
    </label>
  );
}

function DialogInput({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
    />
  );
}

// ═══════════════════════════════════════════════════════════════
// 生成前角色确认对话框
// ═══════════════════════════════════════════════════════════════

interface ScheduledCard {
  id: string; name: string; role: string; score: number;
  reasons: string[]; affiliation: string; motivation: string;
  appeared: boolean; background: string; isNew: boolean;
}

function PreGenConfirm({
  projectId,
  nodeId,
  authorNote,
  title,
  onAuthorNoteChange,
  onConfirm,
  onCancel,
}: {
  projectId: string;
  nodeId?: string;
  authorNote: string;
  title?: string;
  onAuthorNoteChange: (v: string) => void;
  onConfirm: (cards: string[], notes: Record<string, string>, newChars: string[], finalAuthorNote: string) => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [cards, setCards] = useState<ScheduledCard[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cardNotes, setCardNotes] = useState<Record<string, string>>({});
  const [newCharInput, setNewCharInput] = useState("");
  const [newChars, setNewChars] = useState<string[]>([]);
  const [storyInfo, setStoryInfo] = useState<{ storyPhase: string; sceneContext: string; chapterTitle: string; chapterOutline: string; totalCharacters: number; missingRoleSuggestions: string[] } | null>(null);
  const [error, setError] = useState("");
  const [localAuthorNote, setLocalAuthorNote] = useState(authorNote);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    setLoading(true);
    setError("");
    try {
      const url = nodeId
        ? `/api/generate/pre-write-cards?projectId=${projectId}&nodeId=${nodeId}`
        : `/api/generate/pre-write-cards?projectId=${projectId}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setCards(data.scheduledCards || []);
      setStoryInfo(data);
      // 默认全选
      setSelected(new Set((data.scheduledCards || []).map((c: ScheduledCard) => c.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const toggleCard = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const addNewChar = () => {
    const name = newCharInput.trim();
    if (!name || newChars.includes(name)) return;
    setNewChars([...newChars, name]);
    setNewCharInput("");
  };

  const handleConfirm = () => {
    const confirmedIds = cards.filter(c => selected.has(c.id)).map(c => c.id);
    onConfirm(confirmedIds, cardNotes, newChars, localAuthorNote);
  };

  const roleLabel = (r: string) => {
    const m: Record<string, string> = { protagonist: "主角", antagonist: "对手", mentor: "导师", love_interest: "恋人", catalyst: "催化剂", supporting: "配角", background: "背景" };
    return m[r] || r;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onCancel}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 标题 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800 shrink-0">
          <div>
            <h2 className="text-lg font-semibold">📋 {title || "生成前确认——角色调度"}</h2>
            {storyInfo && (
              <p className="text-xs text-zinc-500 mt-0.5">
                {storyInfo.storyPhase} · {storyInfo.sceneContext || "未确定场景"} · 「{storyInfo.chapterTitle}」
              </p>
            )}
          </div>
          <button onClick={onCancel} className="text-zinc-500 hover:text-zinc-300 text-lg">✕</button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              <span className="ml-3 text-sm text-zinc-400">分析中...</span>
            </div>
          )}

          {error && (
            <div className="p-4 rounded-xl bg-red-950/30 border border-red-900/50">
              <p className="text-sm text-red-400">❌ {error}</p>
              <button onClick={loadCards} className="mt-2 text-xs text-red-400 hover:text-red-300 underline">🔄 重试</button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* 统计 */}
              <div className="flex items-center gap-4 text-xs text-zinc-500">
                <span>📊 读取 <b className="text-zinc-300">{cards.length}</b>/{storyInfo?.totalCharacters || "?"} 张角色卡</span>
                <span>✅ 已选 <b className="text-zinc-300">{selected.size}</b> 张</span>
                <span className="text-zinc-600">|</span>
                <span>大纲：{storyInfo?.chapterOutline?.slice(0, 30) || "无"}...</span>
              </div>

              {/* 角色清单 */}
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {cards.map(c => {
                  const checked = selected.has(c.id);
                  return (
                    <label key={c.id} className={`flex items-start gap-2 p-2.5 rounded-lg cursor-pointer border transition-colors text-xs ${
                      checked ? "border-indigo-700 bg-indigo-950/20" : "border-zinc-800 bg-zinc-900/50 opacity-60"
                    }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleCard(c.id)} className="mt-0.5 rounded shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-zinc-200">{c.name}</span>
                          <span className="text-[10px] px-1 py-0.5 rounded bg-zinc-800 text-zinc-400">{roleLabel(c.role)}</span>
                          <span className="text-[10px] text-zinc-500">{c.affiliation}</span>
                          {c.isNew && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-900/40 text-amber-400">🆕</span>}
                          <span className="text-[10px] text-zinc-600 ml-auto">分{c.score}</span>
                        </div>
                        <p className="text-[10px] text-zinc-500 mt-0.5">
                          理由：{c.reasons.join("、")}{c.motivation !== "剧情推进" ? ` · 动机：${c.motivation}` : ""}
                        </p>
                        {c.background && <p className="text-[10px] text-zinc-600 mt-0.5 truncate">背景：{c.background}</p>}
                        <input
                          value={cardNotes[c.id] || ""}
                          onChange={e => setCardNotes(prev => ({ ...prev, [c.id]: e.target.value }))}
                          placeholder="备注（出场理由/特殊要求）..."
                          className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-0.5 text-[10px] placeholder:text-zinc-600 focus:outline-none focus:border-indigo-700"
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                    </label>
                  );
                })}
              </div>

              {/* 缺角色建议 */}
              {(storyInfo?.missingRoleSuggestions?.length || 0) > 0 && (
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-900/30">
                  <p className="text-xs text-amber-400 font-medium mb-1">⚠️ 大纲提到但无匹配角色卡：</p>
                  <div className="flex gap-2 flex-wrap">
                    {storyInfo?.missingRoleSuggestions.map(r => (
                      <button
                        key={r}
                        onClick={() => { if (!newChars.includes(r)) setNewChars([...newChars, r]); }}
                        className="text-[10px] px-2 py-0.5 rounded bg-amber-900/30 text-amber-300 hover:bg-amber-900/50"
                      >
                        + 自建{r}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 手动添加角色 */}
              <div className="flex gap-2">
                <input
                  value={newCharInput}
                  onChange={e => setNewCharInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") addNewChar(); }}
                  placeholder="输入角色名让AI自建..."
                  className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs placeholder:text-zinc-600 focus:outline-none focus:border-indigo-700"
                />
                <button onClick={addNewChar} className="text-xs px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 hover:bg-zinc-700">+添加</button>
              </div>
              {newChars.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {newChars.map(n => (
                    <span key={n} className="text-[10px] px-2 py-0.5 rounded bg-emerald-900/30 text-emerald-400 flex items-center gap-1">
                      🆕 AI自建：{n}
                      <button onClick={() => setNewChars(newChars.filter(x => x !== n))} className="text-zinc-500 hover:text-red-400">✕</button>
                    </span>
                  ))}
                </div>
              )}

              {/* 作者指令 */}
              <div>
                <label className="text-xs text-zinc-400 mb-1 block">📝 作者指令（本章权重——与大纲等同）</label>
                <textarea
                  value={localAuthorNote}
                  onChange={e => { setLocalAuthorNote(e.target.value); onAuthorNoteChange(e.target.value); }}
                  placeholder="角色出场要求、特殊情节约束、本章基调调整..."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-xs resize-none focus:outline-none focus:border-indigo-700"
                  rows={3}
                />
              </div>
            </>
          )}
        </div>

        {/* 底部 */}
        {!loading && !error && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800 shrink-0">
            <span className="text-xs text-zinc-600">
              确认后将带着 {selected.size} 张卡{newChars.length > 0 ? ` + ${newChars.length}个新角色` : ""} 开始生成
            </span>
            <div className="flex gap-2">
              <button onClick={onCancel} className="px-4 py-1.5 text-xs rounded-lg border border-zinc-700 text-zinc-400 hover:text-zinc-200">取消</button>
              <button onClick={handleConfirm} className="px-4 py-1.5 text-xs rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium">
                ✅ 确认生成
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
