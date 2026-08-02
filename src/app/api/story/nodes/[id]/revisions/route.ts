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
    const node = await prisma.storyNode.findUnique({
      where: { id },
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
