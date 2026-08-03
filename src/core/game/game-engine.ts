/**
 * 游戏模式 —— 核心引擎
 *
 * 职责：
 * 1. 加载游戏会话上下文（章纲、角色、世界观、历史轮次、背包）
 * 2. 调用 LLM 流式生成叙事
 * 3. 解析 AI 输出（叙事/选项/实体/物品/进度）
 * 4. 管理背包和实体状态
 * 5. 结束导出时：检查章尾悬念钩子 → 生成结尾 → 拼接正文 → 保存为 StoryNode.content
 */

import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { buildGameSystemPrompt, buildActionPrompt, parseGameOutput } from "./game-prompts";
import type { GameActionInput, GameTurnOutput, GameSessionContext, GameEntity, GameItem, GameOption, GameSessionSummary } from "./types";

// ─── 会话管理 ──────────────────────────────────────────────────

/** 创建或恢复游戏会话 */
export async function ensureGameSession(projectId: string, nodeId: string) {
  let session = await prisma.gameSession.findUnique({
    where: { projectId_nodeId: { projectId, nodeId } },
    include: { states: { orderBy: { round: "asc" } } },
  });

  if (!session) {
    // 检查 node 是否存在
    const node = await prisma.storyNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error(`章节节点 ${nodeId} 不存在`);

    session = await prisma.gameSession.create({
      data: {
        projectId,
        nodeId,
        status: "active",
        currentRound: 0,
        totalWords: 0,
        maxWords: 3000,
        plotProgress: 0,
      },
      include: { states: { orderBy: { round: "asc" } } },
    });
  }

  return session;
}

/** 获取会话摘要（返回给前端） */
export async function getSessionSummary(sessionId: string): Promise<GameSessionSummary> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { states: { orderBy: { round: "asc" } } },
  });
  if (!session) throw new Error(`游戏会话 ${sessionId} 不存在`);

  const allNarrative = session.states.map((s) => s.narrative).filter(Boolean).join("\n\n");
  const entities = session.states.flatMap((s) => (s.entities as unknown as any[]) || []) as GameEntity[];
  const items = session.states.length > 0
    ? ((session.states[session.states.length - 1].items as unknown as any[]) || []) as GameItem[]
    : [];
  const lastState = session.states[session.states.length - 1];
  const lastOptions = lastState ? (lastState.options as unknown as GameOption[]) : [];

  return {
    id: session.id,
    projectId: session.projectId,
    nodeId: session.nodeId,
    status: session.status,
    currentRound: session.currentRound,
    totalWords: session.totalWords,
    maxWords: session.maxWords,
    plotProgress: session.plotProgress,
    entities,
    items,
    lastOptions,
    allNarrative,
    turns: session.states.map((s) => ({
      round: s.round,
      playerAction: s.playerAction,
      narrative: s.narrative,
      options: (s.options as unknown as GameOption[]) || [],
    })),
  };
}

// ─── 上下文加载 ────────────────────────────────────────────────

async function loadGameContext(projectId: string, nodeId: string, session: any): Promise<GameSessionContext> {
  const [project, node, characters, loreEntries, states] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.storyNode.findUnique({ where: { id: nodeId } }),
    prisma.characterCard.findMany({ where: { projectId }, take: 20 }),
    prisma.lorebookEntry.findMany({ where: { projectId, enabled: true }, take: 15 }),
    prisma.gameState.findMany({
      where: { sessionId: session.id },
      orderBy: { round: "asc" },
    }),
  ]);

  if (!project || !node) throw new Error("项目或章节节点不存在");

  // 合并实体（去重）
  const entityMap = new Map<string, GameEntity>();
  for (const s of states) {
    for (const e of (s.entities as unknown as any[]) || []) {
      if (!entityMap.has(e.name)) entityMap.set(e.name, e as GameEntity);
    }
  }

  // 最新背包状态
  const latestItems: GameItem[] = states.length > 0
    ? ((states[states.length - 1].items as unknown as any[]) || [])
    : [];

  return {
    bookName: project.name,
    chapterTitle: node.title,
    outline: node.outline ?? null,
    existingContent: (node.content || "").trim() || null, // v0.46.58：本章已有正文
    characters: characters.map((c: { name: string; role: string; currentStatus: string; background?: string }) => ({
      name: c.name,
      role: c.role,
      currentStatus: c.currentStatus,
      briefDescription: c.background?.slice(0, 100) || "",
    })),
    worldLore: loreEntries.map((l: { title: string; content: string }) => ({ title: l.title, content: l.content })),
    previousTurns: states.map((s: { round: number; playerAction: string; narrative: string }) => ({
      round: s.round,
      playerAction: s.playerAction,
      narrative: s.narrative,
    })),
    entities: Array.from(entityMap.values()),
    items: latestItems,
    currentRound: session.currentRound,
    totalWords: session.totalWords,
    maxWords: session.maxWords,
    plotProgress: session.plotProgress,
  };
}

// ─── 核心游戏循环 ──────────────────────────────────────────────

/**
 * 处理一个游戏回合——流式版本
 * 返回一个 AsyncGenerator，逐 token 产出 SSE 事件
 */
export async function* processGameTurn(input: GameActionInput): AsyncGenerator<{
  type: string;
  content?: string;
  narrative?: string;
  options?: GameOption[];
  newEntities?: GameEntity[];
  itemChanges?: { operation: string; name: string; quantity: number }[];
  plotProgress?: number;
  wordCount?: number;
  error?: string;
}> {
  // 1. 加载会话和上下文
  const session = await prisma.gameSession.findUnique({
    where: { id: input.sessionId },
    include: { states: { orderBy: { round: "asc" } } },
  });
  if (!session) {
    yield { type: "error", error: "游戏会话不存在" };
    return;
  }
  if (session.status !== "active") {
    yield { type: "error", error: "游戏已结束" };
    return;
  }

  const ctx = await loadGameContext(session.projectId, session.nodeId, session);

  // 2. 组装提示词
  const systemPrompt = buildGameSystemPrompt(ctx);
  // 阿游 P1-1：从上一轮 states 取出所选选项文本，让 prompt 显式承接分支
  let selectedOptionText: string | undefined;
  if (input.selectedOption != null && session.states.length > 0) {
    const lastState = session.states[session.states.length - 1] as any;
    const opts = (lastState?.options || []) as any[];
    const hit = opts.find((o: any) => o?.index === input.selectedOption);
    if (hit) selectedOptionText = hit.text;
  }
  const userPrompt = buildActionPrompt({ ...input, selectedOptionText });

  // 3. 获取 LLM 配置并创建客户端
  const llmConfig = await getEffectiveConfig();
  const client = createLLMClient(llmConfig);

  // 4. 流式生成
  const messages = [
    { role: "system" as const, content: systemPrompt },
    { role: "user" as const, content: userPrompt },
  ];

  let fullResponse = "";
  try {
    const stream = client.chatStream({
      model: llmConfig.writerModel,
      messages,
      temperature: 0.85,
      maxTokens: 800,
    });
    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content;
        yield { type: "token", content: chunk.content };
      }
    }
  } catch (err: any) {
    yield { type: "error", error: `LLM 调用失败：${err.message}` };
    return;
  }

  // 5. 解析输出
  const parsed = parseGameOutput(fullResponse);
  const wordCount = parsed.narrative.length;

  // 如果没有解析到选项，给兜底选项
  let finalOptions = parsed.options;
  if (finalOptions.length < 2) {
    finalOptions = [
      { index: 1, text: "继续向前探索" },
      { index: 2, text: "仔细观察周围环境" },
      { index: 3, text: "与身边的人交谈" },
    ];
  }

  // 6. 更新背包和实体
  const prevItems = ctx.items;
  let updatedItems = [...prevItems];
  for (const change of parsed.itemChanges) {
    if (change.operation === "gain") {
      const owner = (change as any).owner || "主角";
      const existing = updatedItems.find((i) => i.name === change.name);
      if (existing) {
        existing.quantity += change.quantity || 1;
        if (!existing.owner) existing.owner = owner;
      } else {
        updatedItems.push({
          name: change.name,
          quantity: change.quantity || 1,
          category: "other",
          source: `第${session.currentRound + 1}轮获得`,
          acquiredRound: session.currentRound + 1,
          owner,
        });
      }
    } else if (change.operation === "consume") {
      const existing = updatedItems.find((i) => i.name === change.name);
      if (existing) {
        existing.quantity -= change.quantity || 1;
        if (existing.quantity <= 0) {
          updatedItems = updatedItems.filter((i) => i.name !== change.name);
        }
      }
    }
  }

  // 合并实体
  const existingEntities = ctx.entities;
  const newEntities = parsed.newEntities.filter(
    (ne) => !existingEntities.find((e) => e.name === ne.name)
  );
  const allEntities = [
    ...existingEntities,
    ...newEntities.map((ne) => ({
      ...ne,
      firstSeenRound: session.currentRound + 1,
    })),
  ];

  // 6.5 世界卡物品联动：游戏新获得的物品，若无对应 item 类世界书词条则自动补充（保留已有物品词条）
  for (const change of parsed.itemChanges) {
    if (change.operation === "gain") {
      await ensureItemLorebook(session.projectId, change.name, (change as any).owner || "主角");
    }
  }

  // 7. 持久化本轮状态
  const newRound = session.currentRound + 1;
  const newTotalWords = session.totalWords + wordCount;
  const finalProgress = parsed.plotProgress > 0 ? parsed.plotProgress : session.plotProgress;

  await prisma.gameState.create({
    data: {
      sessionId: session.id,
      round: newRound,
      playerAction:
        input.selectedOption != null
          ? `选择选项${input.selectedOption}${selectedOptionText ? `：${selectedOptionText}` : ""}`
          : (input.actionText || ACTION_TYPE_LABELS[input.actionType] || "自定义行动"),
      narrative: parsed.narrative,
      options: finalOptions as any,
      entities: allEntities as any,
      items: updatedItems as any,
      plotProgress: finalProgress,
      wordCount,
    },
  });

  // 8. 更新会话
  await prisma.gameSession.update({
    where: { id: session.id },
    data: {
      currentRound: newRound,
      totalWords: newTotalWords,
      plotProgress: finalProgress,
    },
  });

  // 9. 产出完整回合结果
  yield {
    type: "game_done",
    narrative: parsed.narrative,
    options: finalOptions,
    newEntities,
    itemChanges: parsed.itemChanges,
    plotProgress: finalProgress,
    wordCount,
  };
}

/**
 * 世界卡物品联动：确保某物品在世界书中有对应 item 类词条。
 * 已有则保留；无则补充创建（记录归属），使背包物品与世界卡双向打通。
 */
async function ensureItemLorebook(projectId: string, itemName: string, owner: string) {
  if (!itemName || itemName.length < 2) return;
  const existing = await prisma.lorebookEntry.findFirst({
    where: { projectId, category: "item", title: itemName },
  });
  if (existing) return;
  await prisma.lorebookEntry.create({
    data: {
      projectId,
      title: itemName,
      category: "item",
      keys: [itemName],
      content: `[游戏获得] 物品「${itemName}」，归属：${owner}。`,
      insertionOrder: 60,
      enabled: true,
      relatedEntryIds: [],
    },
  });
}

// 类型标签（避免跨文件导入问题）
const ACTION_TYPE_LABELS: Record<string, string> = {
  observe: "观察",
  dialogue: "对话",
  combat: "战斗",
  explore: "探索",
  use_item: "使用物品",
  rest: "休息",
  option: "选择选项",
  custom: "自定义行动",
};

// ─── 结束并导出 ────────────────────────────────────────────────

/**
 * 结束游戏，将累积正文保存为章节内容
 *
 * 流程：
 * 1. 检查章纲是否有"章尾悬念"钩子
 * 2. 有钩子 → 用钩子生成结尾叙事
 * 3. 无钩子 → 生成自然收尾
 * 4. 拼接所有叙事 + 结尾 → 保存 StoryNode.content
 * 5. 标记会话完成
 */
export async function endGameAndExport(sessionId: string): Promise<{
  nodeId: string;
  projectId: string;
  finalContent: string;
  totalWords: number;
}> {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: {
      states: { orderBy: { round: "asc" } },
      node: true,
    },
  });
  if (!session) throw new Error("游戏会话不存在");
  if (session.status !== "active") throw new Error("游戏已结束");

  // 1. 拼接已有叙事
  const existingNarrative = session.states
    .map((s) => s.narrative)
    .filter(Boolean)
    .join("\n\n");

  // 2. 检查章尾悬念钩子
  const outline = session.node.outline;
  let endingHook: string | null = null;
  if (outline) {
    // 匹配 【章尾悬念】：... 或 - **【章尾悬念】**：...
    const hookMatch = outline.match(/【章尾悬念】(?:：|:)\s*(.+?)(?:\n|$)/);
    if (hookMatch) {
      endingHook = hookMatch[1].trim();
    }
  }

  // 3. 调用 LLM 生成结尾
  const llmConfig = await getEffectiveConfig();
  const client = createLLMClient(llmConfig);

  let endingPrompt: string;
  if (endingHook) {
    endingPrompt = `本章即将结束。章纲预定了一个章节结尾的悬念钩子：

【章尾悬念】：${endingHook}

请基于此钩子，结合前面已完成的剧情，生成 2-3 段叙事为本草收尾。保留悬念感和余韵，但也要给本章一个完整的收束。不要出现任何游戏标记（NE/CI/PROGRESS/选项编号）。像正常小说章节一样自然收尾。`;
  } else {
    endingPrompt = `本章即将结束。请基于前面已完成的剧情，生成 2-3 段叙事为本草收尾。可以是：
- 环境的淡出描写
- 角色的内心独白
- 时间的过渡提示
- 情绪的沉淀收束

要求：自然、有画面感、像正常小说章节一样收尾。不要出现任何游戏标记。`;
  }

  const messages = [
    {
      role: "system" as const,
      content: `你是专业小说写手。前面正文已完成，现在需要写章尾收束段落。\n\n前面正文：\n${existingNarrative.slice(-800)}`,
    },
    { role: "user" as const, content: endingPrompt },
  ];

  let endingNarrative = "";
  try {
    const stream = client.chatStream({
      model: llmConfig.writerModel,
      messages,
      temperature: 0.8,
      maxTokens: 400,
    });
    for await (const chunk of stream) {
      if (chunk.content) {
        endingNarrative += chunk.content;
      }
    }
  } catch {
    // 如果 LLM 调用失败，用一个简单的收尾
    endingNarrative = "\n\n——本章完——";
  }

  // 4. 拼接最终内容（纯正文，无游戏标记）
  const finalContent = (existingNarrative + "\n\n" + endingNarrative).trim();
  const finalWordCount = finalContent.length;

  // 5. 保存到 StoryNode.content（覆盖或创建）
  await prisma.storyNode.update({
    where: { id: session.nodeId },
    data: {
      content: finalContent,
      wordCount: finalWordCount,
      status: "completed",
    },
  });

  // 6. 标记会话完成
  await prisma.gameSession.update({
    where: { id: sessionId },
    data: { status: "completed" },
  });

  return {
    nodeId: session.nodeId,
    projectId: session.projectId,
    finalContent,
    totalWords: finalWordCount,
  };
}

/**
 * 清除旧会话（重新开始游戏时用）
 */
export async function resetGameSession(projectId: string, nodeId: string) {
  const existing = await prisma.gameSession.findUnique({
    where: { projectId_nodeId: { projectId, nodeId } },
  });
  if (existing) {
    await prisma.gameState.deleteMany({ where: { sessionId: existing.id } });
    await prisma.gameSession.delete({ where: { id: existing.id } });
  }
  return ensureGameSession(projectId, nodeId);
}
