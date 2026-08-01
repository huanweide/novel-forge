"use client";

import { type ReactNode } from "react";
import { Icon } from "@/components/ui/icons";
import type { CharacterData } from "./types";

type ClassifyGroup = {
  category: string;
  label: string;
  description: string;
  members: string[];
  memberIds: string[];
};

export function ClassifyPanel({
  classifying,
  groups,
  selections,
  characters,
  applying,
  onToggleGroup,
  onToggleMember,
  onApply,
  onClose,
  msg,
  done,
  total,
  result,
  onResultClose,
  selectedTagCount,
  selectedCharIds,
}: {
  classifying: boolean;
  groups: ClassifyGroup[] | null;
  selections: Map<string, Set<string>>;
  characters: CharacterData[];
  applying: boolean;
  onToggleGroup: (label: string) => void;
  onToggleMember: (label: string, memberId: string) => void;
  onApply: () => void;
  onClose: () => void;
  msg: string;
  done: number;
  total: number;
  result: { ok: boolean; message: string } | null;
  onResultClose: () => void;
  selectedTagCount: number;
  selectedCharIds: Set<string>;
}) {
  return (
    <>
      {/* 分类进度 */}
      {classifying && (
        <div className="mb-2 p-2 rounded bg-[var(--nv-creative-soft)] border border-[var(--nv-creative-soft)]">
          <p className="text-xs text-[var(--nv-creative)]">{msg}</p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-[var(--nv-surface-1)] rounded-full overflow-hidden">
              <div className="h-full bg-[var(--nv-creative)] rounded-full transition-all" style={{
                width: `${total > 0 ? Math.round((done / total) * 100) : 5}%`
              }} />
            </div>
            <span className="text-xs text-[var(--nv-text-secondary)] shrink-0">{done}%</span>
          </div>
        </div>
      )}
      {/* 分类面板：用户审查 & 勾选 */}
      {!classifying && groups && groups.length > 0 && (
        <div className="mb-2 rounded bg-[var(--nv-surface-1)] backdrop-blur-sm border border-[var(--nv-creative-soft)] overflow-hidden">
          {/* 面板标题 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-[var(--nv-creative-soft)] border-b border-[var(--nv-creative-soft)]">
            <span className="text-[10px] text-[var(--nv-creative)] font-medium">
              <Icon name="tag" size={10} /> 分类建议 · {groups.length} 组 · {selectedCharIds.size} 人
            </span>
            <button
              onClick={onClose}
              className="text-[10px] text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"
            ><Icon name="x" size={11} /> 关闭</button>
          </div>
          {/* 分类列表——按 category 分组 */}
          <div className="max-h-80 overflow-y-auto p-1.5 space-y-2">
            {(() => {
              const catOrder = ["title", "school", "experience", "club"];
              const catLabel: Record<string, ReactNode> = {
                title: <span className="flex items-center gap-1"><Icon name="tag" size={10} /> 称号/头衔</span>,
                school: <span className="flex items-center gap-1"><Icon name="building" size={10} /> 学校/学园</span>,
                experience: <span className="flex items-center gap-1"><Icon name="clipboard" size={10} /> 经历/履历</span>,
                club: <span className="flex items-center gap-1"><Icon name="users" size={10} /> 俱乐部/队伍</span>,
              };
              const grouped = new Map<string, ClassifyGroup[]>();
              for (const g of groups) {
                const cat = g.category || "club";
                if (!grouped.has(cat)) grouped.set(cat, []);
                grouped.get(cat)!.push(g);
              }
              return catOrder.filter(c => grouped.has(c)).map(cat => (
                <div key={cat}>
                  <div className="text-[10px] text-[var(--nv-text-secondary)] px-1 mb-0.5 font-medium">
                    {catLabel[cat] || cat}
                  </div>
                  {grouped.get(cat)!.map(g => {
                    const sel = selections.get(g.label) || new Set<string>();
                    const allSelected = g.memberIds.length > 0 && sel.size === g.memberIds.length;
                    return (
                      <div key={g.label} className="mb-1 rounded bg-[var(--nv-surface-2)] border border-[var(--nv-border-1)]">
                        {/* 分类头：全选/取消 */}
                        <button
                          onClick={() => onToggleGroup(g.label)}
                          className="w-full flex items-center gap-1.5 px-2 py-1 text-left hover:bg-[var(--nv-surface-3)] transition-colors rounded-t"
                        >
                          <span className={`text-xs ${allSelected ? "text-[var(--nv-creative)]" : "text-[var(--nv-text-tertiary)]"}`}>
                            {allSelected ? <Icon name="check" size={12} /> : <Icon name="circle" size={12} />}
                          </span>
                          <span className="text-[11px] text-[var(--nv-text-primary)] font-medium">{g.label}</span>
                          {g.description && (
                            <span className="text-[9px] text-[var(--nv-text-secondary)]">— {g.description}</span>
                          )}
                          <span className="text-[9px] text-[var(--nv-text-tertiary)] ml-auto">
                            {sel.size}/{g.memberIds.length}
                          </span>
                        </button>
                        {/* 成员列表 */}
                        <div className="flex flex-wrap gap-0.5 px-2 pb-1.5">
                          {g.members.map((name, i) => {
                            const mid = g.memberIds[i];
                            const checked = mid ? sel.has(mid) : false;
                            // 名字 → 角色 brief
                            const char = characters.find(c => c.id === mid);
                            return (
                              <button
                                key={mid || name}
                                onClick={() => mid && onToggleMember(g.label, mid)}
                                className={`text-[9px] px-1.5 py-0.5 rounded-full transition-colors ${
                                  checked
                                    ? "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] border border-[var(--nv-creative-soft)]"
                                    : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] border border-transparent"
                                }`}
                              >
                                {name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ));
            })()}
          </div>
          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-2 py-1.5 bg-[var(--nv-surface-2)] border-t border-[var(--nv-border-1)]">
            <span className="text-[9px] text-[var(--nv-text-tertiary)]">
              {selectedTagCount} 个标签分配给 {selectedCharIds.size} 人
            </span>
            <div className="flex gap-1">
              <button
                onClick={onClose}
                className="text-[10px] px-2 py-0.5 rounded text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"
              >
                取消
              </button>
              <button
                onClick={onApply}
                disabled={selectedTagCount === 0 || applying}
                className={`text-[10px] px-3 py-0.5 rounded font-medium transition-colors ${
                  selectedTagCount > 0 && !applying
                    ? "bg-[var(--nv-creative)] text-[var(--nv-text-primary)] hover:bg-[var(--nv-creative)]"
                    : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] cursor-not-allowed"
                }`}
              >
                {applying ? <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" />应用中…</span> : <span className="flex items-center gap-1"><Icon name="check" size={10} />应用标签 ({selectedTagCount})</span>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 分类错误/简单结果 */}
      {!classifying && !groups && result && (
        <div className={`mb-2 px-2 py-1 rounded text-[10px] ${
          result.ok
            ? "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] border border-[var(--nv-creative-soft)]"
            : "bg-[var(--nv-danger-soft)] text-[var(--nv-danger)] border border-[var(--nv-danger-soft)]"
        }`}>
          {result.message}
          <button onClick={onResultClose} className="ml-2 text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"><Icon name="x" size={12} className="align-middle" /></button>
        </div>
      )}
    </>
  );
}
