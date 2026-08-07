import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// GET /api/story/nodes/recycle —— 列出已软删除（deletedAt 非空）的节点，供回收站恢复/彻底清空
export async function GET() {
  try {
    const nodes = await prisma.storyNode.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      select: {
        id: true,
        title: true,
        type: true,
        deletedAt: true,
        projectId: true,
        project: { select: { name: true } },
      },
    });
    return NextResponse.json(nodes);
  } catch (err) {
    return jsonError(err);
  }
}
