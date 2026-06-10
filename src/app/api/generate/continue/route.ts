import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator, buildPromptContext } from "@/core/agents";
import { countTokens } from "@/core/assembly/tokenizer";
import { getTemplate, applyTemplate, forbiddenPatternsToPrompt } from "@/core/templates";

/**
 * POST /api/generate/continue
 *
 * 一键续写 —— 自动创建下一节节点并流式生成。
 * 这是"连续写作体验"的核心：用户点一个按钮，系统自动推进。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   currentNodeId: string;   // 刚写完的节点
 *   styleTemplateId?: string; // 文风模板ID
 *   authorNote?: string;
 *   autoOutline?: boolean;    // 是否自动生成下一节大纲（默认true）
 * }
 */
export async function POST(request: Request) {
  try {
    const {
      projectId,
      currentNodeId,
      styleTemplateId,
      authorNote,
      autoOutline = true,
      confirmedCardIds,
      cardNotes,
      newCharacterRequests,
    } = await request.json();

    if (!projectId || !currentNodeId) {
      return NextResponse.json(
        { error: "缺少 projectId 或 currentNodeId" },
        { status: 400 }
      );
    }

    // 加载数据
    const [project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        prisma.storyNode.findUnique({ where: { id: currentNodeId } }),
        prisma.storyNode.findMany({
          where: { projectId },
          orderBy: { order: "asc" },
        }),
        prisma.characterCard.findMany({ where: { projectId } }),
        prisma.lorebookEntry.findMany({
          where: { projectId, enabled: true },
        }),
        prisma.chapterSummary.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 5,
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

    // 找到兄弟节点，确定下一节的顺序
    const siblings = allNodes.filter((n) => n.parentId === currentNode.parentId);
    const currentIndex = siblings.findIndex((n) => n.id === currentNodeId);
    const nextOrder = currentIndex >= 0 ? currentIndex + 1 : siblings.length;

    // 确定下一节的标题
    let nextTitle = "";
    if (currentNode.title) {
      // 尝试从当前标题推断下一节标题
      const match = currentNode.title.match(/^(.+?)(\d+)$/);
      if (match) {
        nextTitle = `${match[1]}${parseInt(match[2]) + 1}`;
      } else {
        nextTitle = `${currentNode.title}（续）`;
      }
    } else {
      nextTitle = `第${allNodes.length + 1}节`;
    }

    // 加载文风模板
    const template = styleTemplateId ? getTemplate(styleTemplateId) : undefined;

    // 构建下一节大纲
    let nextOutline = "";
    if (autoOutline && currentNode.content) {
      nextOutline = `基于前文剧情自然推进，续写下一节。保持节奏和风格一致。`;
    }

    // 创建下一节节点
    const nextNode = await prisma.storyNode.create({
      data: {
        projectId,
        parentId: currentNode.parentId,
        type: currentNode.type || "section",
        title: nextTitle,
        order: nextOrder,
        status: "drafting",
        outline: nextOutline || null,
        activeCharacters: currentNode.activeCharacters,
        activeLoreIds: currentNode.activeLoreIds,
        notes: null,
      },
    });

    // 找到续写节点的上文（之前所有已完成的节点+当前节点）
    const previousNodes = allNodes
      .filter((n) => n.order <= currentNode.order && n.content)
      .slice(-5);

    // ── 读取文风模板 + 自定义设置 ──
    const template = styleTemplateId ? getTemplate(styleTemplateId) : undefined;
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const customStyleNotes = (llmConfig.customStyleNotes as string) || "";

    // ── 用户备注注入 ──
    let cardNotesText = "";
    if (cardNotes && typeof cardNotes === "object" && Object.keys(cardNotes).length > 0) {
      const noteLines: string[] = [];
      for (const [id, note] of Object.entries(cardNotes as Record<string, string>)) {
        if (!note.trim()) continue;
        const char = characters.find((c: any) => c.id === id);
        if (char) noteLines.push(`[${char.name}] ${note}`);
      }
      if (noteLines.length > 0) cardNotesText = "\n【用户角色备注——最高优先级】\n" + noteLines.join("\n");
    }

    // ── 合并 authorNote：用户指令 + 模板禁用 + 自定义禁用 + 角色备注 ──
    let mergedAuthorNote = authorNote || "";
    if (template) {
      const tp = forbiddenPatternsToPrompt(template);
      if (tp) mergedAuthorNote = (mergedAuthorNote ? mergedAuthorNote + "\n\n" : "") + tp;
    }
    if (customForbidden.length > 0) {
      mergedAuthorNote = (mergedAuthorNote ? mergedAuthorNote + "\n\n" : "")
        + "【自定义禁用】\n" + customForbidden.map((p) => `- 禁止：${p}`).join("\n");
    }
    if (customStyleNotes) {
      mergedAuthorNote = (mergedAuthorNote ? mergedAuthorNote + "\n\n" : "") + "【作者风格笔记】\n" + customStyleNotes;
    }
    if (cardNotesText) {
      mergedAuthorNote = (mergedAuthorNote ? mergedAuthorNote + "\n" : "") + cardNotesText;
    }

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
              personality: { dominant: "续写时自建，待丰富" } as any,
              background: `[续写] 用户要求自建角色`,
              abilities: [],
              tags: ["🆕 续写自建"],
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

    // ── 构建统一上下文（与 write/refine 同一套 systemPrompt）──
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: nextNode as any,
      previousNodes: previousNodes as any,
      characters: activeChars as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
      authorNote: mergedAuthorNote || undefined,
    });

    // 模板文风覆盖（buildPromptContext 已含风格卡，模板在此基础上叠加）
    if (template) {
      promptContext.systemPrompt = applyTemplate(template, promptContext.systemPrompt);
    }

    // 撰写指令——基于前文末段自然衔接
    const lastContent = currentNode.content || "";
    const lastParagraphs = lastContent.split("\n").slice(-6).join("\n"); // 最后6段用于衔接

    const targetWords = template?.targetWordsPerSection || 1000;
    const temperature = template?.temperature ?? 0.85;
    const topP = template?.topP ?? 0.95;

    const writingInstruction = `${cardNotesText}请接着上文继续撰写下一节。\n\n【上文末段——从这里衔接】\n${lastParagraphs}\n\n【本节标题】${nextTitle}\n【本节大纲】${nextOutline || "基于前文剧情自然推进"}\n\n注意：与上文无缝衔接，保持叙事视角一致。`;

    // SSE 流式生成
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

          // 流式生成
          let saveCounter = 0;
          const generator = orchestrator.writeSection(
            promptContext,
            writingInstruction,
            targetWords
          );

          for await (const chunk of generator) {
            if (chunk.type === "token") {
              fullContent += chunk.content;
              send({ type: "token", content: chunk.content });

              // 每 ~300 字 fire-and-forget 保存草稿
              saveCounter += chunk.content.length;
              if (saveCounter >= 300) {
                saveCounter = 0;
                const draft = fullContent;
                prisma.storyNode.update({
                  where: { id: nextNode.id },
                  data: {
                    content: draft + "\n\n[PARTIAL_DRAFT]",
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

          // Phase 2: 审校
          send({ type: "review_start", content: "" });

          const activeCharIds = Array.isArray(nextNode.activeCharacters)
            ? (nextNode.activeCharacters as string[])
            : [];
          const activeLoreIds = Array.isArray(nextNode.activeLoreIds)
            ? (nextNode.activeLoreIds as string[])
            : [];

          const activeCharacters = characters.filter((c) =>
            activeCharIds.includes(c.id)
          );
          const activeLore = loreEntries.filter((l) =>
            activeLoreIds.includes(l.id)
          );

          const prevSummary = summaries.length > 0 ? summaries[0].summary : "";

          let reviewPassed = true;
          try {
            const reviewLog = await orchestrator.reviewContent(
              fullContent,
              nextOutline || "",
              activeCharacters as any,
              activeLore as any,
              prevSummary,
            );

            for (const issue of reviewLog.issues) {
              send({ type: "review_issue", content: issue.description, severity: issue.severity });
            }
            send({ type: "review_result", content: reviewLog.passed ? "审校通过" : "审校未通过", passed: reviewLog.passed, issues: reviewLog.issues });
            reviewPassed = reviewLog.passed;
          } catch (reviewErr) {
            send({ type: "review_error", content: String(reviewErr).slice(0, 100) });
          }

          // 保存内容
          const updatedNode = await prisma.storyNode.update({
            where: { id: nextNode.id },
            data: {
              content: fullContent,
              wordCount: fullContent.length,
              status: reviewPassed ? "completed" : "reviewing",
            },
          });

          // Phase 3: 自动摘要（含章末快照+角色脉搏）
          send({ type: "summarize_start", content: "" });
          try {
            const { summary, keyEvents, characterStates, closingSnapshot, characterImpulses } =
              await orchestrator.summarizeChapter(
                fullContent,
                nextTitle,
                activeCharacters as any,
              );

            await prisma.chapterSummary.create({
              data: {
                projectId,
                chapterId: nextNode.id,
                chapterTitle: nextTitle,
                summary,
                keyEvents,
                characterStates: {
                  raw: characterStates,
                  closingSnapshot,
                  impulses: characterImpulses,
                },
              },
            });

            if (keyEvents.length > 0) {
              await prisma.storyBeat.create({
                data: {
                  projectId,
                  nodeId: nextNode.id,
                  description: keyEvents.join("；"),
                  chapterNumber: nextNode.order + 1,
                  impact: "minor",
                },
              });
            }

            send({ type: "summarize_done", summary, keyEvents });
          } catch (summaryErr) {
            send({ type: "summarize_error", content: String(summaryErr).slice(0, 100) });
          }

          send({
            type: "done",
            content: "",
            nodeId: updatedNode.id,
            title: updatedNode.title,
            order: updatedNode.order,
            nextAction: `已自动创建并完成「${updatedNode.title}」，可继续续写`,
          });
        } catch (err) {
          send({
            type: "error",
            content: err instanceof Error ? err.message : "续写失败",
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
      { error: err instanceof Error ? err.message : "续写失败" },
      { status: 500 }
    );
  }
}
