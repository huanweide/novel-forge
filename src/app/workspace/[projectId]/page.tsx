"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { SettingsImporter } from "@/components/dashboard/SettingsImporter";
import { StyleSelector } from "@/components/editor/StyleSelector";
import { StyleEditor } from "@/components/editor/StyleEditor";
import { EntityDetector } from "@/components/editor/EntityDetector";
import { ContextPreview } from "@/components/editor/ContextPreview";
import { OutlineGenerator } from "@/components/editor/OutlineGenerator";
import { ImportWizard } from "@/components/editor/ImportWizard";
import { CardUpdater } from "@/components/editor/CardUpdater";
import type { StyleTemplate } from "@/core/templates";

// ─── 类型 ────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  name: string;
  genre: string[];
  synopsis: string;
  toneKeywords: string[];
  characters: CharacterData[];
  lorebookEntries: LorebookData[];
  storyNodes: StoryNodeData[];
}

interface CharacterData {
  id: string;
  name: string;
  role: string;
  personality: string[];
  age: string;
  gender: string;
  currentStatus: string;
}

interface LorebookData {
  id: string;
  title: string;
  category: string;
  keys: string[];
  content: string;
  enabled: boolean;
}

interface StoryNodeData {
  id: string;
  title: string;
  type: string;
  status: string;
  outline: string | null;
  content: string | null;
  wordCount: number;
  order: number;
  parentId: string | null;
  activeCharacters: string[];
}

interface ReviewIssue {
  type: string;
  severity: string;
  description: string;
}

interface SSEEvent {
  type: string;
  content: string;
  severity?: string;
  passed?: boolean;
  issues?: ReviewIssue[];
  usage?: { completionTokens: number; totalTokens: number };
  nodeId?: string;
  status?: string;
}

// ─── 页面组件 ────────────────────────────────────────────────

export default function WorkspacePage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();

  // 项目数据
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);

  // 选中节点
  const [selectedNode, setSelectedNode] = useState<StoryNodeData | null>(null);

  // 生成状态
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [reviewResult, setReviewResult] = useState<{
    passed: boolean;
    issues: ReviewIssue[];
  } | null>(null);

  // 作者注释
  const [authorNote, setAuthorNote] = useState("");
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

  // 大纲生成弹窗
  const [showOutlineGenerator, setShowOutlineGenerator] = useState(false);

  // 文风编辑弹窗
  const [showStyleEditor, setShowStyleEditor] = useState(false);

  // 摘要压缩中
  const [summarizing, setSummarizing] = useState(false);

  // 文风模板
  const [styleTemplateId, setStyleTemplateId] = useState<string | undefined>();

  // 续写状态
  const [continueLoading, setContinueLoading] = useState(false);

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

  // 生成中断控制
  const abortRef = useRef<AbortController | null>(null);

  // ─── 加载项目 ─────────────────────────────────────────────

  const loadProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        setProject(data);
        // 默认选第一个没有内容的节点
        if (data.storyNodes?.length > 0) {
          const firstDraft = data.storyNodes.find(
            (n: StoryNodeData) => n.status !== "completed"
          );
          setSelectedNode(firstDraft || data.storyNodes[0]);
        }
      } else {
        router.push("/");
      }
    } catch (err) {
      console.error("加载项目失败:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId, router]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // ─── 大纲生成 ─────────────────────────────────────────────

  const handleGenerateOutline = async () => {
    if (!project) return;
    try {
      const res = await fetch("/api/generate/outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (res.ok) {
        await loadProject();
      }
    } catch (err) {
      console.error("生成大纲失败:", err);
    }
  };

  // ─── 正文生成 (SSE 流式) ──────────────────────────────────

  const handleWrite = async () => {
    if (!selectedNode || !project) return;

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
          authorNote: authorNote || undefined,
          targetWordCount,
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
            } else if (event.type === "review_result") {
              setReviewResult({
                passed: event.passed ?? false,
                issues: event.issues || [],
              });
            } else if (event.type === "done") {
              // 保存最后生成的内容用于卡面更新
              setLastChapterContent(streamContent);
              setLastChapterTitle(selectedNode?.title || "");
              // 刷新数据
              loadProject();
            } else if (event.type === "error") {
              console.error("生成错误:", event.content);
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
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
          authorNote: authorNote || undefined,
          autoOutline: true,
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
              // 保存最后生成的内容用于卡面更新
              setLastChapterContent(streamContent);
              setLastChapterTitle(selectedNode?.title || "");
              setLastGeneratedText((prev) => prev + streamContent);
              loadProject();
              setContextRefreshKey((k) => k + 1);
            } else if (event.type === "error") {
              console.error("续写错误:", event.content);
            }
          } catch {
            // 忽略解析失败
          }
        }
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== "AbortError") {
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
        onGenerateOutline={() => setShowOutlineGenerator(true)}
        onSummarize={handleSummarize}
        onImportSettings={() => setShowSettingsImport(true)}
        onImportChapters={() => setShowImportWizard(true)}
        onEditStyle={() => setShowStyleEditor(true)}
        onExport={handleExport}
        isGenerating={isGenerating || continueLoading}
        summarizing={summarizing}
        projectId={project.id}
        styleTemplateId={styleTemplateId}
        onStyleSelect={(t) => setStyleTemplateId(t.id)}
      />

      {/* 三栏主区 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左栏：资源树 */}
        <LeftPanel
          project={project}
          activeTab={leftPanel}
          onTabChange={setLeftPanel}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
          onAddSection={handleAddSection}
          onEditCharacter={setEditingCharacter}
          onEditLore={setEditingLore}
          onNewCharacter={() => setShowNewCharacter(true)}
          onNewLore={() => setShowNewLore(true)}
          loadProject={loadProject}
          volumeView={volumeView}
          onToggleVolumeView={() => setVolumeView(!volumeView)}
        />

        {/* 中栏：写作区 */}
        <CenterPanel
          selectedNode={selectedNode}
          streamContent={streamContent}
          isGenerating={isGenerating || continueLoading}
          reviewResult={reviewResult}
          authorNote={authorNote}
          onAuthorNoteChange={setAuthorNote}
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
          projectId={project.id}
          lastGeneratedText={lastGeneratedText}
          onEntitiesCreated={loadProject}
          onOpenCardUpdater={() => setShowCardUpdater(true)}
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

      {/* 大纲生成器 */}
      {showOutlineGenerator && (
        <OutlineGenerator
          projectId={project.id}
          onChaptersCreated={loadProject}
          onClose={() => setShowOutlineGenerator(false)}
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

      {/* 章节卡面更新 */}
      {showCardUpdater && (
        <CardUpdater
          projectId={project.id}
          chapterContent={lastChapterContent}
          chapterTitle={lastChapterTitle}
          onApplied={loadProject}
          onClose={() => setShowCardUpdater(false)}
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
  summarizing,
  projectId,
  styleTemplateId,
  onStyleSelect,
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
  summarizing: boolean;
  projectId: string;
  styleTemplateId?: string;
  onStyleSelect: (t: StyleTemplate) => void;
}) {
  const [showExport, setShowExport] = useState(false);

  return (
    <header className="h-12 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between px-4 shrink-0 relative">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-zinc-500 hover:text-zinc-300 text-sm">
          ← 返回
        </button>
        <span className="text-zinc-700">|</span>
        <span className="font-medium text-sm">{projectName}</span>
      </div>

      <div className="flex items-center gap-1.5">
        <StyleSelector
          projectId={projectId}
          currentStyleId={styleTemplateId}
          onSelect={onStyleSelect}
        />

        <Button
          size="sm"
          variant="outline"
          onClick={onEditStyle}
          disabled={isGenerating}
          className="text-xs border-zinc-700 h-7"
          title="编辑文风细节"
        >
          ⚙️
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onGenerateOutline}
          disabled={isGenerating}
          className="text-xs border-zinc-700 h-7"
        >
          🤖 大纲
        </Button>

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
          📥 导入章节
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={onImportSettings}
          disabled={isGenerating}
          className="text-xs border-indigo-700 text-indigo-400 hover:text-indigo-300 h-7"
        >
          📋 设定
        </Button>

        <div className="relative">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowExport(!showExport)}
            disabled={isGenerating}
            className="text-xs border-zinc-700 h-7"
          >
            📥 导出
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
            <div className="flex items-center justify-between px-1 mb-1">
              <span className="text-[10px] text-zinc-600">
                {volumeView ? "分卷视图" : "平铺视图"}
              </span>
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
            </div>
            <OutlineTree
              nodes={project.storyNodes}
              selectedNode={selectedNode}
              onSelectNode={onSelectNode}
              onAddSection={onAddSection}
              volumeView={volumeView}
            />
          </>
        )}

        {activeTab === "characters" && (
          <CharacterList
            characters={project.characters}
            onEdit={onEditCharacter}
            onDelete={async (id) => {
              await fetch(`/api/characters/${id}`, { method: "DELETE" });
              loadProject();
            }}
            onNew={onNewCharacter}
          />
        )}

        {activeTab === "lorebook" && (
          <LorebookList
            entries={project.lorebookEntries}
            onEdit={onEditLore}
            onDelete={async (id) => {
              await fetch(`/api/lorebook/${id}`, { method: "DELETE" });
              loadProject();
            }}
            onNew={onNewLore}
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
}: {
  nodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  volumeView: boolean;
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
}: {
  volume: StoryNodeData;
  children: StoryNodeData[];
  allNodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
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
}: {
  node: StoryNodeData;
  allNodes: StoryNodeData[];
  selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void;
  depth: number;
}) {
  const children = allNodes.filter((n) => n.parentId === node.id);
  const isSelected = selectedNode?.id === node.id;
  const isImported = node.content?.includes("📥") || false;

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
        <span className="text-[10px]">{typeIcon}</span>
        <span className={`${statusColor} text-[10px]`}>{statusIcon}</span>
        <span className="flex-1 truncate">{node.title}</span>
        {isImported && (
          <span className="text-purple-400/70 text-[10px]" title="从导入文本创建">📥</span>
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
        />
      ))}
    </div>
  );
}

// ─── 角色列表 ───────────────────────────────────────────────

function CharacterList({
  characters,
  onEdit,
  onDelete,
  onNew,
}: {
  characters: CharacterData[];
  onEdit: (c: CharacterData) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-1">
      {characters.map((c) => (
        <div
          key={c.id}
          onClick={() => onEdit(c)}
          className="flex items-center gap-2 py-1.5 px-2 rounded text-xs cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 group"
        >
          <span className="w-5 h-5 rounded-full bg-zinc-700 flex items-center justify-center text-[10px] shrink-0">
            {c.name[0]}
          </span>
          <span className="flex-1 truncate">{c.name}</span>
          <span className="text-zinc-600 text-[10px]">
            {c.role === "protagonist" ? "主角" : c.role === "antagonist" ? "反派" : "配角"}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm(`删除角色「${c.name}」？`)) onDelete(c.id);
            }}
            className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400"
          >
            ✕
          </button>
        </div>
      ))}

      <button
        onClick={onNew}
        className="w-full text-left text-xs text-indigo-400 hover:text-indigo-300 py-1 px-2"
      >
        + 添加角色
      </button>
    </div>
  );
}

// ─── 世界书列表 ─────────────────────────────────────────────

function LorebookList({
  entries,
  onEdit,
  onDelete,
  onNew,
}: {
  entries: LorebookData[];
  onEdit: (l: LorebookData) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}) {
  return (
    <div className="space-y-1">
      {entries.map((e) => (
        <div
          key={e.id}
          onClick={() => onEdit(e)}
          className="flex items-center gap-2 py-1.5 px-2 rounded text-xs cursor-pointer text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300 group"
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${e.enabled ? "bg-green-500" : "bg-zinc-700"}`} />
          <span className="flex-1 truncate">{e.title}</span>
          <span className="text-zinc-600 text-[10px]">{e.category}</span>
        </div>
      ))}

      <button
        onClick={onNew}
        className="w-full text-left text-xs text-indigo-400 hover:text-indigo-300 py-1 px-2"
      >
        + 添加词条
      </button>
    </div>
  );
}

// ─── 中栏：写作区 ───────────────────────────────────────────

function CenterPanel({
  selectedNode,
  streamContent,
  isGenerating,
  reviewResult,
  authorNote,
  onAuthorNoteChange,
  targetWordCount,
  onTargetWordCountChange,
  onWrite,
  onStop,
  onContinue,
  onEditOutline,
  projectId,
  lastGeneratedText,
  onEntitiesCreated,
  onOpenCardUpdater,
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
  projectId: string;
  lastGeneratedText: string;
  onEntitiesCreated: () => void;
  onOpenCardUpdater: () => void;
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
                <div
                  onClick={() => {
                    setOutlineDraft(selectedNode.outline || "");
                    setEditingOutline(true);
                  }}
                  className="text-xs text-zinc-500 hover:text-zinc-400 cursor-pointer italic"
                >
                  {selectedNode.outline || "点击设置本节点大纲..."}
                </div>
              )}
            </div>

            {/* 生成控制 */}
            <div className="flex items-center gap-2 flex-wrap">
              {isGenerating ? (
                <Button size="sm" onClick={onStop} className="bg-red-600 hover:bg-red-500 h-7 text-xs">
                  ⏹ 停止生成
                </Button>
              ) : (
                <Button size="sm" onClick={onWrite} className="bg-indigo-600 hover:bg-indigo-500 h-7 text-xs">
                  ▶ 生成/重写
                </Button>
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
                placeholder="作者指令（高优先级）..."
                value={authorNote}
                onChange={(e) => onAuthorNoteChange(e.target.value)}
                className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs placeholder:text-zinc-600"
              />
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
                  <div
                    className={`mt-6 border rounded-lg p-4 ${
                      reviewResult.passed
                        ? "border-green-800 bg-green-900/20"
                        : "border-yellow-800 bg-yellow-900/20"
                    }`}
                  >
                    <h3 className={`font-medium text-sm mb-2 ${reviewResult.passed ? "text-green-400" : "text-yellow-400"}`}>
                      {reviewResult.passed ? "✅ 审校通过" : "⚠️ 审校发现问题"}
                    </h3>
                    {reviewResult.issues.map((issue, i) => (
                      <div key={i} className="text-xs mb-1">
                        <span
                          className={`inline-block px-1.5 py-0.5 rounded mr-1 ${
                            issue.severity === "critical"
                              ? "bg-red-900/50 text-red-400"
                              : issue.severity === "major"
                              ? "bg-yellow-900/50 text-yellow-400"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {issue.severity}
                        </span>
                        <span className="text-zinc-400">{issue.description}</span>
                      </div>
                    ))}
                  </div>
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
                {isGenerating ? (
                  <span className="animate-pulse">生成中...</span>
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

// ─── 角色编辑弹窗 ───────────────────────────────────────────

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
  const [form, setForm] = useState({
    name: character.name,
    role: character.role,
    age: character.age || "未知",
    gender: character.gender || "未知",
    personality: (character.personality || []).join("、"),
    currentStatus: character.currentStatus || "alive",
  });

  const handleSave = async () => {
    await fetch(`/api/characters/${character.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        personality: form.personality.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
      }),
    });
    onSave();
    onClose();
  };

  return (
    <DialogOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold mb-4">编辑角色：{character.name}</h3>
      <div className="space-y-3">
        <DialogField label="姓名">
          <DialogInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
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
            <option value="background">背景角色</option>
          </select>
        </DialogField>
        <DialogField label="年龄">
          <DialogInput value={form.age} onChange={(v) => setForm({ ...form, age: v })} />
        </DialogField>
        <DialogField label="性别">
          <DialogInput value={form.gender} onChange={(v) => setForm({ ...form, gender: v })} />
        </DialogField>
        <DialogField label="性格特征（逗号分隔）">
          <DialogInput value={form.personality} onChange={(v) => setForm({ ...form, personality: v })} />
        </DialogField>
        <DialogField label="当前状态">
          <select
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm"
            value={form.currentStatus}
            onChange={(e) => setForm({ ...form, currentStatus: e.target.value })}
          >
            <option value="alive">存活</option>
            <option value="dead">死亡</option>
            <option value="missing">失踪</option>
            <option value="incapacitated">失去能力</option>
          </select>
        </DialogField>
      </div>
      <div className="flex justify-end gap-2 mt-5">
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
    await fetch("/api/characters", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId,
        name: form.name,
        role: form.role,
        age: form.age,
        gender: form.gender,
        personality: form.personality.split(/[,，、]/).map((s) => s.trim()).filter(Boolean),
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
          <DialogInput value={form.personality} onChange={(v) => setForm({ ...form, personality: v })} placeholder="傲慢, 护短, 嗜酒" />
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
