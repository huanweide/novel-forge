"use client";

/**
 * Switch — 统一药丸开关
 *
 * 风格：云笔式右对齐 Toggle，配色收敛到 --nv-primary / --nv-surface-3。
 * 用法：
 *   <Switch checked={v} onCheckedChange={setV} label="自动交付" />
 *   <Switch checked={v} onCheckedChange={setV} size="sm" />
 */

import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "md";
  className?: string;
  id?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  size = "md",
  className,
  id,
}: SwitchProps) {
  const trackSize = size === "sm" ? "w-8 h-4" : "w-10 h-5";
  const thumbSize = size === "sm" ? "w-3 h-3" : "w-4 h-4";
  const translate = checked ? (size === "sm" ? "translate-x-4" : "translate-x-5") : "translate-x-0.5";

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {label && (
        <span className={cn("text-[var(--nv-text-tertiary)]", size === "sm" ? "text-[10px]" : "text-xs")}>
          {label}
        </span>
      )}
      <button
        type="button"
        role="switch"
        id={id}
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          "relative shrink-0 rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nv-primary)]/50",
          trackSize,
          checked ? "bg-[var(--nv-primary)]" : "bg-[var(--nv-surface-3)]"
        )}
      >
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full bg-[var(--nv-text-primary)] shadow-sm transition-transform duration-200",
            thumbSize,
            translate
          )}
        />
      </button>
    </label>
  );
}
