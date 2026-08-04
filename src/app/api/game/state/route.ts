import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionSummary } from "@/core/game/game-engine";

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
  // P2：round 非法（<1）直接拒绝
  if (round < 1) {
    return NextResponse.json({ ok: false, error: "round 必须为正整数" }, { status: 400 });
  }
  try {
    // P2：session 不存在时优雅 no-op，避免 500（前端回退仍可安全重试）
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({
        ok: true,
        rolledBackTo: 0,
        summary: { currentRound: 0, totalWords: 0, plotProgress: 0, items: [], entities: [], narrative: "", options: [] },
      });
    }
    // 删除该轮及之后所有 gameState
    await prisma.gameState.deleteMany({ where: { sessionId, round: { gte: round } } });
    // 回滚 session 到 N-1 状态：从剩余 rounds 重算累计
    const remaining = await prisma.gameState.findMany({
      where: { sessionId, round: { lt: round } },
      orderBy: { round: "asc" },
    });
    const last = remaining.length ? remaining[remaining.length - 1] : null;
    const currentRound = last ? last.round : 0;
    const totalWords = remaining.reduce((s, r) => s + (r.wordCount || 0), 0);
    const plotProgress = last ? last.plotProgress : 0;
    await prisma.gameSession.update({
      where: { id: sessionId },
      data: { currentRound, totalWords, plotProgress },
    });
    // P1：返回重算后的全量会话摘要，供前端整体 setState 覆盖（与 rollback 后权威态一致）
    const summary = {
      currentRound,
      totalWords,
      plotProgress,
      items: (last?.items as unknown as any[]) || [],
      entities: (last?.entities as unknown as any[]) || [],
      narrative: remaining.map((r) => r.narrative).filter(Boolean).join("\n\n"),
      options: (last?.options as unknown as any[]) || [],
    };
    return NextResponse.json({ ok: true, rolledBackTo: currentRound, summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

// GET /api/game/state?sessionId=...
// 返回后端权威会话摘要，供前端在 abort/停止/断网后对账回拉整体覆盖（阿游 P0-2）。
// 取全量 summary（currentRound/totalWords/plotProgress/items/entities/narrative/options/turns），
// 保证前端轮次与背包与后端一致。
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return NextResponse.json({ ok: false, error: "缺少 sessionId" }, { status: 400 });
  }
  try {
    const session = await prisma.gameSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({
        ok: true,
        summary: {
          currentRound: 0,
          totalWords: 0,
          plotProgress: 0,
          items: [],
          entities: [],
          narrative: "",
          options: [],
          turns: [],
        },
      });
    }
    const summary = await getSessionSummary(sessionId);
    return NextResponse.json({
      ok: true,
      summary: {
        currentRound: summary.currentRound,
        totalWords: summary.totalWords,
        plotProgress: summary.plotProgress,
        items: summary.items,
        entities: summary.entities,
        narrative: summary.allNarrative,
        options: summary.lastOptions,
        turns: summary.turns,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
