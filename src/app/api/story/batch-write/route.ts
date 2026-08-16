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
      const total = ids.length;
      const chapterTarget = 3000;
      // v2.52+ 分阶段进度：写作占本章 0..85%，后置富化（审校/摘要/逻辑自查）占 85..100%；
      // 富化始终在关键路径同步跑完，保证下一章拿到上一章摘要（不丢上下文）；进度条靠映射富化事件
      // 持续走动，慢模型下也绝不冻结、不丢失任何输出/约束。
      let lastFlush = 0;
      let totalGeneratedChars = 0; // 跨章累计已生成字数（供最终 result 展示）
      // 预置 2% 活信号：写前加载+规划期间进度条非零、不卡死。
      await prisma.fillTask.update({ where: { id: task.id }, data: { progress: 2 } }).catch(() => {});
      try {
          for (let idx = 0; idx < ids.length; idx++) {
            const nodeId = ids[idx];
            try {
              // #313：直接调用核心逻辑，移除 fetch(${ORIGIN}/api/generate/write) 自回环
              const events: any[] = [];
              let localChars = 0;
              const base = (idx / total) * 100;        // 本章在整体进度条起点
              const slice = 100 / total;               // 本章占整体进度比例
              const floorOverall = Math.max(2, base);  // 进度下限：绝不回落到预置活信号以下
              let lastReported = -1;
              const report = (localPct: number) => {
                const pct = Math.max(0, Math.min(100, localPct));
                const overall = Math.min(100, Math.max(floorOverall, Math.round(base + (pct / 100) * slice)));
                const now = Date.now();
                if (overall === lastReported) return;
                if (now - lastFlush < 500 && overall < 100) return;
                lastFlush = now;
                lastReported = overall;
                prisma.fillTask.update({
                  where: { id: task.id },
                  data: { progress: overall, result: { chapter: idx + 1, totalChapters: total, generatedChars: localChars, targetWordCount: chapterTarget } },
                }).catch(() => {});
              };
              // 富化事件 → 分阶段进度映射（85→100），慢模型下进度条持续走动不冻结
              const send: WriteSend = (obj: any) => {
                if (obj && obj.type === "token" && typeof obj.content === "string") {
                  localChars += obj.content.length;
                  report(Math.min(85, (localChars / chapterTarget) * 85)); // 写作阶段 0..85%
                } else if (obj?.type === "chapter_plan" || obj?.type === "babylore_recall") {
                  report(4); // 写前规划/记忆召回：本章已开工
                } else if (obj?.type === "review_start") {
                  report(86);
                } else if (obj?.type === "review_result" || obj?.type === "review_skip") {
                  report(90);
                } else if (obj?.type === "summarize_start") {
                  report(92);
                } else if (obj?.type === "summarize_done" || obj?.type === "summarize_empty" || obj?.type === "summarize_error") {
                  report(97);
                } else if (obj?.type === "logic_check_done" || obj?.type === "logic_check_error") {
                  report(99);
                }
                events.push(obj);
              };
              await runWriteGeneration(
                { projectId, nodeId, authorNote: authorNote || undefined, targetWordCount: chapterTarget },
                // 后台任务不依赖客户端断连信号，用独立 AbortController 占位
                { send, signal: new AbortController().signal },
              );
              report(100); // 本章（含富化）完成，整体进度推进到本章末尾
              totalGeneratedChars += localChars;
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
            data: { status: done > 0 ? "completed" : "failed", progress: 100, result: { done, failed, total: ids.length, generatedChars: totalGeneratedChars } },
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
                    generatedChars: totalGeneratedChars,
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
