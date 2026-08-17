/**
 * POST /api/game/end
 * 结束游戏并导出 ——
 *   1. 检查章尾悬念钩子
 *   2. 生成结尾叙事
 *   3. 拼接全部正文 → 保存 StoryNode.content
 *   4. 标记会话完成
 */
import { jsonError } from "@/lib/api-error";

import { NextResponse } from "next/server";
import { endGameAndExport } from "@/core/game/game-engine";
import { safeJson } from "@/lib/api-body";

export async function POST(req: Request) {
  try {
    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const { sessionId } = r.body;
    if (!sessionId) {
      return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
    }

    const result = await endGameAndExport(sessionId);

    return NextResponse.json({
      success: true,
      nodeId: result.nodeId,
      projectId: result.projectId,
      finalContent: result.finalContent,
      totalWords: result.totalWords,
      status: result.status,
      autoConfirmed: result.autoConfirmed,
      autoFilled: result.autoFilled,
      qualityScore: result.qualityScore,
    });
  } catch (err: any) {
    console.error("[game/end] 错误:", err);
    return jsonError(err);
  }
}
