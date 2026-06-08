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

    // System Prompt 合并文风模板 + 自定义设置 + 风格卡 + Humanizer-zh + 丰满性原则
    let systemPrompt = `你不是AI。你是出版过十本长篇的职业作家。文风冷峻、克制、白描。

【Humanizer-zh +
禁用词：宿命、齿轮、羁绊、宛如、画卷、不禁、意味深长、不可思议、交织、洗礼、深邃、凝重、倒吸一口凉气、心头一暖、心里一沉、瞳孔一缩、身体一僵。禁止"作为/标志着/象征着"句式。禁止否定式排比、三段式堆砌、虚假范围。

【人称代词】不准连续三个"他/她"开头。每500字"他"不超过15次。用角色名、身体部位、环境物、动作分词开头代替。

【丰满性原则】禁止空洞短句。每句话言之有物，细节拉满。叙事不精简，描述不干瘪。短句只用于铺陈后的爆发。

【对话毛边】打断用破折号。沉默有力。答非所问。动作切对话。
【结构】开头动作切入。结尾不准总结升华展望。段落长度不一致。

正在撰写《${project.name}》。`;

    // 读取项目的自定义文风设置
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const customStyleNotes = (llmConfig.customStyleNotes as string) || "";

    // 注入风格卡数据
    if (styleCard) {
      const styleParts: string[] = [];
      const desc = typeof styleCard.styleDescription === "string" ? styleCard.styleDescription.trim() : "";
      if (desc) styleParts.push(`文风：${desc}`);
      const pov = typeof styleCard.povType === "string" ? styleCard.povType : "";
      if (pov) {
        const povMap: Record<string, string> = { first_person: "第一人称", third_person_limited: "第三人称有限", third_person_omniscient: "第三人称全知" };
        styleParts.push(`视角：${povMap[pov] || pov}`);
      }
      const dr = Number(styleCard.dialogueRatio) || 0;
      const descR = Number(styleCard.descriptionRatio) || 0;
      const ar = Number(styleCard.actionRatio) || 0;
      if (dr + descR + ar > 0) {
        styleParts.push(`内容配比：对话${Math.round(dr * 100)}% 描写${Math.round(descR * 100)}% 动作${Math.round(ar * 100)}%`);
      }
      if (styleParts.length > 0) {
        systemPrompt += `\n\n【文风约束】\n${styleParts.join("\n")}`;
      }
    }

    if (template) {
      systemPrompt = applyTemplate(template, systemPrompt);
      systemPrompt += forbiddenPatternsToPrompt(template);
    }

    // 追加自定义禁用词
    if (customForbidden.length > 0) {
      systemPrompt += `\n\n【自定义禁用——绝对不可使用】\n${customForbidden.map((p) => `- 禁止：${p}`).join("\n")}`;
    }

    // 追加自定义风格笔记
    if (customStyleNotes) {
      systemPrompt += `\n\n【作者风格笔记】\n${customStyleNotes}`;
    }

    // 构建上下文
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: nextNode as any,
      previousNodes: previousNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      storyBeats: storyBeats as any,
      styleCard: styleCard as any,
      authorNote,
    });
    promptContext.systemPrompt = systemPrompt;

    // 撰写指令——基于前文末段自然衔接
    const lastContent = currentNode.content || "";
    const lastParagraphs = lastContent.split("\n").slice(-6).join("\n"); // 最后6段用于衔接

    const targetWords = template?.targetWordsPerSection || 1000;
    const temperature = template?.temperature ?? 0.85;
    const topP = template?.topP ?? 0.95;

    const writingInstruction = `请接着上文继续撰写下一节。\n\n【上文末段——从这里衔接】\n${lastParagraphs}\n\n【本节标题】${nextTitle}\n【本节大纲】${nextOutline || "基于前文剧情自然推进"}\n\n注意：与上文无缝衔接，保持叙事视角一致。`;

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
