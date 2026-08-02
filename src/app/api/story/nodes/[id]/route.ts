import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { snapshotRevision } from "@/lib/versions";

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
    return jsonError(err);
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
    // BE-1：手动保存前快照当前正文（去重由 helper 处理）
    const existingNode = await prisma.storyNode.findUnique({
      where: { id },
      select: { content: true, wordCount: true, projectId: true },
    });
    if (existingNode && body.content !== existingNode.content) {
      await snapshotRevision({
        nodeId: id,
        projectId: existingNode.projectId,
        source: "manual",
        prevContent: existingNode.content ?? "",
        prevWordCount: existingNode.wordCount,
      });
    }
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
    return jsonError(err);
  }
}

// DELETE /api/story/nodes/[id] —— 删除节点并自动重新编号章节
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const node = await prisma.storyNode.findUnique({ where: { id } });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }

    // 级联删除子节点
    await prisma.storyNode.deleteMany({ where: { parentId: id } });
    await prisma.storyNode.delete({ where: { id } });

    // 如果删除的是顶层章节（parentId=null, type=chapter），重新编号所有剩余章节
    if (node.parentId === null && (node.type === "chapter" || node.type === "section")) {
      const remaining = await prisma.storyNode.findMany({
        where: { projectId: node.projectId, parentId: null, type: { not: "volume" } },
        orderBy: { order: "asc" },
      });

      const cnDigits = ["零","一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","二十一","二十二","二十三","二十四","二十五","二十六","二十七","二十八","二十九","三十"];
      const toCn = (n: number) => cnDigits[n] || String(n);

      for (let i = 0; i < remaining.length; i++) {
        const ch = remaining[i];
        // 提取原标题中冒号后的部分（如果有的话）
        const rawTitle = (ch.title || "").replace(/^第[一二三四五六七八九十百千\d]+章[：:]\s*/, "");
        const newTitle = rawTitle
          ? `第${toCn(i + 1)}章：${rawTitle}`
          : `第${toCn(i + 1)}章`;
        await prisma.storyNode.update({
          where: { id: ch.id },
          data: { title: newTitle, order: i },
        });
      }
    }

    return NextResponse.json({ success: true, renumbered: true });
  } catch (err) {
    return jsonError(err);
  }
}
