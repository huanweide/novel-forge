// 宝宝流召回服务（剧情推进 = 记忆召回）
//
// 原理：根据当前正文/上下文，AI 筛总结 + 世界书「绿灯(关键词)机制」+ 用户输入 → 发正文 AI。
// 文档原话：默认不提供真正的剧情规划功能——它管"该注入哪段设定"，不替作者写走向。
//
// 本文件实现"召回"：从世界书(LorebookEntry.keys=绿灯关键词)与结构化表格(LoreTable 行)中，
// 匹配当前上下文命中的条目，返回应注入正文 AI 的记忆片段。
//
// v0.46.63 升级：改用词边界匹配（src/core/text/match），灭掉「林」误命中「森林」这类瞎匹配；
// 并对同一词条/行的命中关键词做「最长匹配优先」去重。

import { dedupSubstring, scoreKeyword, matchNameStrict } from "@/core/text/match";

export interface RecallItem {
  source: "lorebook" | "table";
  title: string;
  content: string;
  /** 命中关键词的特异性打分（关键词长度），用于按价值排序截断 */
  score: number;
}

// 表格行的"关键列"——这些列的值出现在上下文里即视为命中召回
const TABLE_KEY_COLS = ["name", "title", "key", "live", "place", "building", "type", "status"];

export function recallContext(
  contextText: string,
  lorebook: Array<{ title: string; content: string; keys: string[]; enabled?: boolean }>,
  tables: Array<{ name: string; columns: any[]; rows: any[] }>,
): RecallItem[] {
  const text = contextText || "";
  const items: RecallItem[] = [];

  // 1) 世界书：绿灯机制——enabled 且任一关键词「真实命中」上下文
  for (const e of lorebook) {
    if (e.enabled === false) continue;
    const keys: string[] = e.keys || [];
    const hitKeys = keys.filter((k) => k && matchNameStrict(text, k));
    if (hitKeys.length === 0) continue;
    // 最长匹配优先：被更长命中关键词包含的短词剔除（如「青龙」被「青龙镇」包含）
    const kept = dedupSubstring(hitKeys);
    const score = kept.reduce((m, k) => Math.max(m, scoreKeyword(k)), 0);
    items.push({ source: "lorebook", title: e.title, content: e.content, score });
  }

  // 2) 结构化表格：行的关键列值「真实命中」上下文即召回
  for (const t of tables) {
    const rows: any[] = t.rows || [];
    const cols: any[] = t.columns || [];
    const keyCols = cols.length ? cols.map((c) => c.key) : TABLE_KEY_COLS;
    for (const r of rows) {
      const hitKeys: string[] = [];
      for (const kc of keyCols) {
        const v = r[kc];
        if (v && typeof v === "string" && v.length >= 2 && matchNameStrict(text, v)) {
          hitKeys.push(v);
        }
      }
      if (hitKeys.length === 0) continue;
      // 最长匹配优先
      const kept = dedupSubstring(hitKeys);
      const score = kept.reduce((m, k) => Math.max(m, scoreKeyword(k)), 0);
      const vals = (cols.length ? cols : []).map((c) => `${c.label}:${r[c.key] ?? ""}`).join("，");
      items.push({
        source: "table",
        title: t.name,
        content: vals || JSON.stringify(r),
        score,
      });
    }
  }

  return items;
}
