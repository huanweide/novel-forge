import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { babyloreFillAll } from "@/core/babylore/fill";

export const maxDuration = 300;

// POST /api/babylore/fill-all  { projectId, tableKeys? }
// v1.4.0 后台化：创建 FillTask 任务后立即返回 taskId，后台 fire-and-forget 逐章执行；
// 前端 2-3s 轮询 GET /api/babylore/fill-task/[taskId] 展示进度；关页面任务继续（本地进程常驻）。
export async function POST(request: Request) {
  try {
    const { projectId, tableKeys } = (await request.json()) as any;
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // 防重复：同项目已有运行中的任务 → 返回既有 taskId
    const running = await prisma.fillTask.findFirst({
      where: { projectId, status: { in: ["pending", "running"] } },
    });
    if (running) {
      return NextResponse.json({ ok: false, taskId: running.id, error: "该项目已有后台填表任务在运行" });
    }

    const task = await prisma.fillTask.create({
      data: { projectId, taskType: "fill", status: "running" },
    });

    // fire-and-forget：本地 next 进程常驻，请求返回后后台继续跑
    void (async () => {
      try {
        const res = await babyloreFillAll(projectId, {
          tableKeys,
          onProgress: async (done, total) => {
            await prisma.fillTask.update({
              where: { id: task.id },
              data: { done, total, progress: total ? Math.round((done / total) * 100) : 0 },
            });
          },
        });
        await prisma.fillTask.update({
          where: { id: task.id },
          data: {
            status: res.ok ? "completed" : "failed",
            progress: 100,
            result: {
              ok: res.ok,
              applied: res.applied,
              operations: res.operations,
              processed: res.processed,
              skipped: res.skipped,
              error: res.error || null,
              warnings: (res.warnings || []).slice(0, 10),
              selfCheck: res.selfCheck as unknown as object,
            } as any,
          },
        });
      } catch (e) {
        await prisma.fillTask.update({
          where: { id: task.id },
          data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
        });
      }
    })();

    return NextResponse.json({ ok: true, taskId: task.id, background: true });
  } catch (e) {
    return jsonError(e);
  }
}
