import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// POST /api/characters/merge-ignore  { revisionId }
// 忽略一个 pending 合并提案（标 ignored，不做任何合并/恢复）。
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
    await prisma.characterCardRevision.update({ where: { id: rev.id }, data: { status: "ignored" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
