/**
 * POST /api/projects/[id]/prompt-revisions/rollback
 *
 * 回滚还原接口（#319 / P2 #10「prompt 当代码」闭环收尾）。
 * 把指定 version 的 globalPrompt 全文写回 Project.globalPrompt，
 * 并以 source="rollback" 落一条新版本快照（version=max+1），
 * 使「回滚」本身成为一次可追踪的新提交（与 git revert 语义一致：不删旧版，只新增一条还原版）。
 *
 * 鉴权风格对齐 #318 列表路由：校验 project 存在性，jsonError 兜底。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { recordGlobalPromptRevision } from "@/core/sync-global-prompt";

const PREVIEW_LEN = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const body = await request.json().catch(() => null);
    const version = typeof body?.version === "number" ? body.version : NaN;
    if (!Number.isInteger(version) || version < 1) {
      return NextResponse.json({ error: "version 必须是 >=1 的整数" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, currentPromptVersion: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // (projectId, version) 复合唯一约束 → 用 projectId_version 定位目标版本
    const target = await prisma.globalPromptRevision.findUnique({
      where: { projectId_version: { projectId: id, version } },
    });
    if (!target) {
      return NextResponse.json({ error: `版本 v${version} 不存在` }, { status: 404 });
    }

    // 1) 写回 globalPrompt（用户意图：让生成上下文立即回到该版本）
    await prisma.project.update({
      where: { id },
      data: { globalPrompt: target.content },
    });

    // 2) 以 rollback 落新版本快照，使「回滚」本身可追踪、可再回滚
    const result = await recordGlobalPromptRevision(
      id,
      target.content,
      "rollback",
      `回滚自 v${version}`,
    );
    if (!result) {
      return NextResponse.json({ error: "回滚版本快照写入失败" }, { status: 500 });
    }

    const preview =
      target.content.length > PREVIEW_LEN
        ? target.content.slice(0, PREVIEW_LEN) + "…"
        : target.content;

    return NextResponse.json({
      ok: true,
      rolledBackFrom: version,
      newVersion: result.version,
      hash: result.hash,
      wordCount: target.content.length,
      preview,
    });
  } catch (err) {
    return jsonError(err);
  }
}
