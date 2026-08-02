"use client";

/**
 * 统一模态框基础组件 —— 虚空玻璃设计体系
 *
 * 收编此前散落在各业务页的两套 overlay 风格（surface-floating 玻璃弹窗 vs bg-[var(--nv-abyss)] 旧弹窗），
 * 统一为：fixed inset-0 遮罩 + surface-floating 玻璃面板 + animate-spring 弹性入场。
 * 自动处理：点击遮罩关闭、ESC 关闭、body 滚动锁定、focus 管理。
 *
 * 用法：
 *   // 简单弹窗（统一标题栏）
 *   <Modal open={open} onClose={close} title="新建表格" icon="table" size="md">
 *     ...内容...
 *     <ModalFooter> ...按钮... </ModalFooter>
 *   </Modal>
 *
 *   // 复杂弹窗（保留自定义头部，只复用遮罩/关闭行为）
 *   <Modal open={open} onClose={close} bare panelClassName="max-w-2xl max-h-[92vh] flex flex-col">
 *     <div className="flex items-center justify-between px-5 py-3 border-b ...">自定义标题栏</div>
 *     ...内容...
 *   </Modal>
 */

import React, { useEffect, useRef, type ReactNode } from "react";
import { Icon, type IconName } from "./icons";
import { useFocusTrap } from "@/hooks/use-focus-trap";

type SizeKey = "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "4xl" | "5xl" | "full";

const SIZE_MAP: Record<SizeKey, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  full: "max-w-[96vw]",
};

export function Modal({
  open,
  onClose,
  title,
  description,
  icon,
  header,
  size = "md",
  children,
  footer,
  closeOnOverlay = true,
  showClose = false,
  bare = false,
  panelClassName = "",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  icon?: IconName;
  /** 自定义头部插槽（含自己的标题/操作按钮/x）。提供后不渲染默认标题栏。 */
  header?: ReactNode;
  size?: SizeKey;
  children?: ReactNode;
  footer?: ReactNode;
  closeOnOverlay?: boolean;
  /** 裸模式（无 title/header）下是否在右上角渲染关闭按钮，默认 false（由弹窗自带关闭入口） */
  showClose?: boolean;
  /** 裸模式：不渲染默认标题栏，children 直接作为面板内容（由调用方自己控制 padding/布局） */
  bare?: boolean;
  /** 追加/覆盖面板宽度与布局类（如 max-w-2xl / w-[480px] / flex flex-col） */
  panelClassName?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open, onClose);

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

  const hasHeader = !!(title || icon || description || header);

  // bare 模式把高度/滚动完全交给 panelClassName，避免与弹窗内部「头部固定 + 内容滚动」布局冲突；
  // 非 bare 模式保留默认 max-h + 整体滚动。
  const panelBase = bare
    ? "surface-floating relative rounded-2xl shadow-2xl animate-spring"
    : "surface-floating relative rounded-2xl shadow-2xl max-h-[88vh] overflow-y-auto custom-scrollbar animate-spring";

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={() => closeOnOverlay && onClose()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? (typeof header === "string" ? header : undefined)}
        className={`${panelBase} ${hasHeader ? SIZE_MAP[size] : ""} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {hasHeader &&
          (header ? (
            header
          ) : (
            <div className="flex items-start gap-3 p-6 pb-0">
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
                className="shrink-0 rounded-lg p-1.5 text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          ))}

        {!hasHeader && showClose && (
          <button
            onClick={onClose}
            aria-label="关闭"
            className="absolute right-4 top-4 z-10 rounded-lg p-1.5 text-[var(--nv-text-tertiary)] transition-colors hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
          >
            <Icon name="x" size={16} />
          </button>
        )}

        {hasHeader ? (
          <div className="mt-5 px-6 pb-6">{children}</div>
        ) : (
          children
        )}

        {footer ? (
          <div className={hasHeader ? "px-6 pb-6 flex gap-3" : "p-6 pt-0 flex gap-3"}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

export function ModalFooter({ children }: { children: ReactNode }) {
  return <div className="flex gap-3">{children}</div>;
}
