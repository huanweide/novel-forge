import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { NextResponse } from "next/server";
import { recallContext } from "@/core/babylore/recall";

// POST /api/babylore/recall  { projectId, context }
// 剧情推进=记忆召回：根据上下文匹配世界书(绿灯)与结构化表格行，返回应注入的记忆。
export async function POST(request: Request) {
  try {
    const { projectId, context } = (await request.json()) as any;
    if (!projectId || !context) {
      return NextResponse.json({ error: "缺少 projectId 或 context" }, { status: 400 });
    }
    const [lore, tables] = await Promise.all([
      getApprovedLore(prisma, projectId),
      prisma.loreTable.findMany({ where: { projectId } }),
    ]);
    const items = recallContext(context, lore as any, tables as any);
    return NextResponse.json({ items, count: items.length });
  } catch (e) {
    return jsonError(e);
  }
}
