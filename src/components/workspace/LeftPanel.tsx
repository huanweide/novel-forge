"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { CharacterList } from "@/components/workspace/CharacterList";
import { WorldPanel } from "@/components/workspace/WorldPanel";
import { StorylineList } from "@/components/workspace/StorylineList";
import { RulesPanel } from "@/components/workspace/RulesPanel";
import { DigestPanel } from "@/components/workspace/DigestPanel";
import { OutlineTree } from "./OutlineTree";
import { Icon } from "@/components/ui/icons";
import type { CharacterData, LorebookData, StoryNodeData } from "./types";
import { toastError } from "@/components/ui/toast";
import { useProjectStore } from "@/store";

export function LeftPanel({
  activeTab, onTabChange, selectedNode, onSelectNode,   onAddSection,
  onEditCharacter, onEditLore, onNewCharacter, loadProject,
  viewMode, onSetViewMode, onDeleteNode, deletingNodeId, onLoadSample,
  onWriteChapter, onSummarizeCurrent, summarizing, onLocateEntity,
}: {
  activeTab: string;
  onTabChange: (tab: "characters" | "world" | "outline" | "storylines" | "rules" | "digest") => void;
  selectedNode: StoryNodeData | null; onSelectNode: (node: StoryNodeData) => void;
  onAddSection: (parentId: string | null) => void; onEditCharacter: (c: CharacterData) => void;
  onEditLore: (l: LorebookData) => void; onNewCharacter: () => void;
  loadProject: () => void; viewMode: "volume" | "flat"; onSetViewMode: (m: "volume" | "flat") => void;
  onDeleteNode?: (id: string) => void;
  deletingNodeId?: string | null;
  onLoadSample?: () => void;
  onWriteChapter?: (storylineId?: string) => void;
  onSummarizeCurrent?: () => void;
  summarizing?: boolean;
  /** 反向联动：点角色卡 / 世界书卡片，正文定位该实体 */
  onLocateEntity?: (id: string) => void;
}) {
  // FE-8：project 数据从 store 读取，不再由父组件逐层透传 project 大对象
  const project = useProjectStore((s) => s.project);
  if (!project) return null;
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreBtnRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  useEffect(() => {
    if (!moreMenuOpen) {
      setMenuPos(null);
      return;
    }
    const el = moreBtnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuPos({ top: rect.bottom, right: window.innerWidth - rect.right });
  }, [moreMenuOpen]);
  const visibleTabs = [
    { key: "outline", label: "大纲", icon: "book" as const },
    { key: "characters", label: `角色 (${project.characters?.length || 0})`, icon: "users" as const },
    { key: "world", label: `世界 (${project.lorebookEntries?.length || 0})`, icon: "globe" as const },
    { key: "storylines", label: `故事 (${project.storylines?.length || 0})`, icon: "bookmarked" as const },
  ] as const;
  const moreTabs = [
    { key: "rules", label: "规则", icon: "shield" as const },
    { key: "digest", label: "摘要大纲", icon: "scroll" as const },
  ] as const;
  const moreActive = moreTabs.some((t) => t.key === activeTab);

  return (
    <aside className="w-64 h-full border-r border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] backdrop-blur-sm flex flex-col shrink-0 overflow-hidden">
      <div className="flex items-end gap-0.5 overflow-x-auto border-b border-[var(--nv-border-2)] px-1.5 pt-1.5 bg-[var(--nv-surface-1)] scrollbar-hide">
        {visibleTabs.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onTabChange(t.key)}
              className={`flex shrink-0 items-center justify-center gap-1 rounded-t-lg px-2.5 py-1.5 text-[11px] transition-all ${
                active
                  ? "bg-[var(--nv-primary-soft)] font-semibold text-[var(--nv-primary)] shadow-[0_0_12px_color-mix(in_oklch,var(--nv-primary)_30%,transparent)]"
                  : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
              }`}
              title={t.label}
            >
              <Icon name={t.icon} size={13} className={`shrink-0 ${active ? "text-[var(--nv-primary)]" : "opacity-70"}`} />
              <span className="whitespace-nowrap">{t.label}</span>
            </button>
          );
        })}
        {/* 更多▾：规则收起，故事线已置顶常显 */}
        <div className="relative z-50 shrink-0" ref={moreBtnRef}>
          <button
            onClick={() => setMoreMenuOpen((o) => !o)}
            className={`flex items-center gap-0.5 rounded-t-lg px-2.5 py-1.5 text-[11px] transition-all ${
              moreActive || moreMenuOpen
                ? "bg-[var(--nv-primary-soft)] font-semibold text-[var(--nv-primary)] shadow-[0_0_12px_color-mix(in_oklch,var(--nv-primary)_30%,transparent)]"
                : "text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
            }`}
          >
            <span>更多</span>
            <span className="text-[10px] opacity-70">▾</span>
          </button>
          {moreMenuOpen && menuPos && createPortal(
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMoreMenuOpen(false)} aria-hidden />
              <div
                className="fixed z-[70] mt-1 w-40 rounded-lg border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] py-1 shadow-xl"
                style={{ top: menuPos.top, right: menuPos.right }}
              >
                {moreTabs.map((t) => (
                  <button key={t.key} onClick={() => { setMoreMenuOpen(false); onTabChange(t.key); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--nv-surface-2)] ${activeTab === t.key ? "font-medium text-[var(--nv-primary)]" : "text-[var(--nv-text-secondary)]"}`}>
                    <Icon name={t.icon} size={13} />
                    {t.label}
                  </button>
                ))}
              </div>
            </>,
            document.body
          )}
        </div>
      </div>
      <div key={activeTab} className="flex-1 overflow-y-auto p-2 animate-in">
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
              </div>
            </div>
            <OutlineTree nodes={project.storyNodes ?? []} selectedNode={selectedNode} onSelectNode={onSelectNode}
              onAddSection={onAddSection} viewMode={viewMode}
              onDeleteNode={onDeleteNode} projectId={project.id} deletingId={deletingNodeId}
              onLoadSample={onLoadSample} />
          </>
        )}
        {activeTab === "storylines" && (
          <StorylineList projectId={project.id} onRefresh={loadProject} onWriteChapter={onWriteChapter} />
        )}

        {activeTab === "characters" && (
          <CharacterList characters={project.characters ?? []} projectId={project.id} onEdit={onEditCharacter}
            onLocate={onLocateEntity}
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
        {activeTab === "digest" && (
          <DigestPanel projectId={project.id} onRefresh={loadProject} selectedNode={selectedNode} onSummarizeCurrent={onSummarizeCurrent} summarizing={summarizing} />
        )}
      </div>
    </aside>
  );
}
