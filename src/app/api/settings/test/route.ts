/**
 * POST /api/settings/test — 测试 LLM 连接（不保存）
 */
import { NextResponse } from "next/server";
import { testLLMConnection } from "@/lib/llm";
import { classifyError } from "@/lib/api-error";

export async function POST(request: Request) {
  try {
    const { provider, apiKey, baseUrl, model } = await request.json();
    if (!provider || !apiKey) {
      return NextResponse.json({ ok: false, error: "缺少 provider 或 apiKey" }, { status: 400 });
    }
    const result = await testLLMConnection(provider, apiKey, baseUrl, model);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: classifyError(err).error }, { status: 500 });
  }
}
