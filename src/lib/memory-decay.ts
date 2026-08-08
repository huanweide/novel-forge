/**
 * 长效记忆衰减引擎
 *
 * 模拟人类记忆的自然遗忘曲线——时间越久，记忆越模糊。
 * 不同重要性的事件有不同的"保鲜期"，过期后自动降级或清理。
 *
 * 衰减规则：
 *   S 级（核心）→ 永久保留，不衰减
 *   A 级（重要）→ 超过 30 章降级为 B 级
 *   B 级（一般）→ 超过 15 章降级为 C 级
 *   C 级（琐碎）→ 超过 5 章直接删除
 *
 * 不与伏笔系统（PendingCommitment）冲突——伏笔由五状态机独立管理。
 */

import { prisma } from "@/lib/prisma";
import type { EventImportance, EventTier, EventCategory } from "@/core/types";

// ═══════════════════════════════════════════
// 衰减配置
// ═══════════════════════════════════════════

export interface TierDecayRule {
  /** 最大存活章数，null 表示永久 */
  maxAge: number | null;
  /** 人类可读标签 */
  label: string;
}

export const DECAY_RULES: Record<string, TierDecayRule> = {
  S: { maxAge: null, label: "S级·永久" },
  A: { maxAge: 30, label: "A级·30章" },
  B: { maxAge: 15, label: "B级·15章" },
  C: { maxAge: 5, label: "C级·5章" },
};

const TIER_ORDER = ["S", "A", "B", "C"] as const;

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface DecayDecision {
  event: EventImportance;
  originalTier: string;
  /** null 表示删除 */
  targetTier: string | null;
  chapterAge: number;
  action: "keep" | "downgrade" | "delete";
}

export interface CleanupStats {
  projectId: string;
  latestChapter: number;
  summariesChecked: number;
  eventsKept: number;
  eventsDowngraded: number;
  eventsDeleted: number;
  /** S/A/B/C 各层级保留数量 */
  tierCounts: Record<string, number>;
}

// ═══════════════════════════════════════════
// 单事件衰减计算
// ═══════════════════════════════════════════

/**
 * 对单个事件计算衰减结果。
 *
 * @param event       事件
 * @param chapterAge  距今章数（当前章 - 事件所在章）
 * @returns 衰减决策（保留/降级/删除）
 */
export function computeEventDecay(
  event: EventImportance,
  chapterAge: number,
): DecayDecision {
  const tier = event.tier?.toUpperCase() || "C";
  const rule = DECAY_RULES[tier];

  // 未识别层级或无规则 → 保守保留
  if (!rule) {
    return { event, originalTier: tier, targetTier: tier, chapterAge, action: "keep" };
  }

  // 永久保留
  if (rule.maxAge === null) {
    return { event, originalTier: tier, targetTier: tier, chapterAge, action: "keep" };
  }

  // 未过期
  if (chapterAge <= rule.maxAge) {
    return { event, originalTier: tier, targetTier: tier, chapterAge, action: "keep" };
  }

  // 过期——找下一级
  const currentIdx = TIER_ORDER.indexOf(tier as typeof TIER_ORDER[number]);
  if (currentIdx < 0 || currentIdx >= TIER_ORDER.length - 1) {
    // 已经是 C 级或未识别 → 删除
    return { event, originalTier: tier, targetTier: null, chapterAge, action: "delete" };
  }

  // 降级：是否应该跳级？逐级降，一次只降一级
  const nextTier = TIER_ORDER[currentIdx + 1];
  const nextRule = DECAY_RULES[nextTier];
  // 如果降级后的层级也已过期（chapterAge > nextRule.maxAge），继续降
  // 递归检查：降级后的事件在新层级是否也超龄
  if (nextRule.maxAge !== null && chapterAge > nextRule.maxAge) {
    // 降级后仍超龄 → 递归计算，直接跳到最终目标层级
    const downgradedEvent = { ...event, tier: nextTier };
    return computeEventDecay(downgradedEvent, chapterAge);
  }

  return {
    event: { ...event, tier: nextTier },
    originalTier: tier,
    targetTier: nextTier,
    chapterAge,
    action: "downgrade",
  };
}

// ═══════════════════════════════════════════
// 单章摘要衰减
// ═══════════════════════════════════════════

/**
 * 对单章摘要的 eventImportances 应用衰减。
 * 返回处理后的 eventImportances 和统计信息。
 */
function applyDecayToSummary(
  summary: {
    id: string;
    chapterTitle: string;
    eventImportances: any;
  },
  latestChapter: number,
): {
  eventImportances: { sTier: any[]; aTier: any[]; bTier: any[]; cTier: any[] };
  kept: number;
  downgraded: number;
  deleted: number;
  tierCounts: Record<string, number>;
} {
  const chapterNum = extractChapterNumber(summary.chapterTitle);
  const chapterAge = latestChapter - chapterNum;

  // 本章或未来章不衰减
  if (chapterAge <= 0) {
    const ei = normalizeImportances(summary.eventImportances);
    return {
      eventImportances: ei,
      kept: countAllEvents(ei),
      downgraded: 0,
      deleted: 0,
      tierCounts: countByTier(ei),
    };
  }

  const rawImportances = summary.eventImportances || {};
  const result = {
    sTier: [] as any[],
    aTier: [] as any[],
    bTier: [] as any[],
    cTier: [] as any[],
  };

  let kept = 0;
  let downgraded = 0;
  let deleted = 0;

  // 遍历 S/A/B/C 四个层级
  for (const tier of TIER_ORDER) {
    const events = Array.isArray(rawImportances[`${tier.toLowerCase()}Tier`])
      ? rawImportances[`${tier.toLowerCase()}Tier`]
      : [];

    for (const evt of events) {
      const event: EventImportance = {
        description: String(evt.description || ""),
        score: Number(evt.score || 0),
        tier: (String(evt.tier || tier) as EventTier),
        category: (String(evt.category || "interaction") as EventCategory),
        isBreakthrough: Boolean(evt.isBreakthrough),
        isForeshadowRelated: Boolean(evt.isForeshadowRelated),
        relatedCharacterIds: Array.isArray(evt.relatedCharacterIds) ? evt.relatedCharacterIds : [],
      };

      const decision = computeEventDecay(event, chapterAge);

      if (decision.action === "delete") {
        deleted++;
      } else if (decision.action === "downgrade") {
        downgraded++;
        const targetTier = decision.targetTier!;
        const tierKey = `${targetTier.toLowerCase()}Tier` as keyof typeof result;
        result[tierKey].push(decision.event);
      } else {
        kept++;
        const tierKey = `${tier.toLowerCase()}Tier` as keyof typeof result;
        result[tierKey].push(decision.event);
      }
    }
  }

  return {
    eventImportances: result,
    kept,
    downgraded,
    deleted,
    tierCounts: countByTier(result),
  };
}

// ═══════════════════════════════════════════
// 批量清理入口
// ═══════════════════════════════════════════

/**
 * 对项目所有章节摘要执行记忆衰减清理。
 *
 * 流程：
 * 1. 获取项目最新章号
 * 2. 遍历所有 ChapterSummary
 * 3. 对每个摘要的 eventImportances 应用衰减
 * 4. 有变更则 update
 * 5. 删除 C 级已全部清空的摘要可选清理
 *
 * @returns 清理统计
 */
export async function cleanupExpiredMemories(projectId: string): Promise<CleanupStats> {
  // 1. 获取最新章号
    const latestNode = await prisma.storyNode.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { order: "desc" },
      select: { order: true, title: true },
  });

  const latestChapter = latestNode ? (latestNode.order as number) + 1 : 1;

  // 2. 获取所有章节摘要
  const summaries = await prisma.chapterSummary.findMany({
    where: { projectId },
    select: { id: true, chapterTitle: true, eventImportances: true },
  });

  // 3. 逐个处理
  const stats: CleanupStats = {
    projectId,
    latestChapter,
    summariesChecked: summaries.length,
    eventsKept: 0,
    eventsDowngraded: 0,
    eventsDeleted: 0,
    tierCounts: { S: 0, A: 0, B: 0, C: 0 },
  };

  for (const summary of summaries) {
    const { eventImportances, kept, downgraded, deleted, tierCounts } =
      applyDecayToSummary(summary, latestChapter);

    stats.eventsKept += kept;
    stats.eventsDowngraded += downgraded;
    stats.eventsDeleted += deleted;

    // 合并层级计数
    for (const [tier, count] of Object.entries(tierCounts)) {
      stats.tierCounts[tier] = (stats.tierCounts[tier] || 0) + count;
    }

    // 有变更才写库
    if (downgraded > 0 || deleted > 0) {
      await prisma.chapterSummary.update({
        where: { id: summary.id },
        data: { eventImportances: eventImportances as any },
      });
    }
  }

  return stats;
}

// ═══════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════

function extractChapterNumber(chapterTitle: string): number {
  const match = chapterTitle?.match(/第(\d+)章/);
  return match ? parseInt(match[1]) : 0;
}

function normalizeImportances(raw: any): {
  sTier: any[];
  aTier: any[];
  bTier: any[];
  cTier: any[];
} {
  return {
    sTier: Array.isArray(raw?.sTier) ? raw.sTier : [],
    aTier: Array.isArray(raw?.aTier) ? raw.aTier : [],
    bTier: Array.isArray(raw?.bTier) ? raw.bTier : [],
    cTier: Array.isArray(raw?.cTier) ? raw.cTier : [],
  };
}

function countAllEvents(ei: { sTier: any[]; aTier: any[]; bTier: any[]; cTier: any[] }): number {
  return ei.sTier.length + ei.aTier.length + ei.bTier.length + ei.cTier.length;
}

function countByTier(ei: { sTier: any[]; aTier: any[]; bTier: any[]; cTier: any[] }): Record<string, number> {
  return {
    S: ei.sTier.length,
    A: ei.aTier.length,
    B: ei.bTier.length,
    C: ei.cTier.length,
  };
}
