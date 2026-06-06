/**
 * 触发词匹配引擎 —— 世界书词条的"检索雷达"
 *
 * 工作原理：
 * 扫描最近生成的文本，找出所有匹配的触发词，然后把对应的世界书词条注入 Prompt。
 *
 * 当前用暴力关键词匹配（O(n*m)），后续升级为向量检索（pgvector）。
 */

import type { LorebookEntry } from "@/core/types";

/**
 * 扫描文本中的触发词，返回命中的所有世界书词条
 *
 * @param text 要扫描的文本（通常是最近生成的内容 + 上下文）
 * @param entries 所有已启用的世界书词条
 * @param maxResults 最多返回多少条（防止塞爆Prompt）
 * @returns 按 insertionOrder 降序排列的匹配词条
 */
export function matchLoreEntries(
  text: string,
  entries: LorebookEntry[],
  maxResults = 10
): { entry: LorebookEntry; triggerKeyword: string; matchScore: number }[] {
  const results: Map<string, { entry: LorebookEntry; triggerKeyword: string; matchScore: number }> = new Map();

  const lowerText = text.toLowerCase();

  for (const entry of entries) {
    if (!entry.enabled) continue;

    for (const key of entry.keys) {
      const lowerKey = key.toLowerCase();

      // 检查是否命中
      if (lowerText.includes(lowerKey)) {
        const existing = results.get(entry.id);

        // 同词条多次命中只保留分数最高的
        // 精确匹配 > 部分匹配，长关键词 > 短关键词
        const score = lowerKey.length / lowerText.length;

        if (!existing || score > existing.matchScore) {
          results.set(entry.id, {
            entry,
            triggerKeyword: key,
            matchScore: score,
          });
        }
      }
    }
  }

  // 按 insertionOrder 降序排列，截取 maxResults
  return Array.from(results.values())
    .sort((a, b) => b.entry.insertionOrder - a.entry.insertionOrder)
    .slice(0, maxResults);
}

/**
 * 根据角色别名查找角色卡（用于OOC检查时快速匹配）
 */
export function findCharacterByName(
  text: string,
  characters: { id: string; name: string; aliases: string[] }[]
): string[] {
  const lowerText = text.toLowerCase();
  const found: string[] = [];

  for (const char of characters) {
    const names = [char.name, ...char.aliases];
    for (const name of names) {
      if (lowerText.includes(name.toLowerCase())) {
        found.push(char.id);
        break;
      }
    }
  }

  return found;
}
