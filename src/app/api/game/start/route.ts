/**
 * POST /api/game/start
 * 初始化游戏会话，流式生成第一段叙事 + 首批选项（SSE）
 *
 * SSE 事件类型：
 * - token: 流式文本块（开场叙事逐字流出）
 * - start_done: 开场完成（含 sessionId/narrative/options/entities/items/progress）
 * - error: 错误
 */
import { NextResponse } from "next/server";
import { processGameStart } from "@/core/game/game-engine";
import { safeJson } from "@/lib/api-body";

export async function POST(req: Request) {
  const r = await safeJson(req);
  if (!r.ok) return r.response;
  const { projectId, nodeId, concept } = r.body;
  if (!projectId || !nodeId) {
    return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
  }

  // 本地 abort：前端停止时透传到引擎，真正中断 LLM 流
  const ac = new AbortController();
  if (req.signal) {
    req.signal.addEventListener("abort", () => ac.abort());
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
        const gen = processGameStart({ projectId, nodeId, concept }, ac.signal);
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
    cancel() {
      ac.abort();
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
