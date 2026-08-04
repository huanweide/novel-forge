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
//
// v0.46.63 重写：灭错名三件套 ——
//  ① 给 LLM 看【权威名录·已有名称 + 全量样例行】（不再只给最近 8 行，看不到全量才造地名变体）；
//  ② 强化提示词（零杜撰/复用已有/完整性/填后自检）；
//  ③ applyOps 代码级去重（同名 insert 自动转 update，杜绝重复行）；
//  ④ 返回「疑似错误地名」警告 + 新增 selfCheckFill（全正文检索校验名称真实性 + 空值完整性）；
//  ⑤ 新增 babyloreFillAll（一键从首章填到最新 + 防重复跳过已填章节）。

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { recordLlmCall } from "@/lib/llm";
import { getSettings } from "@/lib/llm";
import { buildProjectOverrides } from "@/core/llm/client";
import type { LoreTableOp, TableDef } from "./types";

export interface FillResult {
  ok: boolean;
  operations: number;
  applied: number;
  error?: string;
  warnings?: string[]; // 疑似错误地名/名称提示
}

export interface FillAllResult {
  ok: boolean;
  failed: number; // 未达完成门槛（ok && applied>0）的章节数，供前端呈现「部分失败/可重试」
  processed: number; // 实际填表章节数
  skipped: number; // 因已填而跳过的章节数（防重复）
  operations: number;
  applied: number;
  error?: string;
  warnings: string[]; // 各章疑似错误地名
  selfCheck: SelfCheckResult;
}

export interface SelfCheckIssue {
  table: string;
  row: number | string;
  value: string;
  issue: string;
}
export interface SelfCheckResult {
  checkedTables: number;
  nameIssues: number; // 疑似错误地名/名称
  completenessIssues: number; // 空值/缺名称
  crossTableIssues: number; // 跨表同名（归属待确认）
  issues: SelfCheckIssue[];
}

// ─── 防重复填表标记（持久化已填章节，避免重复劳动）──────────
const FILLED_PATH = path.join(process.cwd(), ".runtime", "babylore-filled.json");
function loadFilled(): Record<string, string[]> {
  try {
    return JSON.parse(fs.readFileSync(FILLED_PATH, "utf-8"));
  } catch {
    return {};
  }
}
function saveFilled(m: Record<string, string[]>) {
  fs.mkdirSync(path.dirname(FILLED_PATH), { recursive: true });
  fs.writeFileSync(FILLED_PATH, JSON.stringify(m, null, 2));
}

/** 标记某章节已填表（供写章自动填表与一键填表共享同一防重复标记） */
export function markChapterFilled(projectId: string, nodeId: string) {
  const m = loadFilled();
  const set = new Set(m[projectId] || []);
  if (set.has(nodeId)) return;
  set.add(nodeId);
  m[projectId] = Array.from(set);
  saveFilled(m);
}

// ─── 工具 ──────────────────────────────────────────────────

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

/** 取表的「身份列」：优先 name/title/place/live/key/building，否则第一列 */
function getIdentityCol(t: { columns?: any[] }): string {
  const cols = (t.columns as any[]) || [];
  const keys = cols.map((c) => c.key);
  const priority = ["name", "title", "place", "live", "key", "building"];
  for (const p of priority) if (keys.includes(p)) return p;
  return keys[0] || "name";
}

/** 组装给 LLM 的表格文本：权威名录（已有名称）+ 全量样例行（截断保护） */
function buildTablesText(tables: TableDef[]): string {
  return tables
    .map((t) => {
      const cols = (t.columns as any[]).map((c) => `${c.label}(${c.key})`).join("、");
      const idCol = getIdentityCol(t);
      const allRows = (t.rows as any[]) || [];
      // 权威名录：所有已有名称（去重），防止 LLM 造地名变体
      const nameRoster = Array.from(
        new Set(allRows.map((r) => r[idCol]).filter((v) => v != null && String(v).trim() !== ""))
      ) as string[];
      const rosterText = nameRoster.length
        ? nameRoster.slice(0, 80).map((n) => `- ${n}`).join("\n")
        : "（空，可放心新增）";
      const rosterNote = nameRoster.length > 80 ? `\n（共 ${nameRoster.length} 个名称，已展示前 80）` : "";
      // 全量样例行（截断保护，避免超大表撑爆 prompt）
      const cap = 60;
      const rowsSample = allRows.slice(0, cap).map((r) => JSON.stringify(r)).join("\n");
      const rowsNote = allRows.length > cap ? `\n（共 ${allRows.length} 行，已展示前 ${cap}）` : "";
      return `表「${t.name}」 key=${t.key}
说明：${t.note}
列：${cols}
【权威名录·已有名称（新增事实必须复用，禁止自创同义变体/繁简混用）】
${rosterText}${rosterNote}
【已有样例（全量前 ${cap} 行）】
${rowsSample || "（空）"}${rowsNote}`;
    })
    .join("\n\n---\n\n");
}

const STRICT_SYSTEM_PROMPT = `你是小说数据库填表助手（宝宝流数据库·国模填表·DeepSeek篇）。
任务：阅读【最新章节正文】，提取结构化事实，写入对应结构化表格。

铁律（违反即错误，必须严格遵守）：
1. 名称零杜撰：所有写入的名称（人名/地名/组织名/物品名/功法名）必须逐字复制【最新章节正文】里的原文用字（含繁简、异体写法），禁止音译、改写、缩写、自创同义变体。例：正文写「青龙镇」就填「青龙镇」，不得改成「青龍镇」「青龙城」或「青龙门」之类。
2. 复用已有：每个表已附【权威名录·已有名称】。若本章事实涉及的名称已在名录中，必须用 update 复用该行（match 按名称列匹配），严禁再 insert 同名新行。
3. 新增慎重：仅当正文出现全新且确定性的名称、且不在名录中时，才 insert 新行；新名称仍须与正文用字完全一致。
4. 完整性：提取正文中明确出现、且属于本表列项的事实，不遗漏；但不要凭空补充正文没有的信息。
5. 填后自检：每个被填的名称值都必须能在【最新章节正文】里找到原文；若找不到，说明是错误地名/名称，绝对不要填。

输出严格 JSON（response_format=json_object），不要任何解释文字、不要 Markdown。
返回结构：{"operations":[{"table":"表英文key","op":"insert|update|delete","match":{"col":"列key","val":"匹配值"},"values":{"列key":"值"}}]}
  - insert：values 含各列值（row_id 由系统分配，勿填）。
  - update：match 指定按哪列匹配已有行（一般用唯一列如 name），values 为要更新的列。
  - delete：match 指定删除哪一行。
- 若某事实在表中已存在（同 name），用 update 而非 insert。
- 每个表只处理与本章相关的行。`;

interface LlmCreds {
  baseURL: string;
  apiKey: string;
  model: string;
}

async function runFillForText(
  chapterText: string,
  tables: TableDef[],
  llm: LlmCreds,
  tableKeys?: string[],
): Promise<{ ok: boolean; operations: number; applied: number; warnings: string[]; error?: string }> {
  const filteredTables = tableKeys && tableKeys.length ? tables.filter((t) => tableKeys.includes(t.key)) : tables;
  if (filteredTables.length === 0) {
    return { ok: false, operations: 0, applied: 0, warnings: [], error: "没有匹配的表格" };
  }

  const tablesText = buildTablesText(filteredTables);
  const userPrompt = `【结构化表格定义】
${tablesText}

【最新章节正文】
${chapterText.slice(0, 12000)}

请提取本章事实，输出 operations 的严格 JSON。`;

  const url = llm.baseURL.endsWith("/v1")
    ? `${llm.baseURL}/chat/completions`
    : `${llm.baseURL}/v1/chat/completions`;

  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${llm.apiKey}`,
        },
        signal: AbortSignal.timeout(120000),
        body: JSON.stringify({
          model: llm.model,
          messages: [
            { role: "system", content: STRICT_SYSTEM_PROMPT },
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
      const r = await applyOps(filteredTables, ops, chapterText);
      const warnings = [...r.warnings, ...buildWarnings(r.appliedNames, chapterText)];
      // P0-3：以「实际落地数 applied」为完成门槛——空 ops / 全失效 ops 的章节
      // 须视为失败（ok:false），使其可重试而非被永久标记「已填」（防重复机制反噬）。
      if (r.applied === 0) {
        warnings.push(`本章未落地任何事实（ops=${ops.length}）：${lastErr || "空 ops 或全失效"}，将标记为未填以便重试`);
      }
      const usage = (data as any)?.usage;
      recordLlmCall({
        model: llm.model,
        role: "assistant",
        promptTokens: usage?.prompt_tokens ?? usage?.promptTokens ?? 0,
        completionTokens: usage?.completion_tokens ?? usage?.completionTokens ?? 0,
        totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0,
        baseURL: llm.baseURL,
      });
      return {
        ok: r.applied > 0,
        operations: ops.length,
        applied: r.applied,
        warnings,
        error: r.applied > 0 ? undefined : lastErr || "未落地任何事实",
      };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
      if (attempt < 3) continue;
    }
  }
  return { ok: false, operations: 0, applied: 0, warnings: [], error: lastErr };
}

async function applyOps(
  tables: TableDef[],
  ops: LoreTableOp[],
  _chapterText: string,
): Promise<{ applied: number; appliedNames: { table: string; value: string }[]; warnings: string[] }> {
  const byKey = new Map(tables.map((t) => [t.key, t]));
  let applied = 0;
  const appliedNames: { table: string; value: string }[] = [];
  const warnings: string[] = [];

  for (const op of ops) {
    const t = byKey.get(op.table);
    if (!t) continue;
    // 直接累积修改 tables 内的 t.rows（同一引用贯穿多章循环）：
    // 上一章写回后 t.rows 即最新，下一章 applyOps 看到累积结果，
    // 灭「一键填表每章整体覆盖写回、静默丢失前序章」的缺陷（墨白 P0-1）。
    const rows: any[] = Array.isArray(t.rows) ? t.rows : (t.rows = []);
    const idCol = getIdentityCol(t);

    if (op.op === "insert") {
      const newVal = (op.values || {})[idCol];
      // 代码级去重：同主键名已存在则转 update（杜绝同名重复行）
      const existingIdx =
        newVal != null
          ? rows.findIndex((r: any) => String(r[idCol] ?? "").toLowerCase() === String(newVal).toLowerCase())
          : -1;
      if (existingIdx >= 0) {
        rows[existingIdx] = { ...rows[existingIdx], ...(op.values || {}) };
        applied++;
        if (newVal != null) appliedNames.push({ table: t.name, value: String(newVal) });
      } else {
        const maxId = rows.reduce((m: number, r: any) => Math.max(m, Number(r.row_id) || 0), 0);
        const row: any = { row_id: maxId + 1, ...(op.values || {}) };
        rows.push(row);
        applied++;
        if (newVal != null) appliedNames.push({ table: t.name, value: String(newVal) });
      }
    } else if (op.op === "update") {
      const { col, val } = (op as any).match || {};
      const cols = (t.columns || []) as Array<{ key: string }>;
      // 守卫：LLM 发 update 却漏给 match 或 col 非有效列时，原逻辑会推入带脏键「undefined」的伪行且不报警，
      // 破坏防重复/零错名。此处无效则跳过该 op，不落库、不插伪行（P1-①）。
      if (!col || !cols.some((c) => c.key === col)) {
        warnings.push(`表「${t.name}」update 缺少有效 match 列「${String(col || "")}」，已跳过该操作（不插伪行）`);
        continue;
      }
      // 大小写不敏感匹配（与 insert 去重一致），避免「青龙镇」/「青龙鎮」因字形/大小写漏匹配（墨白 F5）
      const idx = rows.findIndex((r: any) => String(r[col] ?? "").toLowerCase() === String(val ?? "").toLowerCase());
      if (idx >= 0) {
        rows[idx] = { ...rows[idx], ...(op.values || {}) };
        applied++;
        const uv = (op.values || {})[idCol] ?? val;
        if (uv != null) appliedNames.push({ table: t.name, value: String(uv) });
      } else {
        // P1：update 按 match 列未命中任何行。若 match 列非身份列，则无有效身份，
        // 直接新建会造「伪行」（身份列空缺/撞名），故记 warning 并跳过，不静默插伪行。
        if (col !== idCol) {
          warnings.push(`表「${t.name}」update 按「${String(col)}」未命中任何行，且该列非身份列，已跳过（不静默新建伪行）`);
          continue;
        }
        const maxId = rows.reduce((m: number, r: any) => Math.max(m, Number(r.row_id) || 0), 0);
        rows.push({ row_id: maxId + 1, [col]: val, ...(op.values || {}) });
        applied++;
        if (val != null) appliedNames.push({ table: t.name, value: String(val) });
      }
    } else if (op.op === "delete") {
      const { col, val } = (op as any).match || {};
      const cols = (t.columns || []) as Array<{ key: string }>;
      // 守卫：delete 缺有效 match 列时，原逻辑会按 undefined 列过滤→误删整表或静默不删，
      // 此处无效则整体跳过该 op，不删除任何行（P1-①）。
      if (!col || !cols.some((c) => c.key === col)) {
        warnings.push(`表「${t.name}」delete 缺少有效 match 列「${String(col || "")}」，已跳过该操作（不删除任何行）`);
        continue;
      }
      const before = rows.length;
      // 大小写不敏感匹配，与 update 一致（墨白 F5）
      const filtered = rows.filter((r: any) => String(r[col] ?? "").toLowerCase() !== String(val ?? "").toLowerCase());
      applied += before - filtered.length;
      rows.length = 0;
      rows.push(...filtered);
    }

    await prisma.loreTable.update({ where: { id: t.id }, data: { rows } });
  }
  return { applied, appliedNames, warnings };
}

/** 填后自检：被填名称若未出现在正文中，疑似错误地名/名称 */
function buildWarnings(appliedNames: { table: string; value: string }[], chapterText: string): string[] {
  const hay = (chapterText || "").toLowerCase();
  const warnings: string[] = [];
  const seen = new Set<string>();
  for (const { table, value } of appliedNames) {
    const v = (value || "").trim();
    if (v.length < 2) continue;
    const key = `${table}::${v.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!hay.includes(v.toLowerCase())) {
      warnings.push(`表「${table}」填入名称「${v}」未在正文中找到原文，疑似错误地名/名称`);
    }
  }
  return warnings;
}

// ─── 对外 API ───────────────────────────────────────────────

export async function babyloreFill(
  projectId: string,
  chapterText: string,
  options?: { tableKeys?: string[]; projectLlmConfig?: Record<string, unknown> | null },
): Promise<FillResult> {
  // 空内容守卫（P2-④）：正文为空则不触发 LLM 填表，避免空跑/误插空行。
  // safeFillAfterWriting 经本入口调用，故一并覆盖，无需重复判断。
  if (!(chapterText || "").trim()) {
    return { ok: false, operations: 0, applied: 0, error: "空内容跳过填表" };
  }
  let settings;
  try {
    settings = await getSettings();
  } catch (e) {
    return { ok: false, operations: 0, applied: 0, error: e instanceof Error ? e.message : "LLM 未配置" };
  }
  const projOverride = buildProjectOverrides(options?.projectLlmConfig || {});
  const baseURL = projOverride.baseURL || settings.baseUrl;
  const apiKey = projOverride.apiKey || settings.apiKey;
  const rawProj = (options?.projectLlmConfig || {}) as Record<string, unknown>;
  const model = typeof rawProj.model === "string" && rawProj.model.trim() ? rawProj.model : settings.model;

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

  const llm: LlmCreds = { baseURL, apiKey, model };
  const r = await runFillForText(chapterText, tables, llm, options?.tableKeys);
  return {
    ok: r.ok,
    operations: r.operations,
    applied: r.applied,
    error: r.error,
    warnings: r.warnings,
  };
}

/**
 * 一键填表：按 order 遍历所有有正文的章节，从首章填到最新；
 * 已填过的章节（防重复标记）自动跳过；全部填完后自动跑 selfCheck 地名/完整性自检。
 */
export async function babyloreFillAll(
  projectId: string,
  options?: { tableKeys?: string[]; projectLlmConfig?: Record<string, unknown> | null },
): Promise<FillAllResult> {
  let settings;
  try {
    settings = await getSettings();
  } catch (e) {
    return {
      ok: false,
      failed: 0,
      processed: 0,
      skipped: 0,
      operations: 0,
      applied: 0,
      error: e instanceof Error ? e.message : "LLM 未配置",
      warnings: [],
      selfCheck: { checkedTables: 0, nameIssues: 0, completenessIssues: 0, crossTableIssues: 0, issues: [] },
    };
  }
  const projOverride = buildProjectOverrides(options?.projectLlmConfig || {});
  const baseURL = projOverride.baseURL || settings.baseUrl;
  const apiKey = projOverride.apiKey || settings.apiKey;
  const rawProj = (options?.projectLlmConfig || {}) as Record<string, unknown>;
  const model = typeof rawProj.model === "string" && rawProj.model.trim() ? rawProj.model : settings.model;
  const llm: LlmCreds = { baseURL, apiKey, model };

  const where: any = { projectId };
  if (options?.tableKeys?.length) where.key = { in: options.tableKeys };
  const dbTables = await prisma.loreTable.findMany({ where });

  const nodes = await prisma.storyNode.findMany({
    where: { projectId, content: { not: null } },
    orderBy: { order: "asc" },
  });
  const chapters = nodes.filter((n) => (n.content || "").trim().length > 0);

  if (dbTables.length === 0) {
    return {
      ok: false,
      failed: 0,
      processed: 0,
      skipped: 0,
      operations: 0,
      applied: 0,
      error: "项目暂无结构化表格。请先在创意工坊套用「表格模板预设」，或在项目「结构化表格」页新建。",
      warnings: [],
      selfCheck: { checkedTables: 0, nameIssues: 0, completenessIssues: 0, crossTableIssues: 0, issues: [] },
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

  const filledMap = loadFilled();
  const filledSet = new Set(filledMap[projectId] || []);

  let processed = 0;
  let skipped = 0;
  let operations = 0;
  let applied = 0;
  let failedChapters = 0; // 未达 Round6 完成门槛（ok && applied>0）的章节数
  const warnings: string[] = [];

  for (const ch of chapters) {
    if (filledSet.has(ch.id)) {
      skipped++;
      continue;
    }
    const r = await runFillForText(ch.content || "", tables, llm, options?.tableKeys);
    processed++;
    operations += r.operations;
    applied += r.applied;
    for (const w of r.warnings) warnings.push(`第${ch.order}章《${ch.title || "未命名"}》：${w}`);
    // 仅成功章计入已填集合——失败章必须留待重试，否则被永久标记跳过（磐石 P0 修复）。
    // P0-3：门槛由 r.ok 提升为 r.ok && r.applied>0，空 ops/全失效章不标已填，留待重试。
    if (r.ok && r.applied > 0) {
      filledSet.add(ch.id);
      // 增量落盘：每填完一章即持久化，避免中途超时/崩溃丢失全部进度（磐石 P0 防丢进度）
      filledMap[projectId] = Array.from(filledSet);
      saveFilled(filledMap);
    } else {
      // 该章未达完成门槛，计入失败章，留待重试（P1-1：不得静默吞掉）。
      failedChapters++;
    }
  }

  const selfCheck = await selfCheckFill(projectId);

  // P1-1：babyloreFillAll 不得恒返回 ok:true（静默假完成）。
  // 与 Round6 的完成门槛 ok && applied>0 保持一致：仅在确有章节成功落地、且没有任何章节失败时为真；
  // 任一章失败（failedChapters>0）或零落地（applied=0）均判失败并带 error 摘要，促使上游重试而非误判已完成。
  let ok = true;
  let error: string | undefined;
  if (processed === 0 && skipped === 0) {
    // 项目既无已填也无待填章节（无正文或表格为空），属异常，报失败避免静默空跑。
    ok = false;
    error = "没有可填表的章节（项目无正文章节或暂无结构化表格）";
  } else if (processed === 0 && skipped > 0) {
    // 全部章节已填，属正常无需重试，视为成功（非静默假完成）。
    ok = true;
  } else if (failedChapters > 0) {
    ok = false;
    error = `有 ${failedChapters}/${processed} 个章节填表失败，未全部完成（已落 ${applied} 条事实），请检查 LLM 配置/网络后重试`;
  } else if (applied === 0) {
    ok = false;
    error = `已处理 ${processed} 章但均未落地任何事实（applied=0），请检查 LLM 返回内容`;
  }

  return {
    ok,
    failed: failedChapters,
    processed,
    skipped,
    operations,
    applied,
    error,
    warnings,
    selfCheck,
  };
}

/**
 * 填后自检：扫描所有表的所有行，
 *  - 名称正确性：每个名称值能否在全项目正文中检索到原文（检索不到=疑似错误地名）；
 *  - 信息完整性：关键列（身份列）是否为空。
 */
export async function selfCheckFill(projectId: string): Promise<SelfCheckResult> {
  const dbTables = await prisma.loreTable.findMany({ where: { projectId } });
  const nodes = await prisma.storyNode.findMany({
    where: { projectId, content: { not: null } },
    orderBy: { order: "asc" },
  });
  const corpus = nodes.map((n) => (n.content || "")).join("\n").toLowerCase();

  const issues: SelfCheckIssue[] = [];
  let nameIssues = 0;
  let completenessIssues = 0;
  let crossTableIssues = 0;

  // 跨表同名归属校验（F3）：先收集「每个身份列值在哪些表、哪些类别出现」。
  const valueTables = new Map<string, { tables: string[]; categories: Set<string> }>();
  // P1：归表错误检测需要「项目全部类别」与「各类别已有身份值集合」。
  const projectCategories = new Set<string>();
  const catValueSet = new Map<string, Set<string>>();

  for (const t of dbTables) {
    const rows = (t.rows as any[]) || [];
    const idCol = getIdentityCol({ columns: t.columns as any[] });
    const seenInTable = new Set<string>();
    projectCategories.add(t.category || "custom");
    for (const r of rows) {
      const v = r[idCol];
      if (v == null || String(v).trim() === "") {
        completenessIssues++;
        issues.push({ table: t.name, row: r.row_id ?? "?", value: "", issue: "关键列空值（缺少名称）" });
        continue;
      }
      const s = String(v).trim();
      if (s.length >= 2 && !corpus.includes(s.toLowerCase())) {
        nameIssues++;
        issues.push({ table: t.name, row: r.row_id ?? "?", value: s, issue: "疑似错误地名/名称（全正文检索不到原文）" });
      }
      // 跨表同名收集（同表内重复只记一次）
      const sl = s.toLowerCase();
      if (sl.length >= 2 && !seenInTable.has(sl)) {
        seenInTable.add(sl);
        if (!valueTables.has(sl)) valueTables.set(sl, { tables: [], categories: new Set() });
        const e = valueTables.get(sl)!;
        e.tables.push(t.name);
        e.categories.add(t.category || "custom");
        // 累计各类别已有身份值（供唯一名归表校验判断「其它类别表是否有值」）
        const cat = t.category || "custom";
        if (!catValueSet.has(cat)) catValueSet.set(cat, new Set());
        catValueSet.get(cat)!.add(sl);
      }
    }
  }

  // 跨表同名：同一名称值出现在 ≥2 个不同表 → 归属待确认（自动填表可能把人名写进地点表等）。
  // 不论是否跨类别都报（P1-②）：原逻辑强约束 categories.size>=2，导致两张同类别(custom)表互错填不报警。
  // 类别分组：geo 类与 entity 类互相不应共享唯一名（写错表提示）
  const GEO_LIKE = new Set([
    "geo", "location", "place", "places", "building", "buildings", "map", "scene", "scenes",
  ]);
  const ENTITY_LIKE = new Set([
    "characters", "character", "person", "people", "org", "organization",
    "item", "items", "skill", "skills", "relation", "relations", "event", "events",
    "creature", "creatures",
  ]);
  const groupOf = (cat: string): "geo" | "entity" | "other" =>
    GEO_LIKE.has(cat) ? "geo" : ENTITY_LIKE.has(cat) ? "entity" : "other";

  for (const [val, info] of valueTables) {
    const distinct = Array.from(new Set(info.tables));
    if (distinct.length >= 2) {
      crossTableIssues++;
      const others = distinct.join(" / ");
      const sameCat = info.categories.size === 1;
      const detail = sameCat
        ? `同类别多表同名(归属待确认)：与表「${others}」同属「${Array.from(info.categories).join("/")}」却共享同名「${val}」`
        : `跨类别同名(归属待确认)：与表「${others}」类别不同却共享同名「${val}」`;
      for (const tname of distinct) {
        issues.push({ table: tname, row: "跨表", value: val, issue: detail });
      }
    } else {
      // P1：唯一名（仅落单表）却落在「非预期表」——归表错误漏报修复。
      // 仅当唯一名落在 geo 类表、且项目同时存在有值的 entity 类表时告警（典型：人名写进 geo 表）。
      // 单向判定以避免「人物本就在人物表却因项目含 geo 表被误报」。
      const onlyCat = Array.from(info.categories)[0];
      const g = groupOf(onlyCat);
      if (g === "geo" && projectCategories.size >= 2) {
        const conflict = Array.from(projectCategories)
          .filter((c) => c !== onlyCat)
          .some((c) => groupOf(c) === "entity" && (catValueSet.get(c)?.size || 0) > 0);
        if (conflict) {
          crossTableIssues++;
          issues.push({
            table: distinct[0],
            row: "归表",
            value: val,
            issue: `唯一名「${val}」仅落在「${onlyCat}」类表，但项目同时含人物/组织等表，疑似写错表（归表错误，请核对）`,
          });
        }
      }
    }
  }

  return {
    checkedTables: dbTables.length,
    nameIssues,
    completenessIssues,
    crossTableIssues,
    issues: issues.slice(0, 200),
  };
}
