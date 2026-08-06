import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

// POST /api/story/batch-write  { projectId, count(1-10), authorNote? }
// v1.5.0 批量写作后台化：创建 FillTask(taskType=batchWrite) 立即返回 taskId，
// 后台逐章：建新章节 → 调自身 /api/generate/write（完整生成链路：章纲计划/记忆召回/正文/后处理/章名兜底）
// → 消费 SSE 到 done → 上报进度；前端轮询 GET /api/babylore/fill-task/[taskId]。
const ORIGIN = process.env.APP_ORIGIN || "http://localhost:3001";

export async function POST(request: Request) {
  try {
    const { projectId, count, authorNote } = (await request.json()) as any;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    const n = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));

    const running = await prisma.fillTask.findFirst({
      where: { projectId, taskType: "batchWrite", status: { in: ["pending", "running"] } },
    });
    if (running) {
      return NextResponse.json({ ok: false, taskId: running.id, error: "已有批量写作任务在运行" });
    }

    const task = await prisma.fillTask.create({
      data: { projectId, taskType: "batchWrite", status: "running", total: n },
    });

    void (async () => {
      let done = 0;
      let failed = 0;
      try {
        for (let i = 0; i < n; i++) {
          try {
            // 1) 建章（标题占位「第N章」，正文生成后由章名兜底逻辑自动命名）
            const maxOrder = await prisma.storyNode.aggregate({
              where: { projectId },
              _max: { order: true },
            });
            const order = (maxOrder._max.order ?? 0) + 1;
            const node = await prisma.storyNode.create({
              data: {
                projectId,
                parentId: null,
                type: "chapter",
                title: `第${order}章`,
                order,
              },
            });
            // 2) 调自身 write（复用完整生成链路，含章纲计划与后处理）
            const res = await fetch(`${ORIGIN}/api/generate/write`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                projectId,
                nodeId: node.id,
                authorNote: authorNote || undefined,
                targetWordCount: 3000,
              }),
            });
            if (!res.ok || !res.body) throw new Error(`write HTTP ${res.status}`);
            // 3) 消费 SSE 直到 done
            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let buf = "";
            let okDone = false;
            // eslint-disable-next-line no-constant-condition
            while (true) {
              const { done: d, value } = await reader.read();
              if (value) buf += decoder.decode(value, { stream: true });
              if (buf.includes('"type":"done"') || buf.includes('"type": "done"')) okDone = true;
              if (d) break;
            }
            if (okDone) done++;
            else failed++;
          } catch {
            failed++;
          }
          await prisma.fillTask.update({
            where: { id: task.id },
            data: {
              done,
              failed,
              progress: Math.round(((done + failed) / n) * 100),
            },
          });
        }
        await prisma.fillTask.update({
          where: { id: task.id },
          data: {
            status: done > 0 ? "completed" : "failed",
            progress: 100,
            result: { done, failed, total: n },
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
