"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface CollapseProps {
  open?: boolean;            // 受控开合
  defaultOpen?: boolean;     // 非受控初始（默认 true）
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;          // 分组标题
  icon?: IconName;           // 可选左侧图标
  size?: "sm" | "md";        // sm 用于密集分组（text-xs font-medium / chevron 14 / py-1.5），md 默认（text-sm / chevron 16）
  disabled?: boolean;
  mountOnOpen?: boolean;     // 折叠时卸载 children（性能范式，对齐 RightPanel 懒挂载）
  className?: string;
  children: ReactNode;
}

/**
 * Collapse — 单组可折叠分组。
 *
 * 视觉语言沿用代码库约定：chevron 用 arrowRight / arrowDown，内容条件渲染，
 * 不引入 transition-max-height 高度动画。
 */
export function Collapse({
  open,
  defaultOpen = true,
  onOpenChange,
  title,
  icon,
  size = "md",
  disabled = false,
  className,
  children,
}: CollapseProps) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const isOpen = isControlled ? open : innerOpen;

  const toggle = () => {
    if (disabled) return;
    const next = !isOpen;
    if (!isControlled) setInnerOpen(next);
    onOpenChange?.(next);
  };

  const chevronSize = size === "sm" ? 14 : 16;

  return (
    <div className={cn(className)}>
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-expanded={isOpen}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded px-1 py-1.5 cursor-pointer select-none text-[var(--nv-text-primary)] hover:bg-[var(--nv-surface-3)]/40",
          size === "sm" ? "text-xs font-medium" : "text-sm",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="flex min-w-0 items-center gap-2 truncate">
          {icon && <Icon name={icon} size={chevronSize} />}
          <span className="truncate">{title}</span>
        </span>
        <Icon
          name={isOpen ? "arrowDown" : "arrowRight"}
          size={chevronSize}
          className="shrink-0 text-[var(--nv-text-tertiary)]"
        />
      </button>
      {isOpen ? <div className="pb-1 pt-2">{children}</div> : null}
    </div>
  );
}
