import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { buildPromptContext } from "@/core/agents";
import { assemblePrompt, countTokens } from "@/core/assembly";

/**
 * POST /api/generate/preview-context
 *
 * 上下文预览 —— 生成前看一下当前 Prompt 里有什么。
 * 展示各区域内容、Token 用量、触发词匹配结果。
 *
 * 请求体：{ projectId: string; nodeId: string; authorNote?: string }
 */
export async function POST(request: Request) {
  try {
    const { projectId, nodeId, authorNote } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json(
        { error: "缺少 projectId 或 nodeId" },
        { status: 400 }
      );
    }

    const [project, currentNode, allNodes, characters, loreEntries, summaries] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        prisma.storyNode.findUnique({ where: { id: nodeId } }),
        prisma.storyNode.findMany({
          where: { projectId, content: { not: null } },
          orderBy: { order: "asc" },
        }),
        prisma.characterCard.findMany({ where: { projectId } }),
        prisma.lorebookEntry.findMany({
          where: { projectId, enabled: true },
        }),
        prisma.chapterSummary.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
      ]);

    if (!project || !currentNode) {
      return NextResponse.json(
        { error: "项目或节点不存在" },
        { status: 404 }
      );
    }

    // 找到当前节点之前的节点
    const currentNodeIndex = allNodes.findIndex((n) => n.id === nodeId);
    const previousNodes = allNodes.slice(
      Math.max(0, currentNodeIndex - 4),
      currentNodeIndex
    );

    // 构建上下文
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: currentNode as any,
      previousNodes: previousNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      authorNote,
    });

    // 组装 Prompt（不实际发送）
    const contextWindowSize = parseInt(
      process.env.CONTEXT_WINDOW_SIZE || "131072"
    );
    const { budget } = assemblePrompt(
      promptContext,
      contextWindowSize,
      "【预览模式——不会实际生成】"
    );

    // 各区域 Token 明细
    const breakdown = {
      systemPrompt: {
        tokens: countTokens(promptContext.systemPrompt),
        preview: promptContext.systemPrompt.slice(0, 200),
      },
      globalMemory: {
        tokens: countTokens(promptContext.globalMemory.projectSynopsis),
        preview: promptContext.globalMemory.projectSynopsis.slice(0, 200),
        protagonist: promptContext.globalMemory.currentProtagonist?.name || "无",
        toneKeywords: promptContext.globalMemory.toneKeywords,
      },
      triggeredLore: {
        tokens: countTokens(
          promptContext.triggeredLore.map((t) => t.entry.content).join(" ")
        ),
        count: promptContext.triggeredLore.length,
        entries: promptContext.triggeredLore.map((t) => ({
          title: t.entry.title,
          keyword: t.triggerKeyword,
          contentPreview: t.entry.content.slice(0, 100),
        })),
      },
      shortTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.shortTerm
            .map((n) => n.content || "")
            .join(" ")
        ),
        sectionCount: promptContext.slidingWindow.shortTerm.length,
        sections: promptContext.slidingWindow.shortTerm.map((n) => ({
          title: n.title,
          wordCount: n.wordCount,
        })),
      },
      mediumTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.mediumTerm
            .map((s) => s.summary)
            .join(" ")
        ),
        summaryCount: promptContext.slidingWindow.mediumTerm.length,
        summaries: promptContext.slidingWindow.mediumTerm.map((s) => ({
          chapterTitle: s.chapterTitle,
          summaryPreview: s.summary.slice(0, 100),
        })),
      },
      longTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.longTerm
            .map((b) => b.description)
            .join(" ")
        ),
        beatCount: promptContext.slidingWindow.longTerm.length,
      },
      authorNote: {
        tokens: countTokens(promptContext.authorNote || ""),
        content: promptContext.authorNote || "无",
      },
    };

    // 激活的角色（在前文/大纲中出现的）
    const recentText = [
      ...previousNodes.map((n) => n.content || ""),
      currentNode.outline || "",
    ].join(" ");
    const activeCharacters = characters
      .filter((c) => {
        const names = [c.name, ...((c.aliases as string[]) || [])];
        return names.some((name) =>
          recentText.toLowerCase().includes(name.toLowerCase())
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
      }));

    return NextResponse.json({
      budget,
      breakdown,
      activeCharacters,
      activeCharacterCount: activeCharacters.length,
      totalCharacterCount: characters.length,
      activeLoreCount: promptContext.triggeredLore.length,
      totalPromptTokens: budget.used || countTokens(JSON.stringify(breakdown)),
      contextWindowSize,
      usagePercent: ((budget.used || 0) / contextWindowSize * 100).toFixed(1),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "预览失败" },
      { status: 500 }
    );
  }
}
