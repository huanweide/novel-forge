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
import { sseError } from "@/lib/sse-error";

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
      } catch (err: unknown) {
        // 收敛为可读错误，避免泄露原始 err.message（与 write/continue/refine 三路由一致）；
        // 直接发送 sseError 返回的 { type:"error", content, code, hint } 事件，
        // 不再用裸 error 字段（FIX-10：统一 SSE 契约）。
        write(sseError(err));
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
