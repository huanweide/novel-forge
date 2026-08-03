/**
 * 触发词匹配引擎 —— 世界书词条的「检索雷达」
 *
 * 工作原理：
 * 扫描最近生成的文本，找出所有匹配的触发词，然后把对应的世界书词条注入 Prompt。
 *
 * v0.46.63 升级：改用词边界匹配（src/core/text/match），灭掉「林」误命中「森林」这类瞎匹配；
 * 并采用「最长匹配优先」——短关键词若被更长的已命中关键词包含则剔除，相关性按关键词长度打分。
 */

import type { LorebookEntry } from "@/core/types";
import { scoreKeyword, dedupSubstring, matchNameStrict } from "@/core/text/match";

/**
 * 扫描文本中的触发词，返回命中的所有世界书词条
 *
 * @param text 要扫描的文本（通常是最近生成的内容 + 上下文）
 * @param entries 所有已启用的世界书词条
 * @param maxResults 最多返回多少条（防止塞爆Prompt）
 * @returns 按匹配特异性（关键词长度）降序 + insertionOrder 降序排列的匹配词条
 */
export function matchLoreEntries(
  text: string,
  entries: LorebookEntry[],
  maxResults = 10
): { entry: LorebookEntry; triggerKeyword: string; matchScore: number }[] {
  const results: Map<string, { entry: LorebookEntry; triggerKeyword: string; matchScore: number }> = new Map();

  for (const entry of entries) {
    if (!entry.enabled) continue;

    // 收集本词条命中的关键词（过滤掉单字与瞎匹配），再最长匹配优先
    const hitKeys: string[] = [];
    for (const key of entry.keys) {
      const k = (key || "").trim();
      if (!k) continue;
      if (matchNameStrict(text, k)) hitKeys.push(k);
    }
    if (hitKeys.length === 0) continue;

    const kept = dedupSubstring(hitKeys);
    const bestKey = (kept.length ? kept : hitKeys).sort(
      (a, b) => scoreKeyword(b) - scoreKeyword(a)
    )[0];
    const score = scoreKeyword(bestKey);

    results.set(entry.id, { entry, triggerKeyword: bestKey, matchScore: score });
  }

  // 按匹配特异性降序、再按 insertionOrder 降序，截取 maxResults
  return Array.from(results.values())
    .sort((a, b) => b.matchScore - a.matchScore || b.entry.insertionOrder - a.entry.insertionOrder)
    .slice(0, maxResults);
}

/**
 * 根据角色别名查找角色卡（用于OOC检查时快速匹配）
 */
export function findCharacterByName(
  text: string,
  characters: { id: string; name: string; aliases: string[] }[]
): string[] {
  const found: string[] = [];

  for (const char of characters) {
    const names = [char.name, ...char.aliases];
    for (const name of names) {
      // 改用词边界匹配（matchKeyword），避免「阿游」暴力子串误命中「阿克游说」这类 OOC 假阳性。
      if (matchNameStrict(text, name)) {
        found.push(char.id);
        break;
      }
    }
  }

  return found;
}
