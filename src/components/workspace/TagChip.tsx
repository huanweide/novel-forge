"use client";

import type { ReactNode } from "react";

/**
 * 统一标签/筛选芯片（v2.17）：角色卡标签与筛选栏按钮共用同一套尺寸/圆角/配色，
 * 彻底解决此前「标签大小/字体/颜色/图形不一致」的问题。
 * - active：选中/过滤激活态（主色填充）；
 * - 非 active：浅底次文本，hover 抬升；
 * - 可选 leading 图标、trailing 计数。
 */
export function TagChip({
  label,
  active = false,
  onClick,
  icon,
  count,
  title,
  size = "sm",
}: {
  label: ReactNode;
  active?: boolean;
  onClick?: () => void;
  icon?: ReactNode;
  count?: number;
  title?: string;
  size?: "sm" | "xs";
}) {
  const pad = size === "xs" ? "px-1 py-0" : "px-1.5 py-0.5";
  const cls = `inline-flex items-center gap-0.5 ${pad} rounded-full transition-colors leading-none ${
    active
      ? "bg-[var(--nv-primary)] text-[var(--nv-text-primary)]"
      : "bg-[var(--nv-surface-1)] text-[var(--nv-text-secondary)] hover:bg-[var(--nv-surface-2)] hover:text-[var(--nv-text-primary)]"
  }`;
  const content = (
    <>
      {icon}
      <span className="truncate max-w-[10rem]">{label}</span>
      {count !== undefined && <span className="opacity-60 tabular-nums">{count}</span>}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} title={title} aria-pressed={active}>
        {content}
      </button>
    );
  }
  return (
    <span className={cls} title={title}>
      {content}
    </span>
  );
}
