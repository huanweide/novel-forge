"use client";

import { useRef } from "react";
import { Icon } from "@/components/ui/icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";

interface RefineDiffModalProps {
  open: boolean;
  oldContent: string;
  newContent: string;
  /** 应用精修结果（采用新正文，DB 已写入，仅刷新 UI） */
  onApply: () => void;
  /** 撤销：恢复精修前的原正文 */
  onUndo: () => void;
  /** 关闭（保持当前 DB 状态，仅刷新 UI） */
  onClose: () => void;
}

/**
 * #124 精修 diff 预览：精修（修改/续写已有正文）完成后，对比原正文与精修后正文，
 * 让用户显式「应用」或「撤销（保留原正文）」，避免 AI 静默覆盖正文却无从察觉。
 */
export function RefineDiffModal({ open, oldContent, newContent, onApply, onUndo, onClose }: RefineDiffModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // v2.0.16：接入焦点陷阱——Esc 关闭、Tab 在面板内循环，避免键盘焦点逃逸到背后页面
  useFocusTrap(panelRef, open, onClose);
  if (!open) return null;
  const oldLen = (oldContent || "").length;
  const newLen = (newContent || "").length;
  const delta = newLen - oldLen;
  const deltaText = delta === 0 ? "字数不变" : delta > 0 ? `增加 ${delta} 字` : `减少 ${Math.abs(delta)} 字`;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[var(--nv-void)]/70 p-4 backdrop-blur-sm">
      <div ref={panelRef} tabIndex={-1} className="surface-floating w-full max-w-5xl max-h-[88vh] flex flex-col rounded-2xl p-6 animate-spring">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-2">
            <Icon name="history" size={18} className="text-accent-label" />
            <h2 className="text-lg font-bold tracking-tight">精修预览（请确认改动）</h2>
          </div>
          <button onClick={onClose} className="text-[var(--nv-text-tertiary)] hover:text-[var(--nv-text-primary)]" aria-label="关闭">
            <Icon name="x" size={16} />
          </button>
        </div>

        <p className="text-xs text-[var(--nv-text-tertiary)] mb-3">
          原正文 {oldLen} 字 → 精修后 {newLen} 字（{deltaText}）。请核对后选择「应用」或「撤销」。
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 min-h-0">
          <div className="flex flex-col min-h-0">
            <div className="text-xs font-semibold text-[var(--nv-text-secondary)] mb-1.5 flex items-center gap-1.5">
              <Icon name="file" size={12} /> 原正文
            </div>
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 text-sm leading-relaxed whitespace-pre-wrap text-[var(--nv-text-secondary)]">
              {oldContent || "（空）"}
            </div>
          </div>
          <div className="flex flex-col min-h-0">
            <div className="text-xs font-semibold text-[var(--nv-text-secondary)] mb-1.5 flex items-center gap-1.5">
              <Icon name="check" size={12} /> 精修后
            </div>
            <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-[var(--nv-border-2)] bg-[var(--nv-surface-1)] p-3 text-sm leading-relaxed whitespace-pre-wrap text-[var(--nv-text-primary)]">
              {newContent || "（空）"}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-4 mt-2 border-t border-[var(--nv-border-2)]">
          <button
            onClick={onApply}
            className="flex-1 text-sm btn-primary rounded-xl py-2.5 inline-flex items-center justify-center gap-1.5 font-medium"
          >
            <Icon name="check" size={14} /> 应用精修
          </button>
          <button
            onClick={onUndo}
            className="flex-1 text-sm rounded-xl py-2.5 inline-flex items-center justify-center gap-1.5 border border-[var(--nv-border-2)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] transition-colors"
          >
            <Icon name="refresh" size={14} /> 撤销（保留原正文）
          </button>
        </div>
      </div>
    </div>
  );
}
