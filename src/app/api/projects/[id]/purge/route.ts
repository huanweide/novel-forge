import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// POST /api/projects/[id]/purge —— 彻底删除（硬删除，级联清掉所有子表）
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    // 硬删除 —— Project 的子表均 onDelete: Cascade，会一并物理清除
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true, purged: true });
  } catch (err) {
    return jsonError(err);
  }
}
