import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// 收集某节点整棵子树（含自身）的全部 id
async function collectSubtreeIds(projectId: string, rootId: string): Promise<string[]> {
  const all = await prisma.storyNode.findMany({
    where: { projectId },
    select: { id: true, parentId: true },
  });
  const childrenMap = new Map<string | null, string[]>();
  for (const n of all) {
    const key = n.parentId ?? null;
    const arr = childrenMap.get(key) ?? [];
    arr.push(n.id);
    childrenMap.set(key, arr);
  }
  const ids: string[] = [];
  const seen = new Set<string>();
  const stack = [rootId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    ids.push(cur);
    for (const c of childrenMap.get(cur) ?? []) stack.push(c);
  }
  return ids;
}

// 顶层章节彻底删后，对「存活」顶层节点重新编号（跳过已软删）
async function renumberLiveTopChapters(projectId: string) {
  const remaining = await prisma.storyNode.findMany({
    where: { projectId, parentId: null, type: { not: "volume" }, deletedAt: null },
    orderBy: { order: "asc" },
  });
  const cnDigits = ["零","一","二","三","四","五","六","七","八","九","十","十一","十二","十三","十四","十五","十六","十七","十八","十九","二十","二十一","二十二","二十三","二十四","二十五","二十六","二十七","二十八","二十九","三十"];
  const toCn = (n: number) => cnDigits[n] || String(n);
  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i];
    const rawTitle = (ch.title || "").replace(/^第[一二三四五六七八九十百千\d]+章[：:]\s*/, "");
    const newTitle = rawTitle ? `第${toCn(i + 1)}章：${rawTitle}` : `第${toCn(i + 1)}章`;
    await prisma.storyNode.update({ where: { id: ch.id }, data: { title: newTitle, order: i } });
  }
}

// POST /api/story/nodes/[id]/purge —— #123 彻底删除（硬删，级联子树 + 清孤儿记录 + 重新编号）
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.storyNode.findUnique({ where: { id }, select: { id: true, projectId: true, parentId: true, type: true, deletedAt: true } });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    const subtreeIds = await collectSubtreeIds(node.projectId, id);
    // 清关联孤儿（String 引用子记录，schema 无 onDelete Cascade），杜绝污染写作上下文
    await prisma.$transaction([
      prisma.chapterSummary.deleteMany({ where: { chapterId: { in: subtreeIds } } }),
      prisma.storyBeat.deleteMany({ where: { nodeId: { in: subtreeIds } } }),
      prisma.pendingCommitment.deleteMany({ where: { sourceNodeId: { in: subtreeIds } } }),
      prisma.pendingItem.deleteMany({ where: { sourceNodeId: { in: subtreeIds } } }),
      prisma.storyNode.deleteMany({ where: { id: { in: subtreeIds } } }),
    ]);
    if (node.parentId === null && (node.type === "chapter" || node.type === "section")) {
      await renumberLiveTopChapters(node.projectId);
    }
    return NextResponse.json({ success: true, purged: true, count: subtreeIds.length });
  } catch (err) {
    return jsonError(err);
  }
}
