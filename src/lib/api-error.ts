/**
 * API 错误分类与可读化
 *
 * 把后端抛出的原始异常（Prisma 错误码、网络异常、LLM 异常）收敛为
 * 「用户可理解 + 可操作」的 JSON 响应。前端拿到 { error, code, hint } 后
 * 可以直接展示，而不是把 "P2021" / "PrismaClientKnownRequestError" 之类
 * 的原始报错甩给用户——这正是此前「完全不能用却找不到原因」的根源。
 *
 * 用法：
 *   try { ... } catch (err) { return jsonError(err); }
 */
import { NextResponse } from "next/server";

export interface ApiErrorInfo {
  status: number;
  code: string;
  error: string;
  hint?: string;
}

/**
 * Prisma 已知错误码 → 中文可读说明 + 修复指引。
 * 覆盖 Novel Forge 实际会遇到的几类数据库连接 / 初始化问题。
 */
const PRISMA_HINTS: Record<string, { status: number; error: string; hint: string }> = {
  // 无法连接数据库服务器（服务没起 / 地址错 / 端口错）
  P1001: {
    status: 503,
    error: "数据库无法连接",
    hint: "请确认 PostgreSQL 已启动（本地用 `docker compose up -d`），并检查 .env 中的 DATABASE_URL 是否正确。",
  },
  // 连接中途断开
  P1002: {
    status: 503,
    error: "数据库连接中断",
    hint: "数据库响应中断，请检查网络或数据库负载后重试。",
  },
  // 登录失败（账号 / 密码错）
  P1000: {
    status: 503,
    error: "数据库登录失败",
    hint: "DATABASE_URL 中的用户名 / 密码不正确，请核对后重试。",
  },
  // 表不存在（建了库但没建表）
  P2021: {
    status: 503,
    error: "数据库表不存在",
    hint: "数据库尚未初始化，请执行 `npx prisma db push` 建表后再试。",
  },
  // 连接池耗尽
  P2024: {
    status: 503,
    error: "数据库连接池耗尽",
    hint: "当前连接数已满，请稍后重试，或调大连接池上限。",
  },
  // 唯一约束冲突
  P2002: {
    status: 409,
    error: "数据已存在（唯一约束冲突）",
    hint: "存在重复记录，请检查输入内容是否重复。",
  },
};

/** 把任意异常收敛为可读的错误信息 */
export function classifyError(e: unknown): ApiErrorInfo {
  const err = e instanceof Error ? e : new Error(typeof e === "string" ? e : "未知错误");

  // 1) Prisma 已知错误码
  const code = (err as { code?: string }).code;
  if (code && PRISMA_HINTS[code]) {
    const h = PRISMA_HINTS[code];
    return { status: h.status, code, error: h.error, hint: h.hint };
  }

  // 2) 其它 Prisma 错误（未知 code 但以 Prisma 开头）
  if (code?.startsWith("P") || /PrismaClient/i.test(err.name) || /Prisma/i.test(err.message)) {
    return {
      status: 503,
      code: code || "PRISMA",
      error: "数据库访问出错",
      hint: "请确认数据库已启动且已执行 `npx prisma db push` 建表。",
    };
  }

  // 3) 网络 / 外部服务不可达（AI 接口层）
  if (err instanceof TypeError && /fetch|network|ENOTFOUND|ECONNREFUSED|Failed to fetch/i.test(err.message)) {
    return {
      status: 502,
      code: "NETWORK",
      error: "无法连接外部服务（AI 接口）",
      hint: "请检查 Base URL 与网络是否可达。",
    };
  }

  // 4) 默认：泛化文案（L2-003 修复）
  // 不再把原始 err.message 透传给客户端，避免泄露内部路径/SQL 片段/实现细节；
  // 明细仅留存服务端日志（保留堆栈）供排查。
  console.error("[api-error] 未分类异常:", err);
  return {
    status: 500,
    code: "INTERNAL",
    error: "服务器内部错误，请查看日志",
    hint: "如问题持续，请查看服务端日志。",
  };
}

/** 直接返回标准化错误响应，供路由 catch 块使用 */
export function jsonError(e: unknown) {
  const info = classifyError(e);
  return NextResponse.json(
    { error: info.error, code: info.code, hint: info.hint },
    { status: info.status }
  );
}
