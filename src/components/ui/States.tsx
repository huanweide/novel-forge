"use client";

/**
 * 统一空状态 / 加载状态组件 —— 虚空玻璃设计体系
 *
 * 替代各页面散落的裸文字空态与裸 spinner，统一视觉：
 *  - <EmptyState> 居中插画感图标 + 标题 + 说明 + 可选操作按钮
 *  - <Loading> 三点脉冲 / 旋转图标 / 文本，统一观感
 *
 * 用法：
 *   <EmptyState icon="book" title="还没有世界观" description="..." action={<Button>添加</Button>} />
 *   <Loading label="正在生成…" />
 */

import React, { type ReactNode } from "react";
import { Icon, type IconName } from "./icons";

export function EmptyState({
  icon = "sparkles",
  title,
  description,
  action,
  className = "",
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--nv-border-2)] bg-[var(--nv-surface-2)] px-6 py-10 text-center ${className}`}
    >
      <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--nv-creative-soft)] text-[var(--nv-creative)]">
        <Icon name={icon} size={26} />
      </div>
      <p className="text-sm font-medium text-[var(--nv-text-primary)]">{title}</p>
      {description ? (
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--nv-text-tertiary)]">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function Loading({ label, icon = "loader", className = "" }: { label?: string; icon?: IconName; className?: string }) {
  return (
    <div className={`flex items-center justify-center gap-3 text-[var(--nv-text-tertiary)] ${className}`}>
      <Icon name={icon} size={20} className="animate-spin text-[var(--nv-primary)]" />
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}

export function LoadingDots({ label, className = "" }: { label?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 text-[var(--nv-text-tertiary)] ${className}`}>
      <span className="flex gap-1">
        <span className="h-2 w-2 rounded-full bg-[var(--nv-primary)] glow-dot" />
        <span className="h-2 w-2 rounded-full bg-[var(--nv-primary)] glow-dot" />
        <span className="h-2 w-2 rounded-full bg-[var(--nv-primary)] glow-dot" />
      </span>
      {label ? <span className="text-sm">{label}</span> : null}
    </div>
  );
}

/**
 * 统一错误态 —— 与 EmptyState / Loading 同属「三件套」规范（FE-7）。
 * 任何「加载失败 / 请求出错」的页面级错误都应使用它，而不是各自写裸红框，
 * 保证错误视觉语言一致（图标 + 标题 + 说明 + 可选重试动作）。
 */
export function ErrorState({
  icon = "alert",
  title,
  description,
  action,
  className = "",
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--nv-danger-soft)] bg-[var(--nv-danger-soft)]/40 px-6 py-8 text-center ${className}`}
    >
      <div className="relative mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--nv-danger-soft)] text-[var(--nv-danger)]">
        <Icon name={icon} size={22} />
      </div>
      <p className="text-sm font-medium text-[var(--nv-danger)]">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-[var(--nv-text-tertiary)]">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
