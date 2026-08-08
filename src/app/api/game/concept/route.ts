/**
 * POST /api/game/concept
 * 在进入游戏前，先让 AI「构思本章开头」——返回一段开场构思（钩子/切入/氛围/初始张力），
 * 供玩家预览并选择「采用此构思开场」。不写入任何游戏状态。
 */
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { buildGameSystemPrompt } from "@/core/game/game-prompts";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { projectId, nodeId } = await req.json();
    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const [project, node, characters, loreEntries] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.characterCard.findMany({ where: { projectId }, take: 12 }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true }, take: 10 }),
    ]);

    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }
    // #123 软删防复活：已移入回收站的节点不允许构思开场，避免污染 tombstone
    if (node.deletedAt) {
      return NextResponse.json({ error: "该节点已被删除（回收站），无法构思开场。如需操作请先从回收站恢复" }, { status: 410 });
    }

    const existingContent = (node.content || "").trim();
    const ctx = {
      bookName: project.name,
      chapterTitle: node.title,
      outline: node.outline ?? null,
      existingContent: existingContent || null,
      characters: characters.map((c: { name: string; role: string; currentStatus: string; background?: string }) => ({
        name: c.name,
        role: c.role,
        currentStatus: c.currentStatus,
        briefDescription: c.background?.slice(0, 100) || "",
      })),
      worldLore: loreEntries.map((l: { title: string; content: string }) => ({ title: l.title, content: l.content })),
      previousTurns: [] as any[],
      entities: [] as any[],
      items: [] as any[],
      currentRound: 0,
      totalWords: existingContent.length,
      maxWords: 3000,
      plotProgress: 0,
    };

    const systemPrompt = buildGameSystemPrompt(ctx);
    const userPrompt =
      `【构思开头】请在动笔前，先为本章设计一个富有吸引力的开场构思（注意：是"构思"，不是正文）。\n` +
      `请用 2-4 句话点明本场的钩子：从什么情境切入、聚焦哪个角色或矛盾、想营造什么氛围、给玩家哪一种初始张力。\n` +
      `最后单独用一行给出「建议的起始行动：……」（玩家可据此选择开场动作）。\n` +
      `保持简洁、有画面感，避免剧透关键转折。`;

    const llmConfig = await getEffectiveConfig();
    const client = createLLMClient(llmConfig);

    const stream = client.chatStream({
      model: llmConfig.writerModel,
      messages: [
        { role: "system" as const, content: systemPrompt },
        { role: "user" as const, content: userPrompt },
      ],
      temperature: 0.9,
      maxTokens: 800,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      if (chunk.content) fullResponse += chunk.content;
    }

    const concept = fullResponse.trim() || "（构思生成失败，可直接开始游戏）";

    return NextResponse.json({ concept });
  } catch (err: any) {
    console.error("[game/concept] 错误:", err);
    return NextResponse.json({ error: err?.message || "构思失败" }, { status: 500 });
  }
}
