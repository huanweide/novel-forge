#!/usr/bin/env node
/**
 * npm run dev:db —— 一键启动 Novel Forge（零配置本地 SQLite）
 *
 * 自动完成：
 *   1. 若 .env 不存在，从 .env.example 复制（默认即用本地 SQLite，无需手改）
 *   2. prisma db push 同步表结构到本地 SQLite 文件（自动建库，无需起任何服务）
 *   3. npm run dev 启动前端（localhost:3001）
 *
 * 适用：任何人 clone 后一行命令开箱即跑——无需 Docker、无需安装 Postgres。
 * 跨平台：统一用 shell:true 调 npx / npm，避免 Windows 下 .cmd 解析差异。
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");
const DATA_DIR = path.join(ROOT, "data");

// 1) .env
if (!existsSync(ENV)) {
  if (existsSync(ENV_EXAMPLE)) {
    copyFileSync(ENV_EXAMPLE, ENV);
    console.log("✅ 已从 .env.example 生成 .env（默认用本地 SQLite，无需手改）");
  } else {
    console.error("⚠️ 找不到 .env.example，请手动创建 .env 后再试");
  }
} else {
  console.log("ℹ️  .env 已存在，跳过创建");
}

// 2) 同步表结构到本地 SQLite（自动建库文件，无需起任何外部服务）
mkdirSync(DATA_DIR, { recursive: true });
console.log("\n🗄️  同步表结构到本地 SQLite（prisma db push）...");
const push = spawnSync("npx prisma db push", { shell: true, cwd: ROOT, stdio: "inherit" });
if (push.status !== 0) {
  console.error("\n❌ prisma db push 失败。请检查 .env 的 DATABASE_URL 是否为 file: 开头的本地路径。");
  process.exit(1);
}
console.log("\n✅ 本地数据库就绪");

// 3) 前端
console.log("\n🚀 启动开发服务器（npm run dev → http://localhost:3001）...");
const dev = spawn("npm run dev", { shell: true, cwd: ROOT, stdio: "inherit" });
const stop = () => {
  try {
    dev.kill("SIGINT");
  } catch {
    /* noop */
  }
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
dev.on("exit", (code) => process.exit(code ?? 0));
