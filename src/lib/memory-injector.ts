/**
 * 记忆注入器 —— Token 优化五策略
 *
 * 把 classifyEvents 输出的 TieredMemory 转成可注入 prompt 的优化文本块。
 * 五个策略独立可测，组合使用时综合节省 ~60% token。
 *
 * 策略 1：JSON 结构化注入  —— S 级用紧凑 JSON，省 ~40% vs 自然语言
 * 策略 2：选择性字段注入    —— A 级只输出章节号+描述，不输出元数据
 * 策略 3：增量去重          —— 对比 recentContext，已在其中的事件跳过
 * 策略 4：引用压缩          —— B 级用 "Ch3:关键词" 索引，不用完整句子
 * 策略 5：分层优先级截断    —— S 全量 → A 40%预算 → B 20%预算，超预算静默丢弃
 */

import type { TieredMemory, TieredEvent } from "@/lib/memory-classifier";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface InjectionBudget {
  /** 总 token 预算（整个记忆注入块的上限） */
  maxTokens: number;
  /** S 级占比，默认 0.40 */
  sTierRatio: number;
  /** A 级占比，默认 0.40 */
  aTierRatio: number;
  /** B 级占比，默认 0.20 */
  bTierRatio: number;
}

export const DEFAULT_BUDGET: InjectionBudget = {
  maxTokens: 800,
  sTierRatio: 0.40,
  aTierRatio: 0.40,
  bTierRatio: 0.20,
};

// ═══════════════════════════════════════════
// 策略 3：增量去重
// ═══════════════════════════════════════════

/**
 * 从事件列表中移除内容与 recentContext 高度重叠的事件。
 * 用 30 字符窗口做子串匹配——如果事件的任意 30 字符子串已出现在 recentContext 中，则跳过。
 */
function dedupeEvents(events: TieredEvent[], recentContext: string): TieredEvent[] {
  if (!recentContext || recentContext.length < 30) return events;
  const ctx = recentContext.toLowerCase();

  return events.filter((e) => {
    const content = e.content.toLowerCase();
    // 滑动窗口：30 字符子串匹配
    for (let i = 0; i <= content.length - 30; i++) {
      const sub = content.slice(i, i + 30);
      if (ctx.includes(sub)) return false; // 重复，过滤掉
    }
    return true;
  });
}

// ═══════════════════════════════════════════
// 策略 1：JSON 结构化注入（S 级）
// ═══════════════════════════════════════════

/**
 * S 级用紧凑 JSON 格式，每条一行的结构化摘要。
 * 自然语言："第3章关键转折 — 李尘在宗门大比中击败内门弟子获得秘境资格"
 * JSON 格式：`{"ch":3,"e":"宗门大比击败内门弟子→秘境资格","imp":"角色_李尘"}`
 *
 * 节省：省掉"第X章关键转折—""获得"等连接词，~40%。
 */
function formatSTierStructured(events: TieredEvent[]): string[] {
  if (events.length === 0) return [];

  const lines: string[] = ["## 🔴 S级记忆——核心不可遗忘（结构化）"];
  for (const e of events) {
    const ch = e.chapterNumber ?? "?";
    // 提取涉及角色名（从 content 中提取【核心角色·xxx】格式）
    const roleMatch = e.content.match(/【核心角色·([^·]+)】/);
    const imp = roleMatch ? roleMatch[1] : e.importance;
    // 提取纯事件描述（去前缀标签）
    const desc = e.content
      .replace(/^【[^】]+】/, "")
      .replace(/^第\d+章[—\-]\s*/, "")
      .slice(0, 100); // 截断过长描述

    lines.push(`{"ch":${ch},"e":"${desc}","imp":"${imp}"}${e.importance === "critical" ? " ⚠️逾期" : ""}`);
  }
  return lines;
}

// ═══════════════════════════════════════════
// 策略 2：选择性字段注入（A 级）
// ═══════════════════════════════════════════

/**
 * A 级只输出章节号 + 事件描述，不输出 source/importance 等元数据。
 * 格式：`- Ch5: 李尘进入秘境试炼，遭遇妖兽袭击`
 */
function formatATierSelective(events: TieredEvent[]): string[] {
  if (events.length === 0) return [];

  const lines: string[] = ["## 🟡 A级记忆——近期关键事件"];
  for (const e of events) {
    const ch = e.chapterNumber ?? "?";
    const desc = e.content
      .replace(/^第\d+章[—\-]\s*/, "")
      .slice(0, 80);
    lines.push(`- Ch${ch}: ${desc}`);
  }
  return lines;
}

// ═══════════════════════════════════════════
// 策略 4：引用压缩（B 级）
// ═══════════════════════════════════════════

/**
 * B 级压缩为关键词索引，不用完整句子。
 * 格式：`Ch3:玉佩伏笔 | Ch5:秘境试炼 | Ch7:宗门大比`
 * 一行搞定全部 B 级事件。
 */
function formatBTierCompressed(events: TieredEvent[]): string[] {
  if (events.length === 0) return [];

  const snippets: string[] = [];
  for (const e of events) {
    const ch = e.chapterNumber ?? "?";
    // 取前 15 字做关键词摘要
    const kw = e.content
      .replace(/^第\d+章[—\-]\s*/, "")
      .replace(/^【[^】]+】/, "")
      .slice(0, 15);
    snippets.push(`Ch${ch}:${kw}`);
  }

  return [`## ⚪ B级记忆——历史归档（关键词索引）`, snippets.join(" | ")];
}

// ═══════════════════════════════════════════
// 策略 5：分层优先级截断
// ═══════════════════════════════════════════

/**
 * 按预算截断：S 全量 → A 占 sTierRatio → B 占 bTierRatio。
 * 超预算时静默丢弃尾部条目，不提示（避免浪费 token 说"已截断"）。
 */
function truncateByBudget(
  sLines: string[],
  aLines: string[],
  bLines: string[],
  budget: InjectionBudget,
  countTokens: (text: string) => number,
): string {
  const sText = sLines.join("\n");
  const sTokens = countTokens(sText);
  const sMax = Math.floor(budget.maxTokens * budget.sTierRatio);

  // S 级：如果超预算，逐条丢弃尾部
  let sFinal = sText;
  if (sTokens > sMax && sLines.length > 1) {
    const header = sLines[0];
    let acc = header;
    for (let i = 1; i < sLines.length; i++) {
      const candidate = acc + "\n" + sLines[i];
      if (countTokens(candidate) > sMax) break;
      acc = candidate;
    }
    sFinal = acc;
  }

  const remainingAfterS = budget.maxTokens - countTokens(sFinal);
  const aBudget = Math.floor(remainingAfterS * (budget.aTierRatio / (budget.aTierRatio + budget.bTierRatio)));

  // A 级：按 aBudget 截断
  let aText = "";
  if (aLines.length > 1 && aBudget > 0) {
    const header = aLines[0];
    let acc = header;
    for (let i = 1; i < aLines.length; i++) {
      const candidate = acc + "\n" + aLines[i];
      if (countTokens(candidate) > aBudget) break;
      acc = candidate;
    }
    aText = acc;
  }

  const remainingAfterA = remainingAfterS - countTokens(aText);
  const bBudget = Math.min(
    remainingAfterA,
    Math.floor(budget.maxTokens * budget.bTierRatio),
  );

  // B 级：按 bBudget 截断
  let bText = "";
  if (bLines.length > 0 && bBudget > 20) {
    bText = bLines.join("\n");
    if (countTokens(bText) > bBudget && bLines.length > 1) {
      // B 级通常只有 2 行（header + 内容），超了就截内容
      bText = bLines[0] + "\n" + bLines[1].slice(0, Math.floor(bBudget * 4)); // 粗略截断
    }
  }

  const parts = [sFinal, aText, bText].filter((p) => p.trim().length > 0);
  return parts.join("\n\n") + "\n";
}

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════

/**
 * 一站式：去重 → 格式化 → 截断 → 返回可注入 prompt 的记忆文本块。
 *
 * @param tieredMemory   classifyEvents 的输出
 * @param recentContext  最近上下文（当前大纲 + 最近章摘要），用于增量去重
 * @param budget         Token 预算配置，默认 DEFAULT_BUDGET
 * @param countTokens    Token 计数函数（从 @/core/assembly/tokenizer 传入）
 * @returns 可直接拼入 systemPrompt 的记忆文本块，或空字符串
 */
export function injectOptimizedMemory(
  tieredMemory: TieredMemory,
  recentContext: string,
  budget: InjectionBudget = DEFAULT_BUDGET,
  countTokens: (text: string) => number,
): string {
  // Step 1: 增量去重（策略 3）
  const sDeduped = dedupeEvents(tieredMemory.sTier, recentContext);
  const aDeduped = dedupeEvents(tieredMemory.aTier, recentContext);
  const bDeduped = dedupeEvents(tieredMemory.bTier, recentContext);

  // 全空则返回空
  if (sDeduped.length === 0 && aDeduped.length === 0 && bDeduped.length === 0) {
    return "";
  }

  // Step 2: 分级格式化（策略 1/2/4）
  const sLines = formatSTierStructured(sDeduped);
  const aLines = formatATierSelective(aDeduped);
  const bLines = formatBTierCompressed(bDeduped);

  // Step 3: 分层截断（策略 5）
  return truncateByBudget(sLines, aLines, bLines, budget, countTokens);
}
