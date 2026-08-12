/**
 * GET /api/projects/[id]/prompt-revisions
 *
 * 列出版本化后的 globalPrompt 快照（#316/#317 prompt 版本化）。
 * 返回当前生效版本指针 currentPromptVersion + 每个版本的元数据与内容预览，
 * 供「prompt 当代码」的审计 / 比较 / 回滚（回滚还原接口为后续迭代）。
 *
 * 鉴权风格对齐 stylecard 路由：校验 project 存在性，jsonError 兜底。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// 列表只回预览，避免多版本全文堆叠导致载荷过大；完整内容查看走后续 detail 路由。
const PREVIEW_LEN = 300;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const project = await prisma.project.findUnique({
      where: { id },
      select: { id: true, currentPromptVersion: true },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const revisions = await prisma.globalPromptRevision.findMany({
      where: { projectId: id },
      orderBy: { version: "desc" },
      select: {
        version: true,
        source: true,
        hash: true,
        wordCount: true,
        summary: true,
        createdAt: true,
        content: true,
      },
    });

    const items = revisions.map((r) => ({
      version: r.version,
      source: r.source,
      hash: r.hash,
      wordCount: r.wordCount,
      summary: r.summary,
      createdAt: r.createdAt,
      preview: r.content.length > PREVIEW_LEN ? r.content.slice(0, PREVIEW_LEN) + "…" : r.content,
    }));

    return NextResponse.json({
      currentPromptVersion: project.currentPromptVersion,
      revisions: items,
    });
  } catch (err) {
    return jsonError(err);
  }
}
