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

// 表格行的"关键列"——这些列的值出现在上下文里即视为命中召回（与 recall.ts 对齐）
const TABLE_KEY_COLS = ["name", "title", "key", "live", "place", "building", "type", "status"];

/**
 * 从结构化表格收集"已知长名"候选集合：表格关键列值（≥2字）作为已知更长名，
 * 供 matchNameStrict 的最长匹配吞并逻辑使用（3字 lorebook key 在更长表值内被吞并、不误召回）。
 * 与 recall.ts 的 TABLE_KEY_COLS / 收集逻辑保持一致。
 */
function collectTableKnownNames(
  tables?: Array<{ name: string; columns: any[]; rows: any[] }>,
): string[] {
  const names: string[] = [];
  if (!tables || !tables.length) return names;
  for (const t of tables) {
    const rows: any[] = t.rows || [];
    const cols: any[] = t.columns || [];
    const keyCols = cols.length ? cols.map((c) => c.key) : TABLE_KEY_COLS;
    for (const r of rows) {
      for (const kc of keyCols) {
        const v = r[kc];
        if (v && typeof v === "string" && v.length >= 2) names.push(v);
      }
    }
  }
  return names;
}

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
  maxResults = 10,
  tables?: Array<{ name: string; columns: any[]; rows: any[] }>
): { entry: LorebookEntry; triggerKeyword: string; matchScore: number }[] {
  const results: Map<string, { entry: LorebookEntry; triggerKeyword: string; matchScore: number }> = new Map();

  // Round6 P0-1：候选关键词集合（已知更长名优先吞并短名），供 matchNameStrict 最长匹配使用。
  // Round8 P0：在 lorebook keys 基础上补入表格关键列值（特别是长名/3字列值），
  // 使 3字 lorebook key 恰为更长表值前缀时被吞并、不误触发召回
  // （如 lorebook「李星云」不会在「李星云剑法」这种表值内被误召回）。
  const knownNames: string[] = [];
  for (const entry of entries) {
    if (!entry.enabled) continue;
    for (const key of entry.keys) {
      const k = (key || "").trim();
      if (k) knownNames.push(k);
    }
  }
  for (const n of collectTableKnownNames(tables)) {
    knownNames.push(n);
  }

  for (const entry of entries) {
    if (!entry.enabled) continue;

    // 收集本词条命中的关键词（过滤掉单字与瞎匹配），再最长匹配优先
    const hitKeys: string[] = [];
    for (const key of entry.keys) {
      const k = (key || "").trim();
      if (!k) continue;
      if (matchNameStrict(text, k, { knownNames })) hitKeys.push(k);
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

