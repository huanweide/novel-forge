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

// POST /api/story/nodes/[id]/restore —— #123 从回收站恢复（清空 deletedAt，级联整棵子树）
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const node = await prisma.storyNode.findUnique({ where: { id }, select: { id: true, projectId: true, deletedAt: true } });
    if (!node) {
      return NextResponse.json({ error: "节点不存在" }, { status: 404 });
    }
    const subtreeIds = await collectSubtreeIds(node.projectId, id);
    await prisma.storyNode.updateMany({
      where: { id: { in: subtreeIds } },
      data: { deletedAt: null },
    });
    return NextResponse.json({ success: true, restored: true, count: subtreeIds.length });
  } catch (err) {
    return jsonError(err);
  }
}
