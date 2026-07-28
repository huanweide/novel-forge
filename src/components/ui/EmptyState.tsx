import type { ReactNode } from "react";
import { Icon, type IconName } from "./icons";

/**
 * 统一空态卡片（虚空玻璃风格）
 * 用于列表/面板无数据时的友好占位，带图标 + 主文案 + 可选引导 + 可选操作区。
 */
export function EmptyState({
  icon = "bookmarked",
  title,
  hint,
  action,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-1)]/40 p-8 text-center">
      <Icon name={icon} size={28} className="mb-2 text-[var(--nv-text-tertiary)]" />
      <p className="text-xs text-[var(--nv-text-secondary)]">{title}</p>
      {hint && <p className="mt-1 text-[10px] text-[var(--nv-text-tertiary)]">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
