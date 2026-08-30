/**
 * v3.1.55 数据迁移：把遗留的「裸字符串」修成合法 JSON
 *
 * 背景：schema 把 52 个结构化字段从 String 改为原生 Json 后，
 * Prisma 读取 Json 列时会做 JSON.parse。而旧库里这些字段存的是
 * 序列化层写进去的值 —— 对象/数组都是合法 JSON，但**裸字符串不是**：
 *
 *   genre = 都市        ← 非法 JSON（少了引号），JSON.parse 直接抛
 *                         SyntaxError: Unexpected token '玄'
 *   后果：GET /api/projects 整站 500，首页项目列表打不开。
 *
 * 修法：凡 JSON.parse 失败的值，一律当作「裸字符串」用 JSON.stringify 加引号，
 *       "都市" → "\"都市\""，读回来仍是字符串 "都市"，
 *       下游 asArray / safeJoin / safeSplit 都能正常处理。
 *
 * 幂等：已合法的值不动，可重复执行。
 * 适用：仅老库升级需要；新 clone 建库不会存在此问题。
 *
 * 用法：node scripts/migrate-json-fields.mjs
 */
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DATABASE_URL
  ? process.env.DATABASE_URL.replace(/^file:/, "")
  : "./data/novelforge.db";

if (!fs.existsSync(DB_PATH)) {
  console.log("数据库不存在，跳过迁移（新库无需迁移）:", DB_PATH);
  process.exit(0);
}

// 迁移前备份，出错可回滚
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const bak = DB_PATH + ".bak-jsonmig-" + stamp;
fs.copyFileSync(DB_PATH, bak);
console.log("已备份 →", bak);

// schema 中改为 Json 的字段（按表聚合）
const JSON_FIELDS = {
  Project: ["genre","toneKeywords","llmConfig","postProcessingRules","customSafetyRules","buildConfig","appliedPresets"],
  CharacterCard: ["aliases","appearance","personality","dialogueStyle","abilities","hiddenMotives","relationships","timeline","tags"],
  CharacterCardRevision: ["mergedIds","mainBefore","mergedBefore","mainAfter"],
  LorebookEntry: ["keys","relatedEntryIds"],
  StoryNode: ["activeCharacters","activeLoreIds","reviewLogs"],
  ChapterSummary: ["keyEvents","characterStates","eventImportances"],
  PendingCommitment: ["entityIds","closureConditions","partiallyFulfilledIds","statusHistory"],
  Storyline: ["sevenElements"],
  StorylineEvent: ["sourceRefs"],
  GenerationTask: ["result"],
  GameState: ["options","entities","items"],
  Rule: ["scopeConfig"],
  StyleCard: ["tonalMarkers","lexicalFeatures"],
  DissectionTask: ["dimensions","chapterList"],
  ImportTask: ["result"],
  FillTask: ["result"],
  LoreTable: ["columns","rows"],
  BabyloreFillBatch: ["insertedRowIds","updatedRowsBefore"],
  Preset: ["content","tags"],
  ChatSession: ["messages"],
};

const db = new Database(DB_PATH);
let fixed = 0;
const summary = {};

for (const [table, fields] of Object.entries(JSON_FIELDS)) {
  let cols;
  try {
    cols = db.prepare(`PRAGMA table_info("${table}")`).all().map((c) => c.name);
  } catch {
    continue; // 表不存在（旧库可能没同步），跳过
  }
  for (const f of fields) {
    if (!cols.includes(f)) continue;
    const rows = db
      .prepare(`SELECT id, "${f}" v FROM "${table}" WHERE "${f}" IS NOT NULL`)
      .all();
    for (const r of rows) {
      if (typeof r.v !== "string" || r.v.trim() === "") continue;
      let ok = true;
      try {
        JSON.parse(r.v);
      } catch {
        ok = false;
      }
      if (ok) continue;
      // 裸字符串 → 合法 JSON 字符串值
      db.prepare(`UPDATE "${table}" SET "${f}" = ? WHERE id = ?`).run(
        JSON.stringify(r.v),
        r.id
      );
      fixed++;
      const k = table + "." + f;
      summary[k] = (summary[k] || 0) + 1;
    }
  }
}

db.close();
console.log(JSON.stringify(summary, null, 1));
console.log(`\n迁移完成：修复 ${fixed} 个非法 JSON 值`);
if (fixed === 0) console.log("（库里没有需要修的值，属正常情况）");
