/**
 * POST /api/game/end
 * 结束游戏并导出 ——
 *   1. 检查章尾悬念钩子
 *   2. 生成结尾叙事
 *   3. 拼接全部正文 → 保存 StoryNode.content
 *   4. 标记会话完成
 */

import { NextResponse } from "next/server";
import { endGameAndExport } from "@/core/game/game-engine";

export async function POST(req: Request) {
  try {
    const { sessionId } = await req.json();
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
    });
  } catch (err: any) {
    console.error("[game/end] 错误:", err);
    return NextResponse.json({ error: err.message || "内部错误" }, { status: 500 });
  }
}
