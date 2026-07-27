"use client";

import { useState } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
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

const TOP_TABS: Array<{ key: TopTab; icon: IconName; label: string }> = [
  { key: "ai", icon: "bot", label: "AI助手" },
  { key: "query", icon: "search", label: "查询实体" },
  { key: "monitor", icon: "chart", label: "监测" },
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
      <aside className="flex w-10 shrink-0 flex-col items-center gap-3 border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-3 backdrop-blur-sm">
        <button onClick={() => setMinimized(false)} className="text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]" title="展开面板" aria-label="展开面板"><Icon name="arrowLeft" size={16} /></button>
        <div className="flex flex-1 flex-col items-center gap-3 text-[10px] text-[var(--nv-text-tertiary)]">
          {TOP_TABS.map((t) => (
            <button key={t.key} onClick={() => { setMinimized(false); setTopTab(t.key); }}
              className={`writing-mode-vertical hover:text-[var(--nv-text-primary)] ${topTab === t.key ? "text-[var(--nv-primary)]" : ""}`}
              style={{ writingMode: "vertical-rl" }} title={t.label}
            >{t.label}</button>
          ))}
        </div>
        <button onClick={onClose} className="text-[var(--nv-text-muted)] transition-colors hover:text-[var(--nv-danger)]" title="完全关闭" aria-label="关闭面板"><Icon name="x" size={14} /></button>
      </aside>
    );
  }

  // ── 展开状态 ──
  return (
    <aside className="flex w-80 max-h-full shrink-0 flex-col overflow-hidden border-l border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm">
      {/* 顶部三tab */}
      <div className="flex shrink-0 border-b border-[var(--nv-border-2)]">
        {TOP_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTopTab(t.key)}
            className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors ${
              topTab === t.key
                ? "border-b-2 border-[var(--nv-primary)] bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]"
                : "border-b-2 border-transparent text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)] hover:bg-white/[0.04]"
            }`}
          >
            <Icon name={t.icon} size={13} /> {t.label}
          </button>
        ))}
        <button onClick={() => setMinimized(true)} className="shrink-0 px-2 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-text-primary)]" title="最小化" aria-label="最小化"><Icon name="arrowRight" size={14} /></button>
        <button onClick={onClose} className="shrink-0 px-2 text-[var(--nv-text-tertiary)] transition-colors hover:text-[var(--nv-danger)]" title="完全关闭" aria-label="关闭面板"><Icon name="x" size={14} /></button>
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
            <div className="flex border-b border-white/[0.06] shrink-0">
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
      <div className="border-t border-white/[0.06] shrink-0">
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
