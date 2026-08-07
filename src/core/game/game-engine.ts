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
import { evaluateConfirmEligibility, applyConfirm } from "@/core/confirm-guard";
import { STATUS_COMPLETED, STATUS_CONFIRMED, STATUS_DRAFTING } from "@/core/story-status";
import { buildGameSystemPrompt, buildActionPrompt, parseGameOutput } from "./game-prompts";
import type { GameActionInput, GameTurnOutput, GameSessionContext, GameEntity, GameItem, GameOption, GameSessionSummary } from "./types";

// 物品变动输入（含可选 owner，用于背包按 name+owner 隔离，阿游 P1）。
interface ItemChangeRequest {
  operation: string;
  name: string;
  quantity?: number;
  owner?: string;
}

const DEFAULT_OWNER = "主角";

// 按 (name, owner) 二元组应用背包变动，保证主角与 NPC 同名物品互不干扰（阿游 P1）。
// 纯函数：深拷贝每一项再修改，绝不改动入参（便于单测与并发安全）。
export function applyItemChanges(
  prevItems: GameItem[],
  changes: ItemChangeRequest[],
  round: number
): GameItem[] {
  let updatedItems: GameItem[] = prevItems.map((i) => ({ ...i }));
  const matches = (i: GameItem, name: string, owner: string) =>
    i.name === name && (i.owner || DEFAULT_OWNER) === owner;

  for (const change of changes) {
    const owner = change.owner || DEFAULT_OWNER;
    if (change.operation === "gain") {
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) {
        updatedItems[idx] = {
          ...updatedItems[idx],
          quantity: updatedItems[idx].quantity + (change.quantity || 1),
          owner: updatedItems[idx].owner || owner,
        };
      } else {
        updatedItems.push({
          name: change.name,
          quantity: change.quantity || 1,
          category: "other",
          source: `第${round}轮获得`,
          acquiredRound: round,
          owner,
        });
      }
    } else if (change.operation === "consume") {
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) {
        const q = updatedItems[idx].quantity - (change.quantity || 1);
        if (q <= 0) {
          updatedItems.splice(idx, 1);
        } else {
          updatedItems[idx] = { ...updatedItems[idx], quantity: q };
        }
      }
    } else if (change.operation === "equip") {
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) updatedItems[idx] = { ...updatedItems[idx], equipped: true };
    } else if (change.operation === "unequip") {
      // 阿游 P1-1：脱下/解下类。仅清 equipped 标记，物品仍在背包（不删）。
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) updatedItems[idx] = { ...updatedItems[idx], equipped: false };
    } else if (change.operation === "discard") {
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) {
        const q = updatedItems[idx].quantity - (change.quantity || 1);
        if (q <= 0) {
          updatedItems.splice(idx, 1);
        } else {
          updatedItems[idx] = { ...updatedItems[idx], quantity: q };
        }
      }
    } else if (change.operation === "destroy") {
      // 阿游 P1-1：损毁/摧毁类。从背包移除该物品（按数量递减，归零即移除）。
      const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
      if (idx >= 0) {
        const q = updatedItems[idx].quantity - (change.quantity || 1);
        if (q <= 0) {
          updatedItems.splice(idx, 1);
        } else {
          updatedItems[idx] = { ...updatedItems[idx], quantity: q };
        }
      }
    } else if (change.operation === "skip") {
      // 阿游 P1-1：流转/出售类（典当/抵押/出售经 OP_MAP 归一）。安全跳过，不改动背包。
      // 直接 no-op 返回成功（无告警，属预期行为）。
    } else {
      // 阿游 P1-1 修复：收窄兜底，不再对一切未知动词无脑 gain（原 else→gain 反向坑）。
      // 仅当操作确属「获得/得到/获取」类动词才兜底 gain（避免静默丢物）；
      // 其余真正未知动词 → 告警并安全跳过（不污染背包计数）。
      const SAFE_SKIP = new Set([
        "出售", "售卖", "交换", "交易", "卖出", "买出", "当掉", "典当", "抵押", "典押",
      ]);
      const GAIN_LIKE = new Set([
        "获得", "得到", "获取", "收下", "赢得", "缴获", "收到", "得手", "到手",
        "拾取", "捡到", "取得", "拾起", "拿",
      ]);
      if (SAFE_SKIP.has(change.operation)) {
        console.warn(`[applyItemChanges] 已知流转操作「${change.operation}」跳过入库（不计入背包）：${change.name}`);
      } else if (GAIN_LIKE.has(change.operation)) {
        const idx = updatedItems.findIndex((i) => matches(i, change.name, owner));
        if (idx >= 0) {
          updatedItems[idx] = {
            ...updatedItems[idx],
            quantity: updatedItems[idx].quantity + (change.quantity || 1),
            owner: updatedItems[idx].owner || owner,
          };
        } else {
          updatedItems.push({
            name: change.name,
            quantity: change.quantity || 1,
            category: "other",
            source: `第${round}轮获得`,
            acquiredRound: round,
            owner,
          });
        }
      } else {
        console.warn(
          `[applyItemChanges] 未知操作「${change.operation}」，无明确获得语义→安全跳过（不污染背包）：${change.name}`
        );
      }
    }
  }
  return updatedItems;
}

// ─── 会话管理 ──────────────────────────────────────────────────

/** 创建或恢复游戏会话 */
export async function ensureGameSession(
  projectId: string,
  nodeId: string,
  originalContentSnapshot?: string | null,
) {
  let session = await prisma.gameSession.findUnique({
    where: { projectId_nodeId: { projectId, nodeId } },
    include: { states: { orderBy: { round: "asc" } } },
  });

  if (!session) {
    // 检查 node 是否存在
    const node = await prisma.storyNode.findUnique({ where: { id: nodeId } });
    if (!node) throw new Error(`章节节点 ${nodeId} 不存在`);

    // IMP-001 快照修复：以「作者进入游戏那一刻」的 node.content 拍原正文快照作为第 0 段前置。
    // 若传了 preservedSnapshot（来自上一局会话），则复用同一份原正文，保证跨 reset 不变、二次导出不堆叠。
    const snapshot =
      originalContentSnapshot && originalContentSnapshot.length > 0
        ? originalContentSnapshot
        : (node.content || "");

    session = await prisma.gameSession.create({
      data: {
        projectId,
        nodeId,
        status: "active",
        currentRound: 0,
        totalWords: 0,
        maxWords: 3000,
        plotProgress: 0,
        originalContentSnapshot: snapshot,
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
  // 合并实体并按 name 去重（取末轮快照，阿游 P1-2），避免跨轮重复累积导致实体面板数据膨胀。
  const entityMap = new Map<string, GameEntity>();
  for (const s of session.states) {
    for (const e of (s.entities as unknown as any[]) || []) {
      if (e?.name) entityMap.set(e.name, e as GameEntity);
    }
  }
  const entities = Array.from(entityMap.values());
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
export async function* processGameTurn(input: GameActionInput, signal?: AbortSignal): AsyncGenerator<{
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
      // N1 修复：推理模型思考链吃预算，抬到 2500 保证正文非空（与 game/start 对齐）
      maxTokens: 2500,
      signal, // 阿游 P1-1：把前端透传的 abort 信号转发到底层 fetch，停止后 LLM 真正中断、灭 token 浪费
    });
    for await (const chunk of stream) {
      // 流式期用户停止：abort 信号透传进来后立即放弃本轮，停止消费并准备丢弃提交（阿游 P0-1）
      if (signal?.aborted) return;
      if (chunk.content) {
        fullResponse += chunk.content;
        yield { type: "token", content: chunk.content };
      }
    }
  } catch (err: any) {
    // 用户主动停止（abort）不是失败：优雅放弃本轮，不污染回放/对账
    if (err?.name === "AbortError" || signal?.aborted) return;
    yield { type: "error", error: `LLM 调用失败：${err?.message ?? err}` };
    return;
  }

  // 空流保护（阿游 P1-2）：若 LLM 返回 0 个 chunk，fullResponse 为空。
  // 此时不解析、不提交，直接 return 跳过 $transaction，
  // 避免产生「空叙事幻影轮次」污染回放——与 Round7 P0-2 自愈一致。
  if (!fullResponse.trim()) {
    yield { type: "error", error: "LLM 返回为空，本轮未提交" };
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

  // 6. 更新背包和实体（按 name+owner 隔离，阿游 P1）
  const newRound = session.currentRound + 1;
  const updatedItems = applyItemChanges(
    ctx.items,
    parsed.itemChanges as ItemChangeRequest[],
    newRound
  );

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

  // 持久化前最终核对 abort：若用户已在流式期停止（signal 透传，阿游 P0-1），
  // 此处丢弃本轮——不提交 gameState/session，不创建孤儿世界卡词条，与「停止=放弃本轮」语义一致，
  // 后端权威态停在 N，前端 abort 后 GET /api/game/state 对账读到 N，前后端不再错位。
  if (signal?.aborted) {
    return;
  }

  // 6.5 世界卡物品联动：游戏新获得的物品，若无对应 item 类世界书词条则自动补充（保留已有物品词条）
  for (const change of parsed.itemChanges) {
    if (change.operation === "gain") {
      await ensureItemLorebook(session.projectId, change.name, (change as any).owner || "主角");
    }
  }

  // 7. 持久化本轮状态
  const newTotalWords = session.totalWords + wordCount;
  const finalProgress = parsed.plotProgress > 0 ? parsed.plotProgress : session.plotProgress;

  // 7→8 两步写包进事务：避免「gameState 已落库、session 未更新」之间断流留下孤儿态（阿游 P0-2）。
  // 提交时机：仅在解析成功、即将产出 game_done 的这一步提交；流式 token 阶段不落库，
  // 故不存在「流式中间提前提交」。若用户停止/断网，后端已提交的权威态由前端 abort 后
  // GET /api/game/state 对账回拉覆盖（reconcileFromSummary），自愈前后端错位。
  // Round12 A1：gameState 现已落库 @@unique([sessionId, round])（schema.prisma:376），
  // 并发/重试写入同 round 会抛 P2002。改用 upsert：存在则更新、不存在则创建，幂等且不抛错，
  // 与下方 gameSession.update 同处一事务，保持原子性、不留孤儿态。
  await prisma.$transaction([
    prisma.gameState.upsert({
      where: { sessionId_round: { sessionId: session.id, round: newRound } },
      create: {
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
      update: {
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
    }),
    prisma.gameSession.update({
      where: { id: session.id },
      data: {
        currentRound: newRound,
        totalWords: newTotalWords,
        plotProgress: finalProgress,
      },
    }),
  ]);

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
// 世界卡物品联动：确保某物品在世界书中有对应 item 类词条。
// 已有则保留；无则补充创建（记录归属），使背包物品与世界卡双向打通。
// Round12 A4b：去重维度加 owner——主角与同名 NPC 物品各建独立词条，避免共用世界卡丢失归属。
export async function ensureItemLorebook(projectId: string, itemName: string, owner: string) {
  if (!itemName || itemName.length < 2) return;
  const candidates = await prisma.lorebookEntry.findMany({
    where: { projectId, category: "item", title: itemName },
  });
  // 仅在「同 title 且同归属 owner」的词条缺失时才新建，否则保留已有（归属已被该 owner 占用）。
  const ownerTag = `归属：${owner}`;
  const owned = candidates.find((e) => (e.content || "").includes(ownerTag));
  if (owned) return;
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
  status: string;
  autoConfirmed: boolean;
  autoFilled: boolean;
  qualityScore: number | null;
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
  // IMP-001 修复：游戏导出须保留写作原正文作为第 0 段前置，否则已有正文章节开启游戏并导出后
  // 原正文被游戏轮次整体覆盖（数据丢失）。
  // 关键：必须以「作者进入游戏时刻」的原正文快照（session.originalContentSnapshot）为前置，
  // 而非实时 session.node.content —— 后者在首次导出后已被改写为「原正文+游戏轮次」，
  // 若再次导出会把它当成原正文重复前置，造成堆叠损坏。快照跨 reset 复用，保证多次导出前置同一份原正文。
  const originalContent = session.originalContentSnapshot || session.node?.content || "";
  const existingNarrative = [
    originalContent,
    ...session.states.map((s) => s.narrative),
  ]
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
      // N1 修复：章尾收束段在推理模型下 400 预算会全被思考链吃光，抬到 2500
      maxTokens: 2500,
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

  // 5. 轻确认导出：与正式章节确认流程完全统一（Round1 遗留边界 #519）
  // 先评估质量分并落 drafting（不污染下游、不预置"接受"），
  // 再按项目「智能审阅」开关走自动确认：开启且达标→applyConfirm（confirmed+自动填表+reviewLogs），
  // 否则维持 drafting，由用户在确认栏手动定稿。质量分回写供 MonitorPanel 看板可见。
  const nodeForConfirm = session.node;
  const el = evaluateConfirmEligibility(
    { content: finalContent, qualityScore: null },
    [],
    true,
  );
  const proj = await prisma.project.findUnique({
    where: { id: session.projectId },
    select: { autoConfirmEnabled: true },
  });
  const autoConfirmOn = proj?.autoConfirmEnabled ?? true;

  await prisma.storyNode.update({
    where: { id: session.nodeId },
    data: {
      content: finalContent,
      wordCount: finalWordCount,
      status: STATUS_DRAFTING,
      qualityScore: el.score ?? null,
    },
  });

  let autoConfirmed = false;
  let autoFilled = false;
  if (autoConfirmOn && el.eligible) {
    try {
      const fillMsg = await applyConfirm({
        id: session.nodeId,
        projectId: session.projectId,
        content: finalContent,
        order: (nodeForConfirm as any)?.order ?? 0,
      });
      autoConfirmed = true;
      // IMP-003：记录导出是否真的回填了设定库，供前端给出明确提示（避免静默改动世界观）
      autoFilled = typeof fillMsg === "string" && fillMsg.includes("已执行");
    } catch (acErr) {
      console.error("[game-light-confirm] 自动确认失败，保持 drafting：", acErr);
    }
  }
  // 非自动确认或不达标 → 维持 drafting，由用户在确认栏手动定稿（与正式章节一致）

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
    status: autoConfirmed ? STATUS_CONFIRMED : STATUS_DRAFTING,
    autoConfirmed,
    autoFilled,
    qualityScore: el.score ?? null,
  };
}

/**
 * 清除旧会话（重新开始游戏时用）
 */
export async function resetGameSession(projectId: string, nodeId: string) {
  // R2-013 修复：每次「开局 / 重置游戏会话」都重拍作者「当前正在编辑」的实时 node.content 为原正文快照，
  // 确保快照始终 == 工作区真实正文，避免作者润色游戏导出章节后重开游戏时，手动编辑被首次入游的旧快照无声覆盖；
  // 同时消除两局语境错位（C0 旧快照与 C1 实时内容来源不同一）。
  // 注意：endGameAndExport 仍用快照作前置（防「同会话重复导出」的堆叠逻辑不变），此处只是把快照来源刷新为实时正文。
  // 取舍（遗留风险）：若作者「导出后未手动编辑」就直接重开游戏，上一局的游戏正文会被并入新快照基线
  // （即旧游戏输出现在成为新局的「原正文前置」），跨多次重开会持续累积；这与 IMP-001「重开即丢弃旧游戏输出、回到纯净原正文」的语义不同。
  const node = await prisma.storyNode.findUnique({ where: { id: nodeId } });
  const freshSnapshot = node?.content || "";

  const existing = await prisma.gameSession.findUnique({
    where: { projectId_nodeId: { projectId, nodeId } },
  });
  if (existing) {
    await prisma.gameState.deleteMany({ where: { sessionId: existing.id } });
    await prisma.gameSession.delete({ where: { id: existing.id } });
  }
  return ensureGameSession(projectId, nodeId, freshSnapshot);
}
