import { jsonError } from "@/lib/api-error";
import { sseError } from "@/lib/sse-error";
import { requireFields } from "@/lib/api-body";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
import { applyRegexRules } from "@/core/post-process/regex";
import { countTokens } from "@/core/assembly/tokenizer";
import { collectForbiddenPatterns } from "@/lib/forbidden-checker";
import { getTemplate } from "@/core/templates";
import {
  loadGenerationContext,
  handleNewCharacters,
  filterByConfirmedCards,
  prepareAuthorNote,
  buildGenerationContext,
  runPostGenerationPipeline,
  formatStorylines,
  loadStorylinesWithEvents,
  formatDigest,
  formatStage,
  injectContextBlocks,
} from "@/core/pipeline";
import { buildRecallBlock } from "@/core/babylore/loop";
import { classifyTruncation } from "@/core/finish-reason";
import { STATUS_OUTLINE_ONLY } from "@/core/story-status";
import { toAppStoryNode } from "@/core/story-node-bridge";
import { NODE_TYPE } from "@/core/node-type";

/**
 * POST /api/generate/continue
 *
 * 一键续写 —— 自动创建下一节节点并流式生成。
 * 管线：创建新节点 → 数据加载 → 角色预处理 → 上下文构建 → 流式生成 → 完整后处理
 */
export async function POST(request: Request) {
  // L2-001：生成续写限流（1 分钟 10 次），业务 LLM 调用前拦截
  if (!rateLimit("generate/continue", clientIp(request), 10, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const {
      projectId, currentNodeId, styleTemplateId, authorNote, autoOutline = true,
      confirmedCardIds, cardNotes, newCharacterRequests, storylineId, diffuseCompleted,
    } = await request.json();
    const reqCheck = requireFields({ projectId, currentNodeId }, ["projectId", "currentNodeId"]);
    if (!reqCheck.ok) return reqCheck.response;

    // ── 加载上下文（复用 loadGenerationContext，与 write/refine 一致）──
    const genData = await loadGenerationContext(projectId, currentNodeId, 5);
    const { project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard, pendingCommitments } = genData;

    if (!project || !currentNode) {
      return NextResponse.json({ error: "项目或节点不存在" }, { status: 404 });
    }

    // #123 软删防复活：已移入回收站的节点不允许续写，避免覆写已删正文导致「幽灵复活」
    if (currentNode.deletedAt) {
      return NextResponse.json({ error: "该节点已被删除（回收站），无法续写。如需操作请先从回收站恢复" }, { status: 410 });
    }

    let nextTitle = "";
    if (currentNode.title) {
      const match = currentNode.title.match(/^(.+?)(\d+)$/);
      nextTitle = match ? `${match[1]}${parseInt(match[2]) + 1}` : `${currentNode.title}（续）`;
    } else {
      nextTitle = `第${(allNodes as any[]).length + 1}节`;
    }

    let nextOutline = "";
    if (autoOutline && currentNode.content) {
      nextOutline = "基于前文剧情自然推进，续写下一节。保持节奏和风格一致。";
    }

    // ── L5-03：清理本 project 因中断/503 遗留的「尾部 drafting 孤儿节点」──
    // 仅针对尾部节点（order === 当前最大 order）且 content 含 [PARTIAL_DRAFT]，
    // 避免每次 continue 失败都新建节点导致残缺节点堆积污染章节树；
    // 同时不误删用户正在撰写的中部草稿（其中部节点 order 较小，不会被命中）。
    try {
      const orderAgg = await prisma.storyNode.aggregate({ where: { projectId, deletedAt: null }, _max: { order: true } });
      const maxOrder = orderAgg._max.order ?? 0;
      await prisma.storyNode.deleteMany({
        where: { projectId, order: maxOrder, status: "drafting", content: { contains: "[PARTIAL_DRAFT]" } },
      });
    } catch { /* 清理失败不阻塞新建 */ }

    // ── 创建下一节节点 ──
    // R3 修复（复检 NEW-3 / 任务 NEW-1 章号不递增）：order 必须严格递增且不重复。
    // 旧逻辑用「兄弟数组下标 + 1」当全局 order，在嵌套/分卷结构下会与既有节点撞号，
    // 导致续写章 order 倒挂或重复，破坏「order 即序列位次」不变量与 isLatestChapter 判定。
    // 改为基于数据库当前最大 order + 1。
    // F5 修复（Round-7 · 并发 TOCTOU 加固）：把「聚合 max → +1 → 插入」放进一个 DB 事务，
    // 事务内先对当前 Project 行加 `FOR UPDATE` 行锁，使同一 projectId 的并发 continue 请求串行化——
    // 后到的请求在获得锁后会重新读到前者已提交的 max(order)，从而得到 +1 后的新值，
    // 杜绝并发下两条节点拿到相同 order（schema 尚未加 (projectId, order) 唯一约束前，软件层兜底）。
    const nextNode = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const orderAgg = await tx.storyNode.aggregate({
        where: { projectId },
        _max: { order: true },
      });
      const nextOrder = (orderAgg._max.order ?? 0) + 1;
      return await tx.storyNode.create({
        data: {
          projectId, parentId: currentNode.parentId,
          type: currentNode.type || NODE_TYPE.SECTION,
          title: nextTitle, order: nextOrder, status: "drafting",
          outline: nextOutline || null,
          activeCharacters: currentNode.activeCharacters,
          activeLoreIds: currentNode.activeLoreIds,
          notes: null,
        },
      });
    });

    // ── 角色预处理 ──
    const allChars = await handleNewCharacters(characters as any, newCharacterRequests, projectId, "续写");
    const activeChars = filterByConfirmedCards(allChars as any, confirmedCardIds);

    // ── 作者指令 ──
    const finalAuthorNote = await prepareAuthorNote(authorNote || "", cardNotes, allChars as any, projectId);

    // ── LLM 配置 ──
    const llmConfig = ((project.llmConfig || {}) as unknown as Record<string, unknown>);
    const effectiveStyleId = styleTemplateId || (llmConfig.styleTemplateId as string) || "";
    const template = effectiveStyleId ? getTemplate(effectiveStyleId) : undefined;
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const temperature = template?.temperature ?? 0.85;
    const topP = template?.topP ?? 0.95;

    // ── 上下文窗口 ──
    const previousNodes = (allNodes as any[])
      .filter((n: any) => n.order <= currentNode.order && n.content)
      .slice(-5);

    // ── 组装 GenerationData 供管线函数使用 ──
    const data = {
      project: project as any,
      currentNode: toAppStoryNode(nextNode),
      allNodes: allNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      summaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
      // v1.8.24：复用 loadGenerationContext 已算好的全书节奏阶段（防抢跑指令）
      narrativeStage: genData.narrativeStage,
    };

    // ── Prompt 上下文 ──
    const promptContext = await buildGenerationContext({
      data,
      activeCharacters: activeChars as any,
      authorNote: finalAuthorNote || undefined as any,
      previousNodes: previousNodes as any,
      pendingCommitments: pendingCommitments as any[],
    });

    // ── 撰写指令 ──
    const lastContent = currentNode.content || "";
    const lastParagraphs = lastContent.split("\n").slice(-6).join("\n");
    const targetWords = template?.targetWordsPerSection || 1000;

    const cardNotesText = cardNotes && typeof cardNotes === "object"
      ? Object.entries(cardNotes as Record<string, string>)
          .filter(([, n]) => n.trim())
          .map(([id, n]) => { const c = allChars.find((x: any) => x.id === id); return c ? `[${c.name}] ${n}` : ""; })
          .filter(Boolean).join("\n")
      : "";

    let writingInstruction = `${cardNotesText ? "\n【用户角色备注——最高优先级】\n" + cardNotesText + "\n" : ""}请接着上文继续撰写下一节。

【上文末段——从这里衔接】
${lastParagraphs}

【本节标题】${nextTitle}
【本节大纲】${nextOutline || "基于前文剧情自然推进"}

注意：与上文无缝衔接，保持叙事视角一致。`;

    // #204：故事线「据此续写」——把主线/支线上下文注入续写指令
    const storylineCtx = await loadStorylinesWithEvents(projectId);
    if (storylineCtx.length > 0) {
      const formatted = formatStorylines(storylineCtx, {
        targetStorylineId: storylineId,
        diffuseCompleted: !!diffuseCompleted,
      });
      if (formatted) {
        writingInstruction +=
          "\n\n【剧情线上下文——本章必须呼应以下故事线，核心推进线为最高优先级】\n" + formatted;
      }
    }

    // v1.8.23 + v1.8.24：长期记忆摘要 + 全书节奏阶段（防抢跑指令）统一注入尾部
    const digestBlock = formatDigest(data.project as any);
    const stageBlock = formatStage(data.narrativeStage);
    writingInstruction = injectContextBlocks(writingInstruction, [digestBlock, stageBlock]);

    // ── 宝宝流记忆召回（与 write 路由共享闭环逻辑） ──
    const { block: contRecallBlock, items: contRecallItems } = await buildRecallBlock({
      projectId,
      recallText: [
        lastParagraphs,
        nextTitle,
        nextOutline || "",
        activeChars.map((c: any) => c.name).join("、"),
      ].join("\n"),
      loreEntries: data.loreEntries,
    });
    if (contRecallBlock) writingInstruction += contRecallBlock;

    // ── 调度器（支持项目级 LLM 覆盖）──
    const projRec = await prisma.project.findUnique({ where: { id: projectId }, select: { llmConfig: true, postProcessingRules: true } });
    const projLlm = projRec?.llmConfig;
    const projectRules = projRec?.postProcessingRules;
    const orchestrator = await AgentOrchestrator.fromSettings(
      { defaultTemperature: temperature, defaultTopP: topP },
      projLlm as Record<string, unknown> | null,
    );

    // ── SSE 流 ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          let fullContent = "";
          let finishReason: string | undefined; // F1 修复：捕获流式末尾 finish_reason（'length' = 被 max_tokens 截断）

          if (contRecallItems.length > 0) {
            send({ type: "babylore_recall", items: contRecallItems });
          }

          // Phase 1: 流式生成
          let saveCounter = 0;
          for await (const chunk of orchestrator.writeSection(
            promptContext, writingInstruction, targetWords,
            undefined, undefined, temperature, topP,
            request.signal, // L5-04：客户端断连信号透传
          )) {
            if (chunk.type === "token") {
              fullContent += chunk.content;
              send({ type: "token", content: chunk.content });

              saveCounter += chunk.content.length;
              // F3 修复：草稿保存改 await 同步落库，杜绝 fire-and-forget 与后处理落库竞态导致 [PARTIAL_DRAFT] 泄漏
              if (saveCounter >= 300) {
                saveCounter = 0;
                const draft = fullContent;
                try {
                  await prisma.storyNode.update({
                    where: { id: nextNode.id },
                    data: { content: draft + "\n\n[PARTIAL_DRAFT]", status: "drafting" },
                  });
                } catch (e) {
                  console.error("草稿保存失败:", e instanceof Error ? e.message : String(e));
                }
              }
            } else if (chunk.type === "done") {
              // F1 修复：捕获流式末尾 finish_reason（'length' = 被 max_tokens 截断），与 write 路径一致
              if (chunk.finishReason) finishReason = chunk.finishReason;
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          // ── 空响应守卫（F5 修复 / 与 write 路由一致：模型返回空正文 → 回滚为 OUTLINE_ONLY，不标记 completed 空章）──
          // 放在后处理管线之前：空响应根本不跑管线，自然无孤儿 ChapterSummary 等副作用，
          // 下游导出也不会出现「（此节暂无内容）」的已完成空章。
          if (!fullContent || fullContent.trim().length === 0) {
            try {
              await prisma.storyNode.update({
                where: { id: nextNode.id },
                data: { status: STATUS_OUTLINE_ONLY, content: "" },
              });
            } catch { /* 回滚失败不阻塞报错返回 */ }
            send({ type: "error", content: "续写内容为空（模型未返回正文），已回滚该节点，未生成空章。请重试或检查 LLM 配置" });
            controller.close();
            return;
          }

          // ── 正则后处理（U1：与 write 统一消费 postProcessingRules）──
          if (Array.isArray(projectRules) && projectRules.length > 0) {
            const cleaned = applyRegexRules(fullContent, projectRules);
            if (cleaned !== fullContent) {
              send({ type: "postprocess_regex", content: `正则后处理已应用 ${projectRules.length} 条规则` });
              fullContent = cleaned;
            }
          }

          // ── L5-01：max_tokens 截断保护（F1 修复：与 write 路径共用 classifyTruncation 单一真相）──
          // finish_reason==='length' 表示模型被 max_tokens 硬截断，正文残缺，绝不静默进入后处理/确认门；
          // 保留已落盘 partial draft，状态维持 drafting，明确告警为「草稿未完成」，待用户「继续生成」补全。
          {
            const truncation = classifyTruncation(finishReason, fullContent.length, targetWords);
            if (truncation.truncated) {
              try {
                await prisma.storyNode.update({
                  where: { id: nextNode.id },
                  data: { status: "drafting" },
                });
              } catch {
                /* 回滚状态失败不阻塞告警返回 */
              }
              send({
                type: "done", content: "",
                nodeId: nextNode.id, title: nextTitle, order: nextNode.order,
                status: "drafting",
                truncated: true,
                warning: truncation.warning,
                nextAction: `「${nextTitle}」被截断为草稿，点击「继续生成」可从此处补全`,
              });
              controller.close();
              return;
            }
          }

          // Phase 2-4: 后处理管线
          const activeCharIds = Array.isArray(nextNode.activeCharacters)
            ? (nextNode.activeCharacters as string[]) : [];
          const activeLoreIds = Array.isArray(nextNode.activeLoreIds)
            ? (nextNode.activeLoreIds as string[]) : [];

          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [], customForbidden,
          );

          let result: any = { nodeId: nextNode.id, status: "completed" };
          try {
            result = await runPostGenerationPipeline({
              send, orchestrator, projectId,
              nodeId: nextNode.id,
              content: fullContent,
              nodeOutline: nextOutline || "",
              activeCharacters: activeChars.filter((c: any) => activeCharIds.includes(c.id)) as any,
              activeLore: (loreEntries as any[]).filter((l: any) => activeLoreIds.includes(l.id)) as any,
              chapterSummaries: summaries as any,
              currentNode: toAppStoryNode(nextNode),
              chapterTitle: nextTitle,
              chapterOrder: nextNode.order,
              forbiddenPatterns,
            });
          } catch (e) {
            console.error("续写后处理失败（已降级为仅生成）:", e instanceof Error ? e.message : e);
            send({ type: "postprocess_skip", content: e instanceof Error ? e.message : "后处理跳过" });
          }

          // F2 修复：续写不再无条件自动填表。填表唯一发生在「确认门」（手动 confirm 或后处理管线内的 auto-confirm
          // → applyConfirm → safeFillAfterWriting），与 write 路径完全一致，杜绝未审视草稿污染下游记忆/设定库，
          // 并消除 autoConfirm 时与 applyConfirm 的双重填表触发。
          send({
            type: "done", content: "",
            nodeId: result?.nodeId || nextNode.id, title: nextTitle, order: nextNode.order,
            status: result?.status || "completed",
            nextAction: `已自动创建并完成「${nextTitle}」，请确认后回填记忆库`,
          });
        } catch (err) {
          // L5-03 + L5-04：SSE 中断/客户端断连（request.signal 中止）或网关异常时，
          // 删除本次新建的 drafting 孤儿节点，避免残缺节点堆积污染章节树与导出。
          if (request.signal?.aborted) {
            try {
              await prisma.storyNode.deleteMany({
                where: { id: nextNode.id, status: "drafting" },
              });
            } catch { /* 删除失败不阻塞报错返回 */ }
          }
          // L2-003：SSE 错误路径泛化，不向客户端回显原始 err.message；用 sseError 收敛为可读错误事件
          console.error("[generate/continue] 续写失败:", err);
          send(sseError(err));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return jsonError(err);
  }
}
