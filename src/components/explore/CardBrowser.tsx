"use client";

import type { AdoptCard, ExploreStep } from "@/core/explore/types";
import { EXPLORE_STEPS, STEP_LABELS, STEP_ICONS } from "@/core/explore/types";

interface Props {
  allCards: Record<string, AdoptCard[]>;
  adoptStatus: Record<string, string>;
  onAdoptCard: (card: AdoptCard) => void;
  onAdoptAll: () => void;
}

export function CardBrowser({
  allCards,
  adoptStatus,
  onAdoptCard,
  onAdoptAll,
}: Props) {
  const stepKeys = Object.keys(allCards).filter(
    (k) => allCards[k]?.length > 0,
  );
  if (stepKeys.length === 0) return null;

  const totalCards = Object.values(allCards).flat().length;

  return (
    <div className="border-t border-[var(--nv-border-2)] bg-[var(--nv-void)]/80 backdrop-blur-sm">
      {/* 头部 */}
      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="w-1 h-3.5 rounded-full bg-purple-400/60" />
          <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">
            {totalCards} 张设定卡片
          </span>
          <span className="text-[10px] text-[var(--nv-text-muted)]">点击采纳写入项目</span>
        </div>
        <button
          onClick={onAdoptAll}
          className="text-[10px] px-3 py-1 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-400/30 transition-all duration-200 active:scale-95 font-medium"
        >
          全部采纳
        </button>
      </div>

      {/* 卡片列表 */}
      <div className="px-4 pb-3 max-h-64 overflow-y-auto space-y-3">
        {EXPLORE_STEPS.map((step) => {
          const cards = allCards[step];
          if (!cards || cards.length === 0) return null;
          return (
            <div key={step}>
              <div className="text-[10px] text-[var(--nv-text-muted)] font-medium mb-1.5 flex items-center gap-1.5">
                <span>{STEP_ICONS[step]}</span>
                <span>{STEP_LABELS[step]}</span>
                <span className="text-[var(--nv-text-primary)]">({cards.length})</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {cards.map((card) => {
                  const status = adoptStatus[card.id];
                  const active =
                    !status || (status !== "writing" && !status.startsWith("✅"));
                  return (
                    <button
                      key={card.id}
                      onClick={() => active && onAdoptCard(card)}
                      disabled={!active}
                      className={`text-left p-2.5 rounded-xl border transition-all duration-200 ${
                        status?.startsWith("✅")
                          ? "bg-emerald-500/[0.04] border-emerald-500/15"
                          : status === "❌失败"
                            ? "bg-red-500/[0.04] border-red-500/15"
                            : status === "writing"
                              ? "bg-amber-500/[0.04] border-amber-500/15 animate-pulse"
                              : "bg-[var(--nv-surface-2)] border-[var(--nv-border-2)] hover:border-purple-400/25 hover:bg-[var(--nv-surface-2)] hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--nv-text-secondary)] truncate">
                          {card.title}
                        </span>
                        {status === "writing" && (
                          <span className="text-[9px] text-amber-400 animate-pulse shrink-0">
                            ⏳
                          </span>
                        )}
                        {status?.startsWith("✅") && (
                          <span className="text-[9px] text-emerald-400 shrink-0">
                            {status}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-[var(--nv-text-muted)] mt-1 line-clamp-2 leading-relaxed">
                        {card.content}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
