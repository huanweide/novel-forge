import { NextRequest } from "next/server";
import { streamImitation } from "@/core/dissect/imitation-engine";
import type { ImitationRequest, ImitationMode, DimensionKey } from "@/core/dissect/types";
import { DISSECT_DIMENSIONS } from "@/core/dissect/types";
import { jsonError } from "@/lib/api-error";

/**
 * POST /api/imitate/start
 *
 * SSE 流式仿写。基于拆书维度数据，按指定模式和相似度生成仿写内容。
 *
 * Body: ImitationRequest
 *   dissectionId: string
 *   mode: "full" | "partial" | "creative"
 *   similarity: number (0-100)
 *   selectedDimensions: DimensionKey[]
 *   customRequirement?: string
 *   targetWordCount: number
 *   chapterCount: number
 *   genre?: string
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      dissectionId,
      mode = "partial",
      similarity = 70,
      selectedDimensions,
      customRequirement = "",
      targetWordCount = 3000,
      chapterCount = 1,
      genre,
    } = body as ImitationRequest & { genre?: string };

    // 验证
    if (!dissectionId) {
      return new Response(JSON.stringify({ error: "请选择拆书记录" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const validModes: ImitationMode[] = ["full", "partial", "creative"];
    if (!validModes.includes(mode)) {
      return new Response(JSON.stringify({ error: "无效的仿写模式" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!selectedDimensions || selectedDimensions.length === 0) {
      return new Response(JSON.stringify({ error: "至少选择一个仿写维度" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const invalidDims = selectedDimensions.filter(
      (d: string) => !(DISSECT_DIMENSIONS as readonly string[]).includes(d),
    );
    if (invalidDims.length > 0) {
      return new Response(
        JSON.stringify({ error: `无效的维度：${invalidDims.join(", ")}` }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (similarity < 0 || similarity > 100) {
      return new Response(
        JSON.stringify({ error: "相似度需在 0-100 之间" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    const req2: ImitationRequest = {
      dissectionId,
      mode,
      similarity,
      selectedDimensions,
      customRequirement,
      targetWordCount: Math.min(targetWordCount, 50000),
      chapterCount: Math.min(chapterCount, 20),
      genre,
    };

    // SSE 流式响应
    const encoder = new TextEncoder();

    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamImitation(req2)) {
            if (chunk.type === "token") {
              const data = JSON.stringify({ type: "token", content: chunk.content });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            } else if (chunk.type === "done") {
              controller.enqueue(encoder.encode(`data: {"type":"done"}\n\n`));
            }
          }
        } catch (err: any) {
          const errorData = JSON.stringify({
            type: "error",
            message: err?.message || "仿写生成失败",
          });
          controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
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
      },
    });
  } catch (err) {
    console.error("[imitate/start] 启动失败:", err);
    return jsonError(err);
  }
}
