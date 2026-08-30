import { asArray } from "@/lib/utils";
import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { applyMerge, toCharLite } from "@/core/character-dedupe";

export const maxDuration = 300;

// POST /api/characters/merge-confirm  { revisionId }
// 确认一个 pending 合并提案：按快照执行真正合并（主卡并入别名/内容/关系，被并卡软删标记），标 applied。
export async function POST(request: Request) {
  try {
    const { revisionId } = (await request.json()) as any;
    if (!revisionId) {
      return NextResponse.json({ error: "缺少 revisionId" }, { status: 400 });
    }
    const rev = await prisma.characterCardRevision.findUnique({ where: { id: revisionId } });
    if (!rev) return NextResponse.json({ error: "合并提案不存在" }, { status: 404 });
    if (rev.status !== "pending") {
      return NextResponse.json({ error: `该提案已处理（${rev.status}）` }, { status: 409 });
    }
    const main = await prisma.characterCard.findUnique({ where: { id: rev.mainCardId } });
    if (!main) return NextResponse.json({ error: "主卡已不存在" }, { status: 404 });
    const mergedRows = await prisma.characterCard.findMany({ where: { id: { in: asArray<string>(rev.mergedIds) } } });
    if (mergedRows.length === 0) return NextResponse.json({ error: "被并卡已不存在" }, { status: 404 });

    // pending 时主卡/被并卡未被改动，DB 当前值即合并前快照，直接执行合并
    const mainAfter = await applyMerge(toCharLite(main), mergedRows.map(toCharLite));
    await prisma.characterCardRevision.update({
      where: { id: rev.id },
      data: { status: "applied", mainAfter: mainAfter as any },
    });
    return NextResponse.json({ ok: true, mainCardId: rev.mainCardId, mergedIds: rev.mergedIds });
  } catch (e) {
    return jsonError(e);
  }
}
