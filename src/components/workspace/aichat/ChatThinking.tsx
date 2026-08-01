import { Icon } from "@/components/ui/icons";
import type { PendingStep } from "./types";

interface ChatThinkingProps {
  loading: boolean;
  pendingSteps: PendingStep[];
  stepIdx: number;
  onCancel: () => void;
}

export function ChatThinking({ loading, pendingSteps, stepIdx, onCancel }: ChatThinkingProps) {
  if (!loading) return null;

  // ── 加载中但还没步骤 ──
  if (pendingSteps.length === 0) {
    return (
      <div className="px-3 py-3 border-b border-[var(--nv-border-1)] bg-[var(--nv-primary-soft)]">
        <div className="flex items-center gap-3">
          <div className="relative w-5 h-5 shrink-0">
            <div className="absolute inset-0 rounded-full border-2 border-[var(--nv-primary-soft)]" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--nv-primary)] animate-spin" />
          </div>
          <span className="text-xs text-[var(--nv-primary)]">正在思考…</span>
          <button
            onClick={onCancel}
            className="ml-auto text-[10px] px-2 py-0.5 rounded border border-[var(--nv-danger-soft)] text-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] transition-colors"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  // ── 思考动画——实时展示工具调用 ──
  return (
    <div className="px-3 py-3 border-b border-[var(--nv-border-1)] bg-[var(--nv-primary-soft)]">
      <div className="flex items-center gap-3 mb-2">
        <div className="relative w-5 h-5 shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--nv-primary-soft)]" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--nv-primary)] animate-spin" />
        </div>
        <span className="text-xs text-[var(--nv-primary)] font-medium">正在思考</span>
        <button
          onClick={onCancel}
          className="ml-auto text-[10px] px-2 py-0.5 rounded border border-[var(--nv-danger-soft)] text-[var(--nv-danger)] hover:bg-[var(--nv-danger-soft)] transition-colors"
        >
          取消
        </button>
      </div>
      {/* 步骤列表 */}
      <div className="space-y-1">
        {pendingSteps.map((step, i) => (
          <div
            key={i}
            className={`text-[10px] flex items-center gap-1.5 transition-opacity duration-300 ${
              i === stepIdx && pendingSteps.length > 1 ? "text-[var(--nv-primary)] font-medium" : "text-[var(--nv-text-secondary)]"
            }`}
          >
            <span className={step.done ? "text-[var(--nv-success)]" : (i === stepIdx ? "text-[var(--nv-primary)] animate-pulse" : "text-[var(--nv-border-3)]")}>
              {step.done ? <Icon name="check" size={11} /> : <Icon name="refresh" size={11} className="animate-spin" />}
            </span>
            {step.text}
          </div>
        ))}
      </div>
    </div>
  );
}
