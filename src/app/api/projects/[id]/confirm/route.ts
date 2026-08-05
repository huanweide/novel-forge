import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/projects/[id]/confirm —— 确认流程：整本确认完成
// 仅当所有章节/小节节点均为 confirmed 时才置 Project.confirmedAt；否则返回未确认清单。
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const nodes = await prisma.storyNode.findMany({
      where: { projectId: id, type: { in: ["chapter", "section", "scene"] } },
      select: { id: true, title: true, status: true },
    });

    if (nodes.length === 0) {
      return NextResponse.json({ error: "项目还没有任何章节，无法确认完成" }, { status: 400 });
    }

    const unconfirmed = nodes.filter((n) => n.status !== "confirmed");
    if (unconfirmed.length > 0) {
      return NextResponse.json({
        error: `还有 ${unconfirmed.length} 章未确认，无法整本交付`,
        unconfirmed: unconfirmed.map((n) => ({ id: n.id, title: n.title, status: n.status })),
      }, { status: 409 });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { confirmedAt: new Date() },
    });
    return NextResponse.json({ ok: true, confirmedAt: updated.confirmedAt, message: "整本确认完成 🚀" });
  } catch (err) {
    return jsonError(err);
  }
}
