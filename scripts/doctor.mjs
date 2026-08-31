#!/usr/bin/env node
/**
 * Novel Smith 启动自检（doctor）
 *
 * 用途：在 `npm run dev` / `npm start` 之前，快速确认两项最关键、也最容易导致
 * “完全不能用”的前提是否满足：
 *   1) 数据库可连接（本地 SQLite 文件库；也兼容旧式 postgresql:// 自托管）
 *   2) LLM 配置就绪（环境变量，或应用内「设置」页填写的 AppSettings）
 *
 * 用法：node scripts/doctor.mjs
 */
import { config } from "dotenv";
import { existsSync, mkdirSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, isAbsolute, resolve } from "path";
import net from "net";

const __dirname = dirname(fileURLToPath(import.meta.url));

config(); // 读取项目根目录 .env

let ok = true;
const fail = (m) => {
  ok = false;
  console.error("  ✗ " + m);
};
const pass = (m) => console.log("  ✓ " + m);
const warn = (m) => console.warn("  ⚠ " + m);

console.log("\n=== Novel Smith 启动自检 (doctor) ===\n");

// ── 1. 数据库 ──────────────────────────────────────────────
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  fail("DATABASE_URL 未设置。请创建 .env（cp .env.example .env），默认即用本地 SQLite：");
  console.error('    DATABASE_URL="file:./data/novelforge.db"');
} else {
  let url;
  try {
    url = new URL(dbUrl);
  } catch {
    fail("DATABASE_URL 格式不合法，本地示例：file:./data/novelforge.db");
    url = null;
  }
  if (url) {
    if (url.protocol === "file:") {
      // 本地 SQLite：用 better-sqlite3 打开并校验关键表
      try {
        const Database = (await import("better-sqlite3")).default;
        const dbPath = dbUrl.replace(/^file:/, "");
        const abs = isAbsolute(dbPath)
          ? dbPath
          : resolve(process.cwd(), dbPath);
        if (!existsSync(abs)) mkdirSync(dirname(abs), { recursive: true });
        const db = new Database(abs);
        db.prepare("SELECT 1").get();
        try {
          db.prepare("SELECT 1 FROM Project LIMIT 1").get();
          db.close();
          pass(`本地 SQLite 文件库可连接且表已初始化（${abs}）`);
        } catch {
          db.close();
          warn(
            "本地 SQLite 文件已建，但表尚未初始化——请先运行 npm run dev:db（含 prisma db push）或 npx prisma db push。"
          );
        }
      } catch (e) {
        fail(`本地 SQLite 打开失败：${e.message}`);
      }
    } else if (url.protocol === "postgresql:" || url.protocol === "postgres:") {
      // 旧式自托管：仍支持 postgresql://（需自行安装 PostgreSQL）
      try {
        const { Client } = await import("pg");
        const client = new Client({
          connectionString: dbUrl,
          connectionTimeoutMillis: 4000,
        });
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
    } else {
      fail(`DATABASE_URL 协议未被支持：${url.protocol}（本地用 file:，自托管用 postgresql:）`);
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
// ── 3. Prisma client ──────────────────────────────────────
const prismaClientPath = join(__dirname, "..", "src", "generated", "prisma", "client.ts");
if (!existsSync(prismaClientPath)) {
  fail("Prisma client 未生成——dev server 能起但所有 API 会挂。修复：SAFE_DELETE_DISABLE=1 npx prisma generate");
} else {
  pass("Prisma client 已生成（src/generated/prisma）");
}

// ── 4. 端口 3001 ──────────────────────────────────────────
const PORT = 3001;
await new Promise((resolve) => {
  const tester = net
    .createServer()
    .once("error", (e) => {
      if (e.code === "EADDRINUSE") {
        warn(`端口 ${PORT} 已被占用——若非本应用请先释放（可能是上一个 dev 进程未退出）。`);
      } else {
        warn(`端口 ${PORT} 检测异常：${e.code}`);
      }
      resolve();
    })
    .once("listening", () => {
      tester.close();
      pass(`端口 ${PORT} 空闲`);
      resolve();
    })
    .listen(PORT);
});

console.log("");

if (ok) {
  console.log("✅ 自检通过，可启动：npm run dev\n");
  process.exit(0);
} else {
  console.error("❌ 自检发现问题，请先修复上面的 ✗ 项后再启动。\n");
  process.exit(1);
}
