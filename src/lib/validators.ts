/**
 * ARCH-3 集中输入校验层（手写轻量校验，零新依赖）
 *
 * 背景：原计划建议用 zod，但本项目是本地单用户工具，"轻"是核心诉求。
 * 手写一组类型守卫 + 统一入口即可达成「关键写操作不再裸信任 request.json()、
 * 脏数据在进入 prisma 前被拦下（防 500 / 防脏库）」的目标，且不引入运行时依赖。
 *
 * 用法：
 *   const body = await readValidatedBody(request, (raw) => ({
 *     projectId: asStr(raw.projectId, "projectId", { required: true }),
 *     name: asStr(raw.name, "name", { required: true, max: 100 }),
 *   }));
 *   if (body instanceof NextResponse) return body; // 校验失败已返回 400
 */

import { NextResponse } from "next/server";

export class ValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
  }
}

/** 校验失败的统一 400 响应 */
export function badRequest(message: string, field?: string): NextResponse {
  return NextResponse.json(
    { error: message, code: "VALIDATION_ERROR", field },
    { status: 400 }
  );
}

type StrOpts = { required?: boolean; max?: number; fallback?: string | null };
export function asStr(v: unknown, field: string, opts: StrOpts = {}): string {
  if (v === undefined || v === null) {
    if (opts.required) throw new ValidationError(field, `${field} 不能为空`);
    return opts.fallback ?? "";
  }
  if (typeof v !== "string") throw new ValidationError(field, `${field} 必须是字符串`);
  if (opts.max && v.length > opts.max)
    throw new ValidationError(field, `${field} 长度不能超过 ${opts.max}`);
  return v;
}

export function asStrOrNull(v: unknown, field: string, max = 20000): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") throw new ValidationError(field, `${field} 必须是字符串`);
  if (v.length > max) throw new ValidationError(field, `${field} 长度不能超过 ${max}`);
  return v;
}

export function asStrArray(v: unknown, field: string): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new ValidationError(field, `${field} 必须是数组`);
  return v.filter((x) => typeof x === "string");
}

export function asInt(v: unknown, field: string, fallback = 0): number {
  if (v === undefined || v === null) return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) throw new ValidationError(field, `${field} 必须是数字`);
  return Math.trunc(n);
}

export function asBool(v: unknown, fallback = false): boolean {
  if (v === undefined || v === null) return fallback;
  return Boolean(v);
}

/**
 * 解析 JSON + 跑自定义校验。
 * 返回校验后的对象；遇到 JSON 解析错误或校验错误时返回 400 NextResponse（调用方需判 instanceof）。
 */
export async function readValidatedBody<T>(
  request: Request,
  validate: (raw: Record<string, unknown>) => T
): Promise<T | NextResponse> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return badRequest("请求体不是合法 JSON", "body");
  }
  if (typeof raw !== "object" || raw === null) {
    return badRequest("请求体必须是 JSON 对象", "body");
  }
  try {
    return validate(raw as Record<string, unknown>);
  } catch (e) {
    if (e instanceof ValidationError) return badRequest(e.message, e.field);
    return badRequest(e instanceof Error ? e.message : "校验失败", "body");
  }
}
