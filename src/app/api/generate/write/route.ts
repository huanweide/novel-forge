import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
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

/**
 * POST /api/generate/write
 *
 * 核心生成端点 —— SSE 流式输出小说正文。
 * 管线：数据加载 → 角色预处理 → 规则注入 → 上下文构建 → 流式生成 → 后处理（扫描/审校/摘要）
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectId,
      nodeId,
      authorNote,
      targetWordCount = 800,
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
    const previousNodes = data.allNodes.slice(
      Math.max(0, currentNodeIndex - 4),
      currentNodeIndex,
    );

    // ── 6. 构建 Prompt 上下文 ──
    const promptContext = buildGenerationContext({
      data,
      activeCharacters: activeChars as any,
      authorNote: finalAuthorNote,
      previousNodes: previousNodes as any,
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

    // ── 8. 调度器 ──
    const orchestrator = await AgentOrchestrator.fromSettings({
      defaultTemperature: effectiveTemperature,
      defaultTopP: effectiveTopP,
    });

    // ── 9. SSE 流 ──
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
        };

        try {
          let newContent = "";

          // 检查未完成草稿
          const partialDraft =
            data.currentNode.status === "drafting" && data.currentNode.content
              ? data.currentNode.content.replace(/\[PARTIAL_DRAFT\]/g, "").trim()
              : "";

          // Phase 1: 流式生成
          let saveCounter = 0;
          let saving = false;
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
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });

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
                      status: "drafting",
                    },
                  })
                  .then(() => { saving = false; })
                  .catch((e) => { saving = false; console.error("草稿保存失败:", e?.message); });
              }
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          const fullContent = partialDraft + newContent;
          if (partialDraft) {
            send({ type: "resume", content: `从草稿续写 (已有${partialDraft.length}字)` });
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

          const result = await runPostGenerationPipeline({
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
            chapterTitle: data.currentNode.title || `第${data.currentNode.order + 1}节`,
            chapterOrder: data.currentNode.order,
            forbiddenPatterns,
          });

          // Token 用量
          send({
            type: "done",
            content: "",
            nodeId: result.nodeId,
            status: result.status,
            usage: {
              completionTokens: countTokens(fullContent),
              totalTokens: countTokens(fullContent),
            },
          });
        } catch (err) {
          send({
            type: "error",
            content: err instanceof Error ? err.message : "生成过程中出错",
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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成失败" },
      { status: 500 },
    );
  }
}
