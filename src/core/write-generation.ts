/**
 * 正文生成核心逻辑（与 HTTP / SSE 层解耦）。
 *
 * 原 /api/generate/write 路由的业务逻辑整体抽离到此：
 *  - 路由层（route.ts）仅负责限流、参数解析、构造 SSE ReadableStream，
 *    在 stream 的 start 里把 controller.enqueue 封装成 `send` 并透传 request.signal 后调用本函数。
 *  - batch-write 可直接 import 调用本函数，把事件收集进数组来判定 done/truncated/error，
 *    彻底移除 "fetch(${ORIGIN}/api/generate/write)" 的 HTTP 自回环。
 *
 * v2.0.8：#313 重构。
 */
import { prisma } from "@/lib/prisma";
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
  formatStorylines,
  loadStorylinesWithEvents,
  formatDigest,
  formatStage,
  injectContextBlocks,
} from "@/core/pipeline";
import type { StoryNode } from "@/core/types";
import { buildRecallBlock } from "@/core/babylore/loop";
import { planChapterStoryline, applyChapterPlanToStorylines } from "@/core/pipeline/plan-chapter";
import { applyRegexRules } from "@/core/post-process/regex";
import { STATUS_COMPLETED, STATUS_DRAFTING, STATUS_OUTLINE_ONLY } from "@/core/story-status";
import { classifyTruncation } from "@/core/finish-reason";
import { sseError } from "@/lib/sse-error";

export type WriteSend = (obj: object) => void;

export interface WriteInput {
  projectId: string;
  nodeId: string;
  authorNote?: string;
  targetWordCount?: number;
  confirmedCardIds?: string[];
  cardNotes?: Record<string, string>;
  newCharacterRequests?: string[];
  storylineId?: string;
  diffuseCompleted?: boolean;
}

/** 抽离层向前置校验失败（非生成期错误）传达业务边界，便于路由映射。 */
export class WriteError extends Error {
  constructor(
    public code: "notFound" | "recycled",
    message: string,
  ) {
    super(message);
    this.name = "WriteError";
  }
}

export async function runWriteGeneration(
  input: WriteInput,
  deps: { send: WriteSend; signal: AbortSignal },
): Promise<void> {
  const { send, signal } = deps;
  const {
    projectId,
    nodeId,
    authorNote,
    targetWordCount = 3000,
    confirmedCardIds,
    cardNotes,
    newCharacterRequests,
    storylineId,
    diffuseCompleted,
  } = input;

  // ── 1. 加载上下文 ──
  const data = await loadGenerationContext(projectId, nodeId);
  if (!data.project || !data.currentNode) {
    throw new WriteError("notFound", "项目或节点不存在");
  }

  // #123 软删防复活：已移入回收站的节点不允许写章，避免覆写已删正文导致「幽灵复活」
  if (data.currentNode.deletedAt) {
    throw new WriteError("recycled", "该节点已被删除（回收站），无法生成正文。如需操作请先从回收站恢复");
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
  const { template, customForbidden, effectiveTemperature, effectiveTopP } = extractLLMConfig(data);

  // ── 5. 上下文窗口 ──
  const currentNodeIndex = data.allNodes.findIndex((n: StoryNode) => n.id === nodeId);
  const keepChapters = data.project?.contextKeepChapters ?? 4;
  const previousNodes = data.allNodes.slice(
    Math.max(0, currentNodeIndex - keepChapters),
    currentNodeIndex,
  );
  // 当前节点是否为最新章节（用于"跳过最近一章"的自动填表判断）
  const isLatestChapter = currentNodeIndex === data.allNodes.length - 1;

  // ── 6. 构建 Prompt 上下文 ──
  const promptContext = await buildGenerationContext({
    data,
    activeCharacters: activeChars as any,
    authorNote: finalAuthorNote,
    previousNodes,
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

  // #204：故事线「据此续写」——把主线/支线上下文注入写作指令
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
      previousNodes.map((n: StoryNode) => n.content || n.outline || "").join("\n"),
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
      chapterOrder: data.currentNode.order,
      outline: data.currentNode.outline || "",
      authorNote: cleanAuthorNote,
      recallBlock,
      storylines: (data.storylines as any[]) || [],
    });
    if (chapterPlan?.planText) writingInstruction += "\n\n" + chapterPlan.planText;
    // 动态回写剧情线（持续修正、不矛盾、不丢历史）
    if (chapterPlan?.plan) {
      await applyChapterPlanToStorylines(projectId, chapterPlan.plan, data.currentNode.order);
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

  // ── 9. 流式生成（原 SSE start 回调体，去掉 controller 依赖）──
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
    let scanBuffer = ""; // 累积待扫描的新字符
    let lastScanLength = 0; // 上次扫描时的总字符数
    const rtPatterns = collectForbiddenPatterns(template?.forbiddenPatterns || [], customForbidden);
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
      signal, // L5-04：客户端断连信号透传，断连即中止生成与落盘
    )) {
      if (chunk.type === "token") {
        newContent += chunk.content;
        send({ type: "token", content: chunk.content });

        // ── 实时规则检测：每积累 ~200 字符扫描一次 ──
        scanBuffer += chunk.content;
        if (scanBuffer.length >= 200) {
          try {
            const rtResult = scanForbiddenWordsEnhanced(scanBuffer, {
              customExactWords: rtPatterns.filter((p: any) =>
                typeof p === "string" ? !p.startsWith("/") : !p.pattern?.startsWith("/"),
              ),
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

        // 每 ~300 字保存草稿（F3 修复：改 await 同步落库，杜绝 fire-and-forget 与后处理落库竞态导致
        // [PARTIAL_DRAFT] 标记泄漏进已定稿正文；流末尾最后一次写必先于后处理管线落库，无需重入锁）
        saveCounter += chunk.content.length;
        if (saveCounter >= 300) {
          saveCounter = 0;
          const combined = partialDraft + newContent;
          try {
            await prisma.storyNode.update({
              where: { id: nodeId },
              data: {
                content: combined + "\n\n[PARTIAL_DRAFT]",
                status: STATUS_DRAFTING,
              },
            });
          } catch (e) {
            console.error("草稿保存失败:", e instanceof Error ? e.message : String(e));
          }
        }
      } else if (chunk.type === "done") {
        // L5-01：流式末尾携带 finish_reason（'length' 表示被 max_tokens 截断）
        if (chunk.finishReason) finishReason = chunk.finishReason;
      } else if (chunk.type === "error") {
        send(sseError(chunk.content));
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
      } catch {
        /* 回滚失败不阻塞报错返回 */
      }
      send({
        type: "error",
        content: "生成内容为空（模型未返回正文），请重试或检查 LLM 配置",
      });
      return;
    }

    // ── L5-01：max_tokens 截断保护（F1 修复：判定抽到 classifyTruncation 单一真相，write/continue 共用语义与文案）──
    // finish_reason==='length' 表示模型在 max_tokens 处被硬截断（已按 targetWordCount 动态放大预算仍不足）。
    // 此时正文残缺，绝不静默进入后处理/待确认：保留流式阶段已落盘的 partial draft（含 [PARTIAL_DRAFT]），
    // 状态维持 drafting，便于用户下次「继续生成」从断点恢复；并明确告警为「草稿未完成」。
    const truncation = classifyTruncation(finishReason, fullContent.length, targetWordCount);
    if (truncation.truncated) {
      try {
        await prisma.storyNode.update({
          where: { id: nodeId },
          data: { status: STATUS_DRAFTING },
        });
      } catch {
        /* 回滚状态失败不阻塞告警返回 */
      }
      send({
        type: "done",
        content: "",
        nodeId,
        status: STATUS_DRAFTING,
        truncated: true,
        warning: truncation.warning,
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

    const forbiddenPatterns = collectForbiddenPatterns(template?.forbiddenPatterns || [], customForbidden);

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
        currentNode: data.currentNode,
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
    // L2-003：SSE 错误路径泛化，不向客户端回显原始 err.message；用 sseError 收敛为可读错误事件
    console.error("[generate/write] 生成失败:", err);
    send(sseError(err));
  }
}
