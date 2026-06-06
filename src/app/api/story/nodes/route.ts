import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/story/nodes
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const node = await prisma.storyNode.create({
      data: {
        projectId: body.projectId,
        parentId: body.parentId || null,
        type: body.type || "section",
        title: body.title || "未命名",
        order: body.order || 0,
        status: body.status || "outline_only",
        outline: body.outline || null,
        content: body.content || null,
        wordCount: body.wordCount || 0,
        branchId: body.branchId || null,
        isMainBranch: body.isMainBranch ?? true,
        activeCharacters: body.activeCharacters || [],
        activeLoreIds: body.activeLoreIds || [],
        coreConflict: body.coreConflict || null,
        settingDescription: body.settingDescription || null,
        notes: body.notes || null,
      },
    });
    return NextResponse.json(node, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建节点失败" },
      { status: 500 }
    );
  }
}
