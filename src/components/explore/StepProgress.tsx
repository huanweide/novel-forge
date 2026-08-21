"use client";

import { EXPLORE_STEPS, STEP_LABELS } from "@/core/explore/types";
import type { ExploreStep, AdoptedItem } from "@/core/explore/types";

interface Props {
  currentStep: ExploreStep;
  /** 已采纳列表——按真实采纳数判定"完成"，不再仅靠 currentIdx */
  adopted: AdoptedItem[];
  onStepChange: (step: ExploreStep) => void;
}

/** 10 步正式流程（不含 free_talk）—— done 链跳的依据 */
const ORDERED_STEPS = EXPLORE_STEPS.filter((s) => s !== "free_talk") as readonly ExploreStep[];
const FREE_TALK: ExploreStep = "free_talk";

/**
 * 探讨模式 11 步进度条：
 * - 每步右侧显示该 step 的已采纳数（如"1"），0 不显示
 * - 已完成步骤（count>0）= 成功色 + ✓
 * - 点击已完成步骤 = 跳到下一步（"切换至世界观讨论"那种链式）；点最后一步 → 跳到自由讨论
 * - 点击未完成步骤 = 切到该步（与旧行为一致）
 * - 自由讨论步骤始终创意色（独立终点，欢迎随时进）
 * - 当 10 步全完成时，自由讨论步骤变"🎉 全部完成"创意完成态
 */
export function StepProgress({ currentStep, adopted, onStepChange }: Props) {
  // 每步已采纳数（防御：localStorage 可能恢复破损数据 → 非 array）
  const counts: Record<string, number> = {};
  const adoptedList = Array.isArray(adopted) ? adopted : [];
  for (const a of adoptedList) {
    counts[a.step] = (counts[a.step] || 0) + 1;
  }

  const orderedDone = ORDERED_STEPS.every((s) => (counts[s] || 0) > 0);
  const freeTalkCount = counts[FREE_TALK] || 0;

  const handleClick = (step: ExploreStep) => {
    if (step === FREE_TALK) {
      onStepChange(FREE_TALK);
      return;
    }
    const idx = ORDERED_STEPS.indexOf(step);
    const count = counts[step] || 0;
    if (idx >= 0 && count > 0) {
      // 已完成 → 跳到下一步（chain 效果）
      if (idx < ORDERED_STEPS.length - 1) {
        onStepChange(ORDERED_STEPS[idx + 1]);
      } else {
        onStepChange(FREE_TALK);
      }
    } else {
      onStepChange(step);
    }
  };

  return (
    <div className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/50 backdrop-blur-sm px-4 py-2.5 shrink-0">
      <div className="flex items-center justify-start gap-0.5 overflow-x-auto">
        {EXPLORE_STEPS.map((step, i) => {
          const count = counts[step] || 0;
          const done = count > 0;
          const active = currentStep === step;
          const isFree = step === FREE_TALK;
          const allDone = isFree && orderedDone;

          // 跳转提示（hover title）：已完成时显示"→ 切到 X"
          const nextLabel = (() => {
            if (isFree) return "什么都能聊的自由讨论";
            const idx = ORDERED_STEPS.indexOf(step);
            if (idx < 0) return STEP_LABELS[step];
            if (idx < ORDERED_STEPS.length - 1) return `已完成 ${count} 条 · 点击切换至「${STEP_LABELS[ORDERED_STEPS[idx + 1]]}」`;
            return `已完成 ${count} 条 · 点击切换至「自由讨论」`;
          })();

          // 样式分支（active / allDone / done / free / pending）
          const buttonClass = active
            ? isFree
              ? "bg-[var(--nv-creative)]/20 text-[var(--nv-creative)] border-[var(--nv-creative)]/40 shadow-[0_0_14px_var(--nv-creative-soft)]"
              : "bg-[var(--nv-primary)]/15 text-[var(--nv-primary)] border-[var(--nv-primary)]/40 shadow-[0_0_14px_rgba(99,102,241,0.18)]"
            : allDone
              ? "bg-[var(--nv-creative)]/15 text-[var(--nv-creative)] border-[var(--nv-creative)]/30"
              : done
                ? "text-[var(--nv-success)] border-[var(--nv-success)]/20 hover:border-[var(--nv-success)]/40 hover:bg-[var(--nv-success)]/5"
                : isFree
                  ? "text-[var(--nv-creative)]/80 border-[var(--nv-creative)]/20 hover:border-[var(--nv-creative)]/40 hover:bg-[var(--nv-creative)]/5"
                  : "text-[var(--nv-text-muted)] border-transparent hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]";

          const dotClass = active
            ? isFree
              ? "bg-[var(--nv-creative)] text-white shadow-[0_0_8px_var(--nv-creative-soft)]"
              : "bg-[var(--nv-primary)] text-white shadow-[0_0_8px_rgba(99,102,241,0.4)]"
            : allDone
              ? "bg-[var(--nv-creative)] text-white"
              : done
                ? "bg-[var(--nv-success)]/20 text-[var(--nv-success)]"
                : isFree
                  ? "bg-[var(--nv-creative)]/15 text-[var(--nv-creative)]"
                  : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)]";

          return (
            <div key={step} className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => handleClick(step)}
                title={nextLabel}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-200 border ${buttonClass}`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 transition-all duration-200 ${dotClass}`}
                >
                  {allDone ? "🎉" : done ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline whitespace-nowrap">{STEP_LABELS[step]}</span>
                {count > 0 && (
                  <span
                    className={`text-[9px] font-bold px-1 py-px rounded-full leading-tight ${
                      isFree
                        ? "bg-[var(--nv-creative)]/20 text-[var(--nv-creative)]"
                        : "bg-[var(--nv-success)]/20 text-[var(--nv-success)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
              {i < EXPLORE_STEPS.length - 1 && (
                <span
                  className={`w-3 h-px shrink-0 transition-colors duration-300 ${
                    done ? "bg-[var(--nv-success)]/40" : "bg-[var(--nv-border-2)]"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
