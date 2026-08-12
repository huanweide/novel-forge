import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { rollbackMerge } from "@/core/character-dedupe";

// POST /api/characters/merge-rollback  { revisionId }
// 回滚一个已应用的合并：主卡恢复快照旧值，被并卡去除「🗂 已合并」标记，标 rolled_back。
export async function POST(request: Request) {
  try {
    const { revisionId } = (await request.json()) as any;
    if (!revisionId) {
      return NextResponse.json({ error: "缺少 revisionId" }, { status: 400 });
    }
    const rev = await prisma.characterCardRevision.findUnique({ where: { id: revisionId } });
    if (!rev) return NextResponse.json({ error: "合并记录不存在" }, { status: 404 });
    if (rev.status !== "applied") {
      return NextResponse.json({ error: `仅已应用的合并可回滚（当前 ${rev.status}）` }, { status: 409 });
    }
    await rollbackMerge(rev);
    await prisma.characterCardRevision.update({ where: { id: rev.id }, data: { status: "rolled_back" } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
