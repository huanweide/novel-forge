"use client";

import type { AdoptCard, ExploreStep } from "@/core/explore/types";
import { EXPLORE_STEPS, STEP_LABELS, STEP_LUCIDE } from "@/core/explore/types";
import { Icon } from "@/components/ui/icons";

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
          <span className="w-1 h-3.5 rounded-full bg-[var(--nv-creative)]/60 shadow-[0_0_8px_var(--nv-creative-soft)]" />
          <span className="text-xs font-semibold text-[var(--nv-text-secondary)]">
            {totalCards} 张设定卡片
          </span>
          <span className="text-[10px] text-[var(--nv-text-muted)]">点击采纳写入项目</span>
        </div>
        <button
          onClick={onAdoptAll}
          className="text-[10px] px-3 py-1 rounded-lg bg-success/15 text-success border border-success/20 hover:bg-success/20 hover:border-success/30 transition-all duration-200 active:scale-95 font-medium"
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
                <Icon name={STEP_LUCIDE[step]} size={12} className="shrink-0" />
                <span>{STEP_LABELS[step]}</span>
                <span className="text-[var(--nv-text-primary)]">({cards.length})</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {cards.map((card, i) => {
                  const status = adoptStatus[card.id];
                  const active =
                    !status || (status !== "writing" && status !== "adopted");
                  return (
                    <button
                      key={card.id}
                      onClick={() => active && onAdoptCard(card)}
                      disabled={!active}
                      style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      className={`text-left p-2.5 rounded-xl border transition-all duration-200 animate-[nf-card-in_0.4s_ease-out_both] ${
                        status === "adopted"
                          ? "bg-success/[0.04] border-success/15 animate-[nf-adopt-flash_0.6s_ease-out]"
                          : status === "failed"
                            ? "bg-danger/[0.04] border-danger/15"
                            : status === "writing"
                              ? "bg-warning/[0.04] border-warning/15 animate-pulse"
                              : "bg-[var(--nv-surface-2)] border-[var(--nv-border-2)] hover:border-[var(--nv-creative)]/30 hover:bg-[var(--nv-surface-2)] hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(228,184,99,0.12)] active:scale-[0.98]"
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--nv-text-secondary)] truncate" title={card.title}>
                          {card.title}
                        </span>
                        {status === "writing" && (
                          <Icon name="loader" size={11} className="animate-spin text-warning shrink-0" />
                        )}
                        {status === "adopted" && (
                          <span className="text-[9px] text-success shrink-0 flex items-center gap-0.5">
                            <Icon name="check" size={10} /> 已采纳
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
