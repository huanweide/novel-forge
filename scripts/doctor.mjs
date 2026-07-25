#!/usr/bin/env node
/**
 * Novel Forge 启动自检（doctor）
 *
 * 用途：在 `npm run dev` / `npm start` 之前，快速确认两项最关键、也最容易导致
 * “完全不能用”的前提是否满足：
 *   1) PostgreSQL 数据库可连接（DATABASE_URL 存在 ≠ 有效）
 *   2) LLM 配置就绪（环境变量，或应用内「设置」页填写的 AppSettings）
 *
 * 用法：node scripts/doctor.mjs
 */
import { config } from "dotenv";
import { Client } from "pg";

config(); // 读取项目根目录 .env

let ok = true;
const fail = (m) => {
  ok = false;
  console.error("  ✗ " + m);
};
const pass = (m) => console.log("  ✓ " + m);
const warn = (m) => console.warn("  ⚠ " + m);

console.log("\n=== Novel Forge 启动自检 (doctor) ===\n");

// ── 1. 数据库 ──────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  fail("DATABASE_URL 未设置。请创建 .env 并写入（Docker 默认示例）：");
  console.error(
    '    echo DATABASE_URL="postgresql://novelforge:novelforge123@localhost:5432/novelforge" > .env'
  );
} else {
  let url;
  try {
    url = new URL(dbUrl);
  } catch {
    fail("DATABASE_URL 格式不合法，应为 postgresql://user:pass@host:port/db");
    url = null;
  }
  if (url) {
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
      fail(`DATABASE_URL 协议应为 postgresql:，当前为 ${url.protocol}`);
    } else {
      const client = new Client({
        connectionString: dbUrl,
        connectionTimeoutMillis: 4000,
      });
      try {
        await client.connect();
        const r = await client.query("select 1");
        await client.end();
        if (r.rows.length > 0) {
          pass(`数据库可连接（${url.hostname}:${url.port} / ${url.pathname.slice(1)}）`);
        } else {
          fail("数据库已响应但查询异常。");
        }
      } catch (e) {
        fail(
          `数据库无法连接：${e.message}。请确认 PostgreSQL 已启动且 DATABASE_URL 正确——注意：环境变量“存在”不等于“有效”。`
        );
      }
    }
  }
}

// ── 2. LLM 配置 ───────────────────────────────────────────
console.log("\n  LLM 配置（两种来源二选一即可）：");
const envKey = process.env.LLM_API_KEY;
const envModel = process.env.LLM_MODEL;
if (envKey && envModel) {
  pass(`环境变量已配置：provider=${process.env.LLM_PROVIDER || "deepseek"} model=${envModel}`);
} else if (envKey && !envModel) {
  warn("LLM_API_KEY 已设但 LLM_MODEL 缺失——也可在应用内「设置」页填写（优先级更高）。");
} else {
  warn("未设 LLM_API_KEY / LLM_MODEL 环境变量。应用启动后请到「设置」页填入 Key 与模型（DB AppSettings 优先级最高）。");
  warn("没有有效的 Key，所有 AI 生成都会失败——这是“完全不能用”的最常见原因。");
}
console.log("");

if (ok) {
  console.log("✅ 自检通过，可启动：npm run dev\n");
  process.exit(0);
} else {
  console.error("❌ 自检发现问题，请先修复上面的 ✗ 项后再启动。\n");
  process.exit(1);
}
