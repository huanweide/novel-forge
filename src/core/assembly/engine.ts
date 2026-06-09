/**
 * Prompt 组装引擎 —— 系统的心脏
 *
 * 每一次请求 LLM 前，这个函数负责拼装完整的 Prompt。
 * 它把"当前场景施工图"发给 AI：你是谁、世界什么样、之前发生了什么、现在要写什么。
 *
 * 组装顺序（从顶到底）：
 * 1. System Prompt      —— AI身份定义
 * 2. Global Memory      —— 主线总纲 + 主角极简卡 + 基调
 * 3. Triggered Lore     —— 关键词触发注入的世界观
 * 4. Medium Term Memory —— 章节摘要（之前发生的事）
 * 5. Long Term Memory   —— 关键转折点提示
 * 6. Short Term Memory  —— 最近的正文（行文连贯）
 * 7. Author's Note      —— 作者强制介入指令
 */

import type {
  PromptContext,
  GlobalMemory,
  TriggeredLore,
  SlidingWindow,
  StoryNode,
  TokenBudget,
} from "@/core/types";
import { countTokens, truncateByTokens } from "./tokenizer";
import { safeJoin } from "@/lib/utils";

// ─── 配置常量 ───────────────────────────────────────────────

/** 各区域 Token 分配比例 */
const BUDGET_RATIOS = {
  systemPrompt: 0.08,    // 8%
  globalMemory: 0.10,    // 10%
  triggeredLore: 0.15,   // 15%
  shortTerm: 0.25,       // 25% —— 近期正文最重要
  mediumTerm: 0.10,      // 10%
  longTerm: 0.05,        // 5%
  authorNote: 0.02,      // 2%
  responseReserve: 0.25, // 25% —— 留给出文
};

// ─── 核心组装函数 ───────────────────────────────────────────

/**
 * 组装完整 Prompt
 *
 * @param context 上下文各组件
 * @param contextWindowSize 模型上下文窗口大小
 * @param writingInstruction Agent C 的撰写指令（要写什么）
 * @returns 组装好的 Prompt 字符串 + Token 预算报告
 */
export function assemblePrompt(
  context: PromptContext,
  contextWindowSize: number,
  writingInstruction: string
): { prompt: string; budget: TokenBudget } {
  const budget = calculateBudget(contextWindowSize);

  // 1. 系统指令区
  const systemSection = buildSystemSection(context.systemPrompt, budget.allocations.systemPrompt);

  // 2. 全局静态记忆
  const globalSection = buildGlobalMemorySection(context.globalMemory, budget.allocations.globalMemory);

  // 3. 动态触发世界书
  const loreSection = buildLoreSection(context.triggeredLore, budget.allocations.triggeredLore);

  // 4. 中期记忆（章节摘要）
  const mediumSection = buildMediumTermSection(context.slidingWindow, budget.allocations.mediumTermMemory);

  // 5. 长期记忆（关键转折点）
  const longSection = buildLongTermSection(context.slidingWindow, budget.allocations.longTermMemory);

  // 6. 短期记忆（近期正文）
  const shortSection = buildShortTermSection(context.slidingWindow, budget.allocations.shortTermMemory);

  // 7. 作者注释
  const authorSection = context.authorNote
    ? buildAuthorSection(context.authorNote, budget.allocations.authorNote)
    : "";

  // 拼装全文
  const sections = [
    systemSection,
    globalSection,
    loreSection,
    longSection,
    mediumSection,
    shortSection,
    authorSection,
  ].filter(Boolean);

  const assembledContext = sections.join("\n\n---\n\n");

  // 最终 Prompt
  const prompt = `${assembledContext}

---
【接下来请按照以下指令撰写正文】
${writingInstruction}`;

  // 计算实际 Token 用量
  const actualUsed = countTokens(prompt);
  budget.used = actualUsed;

  return { prompt, budget };
}

// ─── 各区块构建函数 ─────────────────────────────────────────

function buildSystemSection(systemPrompt: string, maxTokens: number): string {
  const content = truncateByTokens(systemPrompt, maxTokens);
  return `【系统指令】\n${content}`;
}

function buildGlobalMemorySection(memory: GlobalMemory, maxTokens: number): string {
  const parts: string[] = [];

  parts.push(`【主线总纲】\n${memory.projectSynopsis}`);

  if (memory.currentProtagonist) {
    const p = memory.currentProtagonist;
    parts.push(
      `【当前主角】${p.name}\n性格：${safeJoin(p.personality)}\n当前目标：${p.goal}\n当前状态：${p.status}`
    );
  }

  if (memory.toneKeywords.length > 0) {
    parts.push(`【小说基调】${memory.toneKeywords.join("、")}`);
  }

  // 角色花名册——由 buildPromptContext 构建，含关系/对话风格/外貌/弧光/能力/状态
  if (memory.characterRoster) {
    parts.push(`【角色当前状态——本章开始时各角色已知信息】\n${memory.characterRoster}`);
  }

  const fullContent = `【全局设定——始终牢记】\n${parts.join("\n\n")}`;
  return truncateByTokens(fullContent, maxTokens);
}

function buildLoreSection(
  triggeredLore: TriggeredLore[],
  maxTokens: number
): string {
  if (triggeredLore.length === 0) return "";

  // 每个词条的内容 + 触发标注
  const entries = triggeredLore.map(
    (t) => `[触发词：${t.triggerKeyword}]\n【${t.entry.title}】\n${t.entry.content}`
  );

  let result = `【当前场景相关设定】\n${entries.join("\n\n")}`;
  return truncateByTokens(result, maxTokens);
}

function buildShortTermSection(
  window: SlidingWindow,
  maxTokens: number
): string {
  const nodes = window.shortTerm;
  if (nodes.length === 0) return "";

  // 短期记忆按时间顺序（旧→新），截断到预算
  const texts = nodes.map(
    (n) => `### ${n.title}\n${n.content || n.outline || ""}`
  );

  // 从最新往旧拼接，保证最新的内容不会被截断
  let result = "";
  for (let i = texts.length - 1; i >= 0; i--) {
    const candidate = texts[i] + (result ? "\n\n---\n\n" + result : "");
    if (countTokens(candidate) > maxTokens) {
      // 当前这段太长了，尝试截断它
      const remaining = maxTokens - countTokens("\n\n---\n\n" + result);
      if (remaining > 0) {
        const truncated = truncateByTokens(texts[i], remaining, true); // 保留末尾
        result = truncated + "\n\n---\n\n" + result;
      }
      break;
    }
    result = candidate;
  }

  return result ? `【前文回顾——最近发生的事】\n${result}` : "";
}

function buildMediumTermSection(
  window: SlidingWindow,
  maxTokens: number
): string {
  const summaries = window.mediumTerm;
  if (summaries.length === 0) return "";

  const texts = summaries.map((s) => {
    const events = s.keyEvents.map((e) => `  - ${e}`).join("\n");
    return `[${s.chapterTitle}]\n${s.summary}\n关键事件：\n${events}`;
  });

  let result = "";
  for (let i = texts.length - 1; i >= 0; i--) {
    const candidate = texts[i] + (result ? "\n\n" + result : "");
    if (countTokens(candidate) > maxTokens) break;
    result = candidate;
  }

  return result ? `【本章之前的故事摘要】\n${result}` : "";
}

function buildLongTermSection(
  window: SlidingWindow,
  maxTokens: number
): string {
  const beats = window.longTerm;
  if (beats.length === 0) return "";

  const texts = beats.map((b) => `[第${b.chapterNumber}章] ${b.description}`);

  let result = "";
  for (let i = texts.length - 1; i >= 0; i--) {
    const candidate = texts[i] + (result ? "\n" + result : "");
    if (countTokens(candidate) > maxTokens) break;
    result = candidate;
  }

  return result ? `【前文关键伏笔与转折点】\n${result}` : "";
}

function buildAuthorSection(authorNote: string, maxTokens: number): string {
  return `【⚠️ 作者特别指令——最高优先级】\n${truncateByTokens(authorNote, maxTokens)}`;
}

// ─── 预算计算 ───────────────────────────────────────────────

function calculateBudget(contextWindowSize: number): TokenBudget {
  const allocations = {
    systemPrompt: Math.floor(contextWindowSize * BUDGET_RATIOS.systemPrompt),
    globalMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.globalMemory),
    triggeredLore: Math.floor(contextWindowSize * BUDGET_RATIOS.triggeredLore),
    shortTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.shortTerm),
    mediumTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.mediumTerm),
    longTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.longTerm),
    authorNote: Math.floor(contextWindowSize * BUDGET_RATIOS.authorNote),
    responseReserve: Math.floor(contextWindowSize * BUDGET_RATIOS.responseReserve),
  };

  return {
    total: contextWindowSize,
    used: 0,
    allocations,
  };
}

/**
 * 计算当前上下文组装后的实际 Token 用量（用于调试面板展示）
 */
export function calculateContextUsage(
  context: PromptContext,
  contextWindowSize: number
): TokenBudget {
  const budget = calculateBudget(contextWindowSize);

  budget.used = countTokens(
    [
      context.systemPrompt,
      context.globalMemory.projectSynopsis,
      context.globalMemory.currentProtagonist
        ? JSON.stringify(context.globalMemory.currentProtagonist)
        : "",
      context.globalMemory.toneKeywords.join(),
      ...context.triggeredLore.map((t) => t.entry.content),
      ...context.slidingWindow.shortTerm.map(
        (n) => n.content || n.outline || ""
      ),
      ...context.slidingWindow.mediumTerm.map((s) => s.summary),
      ...context.slidingWindow.longTerm.map((b) => b.description),
      context.authorNote || "",
    ].join(" ")
  );

  return budget;
}
