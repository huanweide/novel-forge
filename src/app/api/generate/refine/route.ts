/**
 * POST /api/generate/refine
 *
 * 微调/续写 —— 基于已有内容按用户指令修改或补长。
 * 管线：数据加载 → 角色预处理 → 规则注入 → 上下文构建 → 流式生成 → 扫描+存储
 */
export const maxDuration = 300;

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

export async function POST(request: Request) {
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
    });

    // ── 7. 微调指令（路由特有逻辑）──
    const existingContent = data.currentNode.content || "";
    const hasContent = existingContent.trim().length > 0;
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

    const writingInstruction = hasContent
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
6. 输出完整修改后全文——用原文+局部替换的方式，不要只输出修改片段。` : `操作指南：
- 如果是修改指令（如"改对话""加描写"）：只修改指定部分，其他保留不变。输出完整修改后的版本。
- 如果是续写指令（如"继续写""补500字"）：从已有正文断点处无缝衔接续写。输出已有正文+续写内容。
- 如果是混合指令：先按修改要求调整，再从断点续写到目标字数。
- 绝对不要改变已有正文中没要求修改的部分。
- 保持文风、人称、节奏一致。
- 续写字数约${targetWords}字。`}`
      : `${cardNotesText ? "\n【用户角色备注——最高优先级】\n" + cardNotesText : ""}此章节暂无正文。请按以下指令从零撰写：${refineInstruction}\n\n目标字数：约${targetWords}字。`;

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

          for await (const chunk of orchestrator.writeSection(
            promptContext, writingInstruction, targetWords,
            undefined, undefined, effectiveTemperature, effectiveTopP,
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          // 后处理管线（仅扫描+存储，跳过审校和摘要）
          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [], customForbidden,
          );

          const result = await runPostGenerationPipeline({
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

          const tokenCount = countTokens(newContent);
          send({
            type: "done", content: "", nodeId: result.nodeId, status: result.status,
            mode: hasContent ? "refine" : "write", wordCount: newContent.length,
            usage: { completionTokens: tokenCount, totalTokens: tokenCount },
          });
        } catch (err) {
          send({ type: "error", content: err instanceof Error ? err.message : "微调失败" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "微调失败" }, { status: 500 });
  }
}
