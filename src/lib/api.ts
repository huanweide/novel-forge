/**
 * Novel Forge · API 响应统一封装
 * 全站 API 路由的错误/成功返回统一结构，避免前端 {error} 与 {ok} 混用导致的解析不一致。
 * 用法：
 *   return jsonError("预设不存在", 404);
 *   return jsonOk({ id });
 */

import { NextResponse } from "next/server";

export interface ApiErrorBody {
  error: string;
  code?: string;
}

/** 统一错误响应：{ error: string, code?: string } + HTTP 状态 */
export function jsonError(message: string, status = 500, code?: string): NextResponse {
  const body: ApiErrorBody = code ? { error: message, code } : { error: message };
  return NextResponse.json(body, { status });
}

/** 统一成功响应 */
export function jsonOk<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}
