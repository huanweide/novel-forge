"use client";

import { memo, useMemo, useState, type ReactNode, type KeyboardEvent } from "react";
import { Icon } from "@/components/ui/icons";
import { StatusBadge } from "@/components/ui/status-badge";
import type { StoryNodeData } from "./types";

// Round-29 FIX-8：预建父 id -> 子节点数组 的 Map，O(n) 一次性构建，
// 消除每个节点递归时 allNodes.filter(parentId===id) 造成的 O(n²) 全量重算。
type ChildrenMap = Map<string, StoryNodeData[]>;

const EMPTY_NODES: StoryNodeData[] = [];

function buildIndex(nodes: StoryNodeData[]): { childrenMap: ChildrenMap; volumeIds: Set<string> } {
  const childrenMap: ChildrenMap = new Map();
  const volumeIds = new Set<string>();
  for (const n of nodes) {
    if (n.type === "volume") volumeIds.add(n.id);
    if (n.parentId) {
      const arr = childrenMap.get(n.parentId);
      if (arr) arr.push(n);
      else childrenMap.set(n.parentId, [n]);
    }
  }
  return { childrenMap, volumeIds };
}

// v3.1.68：本地过审分色标（与过审自检面板同源：分数越高越像 AI 写的）
const HUMANIZE_BADGE: Record<string, string> = {
  clean: "text-[var(--nv-success)] bg-[var(--nv-success)]/10",
  info: "text-[var(--nv-info)] bg-[var(--nv-info-soft)]",
  warn: "text-[var(--nv-warning)] bg-[var(--nv-warning-soft)]",
  danger: "text-[var(--nv-danger)] bg-[var(--nv-danger-soft)]",
};
function humanizeBadgeClass(score: number): string {
  if (score <= 30) return HUMANIZE_BADGE.clean; // 干净（绿）
  if (score <= 60) return HUMANIZE_BADGE.info; // 轻微（蓝）
  if (score <= 80) return HUMANIZE_BADGE.warn; // 明显（黄）
  return HUMANIZE_BADGE.danger; // 严重（红）
}

export const NodeTreeItem = memo(function NodeTreeItem({
  node, childrenMap, selectedId, onSelectNode, onAddSection, depth,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId, badgeSlot,
}: {
  node: StoryNodeData; childrenMap: ChildrenMap; selectedId: string | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  depth: number; batchMode?: boolean; selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void; onDeleteNode?: (id: string) => void;
  deletingId?: string | null;
  projectId: string;
  badgeSlot?: ReactNode;
}) {
  // 直接从预建的 childrenMap 取子节点，O(1)；不再对全量 allNodes 做 filter。
  const children = childrenMap.get(node.id) ?? EMPTY_NODES;
  const isSelected = selectedId === node.id;
  const isImported = node.content?.includes("📥") || false;
  const isChapter = node.type === "chapter" || node.type === "section";
  const isChecked = selectedChapterIds?.has(node.id) || false;
  const typeIcon = node.type === "volume" ? "bookmarked" : node.type === "chapter" ? "book" : node.type === "section" ? "file" : "circle";

  // 键盘入口：Enter / Space 触发与 onClick 相同的选中逻辑（role="button" 语义）。
  const handleActivate = () => onSelectNode(node);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleActivate();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={handleActivate}
        onKeyDown={handleKeyDown}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded cursor-pointer text-xs group transition-all duration-150 ${
          isSelected ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)] shadow-[inset_2px_0_0_0_var(--nv-primary)]" : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)] hover:shadow-[inset_2px_0_0_0_var(--nv-border-3)]"
        }`}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}>
        {batchMode && isChapter && (
          <input type="checkbox" checked={isChecked}
            onChange={(e) => { e.stopPropagation(); onToggleChapterSelect?.(node.id); }}
            className="w-3 h-3 rounded shrink-0 accent-[var(--nv-accent)]" onClick={(e) => e.stopPropagation()} />
        )}
        <Icon name={typeIcon} size={11} className="shrink-0" />
        <StatusBadge status={node.status} />
        {/* v2.9.0：体检保存的质量分常驻徽章（qualityScore 经 /api/generate/audit/book POST 回写） */}
        {node.qualityScore != null && (
          <span
            className={`text-[10px] px-1 py-0.5 rounded-full font-mono ${
              node.qualityScore >= 85
                ? "bg-success/20 text-success"
                : node.qualityScore >= 70
                  ? "bg-[var(--nv-primary)]/20 text-[var(--nv-primary)]"
                  : node.qualityScore >= 60
                    ? "bg-warning/20 text-warning"
                    : "bg-danger/20 text-danger"
            }`}
            title={`写作质量分（全书体检保存）：${node.qualityScore}`}
          >
            {node.qualityScore}
          </span>
        )}
        {/* v3.1.68：本地过审自检分常驻色标（humanizeScore 经「过审自检」面板保存） */}
        {node.humanizeScore != null && (
          <span
            className={`text-[10px] px-1 py-0.5 rounded-full font-mono ${humanizeBadgeClass(node.humanizeScore)}`}
            title={`本地过审分（去AI味·纯本地）：${node.humanizeScore} / 100　分数越高越像 AI 写的`}
          >
            过{node.humanizeScore}
          </span>
        )}
        {badgeSlot}
        <span className="flex-1 truncate">{node.title}</span>
        {isImported && <span className="text-[var(--nv-creative)]/70 text-[10px]" title="从导入文本创建"><Icon name="download" size={11} /></span>}
        {onDeleteNode && (node.type === "chapter" || node.type === "section") && (
          <button onClick={(e) => { e.stopPropagation(); onDeleteNode(node.id); }}
            disabled={deletingId === node.id}
            className="opacity-0 group-hover:opacity-100 text-[var(--nv-danger)]/60 hover:text-[var(--nv-danger)] text-[12px] px-0.5 transition-opacity disabled:opacity-40" title="删除此章节"><Icon name="x" size={12} /></button>
        )}
        {/* Round16 董事会决议：游戏模式入口移除（7/7 判为傻子功能，偏离写作利器核心） */}
        <span className="text-[var(--nv-text-tertiary)] text-[10px]">{node.wordCount > 0 ? `${node.wordCount}字` : ""}</span>
      </div>
      {children.map((child) => (
        <NodeTreeItem key={child.id} node={child} childrenMap={childrenMap} selectedId={selectedId}
          onSelectNode={onSelectNode} onAddSection={onAddSection} depth={depth + 1}
          batchMode={batchMode} selectedChapterIds={selectedChapterIds}
          onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
          projectId={projectId} />
      ))}
    </div>
  );
});

export const VolumeGroup = memo(function VolumeGroup({
  volume, children, childrenMap, selectedId, onSelectNode, onAddSection,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId,
}: {
  volume: StoryNodeData; children: StoryNodeData[]; childrenMap: ChildrenMap; selectedId: string | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  batchMode?: boolean; selectedChapterIds?: Set<string>;     onToggleChapterSelect?: (id: string) => void;
    onDeleteNode?: (id: string) => void;
    deletingId?: string | null;
    projectId: string;
  }) {
  const [collapsed, setCollapsed] = useState(false);
  const totalWords = children.reduce((sum, c) => sum + (c.wordCount || 0), 0);

  const handleToggle = () => setCollapsed(!collapsed);
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleToggle();
    }
  };

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        className="flex items-center gap-1.5 py-1.5 px-2 rounded cursor-pointer text-xs bg-[var(--nv-accent-soft)] border border-[var(--nv-accent)]/20 hover:border-[var(--nv-accent)]/40 transition-colors">
        <Icon name={collapsed ? "arrowRight" : "arrowDown"} size={11} className="text-[var(--nv-accent)]" />
        <Icon name="bookmarked" size={12} className="text-[var(--nv-accent)]" />
        <span className="text-[var(--nv-accent)] font-medium flex-1">{volume.title}</span>
        <span className="text-[var(--nv-text-tertiary)] text-[10px]">{children.length}章 · {totalWords}字</span>
      </div>
      {!collapsed && (
        <div className="ml-2 border-l border-[var(--nv-accent)]/20 pl-2">
          {children.map((ch) => (
            <NodeTreeItem key={ch.id} node={ch} childrenMap={childrenMap} selectedId={selectedId}
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
});

export function OutlineTree({
  nodes, selectedNode, onSelectNode, onAddSection, viewMode,
  batchMode, selectedChapterIds, onToggleChapterSelect, onDeleteNode, deletingId,
  projectId, onLoadSample,
}: {
  nodes: StoryNodeData[]; selectedNode: StoryNodeData | null;
  onSelectNode: (n: StoryNodeData) => void; onAddSection: (parentId: string | null) => void;
  viewMode: "volume" | "flat"; batchMode?: boolean; selectedChapterIds?: Set<string>;
  onToggleChapterSelect?: (id: string) => void;   onDeleteNode?: (id: string) => void;
  deletingId?: string | null;
  projectId: string;
  onLoadSample?: () => void;
}) {
  // 性能：`childrenMap`（取子节点 O(1)）+ `volumeIds`（平铺视图去 O(n²) 嵌套 find）。
  // 仅依赖于 nodes，nodes 引用不变则不重建，配合 memo 避免整树无谓重渲。
  const { childrenMap, volumeIds } = useMemo(() => buildIndex(nodes), [nodes]);
  const selectedId = selectedNode?.id ?? null;

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

  if (viewMode === "volume" && volumeNodes.length > 0) {
    return (
      <div className="space-y-0.5">
        {volumeNodes.map((vol) => {
          const volChildren = childrenMap.get(vol.id) ?? EMPTY_NODES;
          return <VolumeGroup key={vol.id} volume={vol} children={volChildren} childrenMap={childrenMap}
            selectedId={selectedId} onSelectNode={onSelectNode} onAddSection={onAddSection}
            batchMode={batchMode} selectedChapterIds={selectedChapterIds}
            onToggleChapterSelect={onToggleChapterSelect} onDeleteNode={onDeleteNode} deletingId={deletingId}
            projectId={projectId} />;
        })}
        {nonVolumeRoots.map((root) => (
          <NodeTreeItem key={root.id} node={root} childrenMap={childrenMap} selectedId={selectedId}
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

  // v1.6.0：时间线视图删除（世界时间已删除，三视图冗余），直接走平铺。
  // 用预建的 volumeIds 判断父是否为卷，消除原 nodes.find(...) 嵌套造成的 O(n²)。
  const flatNodes = nodes.filter((n) => n.type !== "volume" && !(n.parentId && volumeIds.has(n.parentId)));
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
        <NodeTreeItem key={root.id} node={root} childrenMap={childrenMap} selectedId={selectedId}
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
