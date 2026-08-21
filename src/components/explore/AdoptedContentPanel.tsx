"use client";

import { useState } from "react";
import Link from "next/link";
import type { AdoptedItem } from "@/core/explore/types";
import { STEP_LABELS, STEP_LUCIDE } from "@/core/explore/types";
import { Icon } from "@/components/ui/icons";

interface Props {
  adopted: AdoptedItem[];
  /** AI 一键构筑生成的「待确认」项——可视化展示，确认后才落库 */
  pendingItems?: AdoptedItem[];
  onRemove: (id: string) => void;
  onRemovePending?: (id: string) => void;
  onEditItem?: (id: string, patch: Partial<Pick<AdoptedItem, "title" | "content">>) => void;
  onEditPending?: (id: string, patch: Partial<Pick<AdoptedItem, "title" | "content">>) => void;
  onDeepDive?: (item: AdoptedItem) => void;
  creating: boolean;
  createdProjectId: string | null;
  onCreateProject: (mode: "direct" | "ai_refine") => void;
}

export function AdoptedContentPanel({
  adopted,
  pendingItems = [],
  onRemove,
  onRemovePending,
  onEditItem,
  onEditPending,
  onDeepDive,
  creating,
  createdProjectId,
  onCreateProject,
}: Props) {
  const grouped: Record<string, AdoptedItem[]> = {};
  for (const item of adopted) {
    if (!grouped[item.step]) grouped[item.step] = [];
    grouped[item.step].push(item);
  }

  const total = adopted.length + pendingItems.length;

  return (
    <div className="p-4 flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 rounded-full bg-success/60" />
        <h3 className="text-xs font-semibold text-[var(--nv-text-secondary)] tracking-wider uppercase">
          已导入设定
        </h3>
        {total > 0 && (
          <span className="text-[10px] text-[var(--nv-text-muted)] ml-auto">
            {total} 项
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {/* ── AI 一键构筑待确认区 ── */}
        {pendingItems.length > 0 && (
          <div className="rounded-xl border border-[var(--nv-creative)]/30 bg-[var(--nv-creative)]/[0.06] p-3 space-y-2 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[var(--nv-creative)]/20 border border-[var(--nv-creative)]/40">
                <Icon name="sparkles" size={10} className="text-[var(--nv-creative)]" />
              </span>
              <span className="text-[11px] font-bold text-[var(--nv-creative)]">AI 构筑结果 · 待确认</span>
              <span className="text-[10px] text-[var(--nv-text-muted)] ml-auto">{pendingItems.length} 项</span>
            </div>
            <p className="text-[10px] text-[var(--nv-text-tertiary)] leading-relaxed">
              已按你的方向生成全部设定。核对无误后，在中间「确认写入项目」落库；可逐条编辑或移除。
            </p>
            <div className="space-y-1.5 pt-1">
              {pendingItems.map((item) => (
                <PendingItem
                  key={item.id}
                  item={item}
                  onRemove={onRemovePending ? () => onRemovePending(item.id) : undefined}
                  onEdit={onEditPending ? (patch) => onEditPending(item.id, patch) : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* ── 已采纳列表 ── */}
        {adopted.length === 0 && pendingItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] flex items-center justify-center mb-3">
              <Icon name="inbox" size={28} className="text-[var(--nv-text-primary)]" />
            </div>
            <p className="text-xs text-[var(--nv-text-muted)]">还没聊出任何设定</p>
            <p className="text-[10px] text-[var(--nv-text-primary)] mt-1.5 leading-relaxed max-w-[180px]">
              在左侧和 AI 把世界观、角色聊清楚，采纳的内容会汇聚到这里，再进入写作台写正文
            </p>
          </div>
        ) : (
          <>
            {Object.entries(grouped).map(([step, items]) => (
              <div key={step}>
                <div className="text-[10px] text-[var(--nv-text-muted)] font-medium mb-1.5 flex items-center gap-1.5">
                  <Icon name={STEP_LUCIDE[step as keyof typeof STEP_LUCIDE]} size={12} className="shrink-0" />
                  <span>{STEP_LABELS[step as keyof typeof STEP_LABELS]}</span>
                  <span className="text-[var(--nv-text-primary)]">· {items.length}</span>
                </div>
                {items.map((item) => (
                  <AdoptedItemCard
                    key={item.id}
                    item={item}
                    onRemove={() => onRemove(item.id)}
                    onDeepDive={onDeepDive}
                    onEdit={onEditItem ? (patch) => onEditItem(item.id, patch) : undefined}
                  />
                ))}
              </div>
            ))}
            {adopted.length > 0 && (
              <div className="text-[10px] text-[var(--nv-text-muted)] pt-3 border-t border-[var(--nv-border-2)] flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-[var(--nv-surface-2)]" />
                共 {adopted.length} 条已采纳 · {Object.keys(grouped).length} 个步骤
              </div>
            )}
          </>
        )}
      </div>

      {/* 底部操作 */}
      <div className="border-t border-[var(--nv-border-2)] pt-4 space-y-2 shrink-0">
        {createdProjectId ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-success" />
              <span className="text-xs text-success font-medium">
                项目运行中
              </span>
            </div>
              <Link
                href={`/workspace/${createdProjectId}`}
                className="btn-success w-full py-3 text-xs font-semibold text-center block rounded-xl active:scale-[0.98]"
              >
                进入写作台 →
              </Link>
            <button
              onClick={() => onCreateProject("ai_refine")}
              disabled={creating || adopted.length === 0}
              className={`w-full py-2.5 rounded-xl text-xs font-medium active:scale-[0.98] ${
                creating || adopted.length === 0
                  ? "btn-ghost opacity-60 cursor-not-allowed"
                  : "btn-creative"
              }`}
            >
              {creating ? <span className="flex items-center gap-1"><Icon name="loader" size={12} className="animate-spin" /> 完善中...</span> : <span className="flex items-center gap-1"><Icon name="bot" size={13} /> AI补充缺失设定</span>}
            </button>
          </div>
        ) : (
          <>
            <p className="text-[9px] text-[var(--nv-text-muted)] text-center">
              先和 AI 聊出设定并采纳，再进入写作台
            </p>
            <button
              onClick={() => onCreateProject("direct")}
              disabled={creating || adopted.length === 0}
              className={`w-full py-3 rounded-xl text-xs font-semibold active:scale-[0.98] ${
                creating || adopted.length === 0
                  ? "btn-ghost opacity-60 cursor-not-allowed"
                  : "btn-primary"
              }`}
            >
              {creating ? <span className="flex items-center gap-1"><Icon name="loader" size={12} className="animate-spin" /> 创建中...</span> : <span className="flex items-center gap-1"><Icon name="pencil" size={13} /> 进入写作台 · 开始写小说</span>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─── 已采纳项卡片（支持行内编辑 / 删除 / 深入探讨） ──
function AdoptedItemCard({
  item,
  onRemove,
  onDeepDive,
  onEdit,
}: {
  item: AdoptedItem;
  onRemove: () => void;
  onDeepDive?: (item: AdoptedItem) => void;
  onEdit?: (patch: Partial<Pick<AdoptedItem, "title" | "content">>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftContent, setDraftContent] = useState(item.content);

  const save = () => {
    onEdit?.({ title: draftTitle.trim() || item.title, content: draftContent });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="mb-1.5 p-3 rounded-xl bg-[var(--nv-surface-2)] border border-[var(--nv-primary)]/40 transition-all duration-200">
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          maxLength={60}
          className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-primary)]/40 mb-1.5"
          aria-label="编辑标题"
        />
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={4}
          className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg px-2.5 py-1.5 text-[10px] text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-primary)]/40 resize-none mb-2"
          aria-label="编辑内容"
        />
        <div className="flex items-center justify-end gap-1.5">
          <button
            onClick={() => setEditing(false)}
            className="text-[10px] px-2.5 py-1 rounded-lg btn-ghost"
          >
            取消
          </button>
          <button
            onClick={save}
            className="text-[10px] px-2.5 py-1 rounded-lg bg-[var(--nv-primary)]/15 text-[var(--nv-primary)] border border-[var(--nv-primary)]/30 hover:bg-[var(--nv-primary)]/25 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-1.5 p-3 rounded-xl bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] hover:border-[var(--nv-primary)]/30 transition-all duration-200 group relative">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--nv-text-secondary)] leading-tight">
          {item.title}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {onDeepDive && (
            <button
              onClick={() => onDeepDive(item)}
              title="深入探讨这个设定"
              aria-label="深入探讨"
              className="text-[var(--nv-text-muted)] hover:text-[var(--nv-primary)] opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
            >
              <Icon name="message" size={13} className="inline-block align-text-bottom" />
            </button>
          )}
          {onEdit && (
            <button
              onClick={() => {
                setDraftTitle(item.title);
                setDraftContent(item.content);
                setEditing(true);
              }}
              title="编辑"
              aria-label="编辑"
              className="text-[var(--nv-text-muted)] hover:text-[var(--nv-primary)] opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
            >
              <Icon name="pencil" size={12} className="inline-block align-text-bottom" />
            </button>
          )}
          <button
            onClick={onRemove}
            title="移除"
            aria-label="移除"
            className="text-[var(--nv-text-muted)] hover:text-danger opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
          >
            <Icon name="x" size={15} className="inline-block align-text-bottom" />
          </button>
        </div>
      </div>
      <p className="text-[10px] text-[var(--nv-text-muted)] mt-1 line-clamp-3 leading-relaxed">
        {item.content.slice(0, 140)}
      </p>
      {onDeepDive && (
        <button
          onClick={() => onDeepDive(item)}
          className="mt-2 w-full text-[10px] text-[var(--nv-primary)]/80 hover:text-[var(--nv-primary)] border border-[var(--nv-primary)]/20 hover:border-[var(--nv-primary)]/40 rounded-lg py-1.5 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-1"
        >
          <Icon name="message" size={11} /> 深入探讨
        </button>
      )}
    </div>
  );
}

// ─── AI 构筑待确认项（可编辑/移除，不可深入探讨） ──
function PendingItem({
  item,
  onRemove,
  onEdit,
}: {
  item: AdoptedItem;
  onRemove?: () => void;
  onEdit?: (patch: Partial<Pick<AdoptedItem, "title" | "content">>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(item.title);
  const [draftContent, setDraftContent] = useState(item.content);

  const save = () => {
    onEdit?.({ title: draftTitle.trim() || item.title, content: draftContent });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="p-2.5 rounded-lg bg-[var(--nv-surface-2)] border border-[var(--nv-creative)]/40">
        <input
          autoFocus
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          maxLength={60}
          className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg px-2 py-1.5 text-[11px] font-medium text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-creative)]/40 mb-1.5"
          aria-label="编辑标题"
        />
        <textarea
          value={draftContent}
          onChange={(e) => setDraftContent(e.target.value)}
          rows={3}
          className="w-full bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] rounded-lg px-2 py-1.5 text-[10px] text-[var(--nv-text-secondary)] focus:outline-none focus:border-[var(--nv-creative)]/40 resize-none mb-2"
          aria-label="编辑内容"
        />
        <div className="flex items-center justify-end gap-1.5">
          <button onClick={() => setEditing(false)} className="text-[10px] px-2 py-1 rounded-lg btn-ghost">取消</button>
          <button onClick={save} className="text-[10px] px-2 py-1 rounded-lg bg-[var(--nv-creative)]/15 text-[var(--nv-creative)] border border-[var(--nv-creative)]/30 hover:bg-[var(--nv-creative)]/25 transition-colors">保存</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-2.5 rounded-lg bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] hover:border-[var(--nv-creative)]/30 transition-all duration-200 group relative">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] font-medium text-[var(--nv-text-secondary)] leading-tight">{item.title}</span>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              onClick={() => { setDraftTitle(item.title); setDraftContent(item.content); setEditing(true); }}
              title="编辑"
              aria-label="编辑"
              className="text-[var(--nv-text-muted)] hover:text-[var(--nv-creative)] opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
            >
              <Icon name="pencil" size={12} className="inline-block align-text-bottom" />
            </button>
          )}
          {onRemove && (
            <button
              onClick={onRemove}
              title="移除"
              aria-label="移除"
              className="text-[var(--nv-text-muted)] hover:text-danger opacity-0 group-hover:opacity-100 transition-all duration-200 hover:scale-110"
            >
              <Icon name="x" size={15} className="inline-block align-text-bottom" />
            </button>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--nv-text-tertiary)] mt-1 line-clamp-2 leading-relaxed">
        {item.content.slice(0, 140)}
      </p>
    </div>
  );
}
