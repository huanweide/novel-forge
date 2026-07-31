import { NextRequest, NextResponse } from "next/server";
import { PROVIDER_BASE_URLS } from "@/lib/llm";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * 检索当前提供商可用的模型列表（OpenAI 兼容 /models 端点）。
 * 前端在「设置」页用于把模型输入框变成可下拉选择的列表。
 * 优先用前端传的 apiKey；若未传且库里已有配置，则回退到库里的 Key，
 * 以支持「已有配置时自动检索」（此时前端没有真实 Key）。
 */
export async function POST(req: NextRequest) {
  let body: { provider?: string; apiKey?: string; baseUrl?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* 空 body 也允许，下面会用 DB key */
  }
  const { provider, apiKey, baseUrl } = body;

  let key = (apiKey || "").trim();
  if (!key) {
    try {
      const db = await prisma.appSettings.findUnique({ where: { id: "default" } });
      if (db?.llmApiKey) key = db.llmApiKey;
    } catch {
      /* DB 不可用时忽略，继续走下面的空 key 校验 */
    }
  }
  if (!key) {
    return NextResponse.json({ error: "请先填入 API Key 再检索模型" }, { status: 400 });
  }

  const resolvedProvider = provider || "deepseek";
  const customBase = (baseUrl || "").trim();
  const base = customBase || PROVIDER_BASE_URLS[resolvedProvider] || PROVIDER_BASE_URLS.siliconflow;
  // DeepSeek 默认 base 不含 /v1，而 /models 端点实际在 /v1/models；其余默认 base 已含 /v1
  const modelsUrl =
    resolvedProvider === "deepseek" && !customBase
      ? "https://api.deepseek.com/v1/models"
      : `${base}/models`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(modelsUrl, {
      headers: { Authorization: `Bearer ${key}` },
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `检索失败（HTTP ${res.status}）：${err.slice(0, 150)}` },
        { status: res.status }
      );
    }
    const data = await res.json().catch(() => ({ data: [] }));
    const ids: string[] = Array.isArray(data?.data)
      ? data.data
          .map((m: { id?: string }) => m.id)
          .filter((x: unknown): x is string => typeof x === "string" && x.length > 0)
      : [];
    return NextResponse.json({ models: Array.from(new Set(ids)) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `检索失败：${msg}` }, { status: 500 });
  } finally {
    clearTimeout(timer);
  }
}
