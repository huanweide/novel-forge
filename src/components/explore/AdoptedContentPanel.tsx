"use client";

import Link from "next/link";
import type { AdoptedItem } from "@/core/explore/types";
import { STEP_LABELS, STEP_ICONS } from "@/core/explore/types";
import { Icon } from "@/components/ui/icons";

interface Props {
  adopted: AdoptedItem[];
  onRemove: (id: string) => void;
  creating: boolean;
  createdProjectId: string | null;
  onCreateProject: (mode: "direct" | "ai_refine") => void;
}

export function AdoptedContentPanel({
  adopted,
  onRemove,
  creating,
  createdProjectId,
  onCreateProject,
}: Props) {
  const grouped: Record<string, AdoptedItem[]> = {};
  for (const item of adopted) {
    if (!grouped[item.step]) grouped[item.step] = [];
    grouped[item.step].push(item);
  }

  return (
    <div className="p-4 flex flex-col h-full">
      {/* 头部 */}
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1 h-3.5 rounded-full bg-success/60" />
        <h3 className="text-xs font-semibold text-[var(--nv-text-secondary)] tracking-wider uppercase">
          已采纳内容
        </h3>
        {adopted.length > 0 && (
          <span className="text-[10px] text-[var(--nv-text-muted)] ml-auto">
            {adopted.length} 项
          </span>
        )}
      </div>

      {/* 采纳列表 */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-1">
        {adopted.length === 0 ? (
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
          Object.entries(grouped).map(([step, items]) => (
            <div key={step}>
              <div className="text-[10px] text-[var(--nv-text-muted)] font-medium mb-1.5 flex items-center gap-1.5">
                <span>{STEP_ICONS[step as keyof typeof STEP_ICONS]}</span>
                <span>{STEP_LABELS[step as keyof typeof STEP_LABELS]}</span>
                <span className="text-[var(--nv-text-primary)]">· {items.length}</span>
              </div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="mb-1.5 p-3 rounded-xl bg-[var(--nv-surface-2)] border border-[var(--nv-border-2)] hover:border-[var(--nv-border-2)] transition-all duration-200 group relative"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-[11px] font-medium text-[var(--nv-text-secondary)] leading-tight">
                      {item.title}
                    </span>
                    <button
                      onClick={() => onRemove(item.id)}
                      className="text-[var(--nv-text-muted)] hover:text-danger opacity-0 group-hover:opacity-100 transition-all duration-200 text-xs shrink-0 hover:scale-110"
                    >
                      <Icon name="x" size={15} className="inline-block align-text-bottom shrink-0" />
                                                  </button>
                  </div>
                  <p className="text-[10px] text-[var(--nv-text-muted)] mt-1 line-clamp-2 leading-relaxed">
                    {item.content.slice(0, 80)}
                  </p>
                </div>
              ))}
            </div>
          ))
        )}

        {/* 统计 */}
        {adopted.length > 0 && (
          <div className="text-[10px] text-[var(--nv-text-muted)] pt-3 border-t border-[var(--nv-border-2)] flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[var(--nv-surface-2)]" />
            共 {adopted.length} 条 · {Object.keys(grouped).length} 个步骤
          </div>
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
