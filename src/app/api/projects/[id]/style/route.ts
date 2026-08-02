import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { STYLE_TEMPLATES, getTemplate } from "@/core/templates";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

/**
 * GET /api/projects/[id]/style
 * 获取项目的文风设置
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      select: { llmConfig: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const config = (project.llmConfig || {}) as Record<string, unknown>;
    const templateId = (config.styleTemplateId as string) || "custom";
    const template = getTemplate(templateId);

    return NextResponse.json({
      styleTemplateId: templateId,
      temperature: (config.temperature as number) ?? template?.temperature ?? 0.85,
      topP: (config.topP as number) ?? template?.topP ?? 0.95,
      targetWordsPerSection: (config.targetWordsPerSection as number) ?? template?.targetWordsPerSection ?? 1000,
      customForbiddenPatterns: (config.customForbiddenPatterns as string[]) || [],
      customStyleNotes: (config.customStyleNotes as string) || "",
      dimensions: (config.dimensions as Record<string, number>) || {},
      povType: (config.povType as string) || "",
      template: template || null,
    });
  } catch (err) {
    return jsonError(err);
  }
}

/**
 * PUT /api/projects/[id]/style
 *
 * 设置项目的文风——支持自定义禁用词和风格笔记
 *
 * 请求体：
 * {
 *   styleTemplateId?: string;
 *   temperature?: number;
 *   topP?: number;
 *   targetWordsPerSection?: number;
 *   customForbiddenPatterns?: string[];
 *   customStyleNotes?: string;
 * }
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const currentConfig = (project.llmConfig || {}) as Record<string, unknown>;

    let templateConfig: Record<string, unknown> = {};
    if (body.styleTemplateId) {
      const template = getTemplate(body.styleTemplateId);
      if (!template) {
        return NextResponse.json({ error: "未知的文风模板" }, { status: 400 });
      }
      templateConfig = {
        styleTemplateId: body.styleTemplateId,
        temperature: body.temperature ?? template.temperature,
        topP: body.topP ?? template.topP,
        targetWordsPerSection: body.targetWordsPerSection ?? template.targetWordsPerSection,
      };
    }

    const newConfig: Record<string, unknown> = {
      ...currentConfig,
      ...templateConfig,
      temperature: body.temperature ?? (templateConfig.temperature as number | undefined) ?? (currentConfig.temperature as number | undefined) ?? 0.85,
      topP: body.topP ?? (templateConfig.topP as number | undefined) ?? (currentConfig.topP as number | undefined) ?? 0.95,
      targetWordsPerSection: body.targetWordsPerSection ?? (templateConfig.targetWordsPerSection as number | undefined) ?? (currentConfig.targetWordsPerSection as number | undefined) ?? 1000,
      customForbiddenPatterns: body.customForbiddenPatterns ?? (currentConfig.customForbiddenPatterns as string[]) ?? [],
      customStyleNotes: body.customStyleNotes ?? (currentConfig.customStyleNotes as string) ?? "",
      dimensions: body.dimensions ?? (currentConfig.dimensions as Record<string, number>) ?? {},
      povType: body.povType ?? (currentConfig.povType as string) ?? "",
    };

    await prisma.project.update({
      where: { id },
      data: { llmConfig: newConfig as any },
    });

    // 切换文风模板后立即刷新 globalPrompt，让下次生成生效
    syncGlobalPrompt(id).catch((e) => {
      console.error("文风切换后 globalPrompt 刷新失败:", e instanceof Error ? e.message : String(e));
    });

    return NextResponse.json(newConfig);
  } catch (err) {
    return jsonError(err);
  }
}
