"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
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
  const typeIcon = node.type === "volume" ? "bookmarked" : node.type === "chapter" ? "book" : node.type === "section" ? "file" : "circle";
  const statusIcon = node.status === "completed" ? "check" : node.status === "drafting" ? "pencil" : node.status === "reviewing" ? "alert" : "circle";
  const statusColor = node.status === "completed" ? "text-[var(--nv-success)]" : node.status === "reviewing" ? "text-[var(--nv-accent)]" : "text-[var(--nv-text-tertiary)]";

  return (
    <div>
      <div onClick={() => onSelectNode(node)}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-xs group ${
          isSelected ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}>
        {batchMode && isChapter && (
          <input type="checkbox" checked={isChecked}
            onChange={(e) => { e.stopPropagation(); onToggleChapterSelect?.(node.id); }}
            className="w-3 h-3 rounded shrink-0 accent-[var(--nv-accent)]" onClick={(e) => e.stopPropagation()} />
        )}
        <Icon name={typeIcon} size={11} className="shrink-0" />
        <Icon name={statusIcon as any} size={11} className={`${statusColor} shrink-0`} />
        <span className="flex-1 truncate">{node.title}</span>
        {isImported && <span className="text-[var(--nv-creative)]/70 text-[10px]" title="从导入文本创建"><Icon name="download" size={11} /></span>}
        {onDeleteNode && (node.type === "chapter" || node.type === "section") && (
          <button onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
            disabled={deletingId === node.id}
            className="opacity-0 group-hover:opacity-100 text-[var(--nv-danger)]/60 hover:text-[var(--nv-danger)] text-[12px] px-0.5 transition-opacity disabled:opacity-40" title="删除此章节"><Icon name="x" size={12} /></button>
        )}
        {isChapter && (
          <button onClick={(e) => { e.stopPropagation(); router.push(`/workspace/${projectId}/game/${node.id}`); }}
            className="opacity-0 group-hover:opacity-100 text-[var(--nv-creative)]/70 hover:text-[var(--nv-creative)] text-[12px] px-0.5 transition-opacity" title="游戏模式创作本章"><Icon name="gamepad" size={12} /></button>
        )}
        <span className="text-[var(--nv-text-tertiary)] text-[10px]">{node.wordCount > 0 ? `${node.wordCount}字` : ""}</span>
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
      <div className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-xs bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20 hover:border-[var(--nv-accent)]/40 transition-colors"
        onClick={() => setCollapsed(!collapsed)}>
        <Icon name={collapsed ? "arrowRight" : "arrowDown" as any} size={11} className="text-[var(--nv-accent)]" />
        <Icon name="bookmarked" size={12} className="text-[var(--nv-accent)]" />
        <span className="text-[var(--nv-accent)] font-medium flex-1">{volume.title}</span>
        <span className="text-[var(--nv-text-tertiary)] text-[10px]">{children.length}章 · {totalWords}字</span>
      </div>
      {!collapsed && (
        <div className="ml-2 border-l border-[var(--nv-accent)]/20 pl-2">
          {children.map((ch) => (
            <NodeTreeItem key={ch.id} node={ch} allNodes={allNodes} selectedNode={selectedNode}
              onSelectNode={onSelectNode} onAddSection={onAddSection} depth={1}
              batchMode={batchMode} selectedChapterIds={selectedChapterIds}
              onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
              projectId={projectId} />
          ))}
          <button onClick={(e) => { e.stopPropagation(); onAddSection(volume.id); }}
            className="w-full text-left text-xs text-[var(--nv-text-muted)] hover:text-[var(--nv-text-tertiary)] py-0.5 px-1.5" style={{ paddingLeft: "18px" }}>
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
  projectId, onLoadSample,
}: {
  nodes: StoryNodeData[]; selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  volumeView: boolean; batchMode?: boolean; selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void;   onDeleteNode?: (id: string) => void;
  deletingId?: string | null;
  projectId: string;
  onLoadSample?: () => void;
}) {
  if (nodes.length === 0) {
    return (
      <div className="px-2 py-10 text-center">
        <div className="mb-3 text-xs text-[var(--nv-text-tertiary)]">还没有章节大纲，先有个开头吧：</div>
        {onLoadSample && (
          <button onClick={onLoadSample} className="btn-primary h-7 px-3 mb-3 text-xs">看示例（载入示范小说）</button>
        )}
        <div>
          <button onClick={() => onAddSection(null)} className="text-xs text-[var(--nv-primary)] hover:underline">+ 手动添加章节</button>
        </div>
        <div className="mt-2">
          <button onClick={() => { if (typeof window !== "undefined") window.location.href = "/"; }} className="text-[10px] text-[var(--nv-text-muted)] hover:text-[var(--nv-text-secondary)]">或去首页「按题材开局」</button>
        </div>
      </div>
    );
  }
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
          className="w-full text-left text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] py-1 px-2 mt-2">+ 添加章节/分卷</button>
      </div>
    );
  }

  const flatNodes = volumeView ? nonVolumeRoots
    : nodes.filter((n) => n.type !== "volume" && !(n.parentId && nodes.find((p) => p.id === n.parentId)?.type === "volume"));
  const roots = flatNodes.filter((n) => !n.parentId);

  if (roots.length === 0) {
    return (
      <div className="text-center text-[var(--nv-text-tertiary)] text-xs py-8">
        还没有章节大纲<br />
        <button onClick={() => onAddSection(null)} className="text-[var(--nv-primary)] hover:text-[var(--nv-primary)]/70 mt-2 block mx-auto">+ 手动添加章节</button>
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
        className="w-full text-left text-xs text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-secondary)] py-1 px-2 mt-2">+ 添加章节</button>
    </div>
  );
}
