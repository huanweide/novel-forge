/**
 * GET  /api/settings — 获取全局 LLM 设置（Key 仅展示后 4 位）
 * PUT  /api/settings — 更新全局 LLM 设置
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { clearLLMCache } from "@/lib/llm";
import { jsonError } from "@/lib/api-error";

function maskKey(key: string): string {
  if (!key || key.length <= 4) return key ? "****" : "";
  return "*".repeat(key.length - 4) + key.slice(-4);
}

export async function GET() {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { id: "default" } });
    if (!settings) {
      settings = await prisma.appSettings.create({ data: { id: "default" } });
    }
    return NextResponse.json({
      llmProvider: settings.llmProvider,
      llmApiKey: maskKey(settings.llmApiKey),
      llmModel: settings.llmModel,
      llmBaseUrl: settings.llmBaseUrl,
      hasKey: !!settings.llmApiKey,
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json();
    const { llmProvider, llmApiKey, llmModel, llmBaseUrl } = body;

    const data: Record<string, string> = {};
    if (typeof llmProvider === "string") data.llmProvider = llmProvider;
    if (typeof llmApiKey === "string") data.llmApiKey = llmApiKey;
    if (typeof llmModel === "string") data.llmModel = llmModel;
    if (typeof llmBaseUrl === "string") data.llmBaseUrl = llmBaseUrl;
    // 预设 provider（非 custom/local）的 Base URL 由代码固定（PROVIDER_BASE_URLS），
    // 忽略前端可能误传的残留 baseUrl，避免污染后续生成请求（根因：残留 URL 致生成打到错误地址）。
    if (typeof data.llmProvider === "string" && ["siliconflow", "deepseek", "openai", "groq"].includes(data.llmProvider)) {
      data.llmBaseUrl = ""; // 显式清空，确保库与生成请求都干净（预设 provider 的 URL 由代码固定）
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有可更新的字段" }, { status: 400 });
    }

    await prisma.appSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });

    // 立即失效缓存，下次 LLM 调用使用新配置
    clearLLMCache();

    return NextResponse.json({ ok: true });
  } catch (err) {
    return jsonError(err);
  }
}
