/**
 * GET /api/stats/monitor?projectId=xxx&nodeId=xxx
 *
 * 监测面板数据——总字数/当前章字数/Token估算/章节统计。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const nodeId = searchParams.get("nodeId");

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  try {
    const [nodes, summaries, beats, commitments] = await Promise.all([
      prisma.storyNode.findMany({
        where: { projectId },
        select: { id: true, title: true, type: true, status: true, wordCount: true, order: true, updatedAt: true, reviewLogs: true },
        orderBy: { order: "asc" },
      }),
      prisma.chapterSummary.count({ where: { projectId } }),
      prisma.storyBeat.count({ where: { projectId } }),
      prisma.pendingCommitment.count({ where: { projectId } }),
    ]);

    const chapters = nodes.filter((n) => n.type === "chapter" || n.type === "section" || n.type === "scene");
    const totalWords = nodes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
    const completedChapters = chapters.filter((n) => n.status === "completed").length;
    const pendingConfirmChapters = chapters.filter((n) => n.status === "pending_confirm").length;
    const confirmedChapters = chapters.filter((n) => n.status === "confirmed").length;
    const totalChapters = chapters.length;

    // 自动放行率：已确认章中由智能审阅（auto-confirm）自动审定的数量
    const autoConfirmedChapters = chapters.filter(
      (n) =>
        n.status === "confirmed" &&
        Array.isArray((n as any).reviewLogs) &&
        (n as any).reviewLogs.some((l: any) => l && l.action === "auto-confirm"),
    ).length;
    const autoRate = confirmedChapters > 0 ? Math.round((autoConfirmedChapters / confirmedChapters) * 100) : 0;

    // 当前章节
    let currentNode: typeof nodes[0] | null = null;
    if (nodeId) {
      currentNode = nodes.find((n) => n.id === nodeId) || null;
    }
    const currentWords = currentNode?.wordCount || 0;

    // Token 估算：中文约 1 字 ≈ 0.8 token（生成），prompt 侧约 2x
    const estimatedGeneratedTokens = Math.round(totalWords * 0.8);
    const estimatedPromptTokens = Math.round(estimatedGeneratedTokens * 2.5);
    const estimatedTotalTokens = estimatedGeneratedTokens + estimatedPromptTokens;

    // 章节分布
    const chaptersWithWords = chapters.filter((n) => n.wordCount > 0);
    const avgWordsPerChapter = chaptersWithWords.length > 0
      ? Math.round(totalWords / chaptersWithWords.length)
      : 0;
    const maxChapterWords = chaptersWithWords.length > 0
      ? Math.max(...chaptersWithWords.map((n) => n.wordCount))
      : 0;
    const minChapterWords = chaptersWithWords.length > 0
      ? Math.min(...chaptersWithWords.map((n) => n.wordCount))
      : 0;

    // 近 14 天写作节奏（按章节 updatedAt 聚合字数，近似每日产出）
    const dayMap = new Map<string, number>();
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const n of nodes) {
      const ts = (n as { updatedAt?: Date | string }).updatedAt ? new Date((n as { updatedAt?: Date | string }).updatedAt as string) : null;
      if (!ts) continue;
      const day = ts.toISOString().slice(0, 10);
      if (dayMap.has(day)) dayMap.set(day, (dayMap.get(day) || 0) + (n.wordCount || 0));
    }
    const dailyWords = [...dayMap.entries()].map(([date, words]) => ({ date, words }));

    // AI 成本看板：本月全站 LLM 调用聚合（自 v0.46.20 起记录，client 层单点落库）。
    // 注：client 层不持有 project 上下文，故此处做「全局」聚合，展示全项目 AI 花费；
    // 不伪装 per-project 精确统计（若需 per-project 需在调用链注入 projectId，属独立优化）。
    const usageMonthStart = new Date();
    usageMonthStart.setDate(1);
    usageMonthStart.setHours(0, 0, 0, 0);
    const [llmAgg, llmByModel] = await Promise.all([
      prisma.llmCallLog.aggregate({
        where: { createdAt: { gte: usageMonthStart } },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCost: true },
        _count: true,
      }),
      prisma.llmCallLog.groupBy({
        by: ["model"],
        where: { createdAt: { gte: usageMonthStart } },
        _sum: { totalTokens: true, estimatedCost: true },
        _count: true,
        orderBy: { _sum: { totalTokens: "desc" } },
      }),
    ]);
    const llmUsage = {
      since: usageMonthStart.toISOString().slice(0, 10),
      totalCalls: llmAgg._count,
      totalPromptTokens: llmAgg._sum.promptTokens || 0,
      totalCompletionTokens: llmAgg._sum.completionTokens || 0,
      totalTokens: llmAgg._sum.totalTokens || 0,
      totalCost: llmAgg._sum.estimatedCost || 0,
      byModel: llmByModel.map((g: { model: string; _count: number; _sum: { totalTokens?: number | null; estimatedCost?: number | null } }) => ({
        model: g.model,
        calls: g._count,
        tokens: g._sum.totalTokens || 0,
        cost: g._sum.estimatedCost || 0,
      })),
    };

    // P_a/P_c：按 projectId 分组聚合（本月）——使监测面板可展示「当前项目」与「全局」两档 token/费用。
    // 复用既有 llmCallLog（填表路径现也已带 projectId 落库），按 projectId 分组求和 estimatedCost。
    const [projectAgg, projectByProject] = await Promise.all([
      prisma.llmCallLog.aggregate({
        where: { createdAt: { gte: usageMonthStart }, projectId },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCost: true },
        _count: true,
      }),
      prisma.llmCallLog.groupBy({
        by: ["projectId"],
        where: { createdAt: { gte: usageMonthStart } },
        _sum: { totalTokens: true, estimatedCost: true, promptTokens: true, completionTokens: true },
        _count: true,
        orderBy: { _sum: { totalTokens: "desc" } },
      }),
    ]);
    const projectLlm = {
      since: usageMonthStart.toISOString().slice(0, 10),
      totalCalls: projectAgg._count,
      totalPromptTokens: projectAgg._sum.promptTokens || 0,
      totalCompletionTokens: projectAgg._sum.completionTokens || 0,
      totalTokens: projectAgg._sum.totalTokens || 0,
      totalCost: projectAgg._sum.estimatedCost || 0,
      byProject: projectByProject.map((g: { projectId: string | null; _count: number; _sum: { totalTokens?: number | null; estimatedCost?: number | null } }) => ({
        projectId: g.projectId,
        calls: g._count,
        tokens: g._sum.totalTokens || 0,
        cost: g._sum.estimatedCost || 0,
      })),
    };

    return NextResponse.json({
      totalWords,
      totalChapters,
      completedChapters,
      completionRate: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0,
      confirmStats: {
        pending: pendingConfirmChapters,
        confirmed: confirmedChapters,
        total: totalChapters,
        progress: totalChapters > 0 ? Math.round((confirmedChapters / totalChapters) * 100) : 0,
        autoConfirmed: autoConfirmedChapters,
        autoRate,
      },
      currentChapter: currentNode ? {
        id: currentNode.id,
        title: currentNode.title,
        wordCount: currentNode.wordCount,
        status: currentNode.status,
      } : null,
      tokens: {
        estimatedGenerated: estimatedGeneratedTokens,
        estimatedPrompt: estimatedPromptTokens,
        estimatedTotal: estimatedTotalTokens,
        note: "基于字数估算（中文 1字≈0.8生成token），精确值需启用 token 日志",
      },
      distribution: {
        avgWordsPerChapter,
        maxChapterWords,
        minChapterWords,
        chaptersWithContent: chaptersWithWords.length,
      },
      dataStats: {
        chapterSummaries: summaries,
        storyBeats: beats,
        pendingCommitments: commitments,
      },
      dailyWords,
      llmUsage,
      projectLlm,
    });
  } catch (err) {
    return jsonError(err);
  }
}
