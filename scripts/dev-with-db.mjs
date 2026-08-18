#!/usr/bin/env node
/**
 * npm run dev:db —— 一键启动 Novel Forge（含数据库）
 *
 * 自动完成：
 *   1. 若 .env 不存在，从 .env.example 复制（默认值即可用，含数据库/端口配置）
 *   2. docker compose up -d 启动带 pgvector 向量扩展的 PostgreSQL
 *   3. 等待数据库就绪并执行 prisma db push 建表（自动重试，避免 PG 未就绪就建表失败）
 *   4. npm run dev 启动前端（localhost:3001）
 *
 * 适用：本机已装 Docker Desktop 的开发者 / 想开箱即跑的用户。
 * 不用 Docker 的同学见 README「方式二：手动安装 PostgreSQL」。
 *
 * 跨平台：统一用 shell:true 调 docker / npx / npm，避免 Windows 下 .cmd 解析差异。
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV = path.join(ROOT, ".env");
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) .env
if (!existsSync(ENV)) {
  if (existsSync(ENV_EXAMPLE)) {
    copyFileSync(ENV_EXAMPLE, ENV);
    console.log("✅ 已从 .env.example 生成 .env（默认账号/端口即可用，无需手改）");
  } else {
    console.error("⚠️ 找不到 .env.example，请手动创建 .env 后再试");
  }
} else {
  console.log("ℹ️  .env 已存在，跳过创建");
}

// 2) 数据库
console.log("\n🐳 启动数据库（docker compose up -d，镜像含 pgvector 向量扩展）...");
const dc = spawnSync("docker compose up -d", { shell: true, cwd: ROOT, stdio: "inherit" });
if (dc.status !== 0) {
  console.error("\n❌ Docker 启动失败。请确认：①已安装并启动 Docker Desktop；②当前用户在 docker 用户组。");
  console.error("   不想用 Docker？见 README「方式二：手动安装 PostgreSQL」。");
  process.exit(1);
}

// 3) 等待就绪 + 建表（重试最多 ~60s）
console.log("\n⏳ 等待数据库就绪并同步表结构（prisma db push）...");
let ok = false;
for (let i = 0; i < 30; i++) {
  const r = spawnSync("npx prisma db push", { shell: true, cwd: ROOT, stdio: "pipe" });
  if (r.status === 0) {
    ok = true;
    break;
  }
  process.stdout.write(".");
  await sleep(2000);
}
if (!ok) {
  console.error("\n❌ prisma db push 反复失败。请检查：docker compose ps 是否显示 novel-forge-db 健康；.env 的 DATABASE_URL 是否正确。");
  process.exit(1);
}
console.log("\n✅ 数据库就绪，表结构已同步");

// 4) 前端
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
