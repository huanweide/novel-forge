"use client";

/**
 * Switch — 统一药丸开关 v2
 *
 * 设计目标：顺滑弹簧滑动 + 开/关明显区分 + 现代质感
 *
 * 视觉特征：
 *   - 关闭态："熄灭" — 灰轨 + 半透明白滑块（暗淡）
 *   - 开启态："点亮" — 主题色轨 + 纯白滑块 + 柔和光晕（明亮）
 *   - 动画：300ms 弹簧缓动(cubic-bezier 回弹)，hover/active 有反馈
 *
 * 用法（API 不变）：
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
  // ── 尺寸体系 ──
  const trackSize = size === "sm" ? "w-9 h-5" : "w-12 h-7";
  const thumbSize = size === "sm" ? "w-3.5 h-3.5" : "w-5 h-5";

  // 滑块位移：关闭时靠左 2px，开启时靠右（轨道宽 - 滑块宽 - 2px 边距）
  const translate = checked
    ? size === "sm"
      ? "translate-x-5"
      : "translate-x-[26px]"
    : "translate-x-0.5";

  return (
    <label
      htmlFor={id}
      className={cn(
        "inline-flex items-center gap-2 cursor-pointer select-none group",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {label && (
        <span
          className={cn(
            "text-[var(--nv-text-tertiary)] transition-colors duration-200",
            size === "sm" ? "text-[10px]" : "text-xs",
            checked && "text-[var(--nv-text-secondary)]"
          )}
        >
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
          // 轨道基础：圆角药丸形
          "relative shrink-0 rounded-full",
          // 弹簧缓动动画（背景色 + 阴影）
          "transition-[background-color,box-shadow] duration-300",
          "ease-[cubic-bezier(0.34,1.56,0.64,1)]",
          // focus 无障碍环
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nv-primary)]/50 focus-visible:ring-offset-0",
          trackSize,
          // ── 关闭态：灰轨（熄灭）──
          !checked && "bg-[var(--nv-surface-3)]",
          // 关闭态 hover：微微亮起
          !checked && "group-hover:bg-[var(--nv-surface-2)]",
          // ── 开启态：主题色轨（点亮）──
          checked && "bg-[var(--nv-primary)]",
          // 开启态 hover：轻微加深
          checked && "group-hover:brightness-110"
        )}
      >
        {/* 滑块（thumb） */}
        <span
          className={cn(
            "absolute top-1/2 -translate-y-1/2 rounded-full",
            // 弹簧位移动画
            "transition-[transform,background-color,box-shadow] duration-300",
            "ease-[cubic-bezier(0.34,1.56,0.64,1)]",
            // active 按压反馈：微缩
            "active:scale-95",
            thumbSize,
            translate,
            // ── 关闭态滑块：半透明白（熄灭感）──
            !checked && "bg-white/60 shadow-sm",
            // ── 开启态滑块：纯白 + 柔和光晕（点亮感）──
            checked && "bg-white shadow-[0_0_0_3px_rgba(255,255,255,0.2)]"
          )}
        />
      </button>
    </label>
  );
}
