import { NextResponse } from "next/server";

/**
 * 请求体必填字段校验（v2.47 地基止血）
 *
 * 此前各生成路由手写 `if (!projectId || !nodeId) return NextResponse.json(...)`，
 * 响应体形状（是否带 code/hint）不统一。这里收敛为单一入口：
 *   const v = requireFields(body, ["projectId", "nodeId"]);
 *   if (!v.ok) return v.response;
 * 缺失时返回标准化 400（含 code:BAD_REQUEST + hint），前端可读。
 */

/** 纯函数：返回缺失的必填字段名列表（空串/null/undefined 视为缺失，便于单测，不依赖 Next 运行环境） */
export function missingFields(
  body: Record<string, unknown> | null | undefined,
  fields: string[],
): string[] {
  if (!body) return [...fields];
  return fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === "");
}

/** 校验请求体必填字段，缺失时直接给出标准化 400 响应 */
export function requireFields(
  body: Record<string, unknown> | null | undefined,
  fields: string[],
): { ok: true } | { ok: false; response: NextResponse } {
  const missing = missingFields(body, fields);
  if (missing.length > 0) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: `缺少必填字段：${missing.join("、")}`,
          code: "BAD_REQUEST",
          hint: "请检查请求体是否包含 projectId / nodeId 等必要参数。",
        },
        { status: 400 },
      ),
    };
  }
  return { ok: true };
}

/**
 * 安全解析请求体 JSON —— Round-29 FIX-2 API 输入校验统一。
 *
 * 此前各路由直接 `await req.json()`，客户端发畸形 JSON 时 `req.json()`
 * 抛 SyntaxError，导致路由返回未捕获的 500 + 堆栈。这里把解析收敛为
 * 单一入口：
 *   const r = await safeJson(req);
 *   if (!r.ok) return r.response;   // 提前返回干净 400
 *   const { ... } = r.body;
 * 畸形输入时返回标准化 400（含 code:BAD_REQUEST + 友好文案），而非 500。
 */
export async function safeJson(
  request: Request,
): Promise<{ ok: true; body: any } | { ok: false; response: Response }> {
  try {
    const body = await request.json();
    return { ok: true, body };
  } catch {
    return {
      ok: false,
      response: new Response(
        JSON.stringify({ error: "请求体不是合法 JSON", code: "BAD_REQUEST" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      ),
    };
  }
}
