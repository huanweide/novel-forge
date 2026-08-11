/**
 * PUT/DELETE /api/storyline-events/[id] — 更新 / 删除单条时间轴事件或线索
 *
 * 主要用于「线索集」（CLUE）的手工编辑与删除；时间轴自动事件一般只读不删，
 * 但用户亦可删除误记的大事件。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();
    const existing = await prisma.storylineEvent.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "事件不存在" }, { status: 404 });

    const event = await prisma.storylineEvent.update({
      where: { id },
      data: {
        tag: body.tag !== undefined ? body.tag : existing.tag,
        title: body.title !== undefined ? body.title : existing.title,
        content: body.content !== undefined ? body.content : existing.content,
        position: typeof body.position === "number" ? body.position : existing.position,
        role: body.role !== undefined ? body.role : existing.role,
      },
    });
    return NextResponse.json(event);
  } catch (err) {
    return jsonError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise< { id: string }> }) {
  try {
    const { id } = await params;
    await prisma.storylineEvent.delete({ where: { id } }).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
