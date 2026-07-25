/**
 * GET /api/health —— 系统状态自检探针
 *
 * 供全局状态横幅（SystemStatusBanner）调用，用来判断：
 *   1) 数据库是否可连接（DATABASE_URL 已配 + 表已建）
 *   2) AI 是否已配置（数据库 AppSettings 或环境变量 LLM_API_KEY 至少其一就绪）
 *
 * 设计原则：
 *   - 只读、轻量（$queryRaw SELECT 1 + 配置读取），不影响业务
 *   - 任何异常都被吞掉并返回结构化结果，绝不因自检本身报错而拖垮页面
 *   - 客户端在根布局里调用一次，DB / LLM 有问题时即时给出修复指引
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
  if (!process.env.DATABASE_URL) {
    db = {
      ok: false,
      error: "未配置 DATABASE_URL",
      hint: "请在 .env 写入 postgresql:// 连接串（参考 .env.example），然后用 `docker compose up -d` 启动数据库。",
    };
  } else {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (e) {
      const info = classifyError(e);
      db = {
        ok: false,
        error: info.error,
        hint: info.hint || "请确认数据库已启动且已执行 `npx prisma db push` 建表。",
      };
    }
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
