"use client";

/**
 * 统一模态框基础组件 —— 虚空玻璃设计体系
 *
 * 收编此前散落在各业务页的两套 overlay 风格（surface-floating 玻璃弹窗 vs bg-zinc-900 旧弹窗），
 * 统一为：fixed inset-0 遮罩 + surface-floating 玻璃面板 + animate-spring 弹性入场。
 * 自动处理：点击遮罩关闭、ESC 关闭、body 滚动锁定、focus 管理。
 *
 * 用法：
 *   <Modal open={open} onClose={close} title="新建表格" icon="table" maxWidth="md">
 *     ...内容...
 *     <ModalFooter> ...按钮... </ModalFooter>
 *   </Modal>
 */

import React, { useEffect, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

type SizeKey = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<SizeKey, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  size = "md",
  children,
  footer,
  closeOnOverlay = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  icon?: IconName;
  size?: SizeKey;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnOverlay?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => closeOnOverlay && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`surface-floating w-full ${SIZE_MAP[size]} animate-spring rounded-2xl p-6 shadow-2xl max-h-[88vh] overflow-y-auto custom-scrollbar`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {icon ? (
            <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--nv-primary-soft)] text-[var(--nv-primary)]">
              <Icon name={icon} size={18} />
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-[var(--nv-text-primary)]">{title}</h3>
            {description ? (
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--nv-text-secondary)]">{description}</p>
            ) : null}
          </div>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="shrink-0 rounded-lg p-1.5 text-[var(--nv-text-tertiary)] transition-colors hover:bg-white/[0.06] hover:text-[var(--nv-text-primary)]"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        {children ? <div className="mt-5 text-sm text-[var(--nv-text-secondary)]">{children}</div> : null}
        {footer ? <div className="mt-6 flex gap-3">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex gap-3">{children}</div>;
}
