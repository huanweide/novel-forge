/**
 * POST /api/generate/refine
 *
 * 微调/续写 —— 基于已有内容按用户指令修改或补长。
 * 管线：数据加载 → 角色预处理 → 规则注入 → 上下文构建 → 流式生成 → 扫描+存储
 */
export const maxDuration = 300;
import { jsonError } from "@/lib/api-error";
import { rateLimit, clientIp, rateLimitResponse } from "@/lib/rate-limit";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
import { applyRegexRules } from "@/core/post-process/regex";
import { countTokens } from "@/core/assembly/tokenizer";
import { collectForbiddenPatterns } from "@/lib/forbidden-checker";
import {
  loadGenerationContext,
  handleNewCharacters,
  filterByConfirmedCards,
  prepareAuthorNote,
  extractLLMConfig,
  buildGenerationContext,
  runPostGenerationPipeline,
} from "@/core/pipeline";
import { buildRecallBlock, safeFillAfterWriting } from "@/core/babylore/loop";
import { triggerForeshadowDetect } from "@/core/confirm-guard";

export async function POST(request: Request) {
  // L2-001：生成微调限流（1 分钟 10 次），业务 LLM 调用前拦截
  if (!rateLimit("generate/refine", clientIp(request), 10, 60000).ok) {
    return rateLimitResponse();
  }
  try {
    const {
      projectId, nodeId, instruction, targetWords = 500,
      confirmedCardIds, cardNotes, newCharacterRequests, authorNote,
    } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    // ── 1. 加载上下文 ──
    const data = await loadGenerationContext(projectId, nodeId);
    if (!data.project || !data.currentNode) {
      return NextResponse.json({ error: "项目或节点不存在" }, { status: 404 });
    }

    // #123 软删防复活：已移入回收站的节点不允许精修，避免覆写已删正文导致「幽灵复活」
    if (data.currentNode.deletedAt) {
      return NextResponse.json({ error: "该节点已被删除（回收站），无法精修。如需操作请先从回收站恢复" }, { status: 410 });
    }

    // ── 2. 角色预处理 ──
    const allChars = await handleNewCharacters(data.characters as any, newCharacterRequests, projectId, "微调");
    const activeChars = filterByConfirmedCards(allChars as any, confirmedCardIds);

    // ── 3. 作者指令 ──
    const effectiveAuthorNote = authorNote || (data.project as any).authorNote || "";
    const finalAuthorNote = await prepareAuthorNote(effectiveAuthorNote, cardNotes, allChars as any, projectId);

    // ── 4. LLM 配置 ──
    const { template, customForbidden, effectiveTemperature, effectiveTopP } = extractLLMConfig(data);

    // ── 5. 上下文窗口 ──
    const currentNodeIndex = data.allNodes.findIndex((n: any) => n.id === nodeId);
    const previousNodes = data.allNodes.slice(Math.max(0, currentNodeIndex - 4), currentNodeIndex);

    // ── 6. Prompt 上下文 ──
    const promptContext = buildGenerationContext({
      data,
      activeCharacters: activeChars as any,
      authorNote: finalAuthorNote,
      previousNodes: previousNodes as any,
      pendingCommitments: data.pendingCommitments,
    });

    // ── 7. 微调指令（路由特有逻辑）──
    const existingContent = data.currentNode.content || "";
    const hasContent = existingContent.trim().length > 0;

    // #124：输出预算上限（cap）。已有正文 + 目标续写字数 超过上限时，模型无法完整重输出前文，
    // 会触发 L5-06 静默丢内容或 L5-02 截断。此处显式检测，向前端发 notice + done 标记，杜绝「静默截断」。
    const BUDGET_CEILING = 5000;
    const requestedBudget = existingContent.length + targetWords;
    const budgetCapped = requestedBudget > BUDGET_CEILING;
    const refineInstruction = instruction && instruction.trim().length > 0
      ? instruction.trim()
      : "请在现有正文基础上自然续写，保持文风一致，推进剧情。";
    const isTargetedFix = hasContent && refineInstruction.includes("精准修复");

    const cardNotesText = cardNotes
      ? Object.entries(cardNotes as Record<string, string>)
          .filter(([, n]) => n.trim())
          .map(([id, n]) => { const c = allChars.find((x: any) => x.id === id); return c ? `[${c.name}] ${n}` : ""; })
          .filter(Boolean).join("\n")
      : "";

    let writingInstruction = hasContent
      ? `${cardNotesText ? "\n【用户角色备注——最高优先级】\n" + cardNotesText : ""}【${isTargetedFix ? "精准修复" : "微调"}任务——在以下已有正文上进行${isTargetedFix ? "定点修改" : "修改/续写"}，不要从头重写】

已有正文（共${existingContent.length}字）：
---
${existingContent.slice(-3000)}${existingContent.length > 3000 ? "\n\n…(前文省略)…" : ""}
---

用户指令：${refineInstruction}

${isTargetedFix ? `【精准修复铁律——违反即不合格】
1. 你是外科医生，不是重写作家。只动刀，不换人。
2. 找到问题位置的那几句话——只改那几句。其余文字、标点、换行、段落结构一个字都不许动。
3. 如果问题位置引用的原文和你的修改之间不矛盾——优先保留原文。
4. 输出的全文必须和原文99%相同——只有问题位置不同。
5. 禁止顺手润色、禁止调段落、禁止改标点风格。
6. 输出完整修改后全文——用原文+局部替换的方式，不要只输出修改片段。` : `【铁律】你的输出必须完整包含已有正文的全部内容（一字不落），仅在末尾追加续写或在指定处局部修改；严禁浓缩、删减、重写已有正文。
操作指南：
- 如果是修改指令（如"改对话""加描写"）：只修改指定部分，其他保留不变。输出完整修改后的版本。
- 如果是续写指令（如"继续写""补500字"）：从已有正文断点处无缝衔接续写。输出已有正文+续写内容。
- 如果是混合指令：先按修改要求调整，再从断点续写到目标字数。
- 绝对不要改变已有正文中没要求修改的部分。
- 保持文风、人称、节奏一致。
- 续写字数约${targetWords}字。`}`
      : `${cardNotesText ? "\n【用户角色备注——最高优先级】\n" + cardNotesText : ""}此章节暂无正文。请按以下指令从零撰写：${refineInstruction}\n\n目标字数：约${targetWords}字。`;

    // ── 7.5 宝宝流记忆召回（与 write 路由共享闭环逻辑） ──
    const { block: refineRecallBlock, items: refineRecallItems } = await buildRecallBlock({
      projectId,
      recallText: [
        refineInstruction,
        (data.currentNode.content || "").slice(-1500),
        activeChars.map((c: any) => c.name).join("、"),
      ].join("\n"),
      loreEntries: data.loreEntries,
    });
    if (refineRecallBlock) writingInstruction += refineRecallBlock;

    // ── 8. 调度器（支持项目级 LLM 覆盖）──
    // L1-005：loadGenerationContext 已加载完整 project（含 llmConfig / postProcessingRules），直接复用，避免重复 DB 查询
    const projLlm = (data.project as any)?.llmConfig;
    const projectRules = (data.project as any)?.postProcessingRules;
    const orchestrator = await AgentOrchestrator.fromSettings(
      { defaultTemperature: effectiveTemperature, defaultTopP: effectiveTopP },
      projLlm as Record<string, unknown> | null,
    );

    // ── 9. SSE 流 ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          let newContent = "";
          let finishReason: string | undefined; // L5-01：流式截断信号

          if (refineRecallItems.length > 0) {
            send({ type: "babylore_recall", items: refineRecallItems });
          }

          // L5-01 修复(Round9)：refine 需重输出「已有正文+增量」，目标输出字数=已有正文长+增量，
          // 据此放大 max_tokens 预算（resolveMaxTokens 按 targetWordCount*1.6），避免整章重输出在已有正文处被截断。
          // cap 5000 字（≈8000 token）防止超模型 max_tokens 硬上限。
          // #124：超上限时先发 notice，前端明确告警（建议「分段精修」或「提高预算上限」），不再静默截断。
          if (budgetCapped) {
            send({
              type: "notice",
              kind: "budget_capped",
              ceiling: BUDGET_CEILING,
              existingLen: existingContent.length,
              requested: requestedBudget,
              mode: hasContent ? "refine" : "write",
            });
          }
          for await (const chunk of orchestrator.writeSection(
            promptContext, writingInstruction,
            hasContent ? Math.min(existingContent.length + targetWords, BUDGET_CEILING) : targetWords,
            undefined, undefined, effectiveTemperature, effectiveTopP,
            request.signal, // L5-04：客户端断连信号透传
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });
            } else if (chunk.type === "done") {
              // L5-01：流式末尾携带 finish_reason
              if (chunk.finishReason) finishReason = chunk.finishReason;
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          // ── 正则后处理（U1：与 write 统一消费 postProcessingRules）──
          if (Array.isArray(projectRules) && projectRules.length > 0) {
            const cleaned = applyRegexRules(newContent, projectRules);
            if (cleaned !== newContent) {
              send({ type: "postprocess_regex", content: `正则后处理已应用 ${projectRules.length} 条规则` });
              newContent = cleaned;
            }
          }

          // ── F3 修复：空响应守卫（对齐 write 路由）──
          // refine 在空响应（模型未返回正文）时若进入管线，step 3 会以空串覆盖 content，
          // 把已有章节正文清空，且 done 仍回报 status:"completed"。此处前置拦截：保留原正文、
          // 不跑管线、回报 error，避免线上节点被清空（原正文可经版本快照找回，但线上态不应被污染）。
          if (!newContent || newContent.trim().length === 0) {
            send({
              type: "error",
              content: "微调内容为空（模型未返回正文），已保留原章节正文，请重试或检查 LLM 配置",
            });
            return;
          }

          // ── L5-02：微调截断保护 ──
          // finish_reason==='length' 表示新正文被 max_tokens 截断。不覆盖线上节点为残片：
          // 跳过管线（post-processor 在覆盖前已 snapshotRevision 存了上一版完整正文，可经版本历史恢复），
          // 保留原完整正文，明确告警「草稿未完成」，用户重试即可恢复。
          if (finishReason === "length") {
            send({
              type: "done",
              content: "",
              nodeId,
              status: data.currentNode.status,
              mode: hasContent ? "refine" : "write",
              wordCount: (data.currentNode.content || "").length,
              truncated: true,
              warning: "⚠️ 微调被 max_tokens 截断（finish_reason=length），已保留原章节正文，未用残片覆盖，请重试。",
            });
            return;
          }

          // ── L5-06：微调完整性保护（防模型静默丢前文）──
          // 模型偶发把「续写/修改」误解为「重写精简版」，输出显著短于原正文，导致静默丢内容。
          // 当新输出 < 原正文 90% 且指令非主动缩写时，判定为未完成重输出，降级保留原正文 + 告警，
          // 类比 L5-02，避免线上节点被缩短版覆盖。
          const isShrinkIntent = /(缩写|精简|压缩|缩短|删减|提炼)/.test(refineInstruction);
          if (hasContent && !isShrinkIntent && newContent.length < existingContent.length * 0.9) {
            send({
              type: "done", content: "", nodeId,
              status: data.currentNode.status, mode: "refine",
              wordCount: existingContent.length, truncated: true,
              warning: "⚠️ 微调输出比原正文过短（可能未完整重输出前文），已保留原章节正文，请重试或调整指令。",
            });
            return;
          }

          // 后处理管线（仅扫描+存储，跳过审校和摘要）
          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [], customForbidden,
          );

          let result: any = { nodeId, status: "completed" };
          try {
            result = await runPostGenerationPipeline({
              send, orchestrator, projectId, nodeId,
              content: newContent,
              nodeOutline: data.currentNode.outline || "",
              activeCharacters: activeChars as any,
              activeLore: [] as any,
              chapterSummaries: data.summaries as any,
              currentNode: data.currentNode as any,
              chapterTitle: data.currentNode.title || "",
              chapterOrder: data.currentNode.order,
              forbiddenPatterns,
              skipReview: true,
              skipSummarize: true,
            });
          } catch (e) {
            console.error("微调后处理失败（已降级为仅生成）:", e instanceof Error ? e.message : e);
            send({ type: "postprocess_skip", content: e instanceof Error ? e.message : "后处理跳过" });
          }

          // R2-007 收口（新坑2）：refine 路径后处理内 applyConfirm 传 skipDetect:true，
          // 且 skipSummarize:true 使 4.5 的 detect 补触发被整体跳过，故此处显式兜底触发 detect。
          // detect 为幂等全量重算，refine 新埋/新收的伏笔可借此回写收束率（覆盖本地蒸馏在
          // step 3.6 新创建的 pendingCommitment）。失败不阻塞微调主流程。
          try {
            const origin = new URL(request.url).origin;
            void triggerForeshadowDetect({ projectId, origin });
          } catch {
            /* detect 触发失败不影响微调主流程 */
          }

          // 宝宝流自动填表（正文 → 填表，闭合写作闭环）
          // M1（墨白 Round12）：透传 data.currentNode.order/nodeId，使写入行 _src 形如 ch{n}:batchmanual（章节段非空），与 write 路径一致。
          // IMP-002 扩充：补算 isLatestChapter 使 skipLatestChapter 在 refine 路径生效（与 confirm/batch 算法一致）。
          // R2-003：补传 source:"refine"，闭合填表溯源单链路（写章报告 F-07）；此前漏传 source 导致 _src 缺溯源段、与 confirm/manual/auto-confirm/batch 四入口不一致。
          let refineIsLatest = false;
          try {
            const agg = await prisma.storyNode.aggregate({ where: { projectId, deletedAt: null }, _max: { order: true } });
            refineIsLatest = data.currentNode.order === (agg._max.order ?? data.currentNode.order);
          } catch { /* 聚合失败按非最新，保守填表 */ }
          const babylore = await safeFillAfterWriting({
            projectId,
            content: newContent,
            send,
            nodeOrder: data.currentNode.order,
            isLatestChapter: refineIsLatest,
            nodeId,
            source: "refine",
            projectLlmConfig: projLlm as Record<string, unknown> | null,
          });

          const tokenCount = countTokens(newContent);
          send({
            type: "done", content: "", nodeId: result?.nodeId || nodeId, status: result?.status || "completed",
            mode: hasContent ? "refine" : "write", wordCount: newContent.length,
            usage: { completionTokens: tokenCount, totalTokens: tokenCount },
            babylore,
            // #124：透传预算上限信息，供前端判断是否需要提示用户
            budgetCapped, budgetCeiling: BUDGET_CEILING, existingLen: existingContent.length, newLen: newContent.length,
          });
        } catch (err) {
          // L2-003：SSE 错误路径泛化，不向客户端回显原始 err.message
          console.error("[generate/refine] 微调失败:", err);
          send({ type: "error", content: "服务器内部错误，请查看日志" });
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
