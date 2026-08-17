import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDissection } from "@/core/dissect/engine";
import type { DissectDepth, DissectStatus } from "@/core/dissect/types";
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";

/**
 * POST /api/dissect/start
 *
 * SSE 长连接拆书端点。
 *
 * 相比 v0.20.27 的 fire-and-forget 模式，改为 SSE 长连接：
 *   - 连接存活 = 任务在跑，不会因 HTTP 响应结束而丢失异步上下文
 *   - 进度实时推流到前端：分章→维度提取→章节摘要，每个阶段都有事件
 *   - 即使网络断开，后端继续跑（DB 里有进度），前端重连后走轮询恢复
 *
 * SSE 事件类型：
 *   progress  — { progress, status, message }
 *   done      — { taskId, totalChapters }
 *   error     — { message }
 */
export async function POST(req: NextRequest) {
  // 1. 解析和验证（在 SSE 之前——验证失败返回纯 JSON）
  const parsed = await safeJson(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body as {
    taskName?: string;
    bookName?: string;
    bookAuthor?: string;
    originalText?: string;
    depth?: DissectDepth;
    extractChapterSummaries?: boolean;
  };

  const {
    taskName,
    bookName,
    bookAuthor = "",
    originalText,
    depth = "standard",
    extractChapterSummaries = false,
  } = body;

  if (!originalText || originalText.trim().length < 100) {
    return new Response(JSON.stringify({ error: "原文太短，至少需要100字" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (!bookName && !taskName) {
    return new Response(JSON.stringify({ error: "请填写任务名称或原书名称" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validDepths: DissectDepth[] = ["quick", "standard", "deep"];
  if (!validDepths.includes(depth)) {
    return new Response(
      JSON.stringify({ error: `无效的拆解深度：${depth}` }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  // 2. 创建任务记录
  let taskId: string;
  try {
    const task = await prisma.dissectionTask.create({
      data: {
        taskName: taskName || bookName || "未命名拆书",
        bookName: bookName || taskName || "未知书名",
        bookAuthor,
        originalText: originalText.trim(),
        depth,
        extractChapterSummaries,
        status: "pending",
        progress: 0,
      },
    });
    taskId = task.id;
  } catch (err: any) {
    return jsonError(err);
  }

  // 3. SSE 流式响应——整个拆解过程保持连接存活
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`),
        );
      };

      try {
        // 运行拆解——onProgress 把每个阶段推给前端
        await runDissection({
          taskId,
          depth,
          extractChapterSummaries,
          onProgress: (progress: number, status: DissectStatus, message: string) => {
            send("progress", { progress, status, message });
          },
        });

        // 成功完成——读最终状态
        const final = await prisma.dissectionTask.findUnique({
          where: { id: taskId },
          select: { totalChapters: true },
        });

        send("done", {
          taskId,
          totalChapters: final?.totalChapters || 0,
          message: "拆解完成",
        });
      } catch (err: any) {
        send("error", {
          message: err?.message || "拆解过程中发生错误",
          taskId,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // 禁用 nginx 缓冲
    },
  });
}
