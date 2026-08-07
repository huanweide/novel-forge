/**
 * 后处理管线 —— 禁用词扫描 / 审校 / 摘要 / 存储
 *
 * write 和 continue 路由共享的生成后处理逻辑。
 * refine 路由通过 skipReview + skipSummarize 复用扫描和存储部分。
 */

import { prisma } from "@/lib/prisma";
import { enrichForeshadow } from "@/core/foreshadowing";
import { writeStorylineProgress } from "@/core/pipeline/storyline-writer";
import { scanForbiddenWordsEnhanced, type ForbiddenMatch } from "@/lib/forbidden-checker";
import { runLocalDistillation } from "@/lib/distillation-runner";
import { autoCreateEntities } from "@/lib/entity-auto-creator";
import { classifyAndConvert } from "@/lib/memory-classifier";
import { analyzeQuality } from "@/lib/quality-analyzer";
import { STATUS_DRAFTING } from "@/core/story-status";
import type { KnownEntity, EntityType } from "@/lib/entity-detector";
import type { AgentOrchestrator } from "@/core/agents";
import type { ReviewLog } from "@/core/types";
import type { PostPipelineParams, PostPipelineResult } from "./types";
import { snapshotRevision } from "@/lib/versions";
import { evaluateConfirmEligibility, applyConfirm, triggerForeshadowDetect } from "@/core/confirm-guard";

/**
 * 运行完整的生成后处理管线。
 *
 * 管线步骤：
 *   1. 禁用词扫描 → SSE send
 *   2. 审校（可选）→ SSE send
 *   3. 保存到 storyNode
 *   4. 摘要 + 存入 chapterSummary & storyBeat（可选）→ SSE send
 *
 * 所有步骤的 SSE 事件通过 params.send 回调推送给前端。
 */
export async function runPostGenerationPipeline(
  params: PostPipelineParams,
): Promise<PostPipelineResult> {
  const {
    send,
    orchestrator,
    projectId,
    nodeId,
    content,
    nodeOutline,
    activeCharacters,
    activeLore,
    chapterSummaries,
    currentNode,
    chapterTitle,
    chapterOrder,
    forbiddenPatterns,
    skipReview = false,
    skipSummarize = false,
  } = params;

  // ── 1. 废词扫描（v3.0 五类检测，始终运行——内置50+规则）──
  let scanMatches: ForbiddenMatch[] = [];
  send({ type: "forbidden_scan_start", content: "" });
  try {
    const scanResult = scanForbiddenWordsEnhanced(content, {
      customExactWords: forbiddenPatterns.filter((p: any) => typeof p === "string" ? !p.startsWith("/") : !p.pattern?.startsWith("/")),
    });
    scanMatches = scanResult.matches;  // 缓存供后续步骤复用
    if (!scanResult.passed || scanResult.matches.length > 0) {
      send({
        type: "forbidden_scan_v3",
        content: scanResult.summary,
        passed: scanResult.passed,
        qualityScore: scanResult.qualityScore,
        fuzzyDensity: scanResult.fuzzyDensity,
        bySeverity: scanResult.bySeverity,
        byCategory: scanResult.byCategory,
        matches: scanResult.matches.slice(0, 20),
        totalMatches: scanResult.matches.length,
      });
    } else {
      send({ type: "forbidden_scan_v3", content: "✅ 废词检测全部通过", passed: true, qualityScore: 100, matches: [], totalMatches: 0 });
    }
  } catch (scanErr) {
    send({ type: "forbidden_scan_error", content: `废词扫描跳过：${String(scanErr).slice(0, 100)}` });
  }

  // ── 1.5 六维质量自动评分（纯本地算法，零Token消耗）──
  let qualityReport: { overallScore: number; grade: string; dimensions: any[]; summary: string } | null = null;
  send({ type: "quality_score_start", content: "" });
  try {
    const characterNames = activeCharacters.map((c: any) => c.name);
    const qr = analyzeQuality(content, characterNames, { forbiddenMatches: scanMatches });
    qualityReport = {
      overallScore: qr.overallScore,
      grade: qr.grade,
      dimensions: qr.dimensions.map((d) => ({
        name: d.name,
        key: d.key,
        score: d.score,
        issues: d.issues.slice(0, 3),
      })),
      summary: qr.summary,
    };
    send({
      type: "quality_score",
      content: qr.summary,
      overallScore: qr.overallScore,
      grade: qr.grade,
      dimensions: qualityReport.dimensions,
      passed: qr.passed,
    });
  } catch (qaErr) {
    send({ type: "quality_score_error", content: `质量评分跳过：${String(qaErr).slice(0, 100)}` });
  }

  // ── 2. 审校 ──
  let reviewLog: ReviewLog | undefined;

  if (!skipReview) {
    send({ type: "review_start", content: "" });

    try {
      const previousContext = chapterSummaries.map((s: any) => ({
        chapterTitle: s.chapterTitle,
        summary: s.summary,
        keyEvents: s.keyEvents || [],
        characterStates:
          typeof s.characterStates === "string"
            ? s.characterStates
            : (s.characterStates as any)?.raw ||
              JSON.stringify(s.characterStates || {}),
      }));

      reviewLog = await orchestrator.reviewContent(
        content,
        nodeOutline,
        activeCharacters as any,
        activeLore as any,
        previousContext,
      );

      // 发送审校结果
      for (const issue of reviewLog.issues) {
        send({
          type: "review_issue",
          content: issue.description,
          severity: issue.severity,
          location: issue.location,
          suggestion: issue.suggestion,
        });
      }

      send({
        type: "review_result",
        content: reviewLog.passed ? "审校通过" : "审校未通过，请查看问题列表",
        passed: reviewLog.passed,
        issues: reviewLog.issues,
      });
    } catch (reviewErr) {
      // 审校失败降级——不阻塞主流程，标记为跳过
      send({
        type: "review_skip",
        content: `审校跳过：${String(reviewErr).slice(0, 100)}`,
      });
      reviewLog = undefined;
    }
  }

  // ── 3. 保存到 storyNode ──
  // BE-1：写前快照——把被覆盖的上一版正文存入版本历史（AI 写/重写/润色/自动填表均经此单点）
  const prevContent = (currentNode as any)?.content;
  const prevWordCount = (currentNode as any)?.wordCount;
  if (prevContent && String(prevContent).trim()) {
    await snapshotRevision({
      nodeId,
      projectId,
      source: prevWordCount ? "ai-rewrite" : "ai-write",
      prevContent: String(prevContent),
      prevWordCount,
    });
  }

  const existingReviewLogs = (currentNode as any).reviewLogs || [];
  const reviewLogEntry = reviewLog
    ? {
        id: crypto.randomUUID(),
        nodeId,
        // 统一 ReviewLog 结构（Max Loop Round4·P6）：审校条目补 action/at 键，与确认/提交/打回/诊断日志同构
        action: "review" as const,
        at: new Date().toISOString(),
        timestamp: new Date().toISOString(),
        passed: reviewLog.passed,
        issues: reviewLog.issues,
        summary: reviewLog.summary,
        suggestion: reviewLog.suggestion,
      }
    : null;

  // v1.6.1 章节命名：章名不再由「正文首段前 20 字」兜底（用户指出该逻辑错误）。
  // 改为在下方「4. 摘要」环节用 LLM 对整章的 summary 作为章节名，前缀标注第几章。
  // 此处不写 title，保留节点原有标题（占位「第N章」或用户自定义），待摘要生成后回填。

  const updatedNode = await prisma.storyNode.update({
    where: { id: nodeId },
    data: {
      content,
      wordCount: content.length,
      // 确认流程（spec v1 §二/§五）：生成后仅落 drafting，不污染下游、不预置"接受"。
      // 后处理审校（六维质量）结果仍写入 reviewLogs / qualityScore 供「AI诊断」展示，
      // 但节点状态由人类（AI 智能体）在确认栏拍板，绝不由自动审校闸门决定。
      status: STATUS_DRAFTING,
      qualityScore: qualityReport?.overallScore ?? null,
      ...(reviewLogEntry
        ? {
            reviewLogs: [
              ...(Array.isArray(existingReviewLogs) ? existingReviewLogs : []),
              reviewLogEntry,
            ],
          }
        : {}),
      revisionCount: ((currentNode as any).revisionCount || 0) + 1,
    },
  });

  // ── 3.1 Round3：智能审阅（Auto-Confirm）──
  // 项目开启智能审阅时，生成完若质量达标直接自动确认（含自动填表），
  // 人类从审批者降级为异常处理者。best-effort：失败降级为 drafting，不阻塞落库。
  try {
    const proj = await prisma.project.findUnique({
      where: { id: projectId },
      select: { autoConfirmEnabled: true },
    });
    if (proj?.autoConfirmEnabled) {
      const el = evaluateConfirmEligibility(
        { content, qualityScore: qualityReport?.overallScore ?? null },
        [],
        true,
      );
      if (el.eligible) {
        // R2-007：后处理中 applyConfirm 早于本章摘要生成（摘要在步骤 4 才落库），
        // 故先 skipDetect，待摘要写完后（见步骤 4.5 末尾）再统一触发 detect，避免漏看本章。
        await applyConfirm({
          id: nodeId,
          projectId,
          content,
          order: (currentNode as any)?.order ?? 0,
          skipDetect: true,
        });
        send({ type: "auto_confirm", content: "智能审阅：质量达标，已自动确认" });
      }
    }
  } catch (acErr) {
    console.error("[auto-confirm] 跳过，保持 drafting：", acErr);
  }

  // ── 3.5 本地蒸馏（增强模式——在 LLM summarize 前运行，零 Token 消耗）──
  send({ type: "distill_local_start", content: "" });

  try {
    // 构建已知实体词典（角色名 + 世界书条目）
    const knownEntities: KnownEntity[] = [
      ...activeCharacters.map((c: any) => ({
        name: c.name,
        type: "character" as EntityType,
        aliases: (c as any).aliases || [],
      })),
      ...activeLore.map((l: any) => ({
        name: l.title,
        type: (
          l.category === "geography" ? "location" :
          l.category === "item" ? "material" :
          "technique"
        ) as EntityType,
        aliases: [],
      })),
    ];

    // 加载已有伏笔（未兑现/未废弃的）
    const rawForeshadows = await prisma.pendingCommitment.findMany({
      where: {
        projectId,
        status: { notIn: ["voided", "fulfilled"] },
      },
      select: { id: true, description: true, entityIds: true },
    });
    const existingForeshadows = rawForeshadows.map((f) => ({
      id: f.id,
      description: f.description,
      entityIds: (f.entityIds as string[]) || [],
    }));

    const distillResult = runLocalDistillation({
      content,
      projectId,
      chapterOrder,
      chapterTitle,
      knownCharacters: activeCharacters.map((c: any) => ({
        id: c.id,
        name: c.name,
        currentRealm: (c as any).currentRealm,
        currentLocation: (c as any).currentLocation,
      })),
      knownEntities,
      knownLocations: activeLore
        .filter((l: any) => l.category === "geography")
        .map((l: any) => l.title),
      existingForeshadows,
    });

    // SSE 推送本地蒸馏结果给前端
    send({
      type: "distill_local_done",
      stats: distillResult.stats,
      stateChanges: distillResult.stateChanges.slice(0, 20),
      foreshadowEvents: distillResult.foreshadowEvents.slice(0, 10),
      consistencyIssues: distillResult.consistencyIssues,
      newEntities: distillResult.entities.entities
        .filter((e) => !e.isKnown && e.confidence >= 0.7)
        .slice(0, 15),
    });

    // ── 3.6 伏笔自动处理：蒸馏发现的伏笔事件 → 创建/更新 PendingCommitment ──
    const foreshadowEvents = distillResult.foreshadowEvents;
    if (foreshadowEvents.length > 0) {
      const createdCommitments: string[] = [];
      const updatedCommitments: string[] = [];
      // 去重：同一信号词只处理一次（取置信度最高的）
      const seenSignals = new Set<string>();

      for (const fe of foreshadowEvents) {
        const dedupKey = `${fe.type}:${fe.signalWord}`;
        if (seenSignals.has(dedupKey)) continue;
        seenSignals.add(dedupKey);

        try {
          if (fe.type === "buried" && fe.confidence >= 0.6) {
            // 创建新伏笔
            const created = await prisma.pendingCommitment.create({
              data: {
                projectId,
                source: "foreshadow",
                sourceNodeId: nodeId,
                priority: "medium",
                description: fe.description,
                entityIds: fe.relatedEntityNames,
                closureConditions: [],
                status: "detected",
                detectedAt: new Date(),
                fulfillmentRatio: 0,
                statusHistory: [{
                  from: "pending",
                  to: "detected",
                  trigger: "local_distillation",
                  chapterId: nodeId,
                  timestamp: new Date().toISOString(),
                  details: `本地蒸馏检测到伏笔埋设信号："${fe.signalWord}"`,
                }],
              },
            });
            createdCommitments.push(created.id);
            // 异步生成伏笔后续发展思路（不阻塞主流程，失败静默）
            enrichForeshadow(projectId, created.id).catch(() => {});
          } else if (fe.type === "recovered" && fe.matchedForeshadowId) {
            // 回收已有伏笔
            const existing = await prisma.pendingCommitment.findUnique({ where: { id: fe.matchedForeshadowId } });
            if (existing && existing.status !== "fulfilled" && existing.status !== "voided") {
              const history = (existing.statusHistory as any[]) || [];
              await prisma.pendingCommitment.update({
                where: { id: fe.matchedForeshadowId },
                data: {
                  status: "fulfilled",
                  fulfillmentRatio: 1.0,
                  fulfilledChapterId: nodeId,
                  fulfilledContentSnippet: fe.description,
                  fulfilledAt: new Date(),
                  statusHistory: [...history, {
                    from: existing.status,
                    to: "fulfilled",
                    trigger: "local_distillation",
                    chapterId: nodeId,
                    timestamp: new Date().toISOString(),
                    details: `本地蒸馏检测到伏笔回收信号："${fe.signalWord}"`,
                  }],
                },
              });
              updatedCommitments.push(fe.matchedForeshadowId);
            }
          } else if (fe.type === "deepened" && fe.matchedForeshadowId) {
            // 深化已有伏笔
            const existing = await prisma.pendingCommitment.findUnique({ where: { id: fe.matchedForeshadowId } });
            if (existing && existing.status !== "fulfilled" && existing.status !== "voided") {
              const history = (existing.statusHistory as any[]) || [];
              const partialIds = (existing.partiallyFulfilledIds as string[]) || [];
              await prisma.pendingCommitment.update({
                where: { id: fe.matchedForeshadowId },
                data: {
                  status: "partially_fulfilled",
                  partiallyFulfilledIds: [...partialIds, nodeId],
                  statusHistory: [...history, {
                    from: existing.status,
                    to: "partially_fulfilled",
                    trigger: "local_distillation",
                    chapterId: nodeId,
                    timestamp: new Date().toISOString(),
                    details: `本地蒸馏检测到伏笔深化信号："${fe.signalWord}"`,
                  }],
                },
              });
              updatedCommitments.push(fe.matchedForeshadowId);
            }
          }
        } catch (commitErr) {
          // 单个伏笔处理失败不阻塞整体流程
          send({
            type: "foreshadow_update_error",
            content: `伏笔处理失败：${String(commitErr).slice(0, 100)}`,
          });
        }
      }

      // SSE 推送伏笔更新汇总
      if (createdCommitments.length > 0 || updatedCommitments.length > 0) {
        send({
          type: "foreshadow_update",
          content: `伏笔状态更新：新增 ${createdCommitments.length} 个，更新 ${updatedCommitments.length} 个`,
          created: createdCommitments,
          updated: updatedCommitments,
        });
      }
    }

    // ── 3.7 数据反哺：新实体自动入库 ──
    const newEntities = distillResult.entities.entities
      .filter((e) => !e.isKnown && e.confidence >= 0.7);
    if (newEntities.length > 0) {
      send({ type: "entity_auto_create_start", content: `发现 ${newEntities.length} 个新实体，正在自动创建...` });
      try {
        const autoResult = await autoCreateEntities(newEntities, projectId, nodeId);
        if (autoResult.created.length > 0) {
          send({
            type: "entity_auto_created",
            content: `自动创建了 ${autoResult.created.length} 个实体`,
            created: autoResult.created,
          });
        }
        if (autoResult.skipped.length > 0) {
          send({
            type: "entity_auto_skip",
            content: `${autoResult.skipped.length} 个实体因重复跳过：${autoResult.skipped.join("、")}`,
          });
        }
      } catch (entityErr) {
        // 实体创建失败降级——不阻塞主流程
        send({
          type: "entity_auto_create_error",
          content: `实体自动创建失败：${String(entityErr).slice(0, 100)}`,
        });
      }
    }
  } catch (distillErr) {
    // 本地蒸馏失败降级——不阻塞主流程，LLM summarize 继续运行
    send({
      type: "distill_local_error",
      content: `本地蒸馏跳过：${String(distillErr).slice(0, 100)}`,
    });
  }

  // ── 3.8 待兑现事项自动检测 ──
  // 扫描正文中的"下次""之后""回头""等下次"等关键词，
  // 自动创建 PendingItem（source="distillation"）。
  try {
    const futureIntentPatterns = [
      /下次.{0,10}(?:去|到|让|把|要|做|找|给|跟)/g,
      /回头.{0,10}(?:去|到|让|把|要|做|找|给|跟)/g,
      /等.{0,5}(?:下次|以后|之后).{0,10}(?:再|去|就)/g,
      /以后.{0,10}(?:再|去|要|让)/g,
    ];
    const detectedIntents: string[] = [];
    for (const pat of futureIntentPatterns) {
      let m: RegExpExecArray | null;
      while ((m = pat.exec(content)) !== null) {
        const ctx = content.slice(Math.max(0, m.index - 15), Math.min(content.length, m.index + 40));
        if (!detectedIntents.some((d) => d.includes(ctx))) {
          detectedIntents.push(ctx.trim());
        }
      }
    }

    if (detectedIntents.length > 0) {
      for (const intent of detectedIntents.slice(0, 3)) { // 最多自动创建 3 个
        await prisma.pendingItem.create({
          data: {
            projectId,
            itemType: "user_note",
            content: `[自动检测] 正文暗示了待办意图：${intent}`,
            priority: "low",
            source: "distillation",
            sourceNodeId: nodeId,
            deadlineChapter: chapterOrder != null ? chapterOrder + 3 : null,
          },
        });
      }
      if (detectedIntents.length > 0) {
        send({
          type: "pending_items_detected",
          content: `检测到 ${detectedIntents.length} 个待兑现意图，已自动记录`,
          count: detectedIntents.length,
        });
      }
    }
  } catch (_) {
    // 待办检测失败静默降级
  }

  // ── 4. 摘要（LLM —— 保留用于生成人类可读摘要文本）──
  if (!skipSummarize) {
    send({ type: "summarize_start", content: "" });

    try {
      // v1.6.2 修复：摘要环节偶发空返回（沙箱 LLM 网关抖动）会让命名因 titleBase 空而跳过，
      // 章节停在占位「第N章」。此处加重试兜底：为空/异常最多重试 3 次，拿到非空 summary 才继续；
      // 连败则保留空 summary（命名段安全跳过，绝不写垃圾标题）。
      let summary = "";
      let keyEvents: any[] = [];
      let characterStates = "";
      let closingSnapshot = "";
      let characterImpulses = "";
      let threadProgress: any[] = [];
      let unresolvedQuestions: any[] = [];
      let impactScore = 0;
      let eventImportances: any[] = [];
      let summarized = false;
      for (let attempt = 1; attempt <= 3 && !summarized; attempt++) {
        try {
          const r = await orchestrator.summarizeChapter(
            content,
            chapterTitle,
            activeCharacters as any,
            chapterOrder,
            chapterSummaries.length,
          );
          if (r && r.summary && String(r.summary).trim().length > 0) {
            summary = r.summary;
            keyEvents = (r.keyEvents as any[]) || [];
            characterStates = (r.characterStates as any) || "";
            closingSnapshot = (r.closingSnapshot as any) || "";
            characterImpulses = (r.characterImpulses as any) || "";
            threadProgress = (r.threadProgress as any[]) || [];
            unresolvedQuestions = (r.unresolvedQuestions as any[]) || [];
            impactScore = (r.impactScore as number) || 0;
            eventImportances = (r.eventImportances as any) || [];
            summarized = true;
          } else if (attempt < 3) {
            send({ type: "summarize_retry", content: `摘要为空，第 ${attempt} 次重试` });
          }
        } catch (se) {
          if (attempt < 3) {
            send({ type: "summarize_retry", content: `摘要异常，第 ${attempt} 次重试` });
          } else {
            throw se;
          }
        }
      }

      // 存入 ChapterSummary（含四级事件分层）
      // F8 修复：摘要最多 3 次重试仍连败（summarized=false / summary 为空）时，跳过空壳摘要写入，
      // 避免「chapterId=该节点、summary:""」的空壳进入后续章上下文（context-loader 的 order<=currentOrder 过滤）
      // 与 classifyAndConvert 流程。连败时仅回报事件、不落库；下游命名/分类因 latestSummary 为空已自守卫。
      if (summarized && String(summary).trim().length > 0) {
      await prisma.chapterSummary.create({
        data: {
          projectId,
          chapterId: nodeId,
          chapterTitle,
          summary,
          keyEvents,
          characterStates: {
            raw: characterStates,
            closingSnapshot,
            impulses: characterImpulses,
          } as any,
          eventImportances: eventImportances as any,
        },
      });
      } else {
        send({ type: "summarize_empty", content: "摘要连续生成失败，跳过空摘要写入（不污染后续章上下文）" });
      }

      // v1.4.0：故事线进度回写（threadProgress 之前被丢弃；现在写入 Storyline 七要素 + chapterBindings，只记大事）
      // 同样仅在摘要成功时回写（连败则 threadProgress 为空，无有意义进度可记）。
      if (summarized && String(summary).trim().length > 0) {
      try {
        await writeStorylineProgress(projectId, nodeId, chapterOrder, threadProgress);
      } catch { /* 回写失败不影响主流程 */ }
      }

      // 存入 StoryBeat（长期记忆索引）
      if (keyEvents.length > 0) {
        let description = keyEvents.join("；");
        if (unresolvedQuestions && unresolvedQuestions.length > 0) {
          description += `\n【悬念】${unresolvedQuestions.join("；")}`;
        }
        await prisma.storyBeat.create({
          data: {
            projectId,
            nodeId,
            description,
            chapterNumber: chapterOrder + 1,
            impact: impactScore >= 7 ? "major" : "minor",
          },
        });
      }

      send({ type: "summarize_done", summary, keyEvents });

      // ── 4.1 章节命名（v1.6.1 修复：用户要求章名由 LLM 对整章总结生成，并标注第几章）──
      // 取 summary 首行作为章节名，前缀「第N章：」，仅当标题为空或仍为「第N章」占位时才回填，
      // 绝不覆盖用户已自定义的真实标题。
      try {
        const cleanSummary = String(summary || "")
          .split("\n")
          .map((s) => s.trim())
          .filter((s) => s.length > 0)[0] || "";
        // v1.6.2 修复：summary 可能自带「第N章」前缀（正文首行本身即章节标题时，
        // 摘要会原样摘到「第一章 · 龙髓石」），此处先剥离，避免拼接出「第N章：第N章：xxx」重复标题。
        let titleBase = cleanSummary.slice(0, 40).trim().replace(/^第\s*\d+\s*章[\s:：·]*/, "");
        const curTitle = String((currentNode as any)?.title || "").trim();
        const isPlaceholder = !curTitle || /^第\s*\d+\s*章$/.test(curTitle);
        // 守卫：仅当正文非空时才回填标题。正文为空（模型偶发空返回）时摘要 LLM 会对空内容胡说，
        // 此时不该写标题，保留占位，交由上层错误流程处理。
        if (content && content.trim().length > 0 && isPlaceholder && titleBase) {
          const newTitle = `第${chapterOrder + 1}章：${titleBase}`;
          await prisma.storyNode.update({
            where: { id: nodeId },
            data: { title: newTitle },
          });
          // 同步刚创建的 ChapterSummary.chapterTitle，避免上下文摘要里仍是占位标题
          const latestSummary = await prisma.chapterSummary.findFirst({
            where: { projectId, chapterId: nodeId },
            orderBy: { createdAt: "desc" },
          });
          if (latestSummary) {
            await prisma.chapterSummary.update({
              where: { id: latestSummary.id },
              data: { chapterTitle: newTitle },
            });
          }
        }
      } catch (titleErr) {
        // 命名失败降级——不阻塞主流程
        send({ type: "title_error", content: String(titleErr).slice(0, 100) });
      }

      // ── 4.5 规则分类——基于规则的 S/A/B 分级（零 Token 消耗，补充 LLM 分级）──
      try {
        const allSummaries = await prisma.chapterSummary.findMany({
          where: { projectId },
          orderBy: { createdAt: "asc" },
        });
        const allBeats = await prisma.storyBeat.findMany({
          where: { projectId },
        });
        const allCommitments = await prisma.pendingCommitment.findMany({
          where: { projectId },
        });
        const allCharacters = await prisma.characterCard.findMany({
          where: { projectId },
        });

        const classified = classifyAndConvert(
          allSummaries as any,
          allBeats as any,
          allCommitments as any,
          allCharacters as any,
          chapterOrder + 1,
        );

        // 合并：LLM 的 eventImportances 做底，规则分类的 S/A 级事件补充进去
        const llmImportances = (eventImportances || { sTier: [], aTier: [], bTier: [], cTier: [] }) as any;
        const merged = {
          sTier: [...(llmImportances.sTier || []), ...classified.sTier].slice(0, 10),
          aTier: [...(llmImportances.aTier || []), ...classified.aTier].slice(0, 20),
          bTier: [...(llmImportances.bTier || []), ...classified.bTier].slice(0, 30),
          cTier: (llmImportances.cTier || []).slice(0, 50),
        };

        // 更新刚创建的 ChapterSummary
        const latestSummary = await prisma.chapterSummary.findFirst({
          where: { projectId, chapterId: nodeId },
          orderBy: { createdAt: "desc" },
        });
        if (latestSummary) {
          await prisma.chapterSummary.update({
            where: { id: latestSummary.id },
            data: { eventImportances: merged as any },
          });
        }

        send({
          type: "classify_done",
          content: `规则分类完成：S级${classified.sTier.length}条 A级${classified.aTier.length}条 B级${classified.bTier.length}条`,
          stats: { sTier: classified.sTier.length, aTier: classified.aTier.length, bTier: classified.bTier.length },
        });
      } catch (classifyErr) {
        // 规则分类失败降级——不阻塞主流程
        send({
          type: "classify_error",
          content: `规则分类跳过：${String(classifyErr).slice(0, 100)}`,
        });
      }

      // R2-007：本章摘要已落库，补触发伏笔收束率检测（applyConfirm 入参 skipDetect=true 时已跳过）。
      // 复用共享 helper（含失败日志 + 轻量重试 + 超时保护）；本轮确认（auto-confirm）只触发一次，无重复。
      // nodeId 为死参数已移除（detect 按 projectId 全量重算）。
      void triggerForeshadowDetect({ projectId });
    } catch (summaryErr) {
      // 摘要失败不阻塞主流程
      send({
        type: "summarize_error",
        content: String(summaryErr).slice(0, 100),
      });
    }
  }

  // ── 5. 逻辑自查（零Token，基于DB状态做规则比较）──
  send({ type: "logic_check_start", content: "" });
  try {
    const logicIssues: Array<{ type: string; severity: string; description: string; evidence?: string }> = [];

    // 5.1 角色死活一致性
    const deadChars = await prisma.characterCard.findMany({
      where: { projectId, currentStatus: "dead" },
      select: { name: true, aliases: true },
    });
    for (const c of deadChars) {
      const names = [c.name, ...(c.aliases || [])];
      for (const name of names) {
        if (content.includes(name)) {
          const revivalPatterns = ["复活", "重生", "苏醒", "活了过来", "竟然活着", "没死", "还活着"];
          const hasRevival = revivalPatterns.some((p) => content.includes(p));
          if (!hasRevival) {
            logicIssues.push({
              type: "dead_character_appears",
              severity: "error",
              description: `角色「${c.name}」在前文已标记为死亡，但本章出场且无复活描写`,
              evidence: `角色状态：dead`,
            });
          }
        }
      }
    }

    // 5.2 时间线连续
    if (nodeId) {
      const currentNodeOrder = await prisma.storyNode.findUnique({
        where: { id: nodeId },
        select: { order: true },
      });
      if (currentNodeOrder) {
        const prevNode = await prisma.storyNode.findFirst({
          where: { projectId, type: "chapter", order: { lt: currentNodeOrder.order } },
          orderBy: { order: "desc" },
          select: { title: true, content: true },
        });
        if (prevNode?.content) {
          const timeMarkers = /第([一二三四五六七八九十百千\d]+)[天日月年]/g;
          const currTimes = [...content.matchAll(timeMarkers)].map((m) => m[0]);
          const prevTimes = [...prevNode.content.matchAll(timeMarkers)].map((m) => m[0]);
          if (currTimes.length > 0 && prevTimes.length > 0) {
            const toNum = (s: string): number => {
              const m = s.match(/\d+/);
              if (m) return parseInt(m[0]);
              const map: Record<string, number> = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9, "十": 10 };
              for (const [k, v] of Object.entries(map)) if (s.includes(k)) return v;
              return 0;
            };
            const prevMax = Math.max(...prevTimes.map(toNum), 0);
            const currMin = Math.min(...currTimes.map(toNum), Infinity);
            if (currMin < prevMax && currMin !== Infinity && prevMax !== 0) {
              logicIssues.push({
                type: "timeline_regression",
                severity: "warning",
                description: `时间线疑似倒退：前章"${prevTimes[prevTimes.map(toNum).indexOf(prevMax)]}"，本章"${currTimes[currTimes.map(toNum).indexOf(currMin)]}"`,
              });
            }
          }
        }
      }
    }

    // 5.3 关系突变检测
    const relEntries = await prisma.lorebookEntry.findMany({
      where: { projectId, category: "character_relationship" },
      select: { title: true, content: true },
      take: 20,
    });
    for (const entry of relEntries) {
      const ec = entry.content || "";
      const hostileWords = ["背叛", "反目", "决裂", "敌对", "翻脸", "兵刃相向"];
      const foundHostile = hostileWords.filter((w) => content.includes(w));
      if (foundHostile.length > 0 && ec.includes("盟友") && !ec.includes("决裂")) {
        const hasTransition = content.includes("原来") || content.includes("终于暴露") || content.includes("早就不对劲");
        if (!hasTransition) {
          logicIssues.push({
            type: "relationship_sudden_change",
            severity: "warning",
            description: `关系突变：${entry.title}，前文为盟友关系，本章出现"${foundHostile[0]}"等敌对行为`,
            evidence: ec.slice(0, 100),
          });
        }
      }
    }

    const errCount = logicIssues.filter((i) => i.severity === "error").length;
    const warnCount = logicIssues.filter((i) => i.severity === "warning").length;
    const infoCount = logicIssues.filter((i) => i.severity === "info").length;

    send({
      type: "logic_check_done",
      content: logicIssues.length > 0 ? `❌${errCount} ⚠️${warnCount} ℹ️${infoCount}` : "✅ 逻辑自查通过",
      passed: errCount === 0,
      issues: logicIssues,
    });
  } catch (logicErr) {
    send({ type: "logic_check_error", content: `逻辑自查跳过：${String(logicErr).slice(0, 100)}` });
  }

  return {
    nodeId: updatedNode.id,
    status: updatedNode.status,
    reviewLog,
  };
}
