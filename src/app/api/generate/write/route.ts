import { jsonError } from "@/lib/api-error";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
import { countTokens } from "@/core/assembly/tokenizer";
import { collectForbiddenPatterns, scanForbiddenWordsEnhanced } from "@/lib/forbidden-checker";
import {
  loadGenerationContext,
  handleNewCharacters,
  filterByConfirmedCards,
  prepareAuthorNote,
  extractLLMConfig,
  buildGenerationContext,
  runPostGenerationPipeline,
} from "@/core/pipeline";
import { buildRecallBlock } from "@/core/babylore/loop";
import { planChapterStoryline, applyChapterPlanToStorylines } from "@/core/pipeline/plan-chapter";
import { applyRegexRules } from "@/core/post-process/regex";
import { STATUS_COMPLETED, STATUS_DRAFTING, STATUS_OUTLINE_ONLY } from "@/core/story-status";

/**
 * POST /api/generate/write
 *
 * 核心生成端点 —— SSE 流式输出小说正文。
 * 管线：数据加载 → 角色预处理 → 规则注入 → 上下文构建 → 流式生成 → 后处理（扫描/审校/摘要）
 */
export async function POST(request: Request) {
  // L2-001：生成写章限流（1 分钟 10 次），业务 LLM 调用前拦截
  if (!rateLimit("generate/write", clientIp(request), 10, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const body = await request.json();
    const {
      projectId,
      nodeId,
      authorNote,
      targetWordCount = 3000,
      confirmedCardIds,
      cardNotes,
      newCharacterRequests,
    } = body;

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    // ── 1. 加载上下文 ──
    const data = await loadGenerationContext(projectId, nodeId);
    if (!data.project || !data.currentNode) {
      return NextResponse.json({ error: "项目或节点不存在" }, { status: 404 });
    }

    // #123 软删防复活：已移入回收站的节点不允许写章，避免覆写已删正文导致「幽灵复活」
    if (data.currentNode.deletedAt) {
      return NextResponse.json({ error: "该节点已被删除（回收站），无法生成正文。如需操作请先从回收站恢复" }, { status: 410 });
    }

    // ── 2. 角色预处理 ──
    const allChars = await handleNewCharacters(
      data.characters as any,
      newCharacterRequests,
      projectId,
      "本章",
    );
    const activeChars = filterByConfirmedCards(allChars as any, confirmedCardIds);

    // ── 3. 作者指令 + 规则注入 ──
    const finalAuthorNote = await prepareAuthorNote(authorNote, cardNotes, allChars as any, projectId);

    // ── 4. LLM 配置 ──
    const { template, customForbidden, effectiveTemperature, effectiveTopP } =
      extractLLMConfig(data);

    // ── 5. 上下文窗口 ──
    const currentNodeIndex = data.allNodes.findIndex((n: any) => n.id === nodeId);
    const keepChapters = data.project?.contextKeepChapters ?? 4;
    const previousNodes = data.allNodes.slice(
      Math.max(0, currentNodeIndex - keepChapters),
      currentNodeIndex,
    );
    // 当前节点是否为最新章节（用于"跳过最近一章"的自动填表判断）
    const isLatestChapter = currentNodeIndex === data.allNodes.length - 1;

    // ── 6. 构建 Prompt 上下文 ──
    const promptContext = buildGenerationContext({
      data,
      activeCharacters: activeChars as any,
      authorNote: finalAuthorNote,
      previousNodes: previousNodes as any,
      pendingCommitments: data.pendingCommitments,
    });

    // ── 7. 撰写指令（rules 已通过 systemPrompt 注入，这里只用原始 authorNote）──
    const cleanAuthorNote = authorNote?.trim();
    let writingInstruction = cleanAuthorNote
      ? `【⚠️ 作者指令——最高优先级，优先于大纲】\n${cleanAuthorNote}\n\n`
      : "";
    writingInstruction += data.currentNode.outline
      ? `【本节大纲】${data.currentNode.outline}`
      : "根据上下文自然推进剧情，撰写本节正文。";
    writingInstruction +=
      "\n\n【格式铁律】绝不在正文首行或任意位置写「第X章」「第X节」或章节标题。章节标题由系统管理，正文直接切入动作/对话。";

    // ── 6.1 章节承接（v1.6.1 修复：用户要求新章必须衔接上一章收尾）──
    // 取 previousNodes 中最后一章（即紧邻的上一章）的收尾片段，显式要求从结尾自然续接，
    // 不凭空重启无关场景。previousNodes 已按 keepChapters 截取最近 N 章，末位即上一章。
    const prevChapter = previousNodes[previousNodes.length - 1];
    if (prevChapter?.content && String(prevChapter.content).trim()) {
      const prevTail = String(prevChapter.content)
        .replace(/\s+/g, " ")
        .trim()
        .slice(-400);
      const prevLabel = prevChapter.title
        ? `「${String(prevChapter.title).trim()}」`
        : `第${prevChapter.order + 1}章`;
      writingInstruction +=
        `\n\n【承接上一章结尾——最高优先级之一】上一章（${prevLabel}）的收尾内容如下：\n……${prevTail}\n` +
        `请务必从上一段结尾处自然接续展开，保持情节、人物状态、时间线的连贯；` +
        `可以顺着同一场景往下写，或合理切换到新场景/新视角，但绝不能凭空重启一个与上文毫无关联的冰冷开头。`;
    }

    // ── 6.5 宝宝流记忆召回（剧情推进 = 记忆召回，与 refine/continue 共享 loop.ts） ──
    const { block: recallBlock, items: recallItems } = await buildRecallBlock({
      projectId,
      recallText: [
        data.currentNode.outline || "",
        cleanAuthorNote || "",
        activeChars.map((c: any) => c.name).join("、"),
        previousNodes.map((n: any) => n.content || n.outline || "").join("\n"),
      ].join("\n"),
      loreEntries: data.loreEntries,
    });
    if (recallBlock) writingInstruction += recallBlock;

    // ── 6.6 生成前剧情预设规划（回忆召回式推进剧情线，用户逻辑 1b）──
    // 在点击生成一章之前，先用 LLM 基于活跃剧情线 + 记忆召回规划本章如何推进剧情线。
    let chapterPlan: { planText: string; plan?: any } | null = null;
    try {
      chapterPlan = await planChapterStoryline({
        projectId,
        chapterOrder: (data.currentNode as any).order,
        outline: data.currentNode.outline || "",
        authorNote: cleanAuthorNote,
        recallBlock,
        storylines: (data.storylines as any[]) || [],
      });
      if (chapterPlan?.planText) writingInstruction += "\n\n" + chapterPlan.planText;
      // 动态回写剧情线（持续修正、不矛盾、不丢历史）
      if (chapterPlan?.plan) {
        await applyChapterPlanToStorylines(projectId, chapterPlan.plan, (data.currentNode as any).order);
      }
    } catch (_) {
      // 规划失败不阻断正文生成（规划是锦上添花，非交付前置）
    }

    // ── 8. 调度器（支持项目级 LLM 覆盖）──
    // L1-005：loadGenerationContext 已加载完整 project（含 llmConfig），直接复用，避免重复 DB 查询
    const projLlm = data.project?.llmConfig;
    const orchestrator = await AgentOrchestrator.fromSettings(
      { defaultTemperature: effectiveTemperature, defaultTopP: effectiveTopP },
      projLlm as unknown as Record<string, unknown> | null,
    );

    // ── 9. SSE 流 ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        // 推送本轮召回的记忆列表（供前端透明展示「剧情推进=记忆召回」）
        if (recallItems.length > 0) {
          send({ type: "babylore_recall", items: recallItems });
        }
        // 推送生成前剧情预设规划（透明展示"回忆召回式推进剧情线"）
        if (chapterPlan?.plan) {
          send({ type: "chapter_plan", plan: chapterPlan.plan });
        }

        try {
          let newContent = "";
          let finishReason: string | undefined; // L5-01：流式截断信号

          // 检查未完成草稿
          const partialDraft =
            data.currentNode.status === STATUS_DRAFTING && data.currentNode.content
              ? data.currentNode.content.replace(/\[PARTIAL_DRAFT\]/g, "").trim()
              : "";

          // Phase 1: 流式生成
          let saveCounter = 0;
          let saving = false;
          let scanBuffer = "";                    // 累积待扫描的新字符
          let lastScanLength = 0;                 // 上次扫描时的总字符数
          const rtPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [],
            customForbidden,
          );
          for await (const chunk of orchestrator.writeSection(
            promptContext,
            partialDraft
              ? `${writingInstruction}\n\n【续写——从以下草稿断点继续，不要重复已有内容】\n已有内容末段：${partialDraft.slice(-200)}\n\n请从断点处自然接续。`
              : writingInstruction,
            targetWordCount,
            undefined,
            undefined,
            effectiveTemperature,
            effectiveTopP,
            request.signal, // L5-04：客户端断连信号透传，断连即中止生成与落盘
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });

              // ── 实时规则检测：每积累 ~200 字符扫描一次 ──
              scanBuffer += chunk.content;
              if (scanBuffer.length >= 200) {
                try {
                  const rtResult = scanForbiddenWordsEnhanced(scanBuffer, {
                    customExactWords: rtPatterns.filter((p: any) => typeof p === "string" ? !p.startsWith("/") : !p.pattern?.startsWith("/")),
                  });
                  if (rtResult.matches.length > 0) {
                    // 调整位置偏移（加上之前已扫描的部分）
                    const adjusted = rtResult.matches
                      .filter((m) => m.severity === "error" || m.severity === "warning")
                      .slice(0, 5);
                    for (const m of adjusted) {
                      send({
                        type: "rule_violation",
                        pattern: m.pattern,
                        severity: m.severity,
                        context: m.context,
                        suggestion: m.suggestion,
                        position: lastScanLength + m.index,
                      });
                    }
                  }
                } catch (_) {
                  // 实时扫描异常静默降级——不打断生成流
                }
                lastScanLength += scanBuffer.length;
                scanBuffer = "";
              }

              // 每 ~300 字保存草稿
              saveCounter += chunk.content.length;
              if (saveCounter >= 300 && !saving) {
                saveCounter = 0;
                saving = true;
                const combined = partialDraft + newContent;
                prisma.storyNode
                  .update({
                    where: { id: nodeId },
                    data: {
                      content: combined + "\n\n[PARTIAL_DRAFT]",
                      status: STATUS_DRAFTING,
                    },
                  })
                  .then(() => { saving = false; })
                  .catch((e) => { saving = false; console.error("草稿保存失败:", e?.message); });
              }
            } else if (chunk.type === "done") {
              // L5-01：流式末尾携带 finish_reason（'length' 表示被 max_tokens 截断）
              if (chunk.finishReason) finishReason = chunk.finishReason;
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          let fullContent = partialDraft + newContent;
          if (partialDraft) {
            send({ type: "resume", content: `从草稿续写 (已有${partialDraft.length}字)` });
          }

          // ── 正则后处理（来自酒馆 regex 预设）──
          const projectRules = data.project?.postProcessingRules;
          if (Array.isArray(projectRules) && projectRules.length > 0) {
            const cleaned = applyRegexRules(fullContent, projectRules);
            if (cleaned !== fullContent) {
              send({ type: "postprocess_regex", content: `正则后处理已应用 ${projectRules.length} 条规则` });
              fullContent = cleaned;
            }
          }

          // ── v0.46.55 容错（前置到管线之前，F1 修复）──
          // 模型偶发空响应时先回滚节点、再报错返回，绝不进入后处理管线。
          // 旧逻辑（守卫在管线之后）会在空正文上跑出孤儿 ChapterSummary / PendingCommitment /
          // 实体，并触发 detect；这些副作用在「管线后回滚」时不会被撤销，污染后续章上下文。
          // 前置拦截后：空响应根本不跑管线，自然无孤儿副作用。
          if (!fullContent || fullContent.trim().length === 0) {
            try {
              await prisma.storyNode.update({
                where: { id: nodeId },
                data: { status: STATUS_OUTLINE_ONLY, content: "" },
              });
            } catch { /* 回滚失败不阻塞报错返回 */ }
            send({
              type: "error",
              content: "生成内容为空（模型未返回正文），请重试或检查 LLM 配置",
            });
            return;
          }

          // ── L5-01：max_tokens 截断保护 ──
          // finish_reason==='length' 表示模型在 max_tokens 处被硬截断（已按 targetWordCount 动态放大预算仍不足）。
          // 此时正文残缺，绝不静默进入后处理/待确认：保留流式阶段已落盘的 partial draft（含 [PARTIAL_DRAFT]），
          // 状态维持 drafting，便于用户下次「继续生成」从断点恢复；并明确告警为「草稿未完成」。
          if (finishReason === "length") {
            const insufficient = fullContent.length < Math.ceil(targetWordCount * 0.6);
            try {
              await prisma.storyNode.update({
                where: { id: nodeId },
                data: { status: STATUS_DRAFTING },
              });
            } catch { /* 回滚状态失败不阻塞告警返回 */ }
            send({
              type: "done",
              content: "",
              nodeId,
              status: STATUS_DRAFTING,
              truncated: true,
              warning: insufficient
                ? "⚠️ 生成被 max_tokens 截断（finish_reason=length）且字数明显不足，已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。"
                : "⚠️ 生成被 max_tokens 截断（finish_reason=length），已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。",
            });
            return;
          }

          // Phase 2-4: 后处理管线（扫描 → 审校 → 摘要）
          const activeCharIds = Array.isArray(data.currentNode.activeCharacters)
            ? (data.currentNode.activeCharacters as string[])
            : [];
          const activeLoreIds = Array.isArray(data.currentNode.activeLoreIds)
            ? (data.currentNode.activeLoreIds as string[])
            : [];

          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [],
            customForbidden,
          );

          // Phase 2-4: 后处理管线（扫描 → 审校 → 摘要）
          // 容错：后处理（含 LLM 审校/摘要）若因限流/超时失败，不阻断正文交付——
          // 直接降级为"仅生成"，仍继续自动填表并发送 done。
          let result: any = { nodeId, status: STATUS_COMPLETED };
          try {
            result = await runPostGenerationPipeline({
              send,
              orchestrator,
              projectId,
              nodeId,
              content: fullContent,
              nodeOutline: data.currentNode.outline || "",
              activeCharacters: activeChars.filter((c: any) => activeCharIds.includes(c.id)) as any,
              activeLore: data.loreEntries.filter((l: any) => activeLoreIds.includes(l.id)) as any,
              chapterSummaries: data.summaries as any,
              currentNode: data.currentNode as any,
              chapterTitle: data.currentNode.title || `第${data.currentNode.order + 1}章`,
              chapterOrder: data.currentNode.order,
              forbiddenPatterns,
            });
          } catch (e) {
            console.error("后处理管线失败（已降级为仅生成）:", e instanceof Error ? e.message : e);
            send({ type: "postprocess_skip", content: e instanceof Error ? e.message : "后处理跳过" });
          }

          // ── 确认流程：自动填表已移至「确认通过」后触发（见 /api/story/nodes/[id] PATCH action=confirm）──
          // 理由：未审视草稿不应污染下游记忆/设定库；填表是 confirm 的副作用，而非 write 的副作用。
          // 生成仅落库（status=completed），待AI 智能体逐章确认后才回填表格。

          // Token 用量
          // done 前重查库态：管线内 auto-confirm 可能已把节点改为 confirmed，快照 status 已过期（Max Loop 审查 P1）
          let finalStatus = result?.status || STATUS_COMPLETED;
          try {
            const freshNode = await prisma.storyNode.findUnique({
              where: { id: result?.nodeId || nodeId },
              select: { status: true },
            });
            if (freshNode?.status) finalStatus = freshNode.status;
          } catch {
            // 重查失败保留快照，不阻塞主流程
          }
          send({
            type: "done",
            content: "",
            nodeId: result?.nodeId || nodeId,
            status: finalStatus,
            usage: {
              completionTokens: countTokens(fullContent),
              totalTokens: countTokens(fullContent),
            },
          });
        } catch (err) {
          // L2-003：SSE 错误路径泛化，不向客户端回显原始 err.message
          console.error("[generate/write] 生成失败:", err);
          send({
            type: "error",
            content: "服务器内部错误，请查看日志",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
