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
    const [project, currentNode, allNodes, characters, loreEntries, summaries] =
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

    // 撰写指令
    const writingInstruction = currentNode.outline
      ? `请根据以下大纲撰写本节正文：\n${currentNode.outline}`
      : "请根据上下文自然推进剧情，撰写下一节正文。";

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
          let fullContent = "";

          // Phase 1: 流式生成正文
          for await (const chunk of orchestrator.writeSection(
            promptContext,
            writingInstruction,
            targetWordCount
          )) {
            if (chunk.type === "token") {
              fullContent += chunk.content;
              send({ type: "token", content: chunk.content });
            } else if (chunk.type === "error") {
              send({ type: "error", content: chunk.content });
              controller.close();
              return;
            }
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
              status: reviewLog.passed ? "completed" : "reviewing",
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
