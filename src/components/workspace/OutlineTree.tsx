"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { StoryNodeData } from "./types";

export function NodeTreeItem({
  node, allNodes, selectedNode, onSelectNode, onAddSection, depth,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId,
}: {
  node: StoryNodeData; allNodes: StoryNodeData[]; selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  depth: number; batchMode?: boolean; selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void; onDeleteNode?: (id: string) => void;
  deletingId?: string | null;
  projectId: string;
}) {
  const router = useRouter();
  const children = allNodes.filter((n) => n.parentId === node.id);
  const isSelected = selectedNode?.id === node.id;
  const isImported = node.content?.includes("📥") || false;
  const isChapter = node.type === "chapter" || node.type === "section";
  const isChecked = selectedChapterIds?.has(node.id) || false;
  const typeIcon = node.type === "volume" ? "📂" : node.type === "chapter" ? "📖" : node.type === "section" ? "§" : "○";
  const statusIcon = node.status === "completed" ? "●" : node.status === "drafting" ? "◐" : node.status === "reviewing" ? "⚠" : "○";
  const statusColor = node.status === "completed" ? "text-green-400" : node.status === "reviewing" ? "text-yellow-400" : "text-zinc-600";

  return (
    <div>
      <div onClick={() => onSelectNode(node)}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-xs group ${
          isSelected ? "bg-indigo-500/20 text-indigo-300" : "text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-300"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}>
        {batchMode && isChapter && (
          <input type="checkbox" checked={isChecked}
            onChange={(e) => { e.stopPropagation(); onToggleChapterSelect?.(node.id); }}
            className="w-3 h-3 rounded shrink-0 accent-amber-500" onClick={(e) => e.stopPropagation()} />
        )}
        <span className="text-[10px]">{typeIcon}</span>
        <span className={`${statusColor} text-[10px]`}>{statusIcon}</span>
        <span className="flex-1 truncate">{node.title}</span>
        {isImported && <span className="text-purple-400/70 text-[10px]" title="从导入文本创建">📥</span>}
        {onDeleteNode && (node.type === "chapter" || node.type === "section") && (
          <button onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
            disabled={deletingId === node.id}
            className="opacity-0 group-hover:opacity-100 text-red-500/60 hover:text-red-400 text-[12px] px-0.5 transition-opacity disabled:opacity-40" title="删除此章节">✕</button>
        )}
        {isChapter && (
          <button onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${projectId}/game/${node.id}`); }}
            className="opacity-0 group-hover:opacity-100 text-violet-400/70 hover:text-violet-300 text-[12px] px-0.5 transition-opacity" title="🎮 游戏模式创作本章">🎮</button>
        )}
        <span className="text-zinc-600 text-[10px]">{node.wordCount > 0 ? `${node.wordCount}字` : ""}</span>
      </div>
      {children.map((child) => (
        <NodeTreeItem key={child.id} node={child} allNodes={allNodes} selectedNode={selectedNode}
          onSelectNode={onSelectNode} onAddSection={onAddSection} depth={depth + 1}
          batchMode={batchMode} selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
          projectId={projectId} />
      ))}
    </div>
  );
}

export function VolumeGroup({
  volume, children, allNodes, selectedNode, onSelectNode, onAddSection,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId,
}: {
  volume: StoryNodeData; children: StoryNodeData[]; allNodes: StoryNodeData[];
  selectedNode: StoryNodeData | null; onSelectNode: (n: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void; batchMode?: boolean;
  selectedChapterIds?: Set<string>;     onToggleChapterSelect?: (id: string) => void;
    onDeleteNode?: (id: string) => void;
    deletingId?: string | null;
    projectId: string;
  }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalWords = children.reduce((sum, c) => sum + (c.wordCount || 0), 0);

  return (
    <div>
      <div className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-xs bg-amber-950/20 border border-amber-900/20 hover:border-amber-900/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}>
        <span className="text-[10px]">{collapsed ? "▶" : "▼"}</span>
        <span className="text-amber-400/80 font-medium flex-1">📂 {volume.title}</span>
        <span className="text-zinc-600 text-[10px]">{children.length}章 · {totalWords}字</span>
      </div>
      {!collapsed && (
        <div className="ml-2 border-l border-amber-900/20 pl-2">
          {children.map((ch) => (
            <NodeTreeItem key={ch.id} node={ch} allNodes={allNodes} selectedNode={selectedNode}
              onSelectNode={onSelectNode} onAddSection={onAddSection} depth={1}
              batchMode={batchMode} selectedChapterIds={selectedChapterIds}
              onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
              projectId={projectId} />
          ))}
          <button onClick={(e) => { e.stopPropagation(); onAddSection(volume.id); }}
            className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-0.5 px-1.5" style={{ paddingLeft: "18px" }}>
            + 添加章节到此卷
          </button>
        </div>
      )}
    </div>
  );
}

export function OutlineTree({
  nodes, selectedNode, onSelectNode, onAddSection, volumeView,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId,
}: {
  nodes: StoryNodeData[]; selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  volumeView: boolean; batchMode?: boolean; selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void; onDeleteNode?: (id: string) => void;
  deletingId?: string | null;
  projectId: string;
}) {
  const volumeNodes = nodes.filter((n) => n.type === "volume");
  const nonVolumeRoots = nodes.filter((n) => !n.parentId && n.type !== "volume");

  if (volumeView && volumeNodes.length > 0) {
    return (
      <div className="space-y-0.5">
        {volumeNodes.map((vol) => {
          const volChildren = nodes.filter((n) => n.parentId === vol.id);
          return <VolumeGroup key={vol.id} volume={vol} children={volChildren} allNodes={nodes}
            selectedNode={selectedNode} onSelectNode={onSelectNode} onAddSection={onAddSection}
            batchMode={batchMode} selectedChapterIds={selectedChapterIds}
            onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
            projectId={projectId} />;
        })}
        {nonVolumeRoots.map((root) => (
          <NodeTreeItem key={root.id} node={root} allNodes={nodes} selectedNode={selectedNode}
            onSelectNode={onSelectNode} onAddSection={onAddSection} depth={0}
            batchMode={batchMode} selectedChapterIds={selectedChapterIds}
            onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
            projectId={projectId} />
        ))}
        <button onClick={() => onAddSection(null)}
          className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-1 px-2 mt-2">+ 添加章节/分卷</button>
      </div>
    );
  }

  const flatNodes = volumeView ? nonVolumeRoots
    : nodes.filter((n) => n.type !== "volume" && !(n.parentId && nodes.find((p) => p.id === n.parentId)?.type === "volume"));
  const roots = flatNodes.filter((n) => !n.parentId);

  if (roots.length === 0) {
    return (
      <div className="text-center text-zinc-600 text-xs py-8">
        还没有章节大纲<br />
        <button onClick={() => onAddSection(null)} className="text-indigo-400 hover:text-indigo-300 mt-2 block mx-auto">+ 手动添加章节</button>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {roots.map((root) => (
        <NodeTreeItem key={root.id} node={root} allNodes={nodes} selectedNode={selectedNode}
          onSelectNode={onSelectNode} onAddSection={onAddSection} depth={0}
          batchMode={batchMode} selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
          projectId={projectId} />
      ))}
      <button onClick={() => onAddSection(null)}
        className="w-full text-left text-xs text-zinc-600 hover:text-zinc-400 py-1 px-2 mt-2">+ 添加章节</button>
    </div>
  );
}
