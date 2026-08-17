import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/story/nodes/[id]/revisions —— 列出某节点的正文版本历史（新→旧）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // #123 软删防泄漏：正常 GET 排除已软删节点，软删节点的版本历史按「不存在」返回 404。
    const node = await prisma.storyNode.findUnique({
      where: { id, deletedAt: null },
      select: { id: true },
    });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    const revisions = await prisma.storyNodeRevision.findMany({
      where: { nodeId: id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        wordCount: true,
        source: true,
        summary: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ revisions });
  } catch (err) {
    return jsonError(err);
  }
}
