import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { dedupeCharacters } from "@/core/character-dedupe";
import { generateChapterOutline } from "@/core/pipeline/generate-chapter-outline";
import { runWriteGeneration, WriteSend } from "@/core/write-generation";

export const maxDuration = 300;

// POST /api/story/batch-write
//  A) { projectId, count(1-10), authorNote?, mode:"outline" }（默认）
//     → 后台逐章：建新章节 → 直接调用 generateChapterOutline 生成章纲（写入 node.outline，不写正文）
//     → 完成后 result.outlines=[{nodeId,title,outline}]，前端可编辑/勾选
//  B) { projectId, nodeIds[], authorNote?, mode:"write" }
//     → 后台逐章：直接调用 runWriteGeneration 生成正文（write 自动读取 node.outline 作为本节大纲）
//     → 收集事件流判定 done/truncated/error → 上报进度
// 两种模式都创建 FillTask(taskType=batchWrite) 立即返回 taskId；前端轮询 GET /api/babylore/fill-task/[taskId]。
// v2.0.8 #313：移除原 fetch(${ORIGIN}/api/...) 的 HTTP 自回环，改为直接 import 调用核心逻辑。

async function ensureNoRunning(projectId: string) {
  const running = await prisma.fillTask.findFirst({
    where: { projectId, taskType: "batchWrite", status: { in: ["pending", "running"] } },
  });
  return running;
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
      // v2.52.0 字级进度：按「已生成 token 字数 / 目标总字数」实时推进 FillTask.progress，
      // 避免 0% 长时间挂起像卡死（之前每章完成才跳一次，单章 ~200s 时 0% 挂 3 分钟）。
      const totalTarget = ids.length * 3000;
      let generatedChars = 0;
      let lastFlush = 0;
      // 预置 3%：写前还有上下文加载 + 剧情线规划（1 次 LLM 调用，约数十秒），
      // 先给个非零活信号，避免进度条在 0% 看着像卡死。
      await prisma.fillTask.update({ where: { id: task.id }, data: { progress: 3 } }).catch(() => {});
      try {
          for (const nodeId of ids) {
            try {
              // #313：直接调用核心逻辑，移除 fetch(${ORIGIN}/api/generate/write) 自回环
              const events: any[] = [];
              // v2.52.0：字级进度——累计 token 增量字数，节流（700ms）回写 FillTask.progress，
              // 进度条从「章级跳变」变「按字数平滑走动」，同时把 generatedChars 写进 result 供前端展示。
              const send: WriteSend = (obj: any) => {
                if (obj && obj.type === "token" && typeof obj.content === "string") {
                  generatedChars += obj.content.length;
                  const now = Date.now();
                  if (now - lastFlush > 700 || generatedChars >= totalTarget) {
                    lastFlush = now;
                    // 下限 5%：避免首个 token 把进度从预置的 3% 回落到 0% 造成视觉回跳；
                    // 流式阶段进度只增不减，与预置活信号平滑衔接。
                    const prog = Math.max(5, Math.min(99, Math.round((generatedChars / totalTarget) * 100)));
                    prisma.fillTask.update({
                      where: { id: task.id },
                      data: { progress: prog, result: { generatedChars, targetWordCount: totalTarget } },
                    }).catch(() => {});
                  }
                }
                events.push(obj);
              };
              await runWriteGeneration(
                { projectId, nodeId, authorNote: authorNote || undefined, targetWordCount: 3000, deferEnrichment: true },
                // 后台任务不依赖客户端断连信号，用独立 AbortController 占位
                { send, signal: new AbortController().signal },
              );
              // 与原 consumeSSE 等价：仅在明确成功（无 error、无截断）时记 done
              const okDone = events.some((e) => e.type === "done" && !e.truncated);
              const errored = events.some((e) => e.type === "error");
              if (okDone && !errored) done++;
              else failed++;
            } catch (we) {
              // 前置校验错误（不存在/回收站）也记为失败，保留可观测
              console.error("[batch-write] 正文生成失败:", we instanceof Error ? we.message : we);
              failed++;
            }
            await prisma.fillTask.update({
              where: { id: task.id },
              data: { done, failed, progress: Math.round(((done + failed) / ids.length) * 100) },
            });
          }
          await prisma.fillTask.update({
            where: { id: task.id },
            data: { status: done > 0 ? "completed" : "failed", progress: 100, result: { done, failed, total: ids.length, generatedChars } },
          });
          // #297：批量写作完成后默认自动跑一次去重合并（LLM 判定同一人，清理昵称缩写/尊称脏卡）。
          // P0 护栏（round-2 董事会）：去重结果/异常必须可观测，不再用 .catch(()=>{}) 静默吞掉——
          // 合并组数、龙套标记数、异常原因都写进 fillTask.result.dedupe，前端可见，避免"去重从未成功过却照报批写成功"。
          if (done > 0) {
            try {
              const dres = await dedupeCharacters(projectId);
              await prisma.fillTask.update({
                where: { id: task.id },
                data: {
                  result: {
                    done,
                    failed,
                    total: ids.length,
                    generatedChars,
                    dedupe: { merged: dres.mergedGroups.length, rockets: dres.markedRockets.length, total: dres.total },
                  },
                },
              });
            } catch (de) {
              await prisma.fillTask.update({
                where: { id: task.id },
                data: {
                  result: {
                    done,
                    failed,
                    total: ids.length,
                    dedupe: { error: de instanceof Error ? de.message : String(de) },
                  },
                },
              });
            }
          }
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
      // #294：批量章纲「延续性」——把本批次已生成的章纲依次累积，传给下一章作为强上下文，
      // 保证三章是连续剧情而非彼此独立（即使 DB 时序未落库也能承接）。
      const generatedOutlines: string[] = [];
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
            // 2) 生成章纲（写 node.outline，不写正文）——传入前文章纲保证延续
            // #313：直接调用核心逻辑，移除 fetch(${ORIGIN}/api/generate/chapter-outline) 自回环
            try {
              const d = await generateChapterOutline({
                projectId,
                nodeId: node.id,
                authorNote: authorNote || undefined,
                prevOutlines: generatedOutlines.slice(),
              });
              if (typeof d.outline === "string" && d.outline.length >= 10) {
                outlines.push({ nodeId: node.id, title: node.title, outline: d.outline });
                generatedOutlines.push(d.outline); // 累积给下一章承接
                done++;
              } else {
                failed++;
              }
            } catch (ce) {
              // 异常即本章章纲失败（含回收站/不存在/模型空响应），记 failed 并保留可观测
              console.error("[batch-write] 章纲生成失败:", ce instanceof Error ? ce.message : ce);
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
