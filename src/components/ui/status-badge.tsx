"use client";

import { Icon, type IconName } from "@/components/ui/icons";

/**
 * StatusBadge — 节点/章节状态徽章（统一六态，对齐 story-status 枚举）
 *
 * 视觉三档：
 *   灰 = 进行中 / 待处理（仅大纲 / 草稿 / 已生成待提交）
 *   橙 = 需行动（待确认 / 审校中）
 *   绿 = 已定稿
 * 未知状态兜底灰显，不误导作者。
 */
export function StatusBadge({
  status,
  size = "sm",
}: {
  status: string;
  size?: "sm" | "md";
}) {
  const map: Record<string, { label: string; cls: string; icon: IconName }> = {
    outline_only: { label: "仅大纲", cls: "text-[var(--nv-text-tertiary)] bg-[var(--nv-surface-3)]", icon: "circle" },
    drafting: { label: "草稿", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "pencil" },
    completed: { label: "已生成·待提交", cls: "text-[var(--nv-text-secondary)] bg-[var(--nv-surface-3)]", icon: "file" },
    pending_confirm: { label: "待确认", cls: "text-accent-label bg-[var(--nv-accent-soft)]", icon: "alert" },
    confirmed: { label: "已定稿", cls: "text-[var(--nv-success)] bg-[var(--nv-success)]/10", icon: "check" },
    reviewing: { label: "审校中", cls: "text-accent-label bg-[var(--nv-accent-soft)]", icon: "alert" },
  };
  const s = map[status] || { label: "未知", cls: "text-[var(--nv-text-tertiary)] bg-[var(--nv-surface-3)]", icon: "circle" as IconName };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-medium ${
        size === "md" ? "text-[11px]" : "text-[10px]"
      } ${s.cls}`}
    >
      <Icon name={s.icon} size={size === "md" ? 12 : 10} /> {s.label}
    </span>
  );
}
