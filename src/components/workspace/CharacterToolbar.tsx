"use client";

import { Icon } from "@/components/ui/icons";
import { RangeSelector } from "./RangeSelector";

/**
 * 角色面板工具条（v2.0.4）
 * - 移除「自动分类」（改由 LLM 检测 + 玩家自建标签）；
 * - 所有按钮统一尺寸 / 边框 / 圆角，仅激活 / 禁用态用各自语义色，保证视觉一致性。
 */
export function CharacterToolbar({
  filtered,
  selectedIds,
  allInViewSelected,
  expanding,
  expandDone,
  expandTotal,
  deduping,
  onToggleAll,
  onExpand,
  onDedupe,
  onRange,
  onClear,
  // v2.0.14：自建标签输入与打标——移入工具栏保持同一 base 样式
  newTag,
  onNewTagChange,
  onApplyTags,
  applying,
  selectedCount,
}: {
  filtered: { id: string }[];
  selectedIds: Set<string>;
  allInViewSelected: boolean;
  expanding: boolean;
  expandDone: number;
  expandTotal: number;
  deduping: boolean;
  onToggleAll: () => void;
  onExpand: () => void;
  onDedupe: () => void;
  onRange: (indices: Set<number>) => void;
  onClear: () => void;
  // v2.0.14：自建标签输入与打标
  newTag: string;
  onNewTagChange: (v: string) => void;
  onApplyTags: () => void;
  applying: boolean;
  selectedCount: number;
}) {
  // 统一的按钮基础样式：相同 padding / 边框 / 圆角 / 字号
  const base =
    "text-xs px-2 py-0.5 rounded border transition-colors inline-flex items-center gap-1";
  const neutral =
    "border-[var(--nv-border-1)] text-[var(--nv-text-secondary)] hover:border-[var(--nv-border-2)] hover:text-[var(--nv-text-primary)]";
  const disabled =
    "border-[var(--nv-border-1)] text-[var(--nv-text-tertiary)] cursor-not-allowed";

  return (
    <div className="flex items-center gap-1 mb-2 px-1 flex-wrap">
      <button onClick={onToggleAll} className={`${base} ${neutral}`}>
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
        className={`${base} ${selectedIds.size > 0 && !expanding ? "border-[var(--nv-accent-soft)] text-[var(--nv-accent)] hover:border-[var(--nv-accent)]" : disabled}`}
      >
        {expanding ? (
          <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" />{expandDone}/{expandTotal}</span>
        ) : (
          <span className="flex items-center gap-1"><Icon name="sparkles" size={10} className="text-[var(--nv-accent)]" />AI扩展 ({selectedIds.size})</span>
        )}
      </button>
      <button
        onClick={onDedupe}
        disabled={deduping}
        className={`${base} ${deduping ? "border-[var(--nv-border-1)] text-[var(--nv-text-tertiary)] cursor-not-allowed" : neutral}`}
        title="扫描全部角色卡：① 合并同一真实人物（昵称 / 尊称 / 错别字变体，由 AI 判定并接管别名与关系，被并卡软删标记「🗂 已合并」）；② 标记出场极少的龙套（🎭 龙套，仅打标签不删除）。批量写作后默认自动跑，此按钮用于手动补救。"
      >
        {deduping ? (
          <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" /> 去重中…</span>
        ) : (
          <span className="flex items-center gap-1">自动去重合并</span>
        )}
      </button>
      {selectedIds.size > 0 && !expanding && (
        <button onClick={onClear} className={`${base} ${neutral}`}>
          清空
        </button>
      )}
      {/* v2.0.14：自建标签——输入标签名，把勾选角色打上新标签（并集，不抹旧标签），复用 base 样式保持视觉一致 */}
      <input
        value={newTag}
        onChange={(e) => onNewTagChange(e.target.value)}
        placeholder="新建标签名（如：龙陨卫）"
        className="text-xs px-2 py-0.5 rounded border border-[var(--nv-border-1)] bg-transparent text-[var(--nv-text-primary)] placeholder:text-[var(--nv-text-tertiary)] focus:outline-none focus:border-[var(--nv-primary)] w-36"
      />
      <button
        onClick={onApplyTags}
        disabled={applying || newTag.trim() === "" || selectedCount === 0}
        className={`${base} ${applying || newTag.trim() === "" || selectedCount === 0 ? disabled : "border-[var(--nv-primary-soft)] text-[var(--nv-primary)] hover:border-[var(--nv-primary)]"}`}
        title="把当前勾选的角色全部打上新标签；角色原有标签会保留（并集）"
      >
        {applying ? <span className="flex items-center gap-1"><Icon name="loader" size={10} className="animate-spin" />打标中…</span> : <span>打标到选中({selectedCount})</span>}
      </button>
    </div>
  );
}
