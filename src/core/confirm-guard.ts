// Round3 #1：智能自动确认（Auto-Confirm）共享护栏
// 单一质量阈值真相；批量确认 / 自动确认 / 流水线挂载三处复用，避免阈值分裂。

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { safeFillAfterWriting } from "@/core/babylore/loop";
import { analyzeQuality } from "@/lib/quality-analyzer";
import { QUALITY_PASS_THRESHOLD } from "@/core/quality-thresholds";
import { CONFIRMABLE_STATUSES } from "@/core/story-status";

// 共享阈值（单一真相源）：与 analyzeQuality 的 passed 口径一致
export { QUALITY_PASS_THRESHOLD } from "@/core/quality-thresholds";

// 自动放行结构门槛（盲测实证驱动）：纯统计分数对劣质/短/重复文不可信（盲测假放行率 100%），
// 自动/批量放行叠加「最小长度 + 机械重复检测」，分数仅作参考与看板。
export const MIN_AUTO_CONFIRM_LENGTH = 150;

// 机械重复检测：按句分割后 ≥5 句且去重唯一率 <60% 视为「同一句凑字数」
function isMechanicalRepetition(text: string): boolean {
  const sentences = text
    .split(/[。！？!?；;]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  if (sentences.length < 5) return false;
  const uniqueRatio = new Set(sentences).size / sentences.length;
  return uniqueRatio < 0.6;
}

export function gradeOf(score: number | null): string | null {
  if (score == null) return null;
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  return "D";
}

export interface ConfirmEligibility {
  eligible: boolean;
  score: number | null;
  grade: string | null;
  reason?: string;
}

/**
 * 评估一个节点是否可被自动/批量确认放行。
 * - 空正文 / 过短(<50字)：直接拦截（严重问题，不给 analyzer 误判满分的机会）
 * - qualityScore 非 null：直接采信（生成流水线已算过，省一次分析）
 * - qualityScore 为 null：回退本地实时 analyzeQuality（零 Token）
 * - 分数 < 阈值：拦截并附 reason
 */
export function evaluateConfirmEligibility(
  node: { content?: string | null; qualityScore?: number | null },
  knownNames: string[] = [],
  requirePassed = true,
): ConfirmEligibility {
  // 非法分数（NaN/Infinity）不采信：回退本地重算，杜绝「NaN < 60 恒 false」绕过拦截的漏网
  let score: number | null =
    typeof node.qualityScore === "number" && Number.isFinite(node.qualityScore)
      ? node.qualityScore
      : null;
  if (requirePassed) {
    if (!node.content || node.content.trim().length < 50) {
      return { eligible: false, score: null, grade: "?", reason: "正文为空或过短（少于50字）" };
    }
    // 盲测实证（scripts/agent-quality-blind-test.ts）：劣质/短/空文本对纯统计分 100% 过线（73~100分），
    // 自动放行必须叠加结构门槛——最小长度 + 机械重复检测，分数仅作参考。
    const text = node.content.trim();
    if (text.length < MIN_AUTO_CONFIRM_LENGTH) {
      return { eligible: false, score: null, grade: "?", reason: `正文过短（${text.length}字 < ${MIN_AUTO_CONFIRM_LENGTH}），不自动放行` };
    }
    if (isMechanicalRepetition(text)) {
      return { eligible: false, score: null, grade: "?", reason: "机械重复（句子高度雷同），不自动放行" };
    }
    if (score == null && node.content) {
      try {
        score = analyzeQuality(node.content, knownNames).overallScore;
      } catch {
        score = null;
      }
    }
    if (score == null) {
      return { eligible: false, score: null, grade: "?", reason: "未评估且无法解析正文" };
    }
    if (score < QUALITY_PASS_THRESHOLD) {
      return {
        eligible: false,
        score,
        grade: gradeOf(score) ?? "D",
        reason: `质量分低于阈值(${QUALITY_PASS_THRESHOLD})`,
      };
    }
  }
  return { eligible: true, score, grade: gradeOf(score) };
}

/**
 * 对单个节点执行确认副作用：自动填表（safeFillAfterWriting）+ 状态置 confirmed。
 * 不校验状态，由调用方（端点 / 流水线）决定哪些节点进入。
 */
export async function applyConfirm(node: {
  id: string;
  projectId: string;
  content: string | null;
  order: number;
}): Promise<string> {
  const now = new Date();
  const existing = await prisma.storyNode.findUnique({
    where: { id: node.id },
    select: { reviewLogs: true },
  });
  const prevLogs: Prisma.JsonArray = Array.isArray(existing?.reviewLogs) ? existing.reviewLogs : [];

  let fillMsg = "（无正文，跳过填表）";
  if (node.content && node.content.length > 0) {
    // IMP-002：用「node.order === 项目最大 order」判定是否最新章，使 skipLatestChapter 生效，
    // 不再硬编码 false 导致「跳过最近一章」永远不生效。与 confirm/batch 路径算法一致。
    let isLatestChapter = false;
    try {
      const agg = await prisma.storyNode.aggregate({
        where: { projectId: node.projectId },
        _max: { order: true },
      });
      isLatestChapter = node.order === (agg._max.order ?? node.order);
    } catch {
      /* 聚合失败则按非最新处理（保守：不跳过，仍可能填表） */
    }
    try {
      const fillRes = await safeFillAfterWriting({
        projectId: node.projectId,
        content: node.content,
        send: undefined,
        nodeOrder: node.order,
        isLatestChapter,
        nodeId: node.id,
        source: "auto-confirm",
      });
      // IMP-004：依据真实返回值决定文案，而非无条件声称「已执行」
      if (fillRes.ok && fillRes.applied > 0) {
        fillMsg = "自动填表已执行";
      } else {
        fillMsg = `未触发自动填表（${fillRes.error || "无事实可填"}）`;
      }
    } catch (e) {
      fillMsg = `自动填表失败（不影响确认）: ${e instanceof Error ? e.message : "未知"}`;
    }
  }

  // 幂等守卫：仅当节点仍处待确认态（drafting/pending_confirm）才执行终态更新。
  // 重复/并发请求第二次命中已 confirmed → count=0，不重复 increment revisionCount、不重复追加 reviewLogs。
  const upd = await prisma.storyNode.updateMany({
    where: { id: node.id, status: { in: [...CONFIRMABLE_STATUSES] } },
    data: {
      status: "confirmed",
      confirmedAt: now,
      revisionCount: { increment: 1 },
      reviewLogs: [
        ...prevLogs,
        { action: "auto-confirm", fill: fillMsg, at: now.toISOString() },
      ],
    },
  });
  if (upd.count === 0) return "节点已确认（幂等跳过，未重复计数）";
  return fillMsg;
}
