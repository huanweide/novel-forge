"use client";

import { useState } from "react";
import { ContextPreview } from "@/components/editor/ContextPreview";
import { ChapterEntitiesPanel } from "./ChapterEntitiesPanel";
import { ForeshadowingPanel } from "./ForeshadowingPanel";
import { RelationshipGraph } from "./RelationshipGraph";
import { AIChatBar } from "./AIChatBar";
import { MonitorPanel } from "./MonitorPanel";
import { StatRow } from "./SharedUI";
import type { ProjectData, StoryNodeData } from "./types";

type TopTab = "ai" | "query" | "monitor";
type QuerySubTab = "entities" | "foreshadowing" | "relationships";

interface RightPanelProps {
  selectedNode: StoryNodeData | null;
  project: ProjectData;
  onClose: () => void;
  contextRefreshKey: number;
  authorNote: string;
  onEditCharacter?: (id: string) => void;
  onEditLore?: (id: string) => void;
  selectedText?: string;
}

const TOP_TABS: Array<{ key: TopTab; icon: string; label: string }> = [
  { key: "ai", icon: "🤖", label: "AI助手" },
  { key: "query", icon: "🔍", label: "查询实体" },
  { key: "monitor", icon: "📊", label: "监测" },
];

export function RightPanel(props: RightPanelProps) {
  const { selectedNode, project, onClose, contextRefreshKey, authorNote, onEditCharacter, onEditLore, selectedText } = props;

  const [minimized, setMinimized] = useState(false);
  const [topTab, setTopTab] = useState<TopTab>("ai");
  const [querySubTab, setQuerySubTab] = useState<QuerySubTab>("entities");
  const [showContext, setShowContext] = useState(false);

  // ── 最小化状态 ──
  if (minimized) {
    return (
      <aside className="w-10 border-l border-zinc-800 bg-zinc-900/30 flex flex-col items-center py-3 gap-3 shrink-0">
        <button onClick={() => setMinimized(false)} className="text-zinc-500 hover:text-zinc-300 text-xs" title="展开面板">◀</button>
        <div className="flex-1 flex flex-col items-center gap-3 text-[10px] text-zinc-600">
          {TOP_TABS.map((t) => (
            <button key={t.key} onClick={() => { setMinimized(false); setTopTab(t.key); }}
              className={`writing-mode-vertical hover:text-zinc-400 ${topTab === t.key ? "text-zinc-300" : ""}`}
              style={{ writingMode: "vertical-rl" }} title={t.label}
            >{t.label}</button>
          ))}
        </div>
        <button onClick={onClose} className="text-zinc-700 hover:text-zinc-400 text-[10px]" title="完全关闭">✕</button>
      </aside>
    );
  }

  // ── 展开状态 ──
  return (
    <aside className="w-80 border-l border-zinc-800 bg-zinc-900/30 flex flex-col shrink-0 overflow-hidden max-h-full">
      {/* 顶部三tab */}
      <div className="flex border-b border-zinc-800 shrink-0">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTopTab(t.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors ${
              topTab === t.key
                ? "text-zinc-200 border-b-2 border-indigo-500 bg-zinc-800/20"
                : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/10"
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
        <button onClick={() => setMinimized(true)} className="px-2 text-zinc-600 hover:text-zinc-400 text-xs shrink-0" title="最小化">▶</button>
        <button onClick={onClose} className="px-2 text-zinc-600 hover:text-zinc-400 text-xs shrink-0" title="完全关闭">✕</button>
      </div>

      {/* Tab 内容 */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* ── AI助手 tab ── */}
        {topTab === "ai" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            <AIChatBar
              projectId={project.id}
              chapterContent={selectedNode?.content ?? undefined}
              selectedText={selectedText}
              className="border-t-0"
            />
          </div>
        )}

        {/* ── 查询实体 tab ── */}
        {topTab === "query" && (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* 子tab */}
            <div className="flex border-b border-zinc-800 shrink-0">
              <button
                onClick={() => setQuerySubTab("entities")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  querySubTab === "entities" ? "text-zinc-300 bg-zinc-800/30" : "text-zinc-500 hover:text-zinc-400"
                }`}
              >📊 实体追踪</button>
              <button
                onClick={() => setQuerySubTab("foreshadowing")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  querySubTab === "foreshadowing" ? "text-zinc-300 bg-zinc-800/30" : "text-zinc-500 hover:text-zinc-400"
                }`}
              >🔮 伏笔</button>
              <button
                onClick={() => setQuerySubTab("relationships")}
                className={`flex-1 py-1.5 text-[10px] transition-colors ${
                  querySubTab === "relationships" ? "text-zinc-300 bg-zinc-800/30" : "text-zinc-500 hover:text-zinc-400"
                }`}
              >🕸️ 关系图</button>
            </div>

            {/* 子内容 */}
            <div className="flex-1 overflow-y-auto">
              {querySubTab === "entities" ? (
                <ChapterEntitiesPanel
                  projectId={project.id}
                  chapterContent={selectedNode?.content ?? undefined}
                  onEditCharacter={onEditCharacter}
                  onEditLore={onEditLore}
                  allCharacters={project.characters.map((c) => ({ id: c.id, name: c.name }))}
                  allLoreEntries={project.lorebookEntries.map((l) => ({ id: l.id, title: l.title }))}
                />
              ) : querySubTab === "relationships" ? (
                <RelationshipGraph
                  characters={project.characters as any}
                  projectId={project.id}
                  onEditCharacter={onEditCharacter}
                />
              ) : (
                <ForeshadowingPanel projectId={project.id} />
              )}
            </div>
          </div>
        )}

        {/* ── 监测 tab ── */}
        {topTab === "monitor" && (
          <div className="flex-1 overflow-y-auto">
            <MonitorPanel projectId={project.id} nodeId={selectedNode?.id} />
          </div>
        )}
      </div>

      {/* 底部：折叠的统计 + 上下文 */}
      <div className="border-t border-zinc-800 shrink-0">
        <div className="px-4 py-2 space-y-1">
          <StatRow label="总字数" value={String(project.storyNodes.reduce((sum, n) => sum + (n.wordCount || 0), 0))} />
          <StatRow label="角色" value={String(project.characters.length)} />
          <StatRow label="词条" value={String(project.lorebookEntries.length)} />
          <StatRow label="节点" value={String(project.storyNodes.length)} />
        </div>
        <button
          onClick={() => setShowContext(!showContext)}
          className="w-full flex items-center justify-between px-4 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-400 hover:bg-zinc-800/30 transition-colors"
        >
          <span>🔍 上下文监控</span>
          <span>{showContext ? "▲" : "▼"}</span>
        </button>
        {showContext && selectedNode && (
          <div className="px-3 pb-3">
            <ContextPreview projectId={project.id} nodeId={selectedNode.id} authorNote={authorNote} refreshKey={contextRefreshKey} />
          </div>
        )}
      </div>
    </aside>
  );
}
