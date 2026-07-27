// 宝宝流召回服务（剧情推进 = 记忆召回）
//
// 原理：根据当前正文/上下文，AI 筛总结 + 世界书「绿灯(关键词)机制」+ 用户输入 → 发正文 AI。
// 文档原话：默认不提供真正的剧情规划功能——它管"该注入哪段设定"，不替作者写走向。
//
// 本文件实现"召回"：从世界书(LorebookEntry.keys=绿灯关键词)与结构化表格(LoreTable 行)中，
// 匹配当前上下文命中的条目，返回应注入正文 AI 的记忆片段。

export interface RecallItem {
  source: "lorebook" | "table";
  title: string;
  content: string;
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

  // 1) 世界书：绿灯机制——enabled 且任一关键词出现在上下文中
  for (const e of lorebook) {
    if (e.enabled === false) continue;
    const keys: string[] = e.keys || [];
    const hit = keys.some((k) => k && text.includes(k));
    if (hit) items.push({ source: "lorebook", title: e.title, content: e.content });
  }

  // 2) 结构化表格：行的关键列值出现在上下文中即召回
  for (const t of tables) {
    const rows: any[] = t.rows || [];
    const cols: any[] = t.columns || [];
    const keyCols = cols.length ? cols.map((c) => c.key) : TABLE_KEY_COLS;
    for (const r of rows) {
      const hit = keyCols.some((kc) => {
        const v = r[kc];
        return v && typeof v === "string" && v.length >= 2 && text.includes(v);
      });
      if (hit) {
        const vals = (cols.length ? cols : []).map((c) => `${c.label}:${r[c.key] ?? ""}`).join("，");
        items.push({
          source: "table",
          title: t.name,
          content: vals || JSON.stringify(r),
        });
      }
    }
  }

  return items;
}
