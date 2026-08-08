import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const maxDuration = 300;

// POST /api/story/batch-write
//  A) { projectId, count(1-10), authorNote?, mode:"outline" }（默认）
//     → 后台逐章：建新章节 → 调 /api/generate/chapter-outline 生成章纲（写入 node.outline，不写正文）
//     → 完成后 result.outlines=[{nodeId,title,outline}]，前端可编辑/勾选
//  B) { projectId, nodeIds[], authorNote?, mode:"write" }
//     → 后台逐章：调 /api/generate/write 生成正文（write 自动读取 node.outline 作为本节大纲）
//     → 消费 SSE 到 done → 上报进度
// 两种模式都创建 FillTask(taskType=batchWrite) 立即返回 taskId；前端轮询 GET /api/babylore/fill-task/[taskId]。
const ORIGIN = process.env.APP_ORIGIN || "http://localhost:3001";

async function ensureNoRunning(projectId: string) {
  const running = await prisma.fillTask.findFirst({
    where: { projectId, taskType: "batchWrite", status: { in: ["pending", "running"] } },
  });
  return running;
}

async function consumeSSE(res: Response): Promise<boolean> {
  if (!res.ok || !res.body) throw new Error(`write HTTP ${res.status}`);
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
  return okDone;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as any;
    const { projectId, mode } = body;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    // ── 模式 B：写正文（复用已建章节的 nodeIds，章纲已在 outline 字段）──
    if (mode === "write") {
      const { nodeIds, authorNote } = body;
      const ids = (Array.isArray(nodeIds) ? nodeIds : []).filter((x: any) => typeof x === "string" && x.length > 0);
      if (ids.length === 0) return NextResponse.json({ error: "缺少 nodeIds" }, { status: 400 });

      const running = await ensureNoRunning(projectId);
      if (running) {
        return NextResponse.json({ ok: false, taskId: running.id, error: "已有批量写作任务在运行" });
      }
      const task = await prisma.fillTask.create({
        data: { projectId, taskType: "batchWrite", status: "running", total: ids.length },
      });

      void (async () => {
        let done = 0;
        let failed = 0;
        try {
          for (const nodeId of ids) {
            try {
              const res = await fetch(`${ORIGIN}/api/generate/write`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  projectId,
                  nodeId,
                  authorNote: authorNote || undefined,
                  targetWordCount: 3000,
                }),
              });
              if (await consumeSSE(res)) done++;
              else failed++;
            } catch {
              failed++;
            }
            await prisma.fillTask.update({
              where: { id: task.id },
              data: { done, failed, progress: Math.round(((done + failed) / ids.length) * 100) },
            });
          }
          await prisma.fillTask.update({
            where: { id: task.id },
            data: { status: done > 0 ? "completed" : "failed", progress: 100, result: { done, failed, total: ids.length } },
          });
        } catch (e) {
          await prisma.fillTask.update({
            where: { id: task.id },
            data: { status: "failed", error: e instanceof Error ? e.message : String(e) },
          });
        }
      })();

      return NextResponse.json({ ok: true, taskId: task.id, background: true });
    }

    // ── 模式 A（默认）：建章 + 生成章纲 ──
    const { count, authorNote } = body;
    const n = Math.max(1, Math.min(10, Math.trunc(Number(count)) || 1));

    const running = await ensureNoRunning(projectId);
    if (running) {
      return NextResponse.json({ ok: false, taskId: running.id, error: "已有批量写作任务在运行" });
    }
    const task = await prisma.fillTask.create({
      data: { projectId, taskType: "batchWrite", status: "running", total: n },
    });

    void (async () => {
      let done = 0;
      let failed = 0;
      const outlines: { nodeId: string; title: string; outline: string }[] = [];
      try {
        for (let i = 0; i < n; i++) {
          try {
            // 1) 建章（标题占位「第N章」，正文生成后由章名兜底逻辑自动命名）
            const maxOrder = await prisma.storyNode.aggregate({
              where: { projectId, deletedAt: null },
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
            // 2) 生成章纲（写 node.outline，不写正文）
            const res = await fetch(`${ORIGIN}/api/generate/chapter-outline`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ projectId, nodeId: node.id, authorNote: authorNote || undefined }),
            });
            const d = await res.json().catch(() => ({}));
            if (res.ok && typeof (d as any).outline === "string" && String((d as any).outline).length >= 10) {
              outlines.push({ nodeId: node.id, title: node.title, outline: (d as any).outline });
              done++;
            } else {
              failed++;
            }
          } catch {
            failed++;
          }
          await prisma.fillTask.update({
            where: { id: task.id },
            data: { done, failed, progress: Math.round(((done + failed) / n) * 100) },
          });
        }
        await prisma.fillTask.update({
          where: { id: task.id },
          data: { status: done > 0 ? "completed" : "failed", progress: 100, result: { done, failed, total: n, outlines } },
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
