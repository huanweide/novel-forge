/**
 * 后处理管线 —— 禁用词扫描 / 审校 / 摘要 / 存储
 *
 * write 和 continue 路由共享的生成后处理逻辑。
 * refine 路由通过 skipReview + skipSummarize 复用扫描和存储部分。
 */

import { prisma } from "@/lib/prisma";
import { scanForbiddenWords } from "@/lib/forbidden-checker";
import type { AgentOrchestrator } from "@/core/agents";
import type { ReviewLog } from "@/core/types";
import type { PostPipelineParams, PostPipelineResult } from "./types";

/**
 * 运行完整的生成后处理管线。
 *
 * 管线步骤：
 *   1. 禁用词扫描 → SSE send
 *   2. 审校（可选）→ SSE send
 *   3. 保存到 storyNode
 *   4. 摘要 + 存入 chapterSummary & storyBeat（可选）→ SSE send
 *
 * 所有步骤的 SSE 事件通过 params.send 回调推送给前端。
 */
export async function runPostGenerationPipeline(
  params: PostPipelineParams,
): Promise<PostPipelineResult> {
  const {
    send,
    orchestrator,
    projectId,
    nodeId,
    content,
    nodeOutline,
    activeCharacters,
    activeLore,
    chapterSummaries,
    currentNode,
    chapterTitle,
    chapterOrder,
    forbiddenPatterns,
    skipReview = false,
    skipSummarize = false,
  } = params;

  // ── 1. 禁用词扫描 ──
  if (forbiddenPatterns.length > 0) {
    const scanResult = scanForbiddenWords(content, forbiddenPatterns);
    if (!scanResult.passed) {
      send({
        type: "forbidden_scan",
        content: scanResult.summary,
        matches: scanResult.matches.slice(0, 10),
        totalMatches: scanResult.matches.length,
      });
    } else {
      send({ type: "forbidden_scan", content: "✅ 禁用词检查通过", passed: true });
    }
  }

  // ── 2. 审校 ──
  let reviewLog: ReviewLog | undefined;

  if (!skipReview) {
    send({ type: "review_start", content: "" });

    try {
      const previousContext = chapterSummaries.map((s: any) => ({
        chapterTitle: s.chapterTitle,
        summary: s.summary,
        keyEvents: s.keyEvents || [],
        characterStates:
          typeof s.characterStates === "string"
            ? s.characterStates
            : (s.characterStates as any)?.raw ||
              JSON.stringify(s.characterStates || {}),
      }));

      reviewLog = await orchestrator.reviewContent(
        content,
        nodeOutline,
        activeCharacters as any,
        activeLore as any,
        previousContext,
      );

      // 发送审校结果
      for (const issue of reviewLog.issues) {
        send({
          type: "review_issue",
          content: issue.description,
          severity: issue.severity,
          location: issue.location,
          suggestion: issue.suggestion,
        });
      }

      send({
        type: "review_result",
        content: reviewLog.passed ? "审校通过" : "审校未通过，请查看问题列表",
        passed: reviewLog.passed,
        issues: reviewLog.issues,
      });
    } catch (reviewErr) {
      // 审校失败降级——不阻塞主流程，标记为跳过
      send({
        type: "review_skip",
        content: `审校跳过：${String(reviewErr).slice(0, 100)}`,
      });
      reviewLog = undefined;
    }
  }

  // ── 3. 保存到 storyNode ──
  const existingReviewLogs = (currentNode as any).reviewLogs || [];
  const reviewLogEntry = reviewLog
    ? {
        id: crypto.randomUUID(),
        nodeId,
        timestamp: new Date().toISOString(),
        passed: reviewLog.passed,
        issues: reviewLog.issues,
        summary: reviewLog.summary,
        suggestion: reviewLog.suggestion,
      }
    : null;

  const updatedNode = await prisma.storyNode.update({
    where: { id: nodeId },
    data: {
      content,
      wordCount: content.length,
      status: skipReview ? "completed" : reviewLog?.passed ? "completed" : "reviewing",
      ...(reviewLogEntry
        ? {
            reviewLogs: [
              ...(Array.isArray(existingReviewLogs) ? existingReviewLogs : []),
              reviewLogEntry,
            ],
          }
        : {}),
      revisionCount: ((currentNode as any).revisionCount || 0) + 1,
    },
  });

  // ── 4. 摘要 ──
  if (!skipSummarize) {
    send({ type: "summarize_start", content: "" });

    try {
      const {
        summary,
        keyEvents,
        characterStates,
        closingSnapshot,
        characterImpulses,
        threadProgress,
        unresolvedQuestions,
        impactScore,
        eventImportances,
      } = await orchestrator.summarizeChapter(
        content,
        chapterTitle,
        activeCharacters as any,
        chapterOrder,
        chapterSummaries.length, // existingSummariesCount — 用于时效性衰减
      );

      // 存入 ChapterSummary（含四级事件分层）
      await prisma.chapterSummary.create({
        data: {
          projectId,
          chapterId: nodeId,
          chapterTitle,
          summary,
          keyEvents,
          characterStates: {
            raw: characterStates,
            closingSnapshot,
            impulses: characterImpulses,
          } as any,
          eventImportances: eventImportances as any,
        },
      });

      // 存入 StoryBeat（长期记忆索引）
      if (keyEvents.length > 0) {
        let description = keyEvents.join("；");
        if (unresolvedQuestions && unresolvedQuestions.length > 0) {
          description += `\n【悬念】${unresolvedQuestions.join("；")}`;
        }
        await prisma.storyBeat.create({
          data: {
            projectId,
            nodeId,
            description,
            chapterNumber: chapterOrder + 1,
            impact: impactScore >= 7 ? "major" : "minor",
          },
        });
      }

      send({ type: "summarize_done", summary, keyEvents });
    } catch (summaryErr) {
      // 摘要失败不阻塞主流程
      send({
        type: "summarize_error",
        content: String(summaryErr).slice(0, 100),
      });
    }
  }

  return {
    nodeId: updatedNode.id,
    status: updatedNode.status,
    reviewLog,
  };
}
