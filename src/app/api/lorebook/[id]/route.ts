import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// PUT /api/lorebook/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const entry = await prisma.lorebookEntry.update({
      where: { id },
      data: {
        title: body.title,
        category: body.category,
        keys: body.keys,
        content: body.content,
        insertionOrder: body.insertionOrder,
        enabled: body.enabled,
        parentId: body.parentId,
        relatedEntryIds: body.relatedEntryIds,
      },
    });
    return NextResponse.json(entry);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新词条失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/lorebook/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.lorebookEntry.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "删除词条失败" },
      { status: 500 }
    );
  }
}
