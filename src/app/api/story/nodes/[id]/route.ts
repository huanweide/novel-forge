import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/story/nodes/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.storyNode.findUnique({
      where: { id },
      include: { children: { orderBy: { order: "asc" } } },
    });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    return NextResponse.json(node);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取节点失败" },
      { status: 500 }
    );
  }
}

// PUT /api/story/nodes/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const node = await prisma.storyNode.update({
      where: { id },
      data: {
        title: body.title,
        order: body.order,
        status: body.status,
        outline: body.outline,
        content: body.content,
        wordCount: body.wordCount,
        branchId: body.branchId,
        isMainBranch: body.isMainBranch,
        activeCharacters: body.activeCharacters,
        activeLoreIds: body.activeLoreIds,
        coreConflict: body.coreConflict,
        settingDescription: body.settingDescription,
        notes: body.notes,
        reviewLogs: body.reviewLogs,
        revisionCount: body.revisionCount,
      },
    });
    return NextResponse.json(node);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新节点失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/story/nodes/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // 级联删除子节点
    await prisma.storyNode.deleteMany({ where: { parentId: id } });
    await prisma.storyNode.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "删除节点失败" },
      { status: 500 }
    );
  }
}
