// 宝宝流填表服务（国模填表·DeepSeek篇 精确配置）
//
// 原理：正文 → 填表总结 → 召回 → 正文
// 本文件实现「填表总结」：每写完一章，DeepSeek 自动从正文抽取结构化事实，写入对应结构化表格（LoreTable）。
//
// 国模填表 DeepSeek 精确配置（来自《奶龙都能看会的宝宝流数据库使用教程 v2.7》）：
//   - API: https://api.deepseek.com/v1 （由 settings.baseUrl 解析）
//   - 模型: deepseek-chat（本产品 settings.model，如 deepseek-v4-flash）
//   - 关思维链（COT）+ 严格 JSON：response_format: json_object
//   - 温度 1；SQL 模式填表，失败自动重试 3 次
// 注：本产品把"SQL 模式"等价实现为 JSON 行操作协议（insert/update/delete），在应用层用 JS 落地，兼具宝宝流语义且安全。

import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/llm";
import type { LoreTableOp, TableDef } from "./types";

export interface FillResult {
  ok: boolean;
  operations: number;
  applied: number;
  error?: string;
}

function parseOps(raw: string): LoreTableOp[] {
  if (!raw) return [];
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  else {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  try {
    const parsed = JSON.parse(s);
    const ops = Array.isArray(parsed) ? parsed : parsed.operations;
    if (Array.isArray(ops)) return ops.filter((o: any) => o && o.table && o.op) as LoreTableOp[];
  } catch {
    /* 解析失败交由重试逻辑处理 */
  }
  return [];
}

async function applyOps(tables: TableDef[], ops: LoreTableOp[]): Promise<number> {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  // 按表维护累积的 rows 副本：同一张表的多个操作必须串行累积，
  // 否则每次都从原始 t.rows 重新拷贝会互相覆盖（只保留最后一行）。
  const rowsCache = new Map<string, any[]>();
  const getRows = (t: TableDef): any[] => {
    if (!rowsCache.has(t.id)) {
      rowsCache.set(t.id, Array.isArray(t.rows) ? [...(t.rows as any[])] : []);
    }
    return rowsCache.get(t.id)!;
  };
  let applied = 0;
  for (const op of ops) {
    const t = byKey.get(op.table);
    if (!t) continue;
    const rows = getRows(t);

    if (op.op === "insert") {
      const maxId = rows.reduce((m: number, r: any) => Math.max(m, Number(r.row_id) || 0), 0);
      rows.push({ row_id: maxId + 1, ...(op.values || {}) });
      applied++;
    } else if (op.op === "update") {
      const { col, val } = (op as any).match || {};
      const idx = rows.findIndex((r: any) => String(r[col]) === String(val));
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...(op.values || {}) };
        applied++;
      } else {
        const maxId = rows.reduce((m: number, r: any) => Math.max(m, Number(r.row_id) || 0), 0);
        rows.push({ row_id: maxId + 1, [col]: val, ...(op.values || {}) });
        applied++;
      }
    } else if (op.op === "delete") {
      const { col, val } = (op as any).match || {};
      const before = rows.length;
      const filtered = rows.filter((r: any) => String(r[col]) !== String(val));
      applied += before - filtered.length;
      rows.length = 0;
      rows.push(...filtered);
    }

    await prisma.loreTable.update({ where: { id: t.id }, data: { rows } });
  }
  return applied;
}

export async function babyloreFill(
  projectId: string,
  chapterText: string,
  options?: { tableKeys?: string[] },
): Promise<FillResult> {
  let settings;
  try {
    settings = await getSettings();
  } catch (e) {
    return { ok: false, operations: 0, applied: 0, error: e instanceof Error ? e.message : "LLM 未配置" };
  }

  const where: any = { projectId };
  if (options?.tableKeys?.length) where.key = { in: options.tableKeys };
  const dbTables = await prisma.loreTable.findMany({ where });

  if (dbTables.length === 0) {
    return {
      ok: false,
      operations: 0,
      applied: 0,
      error: "项目暂无结构化表格。请先在创意工坊套用「表格模板预设」，或在项目「结构化表格」页新建。",
    };
  }

  const tables: TableDef[] = dbTables.map((t: any) => ({
    id: t.id,
    key: t.key,
    name: t.name,
    note: t.note || "",
    category: t.category || "custom",
    columns: (t.columns as any) || [],
    rows: (t.rows as any) || [],
  }));

  const tablesText = tables
    .map((t) => {
      const cols = (t.columns as any[]).map((c) => `${c.label}(${c.key})`).join("、");
      const rowsPrev = (t.rows as any[]).slice(-8).map((r) => JSON.stringify(r)).join("\n");
      return `表「${t.name}」 key=${t.key}\n说明：${t.note}\n列：${cols}\n已有样例(最近8行)：\n${rowsPrev || "（空）"}`;
    })
    .join("\n\n---\n\n");

  const systemPrompt = `你是小说数据库填表助手（宝宝流数据库·国模填表·DeepSeek篇）。
任务：阅读【最新章节正文】，提取结构化事实，写入对应结构化表格。
规则：
- 只提取"刚好覆盖当前进度"的事实，绝不编造。
- 输出严格 JSON（response_format=json_object），不要任何解释文字、不要 Markdown。
- 返回结构：{"operations":[{"table":"表英文key","op":"insert|update|delete","match":{"col":"列key","val":"匹配值"},"values":{"列key":"值"}}]}
  - insert：values 含各列值（row_id 由系统分配，勿填）。
  - update：match 指定按哪列匹配已有行（一般用唯一列如 name），values 为要更新的列。
  - delete：match 指定删除哪一行。
- 若某事实在表中已存在（同 name），用 update 而非 insert。
- 每个表只处理与本章相关的行。`;

  const userPrompt = `【结构化表格定义】
${tablesText}

【最新章节正文】
${chapterText.slice(0, 12000)}

请提取本章事实，输出 operations 的严格 JSON。`;

  const url = settings.baseUrl.endsWith("/v1")
    ? `${settings.baseUrl}/chat/completions`
    : `${settings.baseUrl}/v1/chat/completions`;

  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${settings.apiKey}`,
        },
        body: JSON.stringify({
          model: settings.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 1,
          max_tokens: 8000,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const e = await res.text().catch(() => "");
        lastErr = `API ${res.status}: ${e.slice(0, 200)}`;
        throw new Error(lastErr);
      }

      const data = await res.json();
      const raw = data?.choices?.[0]?.message?.content?.trim() || "";
      const ops = parseOps(raw);
      if (ops.length === 0) {
        lastErr = "模型未返回任何有效操作";
        if (attempt < 3) continue;
      }
      const applied = await applyOps(tables, ops);
      return { ok: true, operations: ops.length, applied };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 3) continue;
    }
  }
  return { ok: false, operations: 0, applied: 0, error: lastErr };
}
