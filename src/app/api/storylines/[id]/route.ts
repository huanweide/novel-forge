/**
 * GET /api/storylines/[id] — 获取单条故事线
 * PUT /api/storylines/[id] — 更新故事线
 * DELETE /api/storylines/[id] — 删除故事线
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const storyline = await prisma.storyline.findUnique({ where: { id } });
  if (!storyline) return NextResponse.json({ error: "故事线不存在" }, { status: 404 });
  return NextResponse.json(storyline);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const storyline = await prisma.storyline.update({
      where: { id },
      data: {
        type: body.type,
        parentId: body.parentId,
        title: body.title?.trim(),
        order: body.order,
        status: body.status,
        description: body.description,
        desire: body.desire,
        obstacle: body.obstacle,
        action: body.action,
        result: body.result,
        twist: body.twist,
        turn: body.turn,
        ending: body.ending,
        chapterBindings: body.chapterBindings,
      },
    });
    return NextResponse.json(storyline);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "更新失败" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await prisma.storyline.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "删除失败" }, { status: 500 });
  }
}
