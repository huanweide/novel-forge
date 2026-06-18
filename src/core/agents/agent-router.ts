/**
 * Agent 路由器 —— 统一入口
 *
 * 一条管道串起全部流程：
 *   自然语言 → intent-parser 拆工具 → tool-scheduler 调度执行 → 结果汇总为自然语言
 *
 * 双轨策略（来自 IMPLEMENTATION-PLAN.md）：
 *   现有 API 路由继续工作不受影响，Agent 层通过 AI 对话面板逐步接管。
 *   不搞大爆炸式替换。
 */

import { parseIntents, needsLLMFallback } from "./intent-parser";
import { scheduleCalls, buildScheduledCalls } from "./tool-scheduler";
import { toolRegistry } from "./tool-registry";
import type { ToolContext } from "./tool-registry";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface AgentRequest {
  /** 用户自然语言消息 */
  message: string;
  /** 项目 ID */
  projectId: string;
  /** 可选的上下文（当前编辑的章节、最近对话等） */
  context?: {
    currentNodeId?: string;
    recentMessages?: string[];
  };
}

export interface AgentResponse {
  /** 自然语言回复 */
  reply: string;
  /** 执行了哪些工具 */
  toolsCalled: string[];
  /** 总耗时 ms */
  elapsedMs: number;
  /** 是否需要前端执行的动作 */
  frontendActions: Array<{ type: string; payload: unknown }>;
  /** 是否回退到 LLM（意图解析失败时） */
  usedLLMFallback: boolean;
  /** 调试信息 */
  debug?: {
    intents: Array<{ tool: string; confidence: number }>;
    phases: string[][];
  };
}

// ═══════════════════════════════════════════
// 自然语言生成（轻量模板——不调 LLM）
// ═══════════════════════════════════════════

/**
 * 将工具执行结果汇总为自然语言。
 * 用轻量模板而非 LLM——零 Token 消耗。
 * 复杂场景（如修改确认、多步骤决策）由上游调 LLM 兜底。
 */
function summarizeResults(
  message: string,
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
  results: Map<string, { success: boolean; data: unknown; error?: string }>,
): string {
  if (results.size === 0) return "抱歉，我不太理解你想做什么。能再说具体一点吗？";

  const lines: string[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const [toolName, result] of results) {
    if (result.success) {
      successCount++;
      const summary = summarizeSingleResult(toolName, result.data as any);
      if (summary) lines.push(summary);
    } else {
      failCount++;
      lines.push(`❌ ${toolName}: ${result.error || "执行失败"}`);
    }
  }

  if (lines.length === 0) return "操作已完成。";

  // 单一工具的简洁回复
  if (results.size === 1 && successCount === 1) {
    return lines[0];
  }

  return lines.join("\n");
}

/** 按工具类型做单结果摘要 */
function summarizeSingleResult(toolName: string, data: any): string {
  switch (toolName) {
    case "character_list": {
      const chars = data?.characters || [];
      if (chars.length === 0) return "当前项目还没有角色。";
      const top = chars.slice(0, 8).map((c: any) => `${c.name}(${c.role})`).join("、");
      return `共 ${data.total} 个角色：${top}${chars.length > 8 ? "…" : ""}`;
    }

    case "character_get": {
      if (!data?.found) return data?.message || "未找到匹配的角色。";
      const c = data.character;
      const parts = [`「${c.name}」`];
      if (c.role) parts.push(`定位：${c.role}`);
      if (c.currentStatus && c.currentStatus !== "alive") parts.push(`状态：${c.currentStatus}`);
      if (c.arcProgress) parts.push(`弧光：${c.arcProgress}`);
      return parts.join(" | ");
    }

    case "outline_list": {
      const nodes = data?.outline || [];
      if (nodes.length === 0) return "当前项目还没有大纲。";
      const top = nodes.slice(0, 5).map((n: any) => `${n.title}(${n.type})`).join(" → ");
      return `大纲共 ${data.total} 个节点：${top}${nodes.length > 5 ? "…" : ""}`;
    }

    case "lore_list": {
      const entries = data?.entries || [];
      if (entries.length === 0) return "当前项目还没有世界书设定。";
      const top = entries.slice(0, 5).map((e: any) => `${e.title}`).join("、");
      return `共 ${data.total} 条世界书设定：${top}${entries.length > 5 ? "…" : ""}`;
    }

    case "foreshadowing_list": {
      const items = data?.foreshadowings || [];
      if (items.length === 0) return "当前项目还没有伏笔记录。";
      const pending = items.filter((f: any) => f.status === "pending").length;
      return `共 ${data.total} 条伏笔，其中 ${pending} 条待回收。`;
    }

    case "chapter_get": {
      if (!data) return "未找到章节内容。";
      return `「${data.title}」——状态：${data.status}，${data.wordCount || 0} 字${data.hasContent ? "，已有正文" : "，仅有大纲"}。`;
    }

    case "project_info": {
      const s = data?.stats || {};
      return `「${data?.name}」——${data?.genre?.join("、") || ""}，${s.totalWords || 0} 字 / ${s.characters || 0} 角色 / ${s.storyNodes || 0} 章节。`;
    }

    case "chapter_generate": {
      return `写作面板已就绪——为「${data?.title}」生成正文（目标 ${data?.targetWords} 字）。`;
    }

    // 创建/修改/删除类：直接用 message 字段
    case "character_create":
    case "lore_create":
    case "outline_create":
    case "foreshadowing_create":
    case "character_update":
    case "lore_update":
    case "outline_update":
    case "foreshadowing_update":
    case "character_delete":
    case "lore_delete":
    case "outline_delete":
      return data?.message || "操作已完成。";

    default:
      return data?.message || "";
  }
}

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════

/**
 * Agent 请求——自然语言 → 工具调用 → 结果汇总。
 *
 * 流程：
 * 1. intent-parser 拆工具（纯规则，零 Token）
 * 2. tool-scheduler 按依赖图调度执行
 * 3. 模板引擎汇总结果
 * 4. 意图解析失败时返回 usedLLMFallback=true（上游调 LLM 兜底）
 *
 * @param request  用户消息 + 项目ID
 * @param ctx      工具执行上下文（prisma + 辅助函数）
 * @returns 自然语言回复 + 元数据
 */
export async function routeAgentRequest(
  request: AgentRequest,
  ctx: ToolContext,
): Promise<AgentResponse> {
  const start = Date.now();

  // Step 1: 意图解析
  const intents = parseIntents(request.message);
  const fallback = needsLLMFallback(intents);

  if (fallback) {
    return {
      reply: "",
      toolsCalled: [],
      elapsedMs: Date.now() - start,
      frontendActions: [],
      usedLLMFallback: true,
      debug: { intents: intents.map((i) => ({ tool: i.tool, confidence: i.confidence })), phases: [] },
    };
  }

  // Step 2: 构建调度列表 + 执行
  const toolNames = intents.map((i) => ({ name: i.tool, args: i.args }));
  const calls = buildScheduledCalls(toolNames);
  const allSchemas = toolRegistry.getAllSchemas();

  const scheduleResult = await scheduleCalls(
    calls,
    allSchemas,
    ctx,
    (name, args, c) => toolRegistry.execute(name, args, c),
  );

  // Step 3: 汇总
  const reply = summarizeResults(request.message, toolNames, scheduleResult.results);

  // 收集 frontendActions
  const frontendActions: Array<{ type: string; payload: unknown }> = [];
  for (const [, result] of scheduleResult.results) {
    const data = result.data as any;
    if (data?.frontendAction) {
      frontendActions.push(data.frontendAction);
    }
  }

  return {
    reply,
    toolsCalled: [...scheduleResult.results.keys()],
    elapsedMs: Date.now() - start,
    frontendActions,
    usedLLMFallback: false,
    debug: {
      intents: intents.map((i) => ({ tool: i.tool, confidence: i.confidence })),
      phases: scheduleResult.phases,
    },
  };
}
