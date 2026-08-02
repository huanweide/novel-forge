import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/story/nodes/[id]/revisions/[revId] —— 取某版本正文内容（用于预览）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; revId: string }> }
) {
  try {
    const { id, revId } = await params;
    const revision = await prisma.storyNodeRevision.findUnique({
      where: { id: revId },
    });
    if (!revision || revision.nodeId !== id) {
      return NextResponse.json({ error: "版本不存在或不属于该节点" }, { status: 404 });
    }
    return NextResponse.json({
      id: revision.id,
      version: revision.version,
      wordCount: revision.wordCount,
      source: revision.source,
      summary: revision.summary,
      createdAt: revision.createdAt,
      content: revision.content,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取版本失败" },
      { status: 500 }
    );
  }
}
