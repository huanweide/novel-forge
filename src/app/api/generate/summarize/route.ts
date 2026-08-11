import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
import { rebuildProjectDigest } from "@/core/pipeline/digest";

/**
 * POST /api/generate/summarize
 *
 * 对完成的章节进行 AI 摘要压缩，存入中期记忆。
 * 这是「无限续写」的关键——写完的章节压缩成几百字的摘要，
 * 不再占用上下文窗口，只保留卡面和摘要就能一直写下去。
 *
 * 三种调用模式（请求体 { projectId, chapterId, ... }）：
 *  1. 默认（无 preview / 无 summary）：AI 生成并落库（upsert，避免重复行）。
 *  2. preview: true：仅 AI 生成并返回结果，不落库（供「重新摘要」先预览、用户确认后再保存）。
 *  3. 携带 summary 字段（确认路径）：将前端已确认/编辑的摘要 upsert 落库，不再跑 LLM。
 */
interface SummarizeResult {
  summary: string;
  keyEvents: string[];
  characterStates: unknown;
  closingSnapshot: unknown;
  characterImpulses: unknown;
  eventImportances: unknown;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectId,
      chapterId,
      preview,
      summary,
      keyEvents,
      characterStates,
      closingSnapshot,
      characterImpulses,
      eventImportances,
    } = body as {
      projectId?: string;
      chapterId?: string;
      preview?: boolean;
      summary?: string;
      keyEvents?: string[];
      characterStates?: unknown;
      closingSnapshot?: unknown;
      characterImpulses?: unknown;
      eventImportances?: unknown;
    };

    if (!projectId || !chapterId) {
      return NextResponse.json({ error: "缺少 projectId 或 chapterId" }, { status: 400 });
    }

    // ── 模式 3：确认路径（前端已生成并确认/编辑，直接 upsert 落库，不跑 LLM）──
    if (summary !== undefined) {
      const saved = await persistSummary(projectId, chapterId, {
        summary,
        keyEvents: keyEvents ?? [],
        characterStates,
        closingSnapshot,
        characterImpulses,
        eventImportances,
      });
      return NextResponse.json({
        summary: saved,
        keyEvents: saved.keyEvents,
        characterStates: saved.characterStates,
      });
    }

    // 获取章节内容
    const chapter = await prisma.storyNode.findFirst({
      where: { id: chapterId, projectId, deletedAt: null },
    });

    if (!chapter) {
      return NextResponse.json({ error: "章节不存在" }, { status: 404 });
    }

    if (!chapter.content) {
      return NextResponse.json({ error: "章节内容为空，无法摘要" }, { status: 400 });
    }

    // ── 模式 2：preview 预览（仅生成、不落库）──
    if (preview === true) {
      const result = await runSummarize(projectId, chapter);
      return NextResponse.json({ preview: true, ...result });
    }

    // ── 模式 1：默认（生成 + upsert 落库）──
    const result = await runSummarize(projectId, chapter);
    const saved = await persistSummary(projectId, chapterId, result);
    // v1.8.23：摘要落库后重建项目级摘要大纲（失败静默降级，不影响本次摘要返回）
    try {
      await rebuildProjectDigest(projectId);
    } catch (de) {
      console.error("[digest] 摘要大纲重建失败（已降级）:", de instanceof Error ? de.message : de);
    }
    return NextResponse.json({
      summary: saved,
      keyEvents: saved.keyEvents,
      characterStates: saved.characterStates,
    });
  } catch (err) {
    console.error("摘要压缩失败:", err);
    return jsonError(err);
  }
}

/** 跑 AI 摘要压缩（支持项目级 LLM 覆盖） */
async function runSummarize(
  projectId: string,
  chapter: { content: string | null; title: string | null; order: number; activeCharacters?: unknown },
): Promise<SummarizeResult> {
  const characterIds = (chapter.activeCharacters as string[]) ?? [];
  const characters =
    characterIds.length > 0
      ? await prisma.characterCard.findMany({ where: { id: { in: characterIds } } })
      : [];

  const projLlm = (await prisma.project.findUnique({ where: { id: projectId }, select: { llmConfig: true } }))?.llmConfig;
  const orchestrator = await AgentOrchestrator.fromSettings(undefined, projLlm as Record<string, unknown> | null);
  const { summary, keyEvents, characterStates, closingSnapshot, characterImpulses, eventImportances } = await orchestrator.summarizeChapter(
    chapter.content ?? "",
    chapter.title ?? "",
    characters as never,
    chapter.order,
    0, // 本章最新，diff=0
  );

  return { summary, keyEvents, characterStates, closingSnapshot, characterImpulses, eventImportances };
}

/**
 * 将摘要 upsert 写入 ChapterSummary（同一章节复用一行，避免重复累积），
 * 并替换该章节在 StoryBeat 中的关键转折点（deleteMany + create，避免重复累加）。
 */
async function persistSummary(
  projectId: string,
  chapterId: string,
  result: SummarizeResult,
) {
  const chapter = await prisma.storyNode.findFirst({
    where: { id: chapterId, projectId, deletedAt: null },
    select: { title: true, order: true },
  });
  const chapterTitle = chapter?.title ?? "未命名章节";
  const chapterOrder = chapter?.order ?? 0;

  const charStatesPayload = {
    raw: result.characterStates,
    closingSnapshot: result.closingSnapshot,
    impulses: result.characterImpulses,
  } as never;

  const existing = await prisma.chapterSummary.findFirst({ where: { projectId, chapterId } });
  const chapterSummary = existing
    ? await prisma.chapterSummary.update({
        where: { id: existing.id },
        data: {
          chapterTitle,
          summary: result.summary,
          keyEvents: result.keyEvents,
          characterStates: charStatesPayload,
          eventImportances: (result.eventImportances ?? {}) as never,
        },
      })
    : await prisma.chapterSummary.create({
        data: {
          projectId,
          chapterId,
          chapterTitle,
          summary: result.summary,
          keyEvents: result.keyEvents,
          characterStates: charStatesPayload,
          eventImportances: (result.eventImportances ?? {}) as never,
        },
      });

  // 关键转折点：替换本章原有 beats（避免重复累加）
  if (result.keyEvents.length > 0) {
    await prisma.storyBeat.deleteMany({ where: { projectId, nodeId: chapterId } });
    await prisma.storyBeat.create({
      data: {
        projectId,
        nodeId: chapterId,
        description: result.keyEvents.join("；"),
        chapterNumber: chapterOrder + 1,
        impact: "minor",
      },
    });
  }

  return chapterSummary;
}
