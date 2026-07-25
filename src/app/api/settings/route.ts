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
