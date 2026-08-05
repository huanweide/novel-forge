// Round3 #1：智能自动确认（Auto-Confirm）共享护栏
// 单一质量阈值真相；批量确认 / 自动确认 / 流水线挂载三处复用，避免阈值分裂。

import { prisma } from "@/lib/prisma";
import { safeFillAfterWriting } from "@/core/babylore/loop";
import { analyzeQuality } from "@/lib/quality-analyzer";

// 质量护栏阈值：与 analyzeQuality 的 passed 口径一致（overallScore >= 60 为达标）
export const QUALITY_PASS_THRESHOLD = 60;

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
  let score: number | null = typeof node.qualityScore === "number" ? node.qualityScore : null;
  if (requirePassed) {
    if (!node.content || node.content.trim().length < 50) {
      return { eligible: false, score: null, grade: "?", reason: "正文为空或过短（少于50字）" };
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
  const prevLogs: any[] = Array.isArray(existing?.reviewLogs) ? existing.reviewLogs : [];

  let fillMsg = "（无正文，跳过填表）";
  if (node.content && node.content.length > 0) {
    try {
      await safeFillAfterWriting({
        projectId: node.projectId,
        content: node.content,
        send: undefined,
        nodeOrder: node.order,
        isLatestChapter: false,
        nodeId: node.id,
      });
      fillMsg = "自动填表已执行";
    } catch (e) {
      fillMsg = `自动填表失败（不影响确认）: ${e instanceof Error ? e.message : "未知"}`;
    }
  }

  // 幂等守卫：仅当节点仍处待确认态（drafting/pending_confirm）才执行终态更新。
  // 重复/并发请求第二次命中已 confirmed → count=0，不重复 increment revisionCount、不重复追加 reviewLogs。
  const upd = await prisma.storyNode.updateMany({
    where: { id: node.id, status: { in: ["drafting", "pending_confirm"] } },
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
