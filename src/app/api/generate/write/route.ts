import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator, buildPromptContext } from "@/core/agents";
import { countTokens } from "@/core/assembly/tokenizer";
// 模型配置从 AgentOrchestrator.fromSettings() 动态读取
import { getTemplate } from "@/core/templates";
import { scanForbiddenWords, collectForbiddenPatterns } from "@/lib/forbidden-checker";
import { getActiveRules, injectRules } from "@/core/rules";

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
    const { projectId, nodeId, authorNote, targetWordCount = 800, confirmedCardIds, cardNotes, newCharacterRequests } = body;

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

    // ── 自建用户要求的角色 ──
    if (Array.isArray(newCharacterRequests) && newCharacterRequests.length > 0) {
      for (const req of newCharacterRequests as string[]) {
        const name = req.trim();
        if (!name) continue;
        // 检查是否已存在同名角色
        const exists = characters.some(c => c.name.toLowerCase() === name.toLowerCase());
        if (!exists) {
          const created = await prisma.characterCard.create({
            data: {
              projectId,
              name,
              role: "supporting",
              personality: { dominant: "本章新建，待丰富" } as any,
              background: `[${currentNode.title || "本章"}] 用户要求自建角色`,
              abilities: [],
              tags: ["🆕 用户自建"],
              currentStatus: "alive",
            } as any,
          });
          characters.push(created as any);
        }
      }
    }

    // ── 过滤角色花名册——如果用户确认了卡列表，只送确认的 ──
    let activeCharacters = characters;
    if (Array.isArray(confirmedCardIds) && confirmedCardIds.length > 0) {
      const confirmedSet = new Set(confirmedCardIds as string[]);
      activeCharacters = characters.filter(c => confirmedSet.has(c.id));
    }

    // 把用户备注注入 authorNote
    let enrichedAuthorNote = authorNote || "";
    if (cardNotes && typeof cardNotes === "object" && Object.keys(cardNotes).length > 0) {
      const noteLines: string[] = [];
      for (const [id, note] of Object.entries(cardNotes as Record<string, string>)) {
        if (!note.trim()) continue;
        const char = characters.find(c => c.id === id);
        if (char) noteLines.push(`[${char.name}] ${note}`);
      }
      if (noteLines.length > 0) {
        enrichedAuthorNote = (enrichedAuthorNote ? enrichedAuthorNote + "\n\n" : "") + "【用户角色备注——最高优先级】\n" + noteLines.join("\n");
      }
    }

    // ── Rules 系统注入 ──
    const writeRules = await getActiveRules(projectId, "write_only");
    const finalAuthorNote = injectRules(enrichedAuthorNote, writeRules);

    // 构建 Prompt 上下文——使用过滤后的角色列表
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: currentNode as any,
      previousNodes: previousNodes as any,
      characters: activeCharacters as any,
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

    // 撰写指令——作者注释放最前面，最高优先级
    const effectiveAuthorNote = enrichedAuthorNote || authorNote;
    let writingInstruction = effectiveAuthorNote
      ? `【⚠️ 作者指令——最高优先级，优先于大纲】\n${effectiveAuthorNote}\n\n`
      : "";
    writingInstruction += currentNode.outline
      ? `【本节大纲】${currentNode.outline}`
      : "根据上下文自然推进剧情，撰写本节正文。";
    writingInstruction += "\n\n【格式铁律】绝不在正文首行或任意位置写「第X章」「第X节」或章节标题。章节标题由系统管理，正文直接切入动作/对话。";

    // 从全局设置创建调度器——模型名、API Key 全部动态读取
    const orchestrator = await AgentOrchestrator.fromSettings({
      defaultTemperature: effectiveTemperature,
      defaultTopP: effectiveTopP,
    });

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
          let newContent = ""; // 本次生成的新内容

          // 检查是否有未完成的草稿
          const partialDraft = currentNode.status === "drafting" && currentNode.content
            ? currentNode.content.replace(/\[PARTIAL_DRAFT\]/g, "").trim()
            : "";

          // Phase 1: 流式生成正文
          let saveCounter = 0;
          let saving = false; // 防重叠锁
          for await (const chunk of orchestrator.writeSection(
            promptContext,
            partialDraft
              ? `${writingInstruction}\n\n【续写——从以下草稿断点继续，不要重复已有内容】\n已有内容末段：${partialDraft.slice(-200)}\n\n请从断点处自然接续。`
              : writingInstruction,
            targetWordCount,
            undefined, // 用 orchestrator 自带的 settings 客户端
            undefined, // 用 orchestrator 自带的 settings 模型名
            effectiveTemperature,
            effectiveTopP,
          )) {
            if (chunk.type === "token") {
              newContent += chunk.content;
              send({ type: "token", content: chunk.content });

              // 每 ~300 字保存草稿（防重叠写）
              saveCounter += chunk.content.length;
              if (saveCounter >= 300 && !saving) {
                saveCounter = 0;
                saving = true;
                const combined = partialDraft + newContent;
                prisma.storyNode.update({
                  where: { id: nodeId },
                  data: {
                    content: combined + "\n\n[PARTIAL_DRAFT]",
                    status: "drafting",
                  },
                }).then(() => { saving = false; })
                  .catch((e) => { saving = false; console.error("草稿保存失败:", e?.message); });
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

          // Phase 1.5: 禁用词扫描
          const forbiddenPatterns = collectForbiddenPatterns(
            template?.forbiddenPatterns || [],
            customForbidden,
          );
          if (forbiddenPatterns.length > 0) {
            const scanResult = scanForbiddenWords(fullContent, forbiddenPatterns);
            if (!scanResult.passed) {
              send({
                type: "forbidden_scan",
                content: scanResult.summary,
                matches: scanResult.matches.slice(0, 10), // 最多报10条
                totalMatches: scanResult.matches.length,
              });
            } else {
              send({ type: "forbidden_scan", content: "✅ 禁用词检查通过", passed: true });
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

          // 构建跨章上下文——取最近3章摘要+角色状态快照做一致性对比
          const previousContext = summaries.map(s => ({
            chapterTitle: s.chapterTitle,
            summary: s.summary,
            keyEvents: s.keyEvents || [],
            characterStates: typeof s.characterStates === "string"
              ? s.characterStates
              : (s.characterStates as any)?.raw || JSON.stringify(s.characterStates || {}),
          }));

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const reviewLog = await orchestrator.reviewContent(
            fullContent,
            currentNode.outline || "",
            activeCharacters as any,
            activeLore as any,
            previousContext
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
            const { summary, keyEvents, characterStates, closingSnapshot, characterImpulses, threadProgress, unresolvedQuestions, impactScore } =
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
              let description = keyEvents.join("；");
              if (unresolvedQuestions && unresolvedQuestions.length > 0) {
                description += `\n【悬念】${unresolvedQuestions.join("；")}`;
              }
              await prisma.storyBeat.create({
                data: {
                  projectId,
                  nodeId,
                  description,
                  chapterNumber: currentNode.order + 1,
                  impact: impactScore >= 7 ? "major" : "minor",
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
