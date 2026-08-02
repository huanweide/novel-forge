import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";

/**
 * POST /api/generate/summarize
 *
 * 对完成的章节进行 AI 摘要压缩，存入中期记忆。
 * 这是「无限续写」的关键——写完的章节压缩成几百字的摘要，
 * 不再占用上下文窗口，只保留卡面和摘要就能一直写下去。
 *
 * 请求体：{ projectId: string; chapterId: string }
 */
export async function POST(request: Request) {
  try {
    const { projectId, chapterId } = await request.json();

    if (!projectId || !chapterId) {
      return NextResponse.json(
        { error: "缺少 projectId 或 chapterId" },
        { status: 400 }
      );
    }

    // 获取章节内容
    const chapter = await prisma.storyNode.findFirst({
      where: { id: chapterId, projectId },
    });

    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    if (!chapter.content) {
      return NextResponse.json({ error: "章节内容为空，无法摘要" }, { status: 400 });
    }

    // 获取相关角色
    const characterIds = chapter.activeCharacters as string[];
    const characters = characterIds.length > 0
      ? await prisma.characterCard.findMany({
          where: { id: { in: characterIds } },
        })
      : [];

    // AI 摘要压缩（支持项目级 LLM 覆盖）
    const projLlm = (await prisma.project.findUnique({ where: { id: projectId }, select: { llmConfig: true } }))?.llmConfig;
    const orchestrator = await AgentOrchestrator.fromSettings(undefined, projLlm as Record<string, unknown> | null);
    const { summary, keyEvents, characterStates, closingSnapshot, characterImpulses, eventImportances } = await orchestrator.summarizeChapter(
      chapter.content,
      chapter.title,
      characters as any,
      chapter.order,
      0, // 本章最新，diff=0
    );

    // 存入 ChapterSummary 表（含四级事件分层）
    const chapterSummary = await prisma.chapterSummary.create({
      data: {
        projectId,
        chapterId,
        chapterTitle: chapter.title,
        summary,
        keyEvents,
        characterStates: {
          states: JSON.parse(characterStates || '{"states":[]}'),
          closingSnapshot,
          impulses: characterImpulses,
        } as any,
        eventImportances: eventImportances as any,
      },
    });

    // 提取关键转折点存入 StoryBeat
    if (keyEvents.length > 0) {
      await prisma.storyBeat.create({
        data: {
          projectId,
          nodeId: chapterId,
          description: keyEvents.join("；"),
          chapterNumber: chapter.order + 1,
          impact: "minor",
        },
      });
    }

    return NextResponse.json({
      summary: chapterSummary,
      keyEvents,
      characterStates,
    });
  } catch (err) {
    console.error("摘要压缩失败:", err);
    return jsonError(err);
  }
}
