// 自动放行率（autoRate）纯函数——从监测统计中独立出来，便于离线单测。
// 原逻辑内联在 src/app/api/stats/monitor/route.ts，重构为单一真相源，前后端可复用。

import { STATUS_CONFIRMED } from "@/core/story-status";

export interface ChapterLike {
  status?: string | null;
  reviewLogs?: unknown;
}

/** 已确认章中由智能审阅（auto-confirm）自动审定的数量 */
export function countAutoConfirmed(chapters: ChapterLike[]): number {
  return chapters.filter(
    (c) =>
      c.status === STATUS_CONFIRMED &&
      Array.isArray(c.reviewLogs) &&
      (c.reviewLogs as Array<{ action?: string }>).some((l) => l && l.action === "auto-confirm"),
  ).length;
}

/**
 * 给定章节列表，计算自动放行数量与百分比。
 * 无已确认章时 autoRate 返回 0（避免除零）。
 */
export function computeAutoRate(chapters: ChapterLike[]): { autoConfirmed: number; autoRate: number } {
  const confirmedChapters = chapters.filter((c) => c.status === STATUS_CONFIRMED).length;
  const autoConfirmed = countAutoConfirmed(chapters);
  const autoRate = confirmedChapters > 0 ? Math.round((autoConfirmed / confirmedChapters) * 100) : 0;
  return { autoConfirmed, autoRate };
}
