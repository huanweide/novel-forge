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
import { recallContext } from "@/core/babylore/recall";
import { babyloreFill } from "@/core/babylore/fill";

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

    // ── 6.5 宝宝流记忆召回（剧情推进 = 记忆召回） ──
    // 用本节大纲 + 作者指令 + 前文 + 角色名 作为召回上下文，
    // 把命中的世界书条目 / 结构化表格行注入本轮撰写指令，保证设定一致性。
    const loreTablesRaw = await prisma.loreTable.findMany({ where: { projectId } });
    const recallText = [
      data.currentNode.outline || "",
      cleanAuthorNote || "",
      activeChars.map((c: any) => c.name).join("、"),
      previousNodes.map((n: any) => n.content || n.outline || "").join("\n"),
    ].join("\n");
    // 过滤"自动发现"占位世界书（内容含 [自动发现]，仅为待补充设定，召回会污染 prompt）
    const cleanLore = (data.loreEntries || []).filter(
      (e: any) => !((e.content || "") as string).includes("[自动发现]"),
    );
    const recallRaw = recallContext(
      recallText,
      cleanLore as any,
      loreTablesRaw.map((t: any) => ({
        name: t.name,
        columns: t.columns || [],
        rows: t.rows || [],
      })),
    );
    // 优先保留结构化表格命中（精确），限制总数避免 prompt 膨胀
    const recallItems = [
      ...recallRaw.filter((i) => i.source === "table"),
      ...recallRaw.filter((i) => i.source === "lorebook"),
    ].slice(0, 12);
    if (recallItems.length > 0) {
      const recallBlock =
        "\n\n## 🧠 宝宝流记忆召回（剧情推进 = 记忆召回——请在写作中自然呼应，保持设定一致，但不要复述原文）\n" +
        recallItems
          .map(
            (it) =>
              `【${it.source === "lorebook" ? "世界书" : "结构化表格"}｜${it.title}】\n${it.content}`,
          )
          .join("\n\n");
      writingInstruction += recallBlock;
    }

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

        // 推送本轮召回的记忆列表（供前端透明展示「剧情推进=记忆召回」）
        if (recallItems.length > 0) {
          send({ type: "babylore_recall", items: recallItems });
        }

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

          // Phase 2-4: 后处理管线（扫描 → 审校 → 摘要）
          // 容错：后处理（含 LLM 审校/摘要）若因限流/超时失败，不阻断正文交付——
          // 直接降级为"仅生成"，仍继续自动填表并发送 done。
          let result: any = { nodeId, status: "completed" };
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
              chapterTitle: data.currentNode.title || `第${data.currentNode.order + 1}节`,
              chapterOrder: data.currentNode.order,
              forbiddenPatterns,
            });
          } catch (e) {
            console.error("后处理管线失败（已降级为仅生成）:", e instanceof Error ? e.message : e);
            send({ type: "postprocess_skip", content: e instanceof Error ? e.message : "后处理跳过" });
          }

          // ── 宝宝流自动填表（正文 → 填表，闭合「正文→填表→召回→正文」写作闭环） ──
          // 每章写完后自动用 DeepSeek 抽取结构化事实回填表格；失败不影响正文交付。
          let babylore: { ok: boolean; operations: number; applied: number; error: string } = {
            ok: false,
            operations: 0,
            applied: 0,
            error: "",
          };
          try {
            const fillRes = await babyloreFill(projectId, fullContent);
            babylore = {
              ok: fillRes.ok,
              operations: fillRes.operations,
              applied: fillRes.applied,
              error: fillRes.error || "",
            };
          } catch (e) {
            babylore = {
              ok: false,
              operations: 0,
              applied: 0,
              error: e instanceof Error ? e.message : "填表异常",
            };
          }
          send({ type: "babylore_fill", ...babylore });

          // Token 用量
          send({
            type: "done",
            content: "",
            nodeId: result?.nodeId || nodeId,
            status: result?.status || "completed",
            usage: {
              completionTokens: countTokens(fullContent),
              totalTokens: countTokens(fullContent),
            },
            babylore,
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
