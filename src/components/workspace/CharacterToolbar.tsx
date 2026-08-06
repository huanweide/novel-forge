"use client";

import { Icon } from "@/components/ui/icons";
import { RangeSelector } from "./RangeSelector";

export function CharacterToolbar({
  filtered,
  selectedIds,
  allInViewSelected,
  expanding,
  expandDone,
  expandTotal,
  classifying,
  classifyDone,
  classifyTotal,
  deduping,
  onToggleAll,
  onExpand,
  onClassify,
  onDedupe,
  onRange,
  onClear,
}: {
  filtered: { id: string }[];
  selectedIds: Set<string>;
  allInViewSelected: boolean;
  expanding: boolean;
  expandDone: number;
  expandTotal: number;
  classifying: boolean;
  classifyDone: number;
  classifyTotal: number;
  deduping: boolean;
  onToggleAll: () => void;
  onExpand: () => void;
  onClassify: () => void;
  onDedupe: () => void;
  onRange: (indices: Set<number>) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1 mb-2 px-1 flex-wrap">
      <button
        onClick={onToggleAll}
        className="text-xs px-1.5 py-0.5 rounded text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)] border border-[var(--nv-border-1)] hover:border-[var(--nv-border-2)]"
      >
        {allInViewSelected ? "取消全选" : `全选(${filtered.length})`}
      </button>
      <RangeSelector
        total={filtered.length}
        placeholder={`1-${filtered.length}`}
        onSelect={onRange}
      />
      <button
        onClick={onExpand}
        disabled={selectedIds.size === 0 || expanding}
        className={`text-xs px-2 py-0.5 rounded transition-colors ${
          selectedIds.size > 0 && !expanding
            ? "bg-[var(--nv-accent-soft)] text-[var(--nv-accent)] hover:bg-[var(--nv-accent-soft)] border border-[var(--nv-accent-soft)]"
            : "text-[var(--nv-text-tertiary)] border border-[var(--nv-border-1)] cursor-not-allowed"
        }`}
      >
        {expanding ? <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" />{expandDone}/{expandTotal}</span> : <span className="flex items-center gap-1"><Icon name="sparkles" size={10} className="text-[var(--nv-accent)]" />AI扩展 ({selectedIds.size})</span>}
      </button>
      <button
        onClick={onClassify}
        disabled={classifying}
        className={`text-xs px-2 py-0.5 rounded transition-colors ${
          classifying
            ? "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] border border-[var(--nv-creative-soft)]"
            : "bg-[var(--nv-creative-soft)] text-[var(--nv-creative)] hover:bg-[var(--nv-creative-soft)] border border-[var(--nv-creative-soft)] hover:border-[var(--nv-creative-soft)]"
        }`}
      >
        {classifying ? <span className="flex items-center gap-1"><Icon name="tag" size={10} /> {classifyDone}/{classifyTotal || "?"}</span> : <span className="flex items-center gap-1"><Icon name="tag" size={10} /> 自动分类</span>}
      </button>
      <button
        onClick={onDedupe}
        disabled={deduping}
        className={`text-xs px-2 py-0.5 rounded transition-colors ${
          deduping
            ? "bg-[var(--nv-surface-3)] text-[var(--nv-text-tertiary)] border border-[var(--nv-border-1)]"
            : "bg-[var(--nv-surface-2)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-3)] border border-[var(--nv-border-1)] hover:border-[var(--nv-border-2)]"
        }`}
        title="扫描全部角色卡：① 合并同名/相似角色（小名、繁简、错别字变体归并到内容最丰富的角色，别名与关系一并接管，被并卡软删保留）；② 标记出场次数过少的龙套（出现<3次且无背景，仅打标签不删除，可在标签筛选中隐藏）。执行前先预览待合并/标记清单再确认。"
      >
        {deduping ? <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" /> 去重中…</span> : <span className="flex items-center gap-1">自动去重合并</span>}
      </button>
      {selectedIds.size > 0 && !expanding && (
        <button
          onClick={onClear}
          className="text-xs text-[var(--nv-text-secondary)] hover:text-[var(--nv-text-primary)]"
        >
          清空
        </button>
      )}
    </div>
  );
}
