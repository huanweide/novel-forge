/**
 * GET /api/health —— 系统状态自检探针
 *
 * 供全局状态横幅（SystemStatusBanner）调用，用来判断：
 *   1) 数据库是否可连接（本地 SQLite 文件库已建并可查询）
 *   2) AI 是否已配置（数据库 AppSettings 或环境变量 LLM_API_KEY 至少其一就绪）
 *
 * 设计原则：
 *   - 只读、轻量（$queryRaw SELECT 1 + 配置读取），不影响业务
 *   - 任何异常都被吞掉并返回结构化结果，绝不因自检本身报错而拖垮页面
 *   - 客户端在根布局里调用一次，DB / LLM 有问题时即时给出修复指引
 *
 * 零配置说明：本项目使用本地 SQLite 文件库（better-sqlite3），无需 Docker / 外部 Postgres。
 * DATABASE_URL 默认 file:./data/novelforge.db，prisma.ts 在未设置时也会回落到该路径并自动建库，
 * 因此 health 探针直接尝试查询即可，不硬性依赖环境变量是否显式设置。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/llm";
import { classifyError } from "@/lib/api-error";
import { LATEST_VERSION } from "@/lib/changelog-data";

export const dynamic = "force-dynamic";

export async function GET() {
  // ── 数据库 ──
  let db = { ok: true as boolean, error: "", hint: "" };
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    const info = classifyError(e);
    db = {
      ok: false,
      error: info.error,
      hint: info.hint || "请确认本地 SQLite 文件已生成：直接 `npm run dev` 会自动建库（或手动 `npx prisma db push`）。",
    };
  }

  // ── AI 配置 ──
  let llm: { ok: boolean; error: string; hint: string } = { ok: true, error: "", hint: "" };
  try {
    await getSettings();
    llm = { ok: true, error: "", hint: "" };
  } catch (e) {
    const info = classifyError(e);
    llm = { ok: false, error: info.error, hint: info.hint || "" };
  }

  return NextResponse.json({ version: LATEST_VERSION, db, llm });
}
