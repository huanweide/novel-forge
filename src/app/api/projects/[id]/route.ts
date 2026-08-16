import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  readValidatedBody,
  optStr,
  optStrArray,
  optInt,
  optBool,
  optObj,
} from "@/lib/validators";

// GET /api/projects/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        characters: true,
        lorebookEntries: true,
        storyNodes: { where: { deletedAt: null }, orderBy: { order: "asc" } },
        storyBranches: true,
        storylines: { orderBy: [{ type: "asc" }, { order: "asc" }] },
        styleCards: true,
        loreTables: true,
        rules: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/projects/[id] — 更新项目（接入 ARCH-3 校验：部分更新，未提供字段不更新，显式 null 清空）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await readValidatedBody(request, (raw) => ({
      name: optStr(raw.name, "name", 200),
      description: optStr(raw.description, "description", 5000),
      genre: optStrArray(raw.genre, "genre"),
      targetWordCount: optInt(raw.targetWordCount, "targetWordCount"),
      synopsis: optStr(raw.synopsis, "synopsis", 10000),
      toneKeywords: optStrArray(raw.toneKeywords, "toneKeywords"),
      authorNote: optStr(raw.authorNote, "authorNote", 5000),
      globalPrompt: optStr(raw.globalPrompt, "globalPrompt", 50000),
      llmConfig: optObj(raw.llmConfig, "llmConfig"),
      postProcessingRules: optObj(raw.postProcessingRules, "postProcessingRules"),
      // 2.0 P2-1：用户可配置内容安全黑名单（增量叠加默认基线）
      customSafetyRules: optObj(raw.customSafetyRules, "customSafetyRules"),
      // Max Loop Round4·P8：智能审阅开关 API 写入入口（此前仅 DB/UI 可切，自动化/测试无法配置）
      autoConfirmEnabled: optBool(raw.autoConfirmEnabled),
      // v1.1.0：全书智能交付自动执行开关 API 写入入口
      autoDeliverEnabled: optBool(raw.autoDeliverEnabled),
      // v2.55.0：章节标题风格（default/verse/prose/brief/suspense）
      titleStyle: optStr(raw.titleStyle, "titleStyle", 20),
    }));
    if (body instanceof NextResponse) return body;

    // 仅把「提供了的字段」放进 data：undefined 排除（不更新），null 保留（清空）
    const data: Record<string, unknown> = {};
    (Object.keys(body) as Array<keyof typeof body>).forEach((k) => {
      const v = body[k];
      if (v !== undefined) data[k] = v;
    });

    const updated = await prisma.project.update({
      where: { id },
      data: data as never,
    });
    // v1.6.40 修复：PATCH 若改了 globalPrompt 渲染源（作品信息字段 synopsis/genre/toneKeywords/authorNote），
    // 且未显式手动覆盖 globalPrompt，则刷全局系统提示词，避免「作者改了类型/基调/总纲，下一章生成仍读旧提示词」的失真。
    const touchedWorkInfo =
      body.genre !== undefined ||
      body.synopsis !== undefined ||
      body.toneKeywords !== undefined ||
      body.authorNote !== undefined;
    const manualGlobalPrompt = body.globalPrompt !== undefined;
    if (touchedWorkInfo && !manualGlobalPrompt) {
      syncGlobalPrompt(id).catch(() => {});
    }
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/projects/[id] —— 软删除（移入回收站，子表随项目软删一起隐藏）
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, select: { deletedAt: true } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    await prisma.project.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    return NextResponse.json({ success: true, recycled: true });
  } catch (err) {
    return jsonError(err);
  }
}
