// ============================================================
// 探讨模式 — 共享工具函数
// 消除 adopt/chat/create 三个路由间的重复代码
// ============================================================

import type { ExploreStep } from "@/core/explore/types";

/** 步骤 → 世界书分类映射 */
export function stepToCategory(step: ExploreStep): string {
  const map: Record<ExploreStep, string> = {
    opening: "worldview",
    worldview: "worldview",
    protagonist: "custom",
    golden_finger: "custom",
    core_conflict: "plot",
    factions: "faction",
    power_system: "magic_system",
    currency: "economy",
    map: "geography",
    plot_thread: "plot",
    free_talk: "custom",
  };
  return map[step] || "custom";
}

/** 从文本中提取中文关键词作为触发词 (2-6字词，去停用词，按频排序) */
export function extractKeysFromText(text: string): string[] {
  const terms = text.match(/(?:[一-鿿]{2,6})(?=[：:，。、\n\s\-—（）\(\)])/g) || [];
  const freq: Record<string, number> = {};
  const stopWords = /^(本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么|但是|所以|因为|如果|虽然)/;
  for (const t of terms) {
    if (stopWords.test(t)) continue;
    freq[t] = (freq[t] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([k]) => k);
}

/** 从 LLM 返回的原始文本中稳健提取 JSON（处理 markdown 代码块包裹） */
export function extractJson(raw: string): Record<string, any> | null {
  try {
    const codeBlock = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = codeBlock ? codeBlock[1] : raw;
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
  } catch {
    return null;
  }
}

/**
 * 尝试从卡片内容中直接提取结构化数据（跳过 LLM 解析）
 * 成功 → 返回结构化对象
 * 失败 → 返回 null，走 LLM 路径
 */
export function tryExtractStructured(card: {
  title: string;
  content: string;
}): Record<string, any> | null {
  try {
    const parsed = JSON.parse(card.content);
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.name &&
      typeof parsed.name === "string"
    ) {
      return parsed;
    }
    if (
      parsed &&
      typeof parsed === "object" &&
      parsed.content &&
      typeof parsed.content === "string" &&
      parsed.content.length > 20
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 从结构化角色数据中提取触发词
 */
export function extractCharacterKeys(
  name: string,
  char: Record<string, any>,
): string[] {
  const keys: string[] = [name];
  if (Array.isArray(char.aliases)) keys.push(...char.aliases);
  if (Array.isArray(char.abilities))
    keys.push(...char.abilities.filter((a: any) => typeof a === "string"));
  return keys.slice(0, 8);
}
