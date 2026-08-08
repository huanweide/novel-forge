/**
 * POST /api/game/start
 * 初始化游戏会话，生成第一段叙事 + 首批选项
 */
import { jsonError } from "@/lib/api-error";

import { NextResponse } from "next/server";
import { resetGameSession, ensureItemLorebook } from "@/core/game/game-engine";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { buildGameSystemPrompt, parseGameOutput } from "@/core/game/game-prompts";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  try {
    const { projectId, nodeId, concept } = await req.json();
    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    // 1. 创建或重置会话
    const session = await resetGameSession(projectId, nodeId);

    // 2. 加载上下文
    const [project, node, characters, loreEntries] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.characterCard.findMany({ where: { projectId, reviewStatus: "approved" }, take: 20 }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true, reviewStatus: "approved" }, take: 15 }),
    ]);

    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }
    // #123 软删防复活：已移入回收站的节点不允许开始游戏，避免污染 tombstone
    if (node.deletedAt) {
      return NextResponse.json({ error: "该节点已被删除（回收站），无法开始游戏。如需操作请先从回收站恢复" }, { status: 410 });
    }

    // 3. 组装起始提示词（v0.46.58：带上本章已有正文——游戏从已有内容之后继续，不再从零开始）
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
    const userPrompt = existingContent
      ? `【开始游戏】本章已有正文 ${existingContent.length} 字。请从现有正文的结尾自然续接，为游戏开场：简短承接上一段情节，然后给出 3-4 个编号选项让玩家选择接下来的行动。`
      : node.outline
        ? `【开始游戏】根据章纲，为本章写一个开场。从"${node.outline.slice(0, 80)}..."开始，生成精彩的入场叙事。记住在叙事结束后给出 3-4 个编号选项。`
        : `【开始游戏】为本章写一个精彩的开场。描述场景、氛围和角色的初始状态，然后给出 3-4 个编号选项。`;

    // v0.46.78：若玩家采用了 AI 构思的开场，则将其作为参考融入叙事（自然融入，不照抄）
    const finalUserPrompt = concept
      ? `${userPrompt}\n\n【构思参考】玩家已采用以下开场构思，请据此展开本章开场叙事，自然融入而非照抄原文：${concept}`
      : userPrompt;

    // 4. 调用 LLM
    const llmConfig = await getEffectiveConfig();
    const client = createLLMClient(llmConfig);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: finalUserPrompt },
    ];

    const stream = client.chatStream({
      model: llmConfig.writerModel,
      messages,
      temperature: 0.85,
      // N1 修复：deepseek-v4-flash 等推理模型会先吐思考链（reasoning_content），
      // 吃掉 max_tokens 预算。这里给足 2500，保证「思考 + 正文」都有空间。
      maxTokens: 2500,
    });

    // 5. 流式收集（非 SSE，直接收集完整响应）
    let fullResponse = "";
    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    // 6. 解析
    const parsed = parseGameOutput(fullResponse);
    const wordCount = parsed.narrative.length;

    let finalOptions = parsed.options;
    if (finalOptions.length < 2) {
      finalOptions = [
        { index: 1, text: "仔细观察周围环境" },
        { index: 2, text: "与身边的人交谈" },
        { index: 3, text: "继续探索前进" },
      ];
    }

    const entities = parsed.newEntities.map((ne) => ({
      ...ne,
      firstSeenRound: 1,
    }));

    // 处理初始物品（阿游 N1：写入 owner 与可携带的 category，与 processGameTurn / reconcile 对齐）
    const initialItems: any[] = [];
    for (const change of parsed.itemChanges) {
      if (change.operation === "gain") {
        initialItems.push({
          name: change.name,
          quantity: change.quantity,
          category: change.category || "other",
          owner: change.owner || "主角",
          source: "开场获得",
          acquiredRound: 1,
        });
      }
    }

    // 6.5 世界卡物品联动：开场 gain 的物品同样补世界书词条（与 processGameTurn:401-405 一致，Round12 A4c）
    for (const item of initialItems) {
      await ensureItemLorebook(session.projectId, item.name, item.owner || "主角");
    }

    // 7. 保存第一轮状态
    await prisma.gameState.create({
      data: {
        sessionId: session.id,
        round: 1,
        playerAction: "开始游戏",
        narrative: parsed.narrative,
        options: finalOptions as any,
        entities: entities as any,
        items: initialItems as any,
        plotProgress: parsed.plotProgress > 0 ? parsed.plotProgress : 5,
        wordCount,
      },
    });

    await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        currentRound: 1,
        totalWords: wordCount,
        plotProgress: parsed.plotProgress > 0 ? parsed.plotProgress : 5,
      },
    });

    // 8. 返回结果
    return NextResponse.json({
      sessionId: session.id,
      narrative: parsed.narrative,
      options: finalOptions,
      newEntities: entities,
      itemChanges: parsed.itemChanges,
      items: initialItems,
      plotProgress: parsed.plotProgress > 0 ? parsed.plotProgress : 5,
      totalWords: wordCount,
      currentRound: 1,
    });
  } catch (err: any) {
    console.error("[game/start] 错误:", err);
    return jsonError(err);
  }
}
