"use client";

import { CharacterList } from "@/components/workspace/CharacterList";
import { WorldPanel } from "@/components/workspace/WorldPanel";
import { StorylineList } from "@/components/workspace/StorylineList";
import { RulesPanel } from "@/components/workspace/RulesPanel";
import { OutlineTree } from "./OutlineTree";
import { Icon } from "@/components/ui/icons";
import type { ProjectData, CharacterData, LorebookData, StoryNodeData } from "./types";
import { toastError } from "@/components/ui/toast";

export function LeftPanel({
  project, activeTab, onTabChange, selectedNode, onSelectNode, onAddSection,
  onEditCharacter, onEditLore, onNewCharacter, onNewLore, loadProject,
  volumeView, onToggleVolumeView, batchMode, onToggleBatchMode,
  selectedChapterIds, onToggleChapterSelect, onSelectAll, onClearSelection,
  batchGenerating, onBatchGenerate, onDeleteNode, deletingNodeId,
}: {
  project: ProjectData; activeTab: string;
  onTabChange: (tab: "characters" | "world" | "lorebook" | "outline" | "storylines" | "rules") => void;
  selectedNode: StoryNodeData | null; onSelectNode: (node: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void; onEditCharacter: (c: CharacterData) => void;
  onEditLore: (l: LorebookData) => void; onNewCharacter: () => void; onNewLore: () => void;
  loadProject: () => void; volumeView: boolean; onToggleVolumeView: () => void;
  batchMode: boolean; onToggleBatchMode: () => void; selectedChapterIds: Set<string>;
  onToggleChapterSelect: (id: string) => void; onSelectAll: () => void;
  onClearSelection: () => void; batchGenerating: boolean; onBatchGenerate: () => void;
  onDeleteNode?: (id: string) => void;
  deletingNodeId?: string | null;
}) {
  const tabs = [
    { key: "outline", label: "大纲" },
    { key: "storylines", label: `故事线 (${project.storylines?.length || 0})` },
    { key: "characters", label: `角色 (${project.characters.length})` },
    { key: "world", label: `世界 (${project.lorebookEntries?.length || 0})` },
    { key: "rules", label: "规则" },
  ] as const;

  return (
    <aside className="w-64 border-r border-white/[0.06] bg-white/[0.02] backdrop-blur-sm flex flex-col shrink-0 overflow-hidden">
      <div className="flex border-b border-white/[0.06]">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => onTabChange(t.key)}
            className={`flex-1 text-xs py-2 text-center transition-colors ${
              activeTab === t.key ? "text-indigo-400 border-b border-indigo-400 bg-indigo-400/5" : "text-zinc-500 hover:text-zinc-300"
            }`}>{t.label}</button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {activeTab === "outline" && (
          <>
            <div className="flex items-center justify-between px-1 mb-1 flex-wrap gap-1">
              <span className="text-[10px] text-zinc-600">{volumeView ? "分卷视图" : "平铺视图"}</span>
              <div className="flex items-center gap-1">
                <button onClick={onToggleVolumeView}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${volumeView ? "bg-indigo-900/40 text-indigo-400" : "bg-white/[0.04] text-zinc-500"}`}>
                  {volumeView ? <span className="flex items-center gap-1"><Icon name="package" size={10} /> 分卷</span> : <span className="flex items-center gap-1"><Icon name="file" size={10} /> 平铺</span>}
                </button>
                <button onClick={onToggleBatchMode} disabled={batchGenerating}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${batchMode ? "bg-amber-900/40 text-amber-400" : "bg-white/[0.04] text-zinc-500"}`}>
                  ☑ 批量
                </button>
              </div>
            </div>
            {batchMode && (
              <div className="flex items-center gap-1 mb-1 px-1 flex-wrap">
                <button onClick={onSelectAll} className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-white/[0.04] px-1.5 py-0.5 rounded">全选</button>
                <button onClick={onClearSelection} className="text-[10px] text-zinc-400 hover:text-zinc-200 bg-white/[0.04] px-1.5 py-0.5 rounded">清除</button>
                <span className="text-[10px] text-zinc-600 ml-1">{selectedChapterIds.size} 章</span>
                {selectedChapterIds.size > 0 && !batchGenerating && (
                  <button onClick={onBatchGenerate} className="text-[10px] bg-amber-600 hover:bg-amber-500 text-white px-2 py-0.5 rounded font-medium ml-auto">▶ 批量生成</button>
                )}
              </div>
            )}
            <OutlineTree nodes={project.storyNodes} selectedNode={selectedNode} onSelectNode={onSelectNode}
              onAddSection={onAddSection} volumeView={volumeView} batchMode={batchMode}
              selectedChapterIds={selectedChapterIds} onToggleChapterSelect={onToggleChapterSelect}
              onDeleteNode={onDeleteNode} projectId={project.id} deletingId={deletingNodeId} />
          </>
        )}
        {activeTab === "storylines" && (
          <StorylineList projectId={project.id} onRefresh={loadProject} />
        )}

        {activeTab === "characters" && (
          <CharacterList characters={project.characters} projectId={project.id} onEdit={onEditCharacter}
            onDelete={async (id) => { const res = await fetch(`/api/characters/${id}`, { method: "DELETE" }); if (!res.ok) { const d = await res.json().catch(() => ({ error: "未知错误" })); throw new Error(d.error || `HTTP ${res.status}`); } loadProject(); }}
            onNew={onNewCharacter} onExpanded={loadProject} />
        )}
        {activeTab === "world" && (
          <WorldPanel projectId={project.id} entries={project.lorebookEntries} onRefresh={loadProject} />
        )}
        {activeTab === "rules" && (
          <RulesPanel projectId={project.id} onRefresh={loadProject} />
        )}
      </div>
    </aside>
  );
}
