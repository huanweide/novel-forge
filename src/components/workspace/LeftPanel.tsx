"use client";

import { useState } from "react";
import { CharacterList } from "@/components/workspace/CharacterList";
import { WorldPanel } from "@/components/workspace/WorldPanel";
import { StorylineList } from "@/components/workspace/StorylineList";
import { RulesPanel } from "@/components/workspace/RulesPanel";
import { OutlineTree } from "./OutlineTree";
import { Icon } from "@/components/ui/icons";
import type { CharacterData, LorebookData, StoryNodeData } from "./types";
import { toastError } from "@/components/ui/toast";
import { useProjectStore } from "@/store";

export function LeftPanel({
  activeTab, onTabChange, selectedNode, onSelectNode,   onAddSection,
  onEditCharacter, onEditLore, onNewCharacter, loadProject,
  viewMode, onSetViewMode, batchMode, onToggleBatchMode,
  selectedChapterIds, onToggleChapterSelect, onSelectAll, onClearSelection,
  batchGenerating, onBatchGenerate, onDeleteNode, deletingNodeId, onLoadSample,
  onBatchConfirm, batchConfirming, onWriteChapter,
}: {
  activeTab: string;
  onTabChange: (tab: "characters" | "world" | "outline" | "storylines" | "rules") => void;
  selectedNode: StoryNodeData | null; onSelectNode: (node: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void; onEditCharacter: (c: CharacterData) => void;
  onEditLore: (l: LorebookData) => void; onNewCharacter: () => void;
  loadProject: () => void; viewMode: "volume" | "flat"; onSetViewMode: (m: "volume" | "flat") => void;
  batchMode: boolean; onToggleBatchMode: () => void; selectedChapterIds: Set<string>;
  onToggleChapterSelect: (id: string) => void; onSelectAll: () => void;
  onClearSelection: () => void; batchGenerating: boolean; onBatchGenerate: () => void;
  onBatchConfirm: () => void; batchConfirming: boolean;
  onDeleteNode?: (id: string) => void;
  deletingNodeId?: string | null;
  onLoadSample?: () => void;
  onWriteChapter?: (storylineId?: string) => void;
}) {
  // FE-8：project 数据从 store 读取，不再由父组件逐层透传 project 大对象
  const project = useProjectStore((s) => s.project);
  if (!project) return null;
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  // 选中的章节里处于「待确认」的数量（批量确认仅对这些章生效）
  const selectedPendingCount =
    project.storyNodes?.filter((n) => selectedChapterIds.has(n.id) && n.status === "pending_confirm").length ?? 0;
  const visibleTabs = [
    { key: "outline", label: "大纲" },
    { key: "characters", label: `角色 (${project.characters?.length || 0})` },
    { key: "world", label: `世界 (${project.lorebookEntries?.length || 0})` },
    { key: "storylines", label: `故事线（${project.storylines?.length || 0}）` },
  ] as const;
  const moreTabs = [
    { key: "rules", label: "规则" },
  ] as const;
  const moreActive = moreTabs.some((t) => t.key === activeTab);

  return (
    <aside className="w-64 h-full border-r border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm flex flex-col shrink-0 overflow-hidden">
      <div className="flex border-b border-[var(--nv-border-2)]">
        {visibleTabs.map((t) => (
          <button key={t.key} onClick={() => onTabChange(t.key)}
            className={`flex-1 text-xs py-2 text-center transition-colors ${
              activeTab === t.key ? "text-[var(--nv-primary)] border-b border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]" : "text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]"
            }`}>{t.label}</button>
        ))}
        {/* 更多▾：规则收起，故事线已置顶常显 */}
        <div className="relative z-50">
          <button onClick={() => setMoreMenuOpen((o) => !o)}
            className={`text-xs py-2 px-2 text-center transition-colors border-b ${
              moreActive || moreMenuOpen ? "text-[var(--nv-primary)] border-[var(--nv-primary)] bg-[var(--nv-primary-soft)]" : "text-[var(--nv-text-tertiary)] border-transparent hover:text-[var(--nv-text-primary)]"
            }`}>更多 <span className="text-[10px] opacity-70">▾</span></button>
          {moreMenuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} aria-hidden />
              <div className="absolute right-0 top-full z-50 mt-1 w-36 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-1 shadow-xl">
                {moreTabs.map((t) => (
                  <button key={t.key} onClick={() => { setMoreMenuOpen(false); onTabChange(t.key); }}
                    className={`block w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-[var(--nv-surface-2)] ${activeTab === t.key ? "text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)]"}`}>{t.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "outline" && (
          <>
            <div className="flex items-center justify-between px-1 mb-1 flex-wrap gap-1">
              <span className="text-[10px] text-[var(--nv-text-tertiary)]">{viewMode === "volume" ? "分卷视图" : viewMode === "flat" ? "平铺视图" : "时间线视图"}</span>
              <div className="flex items-center gap-1">
                <button onClick={() => onSetViewMode("volume")}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${viewMode === "volume" ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}
                  title="分卷视图">
                  <span className="flex items-center gap-1"><Icon name="package" size={10} /> 分卷</span>
                </button>
                <button onClick={() => onSetViewMode("flat")}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${viewMode === "flat" ? "bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}
                  title="平铺视图">
                  <span className="flex items-center gap-1"><Icon name="file" size={10} /> 平铺</span>
                </button>
                <button onClick={onToggleBatchMode} disabled={batchGenerating}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${batchMode ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]" : "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)]"}`}>
                  批量
                </button>
              </div>
            </div>
            {batchMode && (
              <div className="flex items-center gap-1 mb-1 px-1 flex-wrap">
                <button onClick={onSelectAll} className="text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] bg-[var(--nv-surface-3)] px-1.5 py-0.5 rounded">全选</button>
                <button onClick={onClearSelection} className="text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] bg-[var(--nv-surface-3)] px-1.5 py-0.5 rounded">清除</button>
                <span className="text-[10px] text-[var(--nv-text-tertiary)] ml-1">{selectedChapterIds.size} 章</span>
                {selectedChapterIds.size > 0 && !batchGenerating && (
                  <button onClick={onBatchGenerate} className="btn-ghost text-[10px] px-2 py-0.5 rounded font-medium ml-auto text-[var(--nv-accent)] border border-[var(--nv-accent)]/40 hover:bg-[var(--nv-accent-soft)]">批量生成</button>
                )}
                {selectedPendingCount > 0 && !batchGenerating && !batchConfirming && (
                  <button onClick={onBatchConfirm} disabled={batchConfirming} className="btn-ghost text-[10px] px-2 py-0.5 rounded font-medium text-[var(--nv-success)] border border-[var(--nv-success)]/40 hover:bg-[var(--nv-success)]/10">批量确认 {selectedPendingCount}</button>
                )}
              </div>
            )}
            <OutlineTree nodes={project.storyNodes ?? []} selectedNode={selectedNode} onSelectNode={onSelectNode}
              onAddSection={onAddSection} viewMode={viewMode} batchMode={batchMode}
              selectedChapterIds={selectedChapterIds} onToggleChapterSelect={onToggleChapterSelect}
              onDeleteNode={onDeleteNode} projectId={project.id} deletingId={deletingNodeId}
              onLoadSample={onLoadSample} />
          </>
        )}
        {activeTab === "storylines" && (
          <StorylineList projectId={project.id} onRefresh={loadProject} onWriteChapter={onWriteChapter} />
        )}

        {activeTab === "characters" && (
          <CharacterList characters={project.characters ?? []} projectId={project.id} onEdit={onEditCharacter}
            onDelete={async (id) => { const res = await fetch(`/api/characters/${id}`, { method: "DELETE" }); if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); } loadProject(); }}
            onConfirm={async (id) => { const res = await fetch(`/api/characters/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewStatus: "approved" }) }); if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); } loadProject(); }}
            onNew={onNewCharacter} onExpanded={loadProject} />
        )}
        {activeTab === "world" && (
          <WorldPanel projectId={project.id} entries={project.lorebookEntries ?? []} onRefresh={loadProject} onEditEntry={onEditLore} />
        )}
        {activeTab === "rules" && (
          <RulesPanel projectId={project.id} onRefresh={loadProject} />
        )}
      </div>
    </aside>
  );
}
