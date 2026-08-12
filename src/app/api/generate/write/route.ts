import { jsonError } from "@/lib/api-error";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { runWriteGeneration, WriteInput, WriteSend } from "@/core/write-generation";

/**
 * POST /api/generate/write
 *
 * 核心生成端点 —— SSE 流式输出小说正文。
 * 业务逻辑已抽离至 @/core/write-generation（runWriteGeneration），
 * 本路由仅负责限流、参数解析、构造成 SSE ReadableStream 并把 controller.enqueue 封装成 send、
 * 透传 request.signal。v2.0.8 #313 重构。
 */
export async function POST(request: Request) {
  // L2-001：生成写章限流（1 分钟 10 次），业务 LLM 调用前拦截
  if (!rateLimit("generate/write", clientIp(request), 10, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const body = await request.json();
    const {
      projectId,
      nodeId,
      authorNote,
      targetWordCount = 3000,
      confirmedCardIds,
      cardNotes,
      newCharacterRequests,
      storylineId,
      diffuseCompleted,
    } = body;

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const input: WriteInput = {
      projectId,
      nodeId,
      authorNote,
      targetWordCount,
      confirmedCardIds,
      cardNotes,
      newCharacterRequests,
      storylineId,
      diffuseCompleted,
    };

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send: WriteSend = (obj) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };
        try {
          await runWriteGeneration(input, { send, signal: request.signal });
        } catch (e) {
          // 前置校验失败（不存在/回收站）——推 error 事件后关闭，等价于原 404/410 HTTP 响应
          console.error("[generate/write] 前置校验失败:", e);
          send({ type: "error", content: "服务器内部错误，请查看日志" });
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
  } catch (err) {
    return jsonError(err);
  }
}
