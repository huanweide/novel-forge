/**
 * GET /api/stats/monitor?projectId=xxx&nodeId=xxx
 *
 * 监测面板数据——总字数/当前章字数/Token估算/章节统计。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
        select: { id: true, title: true, type: true, status: true, wordCount: true, order: true },
        orderBy: { order: "asc" },
      }),
      prisma.chapterSummary.count({ where: { projectId } }),
      prisma.storyBeat.count({ where: { projectId } }),
      prisma.pendingCommitment.count({ where: { projectId } }),
    ]);

    const chapters = nodes.filter((n) => n.type === "chapter" || n.type === "section" || n.type === "scene");
    const totalWords = nodes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
    const completedChapters = chapters.filter((n) => n.status === "completed").length;
    const totalChapters = chapters.length;

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

    return NextResponse.json({
      totalWords,
      totalChapters,
      completedChapters,
      completionRate: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0,
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
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取统计数据失败" },
      { status: 500 },
    );
  }
}
