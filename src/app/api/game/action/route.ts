/**
 * POST /api/game/action
 * 处理一个游戏回合——SSE 流式响应
 *
 * SSE 事件类型：
 * - token: 流式文本块
 * - game_done: 回合完成（含 narrative/options/entities/items/progress）
 * - error: 错误
 */

import { NextResponse } from "next/server";
import { processGameTurn } from "@/core/game/game-engine";
import type { GameActionType } from "@/core/game/types";

export async function POST(req: Request) {
  const { sessionId, actionType, actionText, selectedOption, targetItem } =
    await req.json();

  if (!sessionId) {
    return NextResponse.json({ error: "缺少 sessionId" }, { status: 400 });
  }

  // 创建 SSE 流
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const write = (data: any) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const gen = processGameTurn(
          {
            sessionId,
            actionType: (actionType || "custom") as GameActionType,
            actionText: actionText || "自定义行动",
            selectedOption,
            targetItem,
          },
          req.signal
        );

        for await (const event of gen) {
          write(event);
          if (event.type === "error") break;
        }
      } catch (err: any) {
        write({ type: "error", error: err.message || "未知错误" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
