"use client";

import { EXPLORE_STEPS, STEP_LABELS } from "@/core/explore/types";
import type { ExploreStep } from "@/core/explore/types";

interface Props {
  currentStep: ExploreStep;
  onStepChange: (step: ExploreStep) => void;
}

/**
 * 探讨模式 11 步进度条——明确「正在进行 AI 探讨服务」的框架感，
 * 当前步高亮、已完成步打勾、步骤间连线，让用户清楚旅程进度。
 */
export function StepProgress({ currentStep, onStepChange }: Props) {
  const currentIdx = EXPLORE_STEPS.indexOf(currentStep);

  return (
    <div className="border-b border-[var(--nv-border-2)] bg-[var(--nv-void)]/50 backdrop-blur-sm px-4 py-2.5 shrink-0">
      <div className="flex items-center justify-start gap-0.5 overflow-x-auto">
        {EXPLORE_STEPS.map((step, i) => {
          const done = i < currentIdx;
          const active = i === currentIdx;
          return (
            <div key={step} className="flex items-center gap-0.5 shrink-0">
              <button
                onClick={() => onStepChange(step)}
                title={`第 ${i + 1} 步 · ${STEP_LABELS[step]}`}
                className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-all duration-200 border ${
                  active
                    ? "bg-[var(--nv-primary)]/15 text-[var(--nv-primary)] border-[var(--nv-primary)]/40 shadow-[0_0_14px_rgba(99,102,241,0.18)]"
                    : done
                      ? "text-[var(--nv-success)] border-[var(--nv-success)]/20 hover:border-[var(--nv-success)]/40 hover:bg-[var(--nv-success)]/5"
                      : "text-[var(--nv-text-muted)] border-transparent hover:text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)]"
                }`}
              >
                <span
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 transition-all duration-200 ${
                    active
                      ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)] shadow-[0_0_8px_rgba(99,102,241,0.4)]"
                      : done
                        ? "bg-[var(--nv-success)]/20 text-[var(--nv-success)]"
                        : "bg-[var(--nv-surface-2)] text-[var(--nv-text-muted)]"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline whitespace-nowrap">{STEP_LABELS[step]}</span>
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
