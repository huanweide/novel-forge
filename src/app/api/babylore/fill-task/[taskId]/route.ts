import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET /api/babylore/fill-task/[taskId] —— 一键追评后台任务进度轮询（v1.4.0）
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ taskId: string }> },
) {
  try {
    const { taskId } = await params;
    const task = await prisma.fillTask.findUnique({ where: { id: taskId } });
    if (!task) {
      return NextResponse.json({ error: "任务不存在" }, { status: 404 });
    }
    return NextResponse.json({
      id: task.id,
      status: task.status,
      progress: task.progress,
      total: task.total,
      done: task.done,
      failed: task.failed,
      result: task.result,
      error: task.error,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "查询任务失败" },
      { status: 500 },
    );
  }
}
