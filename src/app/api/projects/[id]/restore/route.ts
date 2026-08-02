import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// POST /api/projects/[id]/restore —— 从回收站恢复（清空 deletedAt）
export async function POST(
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
      data: { deletedAt: null },
    });
    return NextResponse.json({ success: true, restored: true });
  } catch (err) {
    return jsonError(err);
  }
}
