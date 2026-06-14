/**
 * POST /api/generate/refine
 *
 * 微调/续写 —— 不重写正文，基于已有内容按用户指令修改或补长。
 * 与 write 的区别：write 是从大纲重新生成，refine 是在已有正文上做精细调整。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   nodeId: string;
 *   instruction: string;      // 微调指令（"加500字战斗描写"/ "改对话更凶狠"）
 *   targetWords?: number;     // 目标增加字数（默认500）
 * }
 */
export const maxDuration = 300;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator, buildPromptContext } from "@/core/agents";
import { countTokens } from "@/core/assembly/tokenizer";
import { getSiliconFlowClient } from "@/core/llm/client";
import { getTemplate } from "@/core/templates";
import { scanForbiddenWords, collectForbiddenPatterns } from "@/lib/forbidden-checker";
import { getActiveRules, injectRules } from "@/core/rules";

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, instruction, targetWords = 500, confirmedCardIds, cardNotes, newCharacterRequests, authorNote } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const [project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        prisma.storyNode.findUnique({ where: { id: nodeId } }),
        prisma.storyNode.findMany({
          where: { projectId, content: { not: null } },
          orderBy: { order: "asc" },
        }),
        prisma.characterCard.findMany({ where: { projectId } }),
        prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
        prisma.chapterSummary.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 3,
        }),
        prisma.storyBeat.findMany({
          where: { projectId },
          orderBy: { chapterNumber: "desc" },
          take: 20,
        }),
        prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
      ]);

    if (!project || !currentNode) {
      return NextResponse.json({ error: "项目或节点不存在" }, { status: 404 });
    }

    const existingContent = currentNode.content || "";
    const hasContent = existingContent.trim().length > 0;

    // 找到上下文
    const currentNodeIndex = allNodes.findIndex((n) => n.id === nodeId);
    const previousNodes = allNodes.slice(Math.max(0, currentNodeIndex - 4), currentNodeIndex);

    // ── 自建角色 ──
    const allChars = [...characters];
    if (Array.isArray(newCharacterRequests) && newCharacterRequests.length > 0) {
      for (const req of newCharacterRequests as string[]) {
        const name = req.trim();
        if (!name) continue;
        const exists = allChars.some((c: any) => c.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          const created = await prisma.characterCard.create({
            data: {
              projectId,
              name,
              role: "supporting",
              personality: { dominant: "微调时自建，待丰富" } as any,
              background: `[微调] 用户要求自建角色`,
              abilities: [],
              tags: ["🆕 微调自建"],
              currentStatus: "alive",
            } as any,
          });
          allChars.push(created as any);
        }
      }
    }

    // ── 过滤角色 ──
    let activeChars = allChars;
    if (Array.isArray(confirmedCardIds) && confirmedCardIds.length > 0) {
      const confirmedSet = new Set(confirmedCardIds as string[]);
      activeChars = allChars.filter((c: any) => confirmedSet.has(c.id));
    }

    // 作者指令：请求体优先 → 数据库持久化兜底
    const effectiveAuthorNote = authorNote || (project as any).authorNote || "";

    // ── Rules 系统注入 ──
    const writeRules = await getActiveRules(projectId, "write_only");
    const finalAuthorNote = injectRules(effectiveAuthorNote, writeRules);

    // 构建 Prompt 上下文（和 write 一样）
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: currentNode as any,
      previousNodes: previousNodes as any,
      characters: activeChars as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
      authorNote: finalAuthorNote,
    });

    // 文风规则已统一在 systemPrompt 中，不再从模板二次注入
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    const templateId = (llmConfig.styleTemplateId as string) || "";
    const template = getTemplate(templateId);
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];

    const effectiveTemperature = (llmConfig.temperature as number) ?? template?.temperature ?? 0.85;
    const effectiveTopP = (llmConfig.topP as number) ?? template?.topP ?? 0.95;

    // ── 用户备注注入 ──
    let cardNotesText = "";
    if (cardNotes && typeof cardNotes === "object" && Object.keys(cardNotes).length > 0) {
      const noteLines: string[] = [];
      for (const [id, note] of Object.entries(cardNotes as Record<string, string>)) {
        if (!note.trim()) continue;
        const char = allChars.find((c: any) => c.id === id);
        if (char) noteLines.push(`[${char.name}] ${note}`);
      }
      if (noteLines.length > 0) cardNotesText = "\n【用户角色备注——最高优先级】\n" + noteLines.join("\n");
    }

    // 微调指令
    const refineInstruction = instruction && instruction.trim().length > 0
      ? instruction.trim()
      : "请在现有正文基础上自然续写，保持文风一致，推进剧情。";

    const isTargetedFix = hasContent && refineInstruction.includes("精准修复");

    const writingInstruction = hasContent
      ? `${cardNotesText}【${isTargetedFix ? "精准修复" : "微调"}任务——在以下已有正文上进行${isTargetedFix ? "定点修改" : "修改/续写"}，不要从头重写】

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
      : `${cardNotesText}此章节暂无正文。请按以下指令从零撰写：${refineInstruction}\n\n目标字数：约${targetWords}字。`;

    // SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const orchestrator = new AgentOrchestrator();
          let newContent = "";

          // 流式生成
          for await (const chunk of orchestrator.writeSection(
            promptContext,
            writingInstruction,
            targetWords,
            getSiliconFlowClient(),
            "deepseek-ai/DeepSeek-V4-Pro",
            effectiveTemperature,
            effectiveTopP,
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

          // Phase 1.5: 禁用词扫描
          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [],
            customForbidden,
          );
          if (forbiddenPatterns.length > 0) {
            const scanResult = scanForbiddenWords(newContent, forbiddenPatterns);
            if (!scanResult.passed) {
              send({
                type: "forbidden_scan",
                content: scanResult.summary,
                matches: scanResult.matches.slice(0, 10),
                totalMatches: scanResult.matches.length,
              });
            } else {
              send({ type: "forbidden_scan", content: "✅ 禁用词检查通过", passed: true });
            }
          }

          // 判断是续写还是修改：续写的结果比原文长很多
          const isContinue = hasContent && newContent.length > existingContent.length * 0.9;
          const finalContent = isContinue ? newContent : newContent;

          // 保存
          await prisma.storyNode.update({
            where: { id: nodeId },
            data: {
              content: finalContent,
              wordCount: finalContent.length,
              status: "completed",
            },
          });

          const tokenCount = countTokens(finalContent);
          send({
            type: "done",
            content: "",
            nodeId,
            status: "completed",
            mode: hasContent ? "refine" : "write",
            wordCount: finalContent.length,
            usage: { completionTokens: tokenCount, totalTokens: tokenCount },
          });
        } catch (err) {
          send({
            type: "error",
            content: err instanceof Error ? err.message : "微调失败",
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
      { error: err instanceof Error ? err.message : "微调失败" },
      { status: 500 }
    );
  }
}
