import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

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

// PATCH /api/projects/[id] — 更新项目（作者指令等）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        genre: body.genre,
        targetWordCount: body.targetWordCount,
        synopsis: body.synopsis,
        toneKeywords: body.toneKeywords,
        authorNote: body.authorNote,
        globalPrompt: body.globalPrompt,
        llmConfig: body.llmConfig,
        postProcessingRules: body.postProcessingRules,
        // Max Loop Round4·P8：智能审阅开关 API 写入入口（此前仅 DB/UI 可切，自动化/测试无法配置）
        autoConfirmEnabled: body.autoConfirmEnabled,
        // v1.1.0：全书智能交付自动执行开关 API 写入入口
        autoDeliverEnabled: body.autoDeliverEnabled,
      },
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
