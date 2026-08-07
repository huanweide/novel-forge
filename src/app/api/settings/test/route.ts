/**
 * POST /api/settings/test — 测试 LLM 连接（不保存）
 */
import { NextResponse } from "next/server";
import { testLLMConnection } from "@/lib/llm";
import { classifyError } from "@/lib/api-error";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(request: Request) {
  // L2-001：测试连接限流（1 分钟 3 次），避免被滥用探测/打爆网关
  if (!rateLimit("settings/test", clientIp(request), 3, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const { provider, apiKey, baseUrl, model } = await request.json();
    // 本地推理（Ollama）无需 API Key，仅校验 provider 与 baseUrl
    if (!provider) {
      return NextResponse.json({ ok: false, error: "缺少 provider" }, { status: 400 });
    }
    if (provider !== "local" && !apiKey) {
      return NextResponse.json({ ok: false, error: "缺少 provider 或 apiKey" }, { status: 400 });
    }
    const result = await testLLMConnection(provider, provider === "local" ? "" : apiKey, baseUrl, model);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: classifyError(err).error }, { status: 500 });
  }
}
