import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-error";

/**
 * GET /api/import/[taskId]
 *
 * 查询导入任务详情——供前端断线后轮询恢复进度与结果。
 * 对齐 dissect/[id] 的轮询模式：import/parse 已落库 ImportTask 并返回 taskId，
 * 前端若 SSE 中途断开，可凭 taskId 轮询此端点，completed 时拿 result 进预览。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const task = await prisma.importTask.findUnique({ where: { id: taskId } });
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    return NextResponse.json({
      id: task.id,
      projectId: task.projectId,
      importMode: task.importMode,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      rawTextLen: task.rawTextLen,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (err: any) {
    console.error("[import/[taskId]] 查询失败:", err);
    return jsonError(err);
  }
}
