import { jsonError } from "@/lib/api-error";
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
} from "@/core/pipeline";
import { buildRecallBlock, safeFillAfterWriting } from "@/core/babylore/loop";

/**
 * POST /api/generate/continue
 *
 * 一键续写 —— 自动创建下一节节点并流式生成。
 * 管线：创建新节点 → 数据加载 → 角色预处理 → 上下文构建 → 流式生成 → 完整后处理
 */
export async function POST(request: Request) {
  try {
    const {
      projectId, currentNodeId, styleTemplateId, authorNote, autoOutline = true,
      confirmedCardIds, cardNotes, newCharacterRequests,
    } = await request.json();

    if (!projectId || !currentNodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 currentNodeId" }, { status: 400 });
    }

    // ── 加载上下文（复用 loadGenerationContext，与 write/refine 一致）──
    const genData = await loadGenerationContext(projectId, currentNodeId, 5);
    const { project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard, pendingCommitments } = genData;

    if (!project || !currentNode) {
      return NextResponse.json({ error: "项目或节点不存在" }, { status: 404 });
    }

    // ── 创建下一节节点 ──
    const siblings = (allNodes as any[]).filter((n: any) => n.parentId === (currentNode as any).parentId);
    const currentIndex = siblings.findIndex((n: any) => n.id === currentNodeId);
    const nextOrder = currentIndex >= 0 ? currentIndex + 1 : siblings.length;

    let nextTitle = "";
    if ((currentNode as any).title) {
      const match = (currentNode as any).title.match(/^(.+?)(\d+)$/);
      nextTitle = match ? `${match[1]}${parseInt(match[2]) + 1}` : `${(currentNode as any).title}（续）`;
    } else {
      nextTitle = `第${(allNodes as any[]).length + 1}节`;
    }

    let nextOutline = "";
    if (autoOutline && (currentNode as any).content) {
      nextOutline = "基于前文剧情自然推进，续写下一节。保持节奏和风格一致。";
    }

    const nextNode = await prisma.storyNode.create({
      data: {
        projectId, parentId: (currentNode as any).parentId,
        type: (currentNode as any).type || "section",
        title: nextTitle, order: nextOrder, status: "drafting",
        outline: nextOutline || null,
        activeCharacters: (currentNode as any).activeCharacters,
        activeLoreIds: (currentNode as any).activeLoreIds,
        notes: null,
      },
    });

    // ── 角色预处理 ──
    const allChars = await handleNewCharacters(characters as any, newCharacterRequests, projectId, "续写");
    const activeChars = filterByConfirmedCards(allChars as any, confirmedCardIds);

    // ── 作者指令 ──
    const finalAuthorNote = await prepareAuthorNote(authorNote || "", cardNotes, allChars as any, projectId);

    // ── LLM 配置 ──
    const llmConfig = ((project as any).llmConfig || {}) as Record<string, unknown>;
    const effectiveStyleId = styleTemplateId || (llmConfig.styleTemplateId as string) || "";
    const template = effectiveStyleId ? getTemplate(effectiveStyleId) : undefined;
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const temperature = template?.temperature ?? 0.85;
    const topP = template?.topP ?? 0.95;

    // ── 上下文窗口 ──
    const previousNodes = (allNodes as any[])
      .filter((n: any) => n.order <= (currentNode as any).order && n.content)
      .slice(-5);

    // ── 组装 GenerationData 供管线函数使用 ──
    const data = {
      project: project as any,
      currentNode: nextNode as any,
      allNodes: allNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      summaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
    };

    // ── Prompt 上下文 ──
    const promptContext = buildGenerationContext({
      data,
      activeCharacters: activeChars as any,
      authorNote: finalAuthorNote || undefined as any,
      previousNodes: previousNodes as any,
      pendingCommitments: pendingCommitments as any[],
    });

    // ── 撰写指令 ──
    const lastContent = (currentNode as any).content || "";
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

          if (contRecallItems.length > 0) {
            send({ type: "babylore_recall", items: contRecallItems });
          }

          // Phase 1: 流式生成
          let saveCounter = 0;
          let saving = false;
          for await (const chunk of orchestrator.writeSection(
            promptContext, writingInstruction, targetWords,
            undefined, undefined, temperature, topP,
          )) {
            if (chunk.type === "token") {
              fullContent += chunk.content;
              send({ type: "token", content: chunk.content });

              saveCounter += chunk.content.length;
              if (saveCounter >= 300 && !saving) {
                saveCounter = 0;
                saving = true;
                const draft = fullContent;
                prisma.storyNode.update({
                  where: { id: nextNode.id },
                  data: { content: draft + "\n\n[PARTIAL_DRAFT]", status: "drafting" },
                }).then(() => { saving = false; })
                  .catch((e) => { saving = false; console.error("草稿保存失败:", e?.message); });
              }
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          // ── 正则后处理（U1：与 write 统一消费 postProcessingRules）──
          if (Array.isArray(projectRules) && projectRules.length > 0) {
            const cleaned = applyRegexRules(fullContent, projectRules);
            if (cleaned !== fullContent) {
              send({ type: "postprocess_regex", content: `正则后处理已应用 ${projectRules.length} 条规则` });
              fullContent = cleaned;
            }
          }

          // Phase 2-4: 后处理管线
          const activeCharIds = Array.isArray((nextNode as any).activeCharacters)
            ? ((nextNode as any).activeCharacters as string[]) : [];
          const activeLoreIds = Array.isArray((nextNode as any).activeLoreIds)
            ? ((nextNode as any).activeLoreIds as string[]) : [];

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
              currentNode: nextNode as any,
              chapterTitle: nextTitle,
              chapterOrder: (nextNode as any).order,
              forbiddenPatterns,
            });
          } catch (e) {
            console.error("续写后处理失败（已降级为仅生成）:", e instanceof Error ? e.message : e);
            send({ type: "postprocess_skip", content: e instanceof Error ? e.message : "后处理跳过" });
          }

          // 宝宝流自动填表（正文 → 填表，闭合写作闭环）
          // M1（墨白 Round12）：透传 nextNode.order/nodeId，使写入行 _src 形如 ch{n}:batchmanual（章节段非空），与 write 路径一致。
          // IMP-002 扩充：补算 isLatestChapter 使 skipLatestChapter 在 continue 路径生效（与 confirm/batch 算法一致）。
          let contIsLatest = false;
          try {
            const agg = await prisma.storyNode.aggregate({ where: { projectId }, _max: { order: true } });
            contIsLatest = (nextNode as any).order === (agg._max.order ?? (nextNode as any).order);
          } catch { /* 聚合失败按非最新，保守填表 */ }
          const babylore = await safeFillAfterWriting({
            projectId,
            content: fullContent,
            send,
            nodeOrder: (nextNode as any).order,
            isLatestChapter: contIsLatest,
            nodeId: nextNode.id,
            projectLlmConfig: projLlm as Record<string, unknown> | null,
          });

          send({
            type: "done", content: "",
            nodeId: result?.nodeId || nextNode.id, title: nextTitle, order: (nextNode as any).order,
            status: result?.status || "completed",
            nextAction: `已自动创建并完成「${nextTitle}」，可继续续写`,
            babylore,
          });
        } catch (err) {
          send({ type: "error", content: err instanceof Error ? err.message : "续写失败" });
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
