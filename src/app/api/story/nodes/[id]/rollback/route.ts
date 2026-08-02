import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { snapshotRevision } from "@/lib/versions";

// POST /api/story/nodes/[id]/rollback  body: { revisionId }
// 把节点正文回滚到指定版本，并把「回滚前」的当前正文先快照（保证回滚可逆）。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { revisionId } = body;

    if (!revisionId) {
      return NextResponse.json({ error: "缺少 revisionId" }, { status: 400 });
    }

    const node = await prisma.storyNode.findUnique({
      where: { id },
      select: { content: true, wordCount: true, projectId: true },
    });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }

    const revision = await prisma.storyNodeRevision.findUnique({
      where: { id: revisionId },
    });
    if (!revision || revision.nodeId !== id) {
      return NextResponse.json({ error: "版本不存在或不属于该节点" }, { status: 404 });
    }

    // 先快照「回滚前」的当前正文，保证回滚操作本身可逆
    if (node.content && String(node.content).trim()) {
      await snapshotRevision({
        nodeId: id,
        projectId: node.projectId,
        source: "rollback",
        prevContent: node.content,
        prevWordCount: node.wordCount,
      });
    }

    // 回滚正文
    const updated = await prisma.storyNode.update({
      where: { id },
      data: {
        content: revision.content,
        wordCount: revision.content.length,
        status: "completed",
      },
    });

    return NextResponse.json({
      success: true,
      content: updated.content,
      wordCount: updated.wordCount,
      rolledBackToVersion: revision.version,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "回滚失败" },
      { status: 500 }
    );
  }
}
