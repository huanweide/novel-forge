import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// DELETE /api/game/state?sessionId=...&round=N
// 删除第 N 轮及之后所有 gameState，并回滚 session 的 currentRound/totalWords/plotProgress 到 N-1 状态，
// 使「回退」操作真正落库（阿游 P0-1）。此前回退仅改前端内存，导出时仍含被回退轮次，导致显示与导出永久错位。
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const roundStr = searchParams.get("round");
  if (!sessionId || !roundStr) {
    return NextResponse.json({ ok: false, error: "缺少 sessionId 或 round" }, { status: 400 });
  }
  const round = parseInt(roundStr, 10);
  if (isNaN(round)) {
    return NextResponse.json({ ok: false, error: "round 必须为数字" }, { status: 400 });
  }
  try {
    // 删除该轮及之后所有 gameState
    await prisma.gameState.deleteMany({ where: { sessionId, round: { gte: round } } });
    // 回滚 session 到 N-1 状态：从剩余 rounds 重算累计
    const remaining = await prisma.gameState.findMany({
      where: { sessionId, round: { lt: round } },
      orderBy: { round: "asc" },
    });
    const currentRound = remaining.length ? remaining[remaining.length - 1].round : 0;
    const totalWords = remaining.reduce((s, r) => s + (r.wordCount || 0), 0);
    const plotProgress = remaining.length ? remaining[remaining.length - 1].plotProgress : 0;
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { currentRound, totalWords, plotProgress },
    });
    return NextResponse.json({ ok: true, rolledBackTo: currentRound });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
