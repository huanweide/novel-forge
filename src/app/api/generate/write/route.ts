import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator, buildPromptContext } from "@/core/agents";
import { countTokens } from "@/core/assembly/tokenizer";

/**
 * POST /api/generate/write
 *
 * 核心生成端点 —— SSE 流式输出小说正文。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   nodeId: string;        // 当前要生成的节点
 *   authorNote?: string;   // 作者强制指令
 *   targetWordCount?: number;
 * }
 *
 * 响应：Server-Sent Events 流
 * - data: {"type":"token","content":"..."}   → 正文 token
 * - data: {"type":"review_start"}             → 开始审校
 * - data: {"type":"review_issue","content":"..."} → 审校发现问题
 * - data: {"type":"review_result","passed":true/false}
 * - data: {"type":"done","content":"","usage":{...}}
 * - data: {"type":"error","content":"..."}
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, nodeId, authorNote, targetWordCount = 800 } = body;

    if (!projectId || !nodeId) {
      return NextResponse.json(
        { error: "缺少 projectId 或 nodeId" },
        { status: 400 }
      );
    }

    // 加载所有需要的数据
    const [project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        prisma.storyNode.findUnique({ where: { id: nodeId } }),
        prisma.storyNode.findMany({
          where: { projectId, content: { not: null } },
          orderBy: { order: "asc" },
        }),
        prisma.characterCard.findMany({ where: { projectId } }),
        prisma.lorebookEntry.findMany({
          where: { projectId, enabled: true },
        }),
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
        prisma.styleCard.findFirst({
          where: { projectId },
          orderBy: { updatedAt: "desc" },
        }),
      ]);

    if (!project || !currentNode) {
      return NextResponse.json(
        { error: "项目或节点不存在" },
        { status: 404 }
      );
    }

    // 找到当前节点之前的节点（短期记忆）
    const currentNodeIndex = allNodes.findIndex((n) => n.id === nodeId);
    const previousNodes = allNodes.slice(
      Math.max(0, currentNodeIndex - 4),
      currentNodeIndex
    );

    // 构建 Prompt 上下文
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: currentNode as any,
      previousNodes: previousNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
      authorNote,
    });

    // 注入项目的自定义文风设置
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const customStyleNotes = (llmConfig.customStyleNotes as string) || "";

    if (customForbidden.length > 0) {
      promptContext.systemPrompt += `\n\n【自定义禁用——绝对不可使用】\n${customForbidden.map((p) => `- 禁止：${p}`).join("\n")}`;
    }
    if (customStyleNotes) {
      promptContext.systemPrompt += `\n\n【作者风格笔记】\n${customStyleNotes}`;
    }

    // 撰写指令——作者注释放最前面，最高优先级
    let writingInstruction = authorNote
      ? `【⚠️ 作者指令——最高优先级，优先于大纲】\n${authorNote}\n\n`
      : "";
    writingInstruction += currentNode.outline
      ? `【本节大纲】${currentNode.outline}`
      : "根据上下文自然推进剧情，撰写本节正文。";
    writingInstruction += "\n\n【格式铁律】绝不在正文首行或任意位置写「第X章」「第X节」或章节标题。章节标题由系统管理，正文直接切入动作/对话。";

    // 创建 SSE 流
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: object) => {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        };

        try {
          const orchestrator = new AgentOrchestrator();
          let newContent = ""; // 本次生成的新内容

          // 检查是否有未完成的草稿
          const partialDraft = currentNode.status === "drafting" && currentNode.content
            ? currentNode.content.replace(/\[PARTIAL_DRAFT\]/g, "").trim()
            : "";

          // Phase 1: 流式生成正文
          let saveCounter = 0;
          for await (const chunk of orchestrator.writeSection(
            promptContext,
            partialDraft
              ? `${writingInstruction}\n\n【续写——从以下草稿断点继续，不要重复已有内容】\n已有内容末段：${partialDraft.slice(-200)}\n\n请从断点处自然接续。`
              : writingInstruction,
            targetWordCount
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });

              // 每 ~300 字 fire-and-forget 保存草稿（合并旧内容）
              saveCounter += chunk.content.length;
              if (saveCounter >= 300) {
                saveCounter = 0;
                const combined = partialDraft + newContent;
                prisma.storyNode.update({
                  where: { id: nodeId },
                  data: {
                    content: combined + "\n\n[PARTIAL_DRAFT]",
                    status: "drafting",
                  },
                }).catch(() => {}); // 静默失败，不阻塞流
              }
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
          }

          // 合并旧草稿 + 新内容
          const fullContent = partialDraft + newContent;

          // 通知前端是否续写
          if (partialDraft) {
            send({ type: "resume", content: `从草稿续写 (已有${partialDraft.length}字)` });
          }

          // Phase 2: 审校
          send({ type: "review_start", content: "" });

          const activeCharIds = Array.isArray(currentNode.activeCharacters)
            ? (currentNode.activeCharacters as string[])
            : [];
          const activeLoreIds = Array.isArray(currentNode.activeLoreIds)
            ? (currentNode.activeLoreIds as string[])
            : [];

          const activeCharacters = characters.filter((c) =>
            activeCharIds.includes(c.id)
          );
          const activeLore = loreEntries.filter((l) =>
            activeLoreIds.includes(l.id)
          );

          const prevSummary =
            summaries.length > 0 ? summaries[0].summary : "";

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const reviewLog = await orchestrator.reviewContent(
            fullContent,
            currentNode.outline || "",
            activeCharacters as any,
            activeLore as any,
            prevSummary
          );

          // 发送审校结果
          for (const issue of reviewLog.issues) {
            send({
              type: "review_issue",
              content: issue.description,
              severity: issue.severity,
            });
          }

          send({
            type: "review_result",
            content: reviewLog.passed ? "审校通过" : "审校未通过，请查看问题列表",
            passed: reviewLog.passed,
            issues: reviewLog.issues,
          });

          // 保存生成内容到数据库
          const updatedNode = await prisma.storyNode.update({
            where: { id: nodeId },
            data: {
              content: fullContent,
              wordCount: fullContent.length,
              status: "completed", // 内容写完即为完成，审校仅作参考建议
              reviewLogs: [
                ...((currentNode.reviewLogs as any) || []),
                {
                  id: crypto.randomUUID(),
                  nodeId,
                  timestamp: new Date().toISOString(),
                  passed: reviewLog.passed,
                  issues: reviewLog.issues,
                  summary: reviewLog.summary,
                  suggestion: reviewLog.suggestion,
                },
              ],
              revisionCount: (currentNode.revisionCount || 0) + 1,
            },
          });

          // Phase 3: 自动摘要——写入中期记忆
          send({ type: "summarize_start", content: "" });

          try {
            const { summary, keyEvents, characterStates, closingSnapshot, characterImpulses } =
              await orchestrator.summarizeChapter(
                fullContent,
                currentNode.title || `第${currentNode.order + 1}节`,
                activeCharacters as any,
              );

            // 存入 ChapterSummary（characterStates JSON 包含快照+脉搏+状态）
            await prisma.chapterSummary.create({
              data: {
                projectId,
                chapterId: nodeId,
                chapterTitle: currentNode.title || `第${currentNode.order + 1}节`,
                summary,
                keyEvents,
                characterStates: {
                  raw: characterStates,
                  closingSnapshot,
                  impulses: characterImpulses,
                },
              },
            });

            // 存入 StoryBeat（长期记忆索引）
            if (keyEvents.length > 0) {
              await prisma.storyBeat.create({
                data: {
                  projectId,
                  nodeId,
                  description: keyEvents.join("；"),
                  chapterNumber: currentNode.order + 1,
                  impact: "minor",
                },
              });
            }

            send({ type: "summarize_done", summary, keyEvents });
          } catch (summaryErr) {
            // 摘要失败不阻塞主流程
            send({ type: "summarize_error", content: String(summaryErr).slice(0, 100) });
          }

          // Token 用量
          const tokenCount = countTokens(fullContent);

          send({
            type: "done",
            content: "",
            nodeId: updatedNode.id,
            status: updatedNode.status,
            usage: {
              completionTokens: tokenCount,
              totalTokens: tokenCount,
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
      { status: 500 }
    );
  }
}
