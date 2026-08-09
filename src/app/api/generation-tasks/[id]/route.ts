/**
 * GET /api/generation-tasks/[id] —— 轮询单条任务状态（供前端轮询拿结果）
 *
 * v1.8.6 (#174)
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const task = await prisma.generationTask.findUnique({ where: { id } });
    if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

    return NextResponse.json({
      id: task.id,
      projectId: task.projectId,
      targetType: task.targetType,
      status: task.status,
      progress: task.progress,
      result: task.result,
      error: task.error,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    });
  } catch (err) {
    return jsonError(err);
  }
}
