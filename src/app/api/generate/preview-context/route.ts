import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { NextResponse } from "next/server";
import { buildPromptContext } from "@/core/agents";
import { getConsistencyBaselineText } from "@/core/consistency/extractFacts";
import { assemblePrompt, countTokens } from "@/core/assembly";
import { getTemplate } from "@/core/templates";
import { toAppStoryNode } from "@/core/story-node-bridge";

/**
 * POST /api/generate/preview-context
 *
 * 上下文预览 —— 生成前看一下当前 Prompt 里有什么。
 * 展示各区域内容、Token 用量、触发词匹配结果。
 *
 * 请求体：{ projectId: string; nodeId: string; authorNote?: string }
 */
export async function POST(request: Request) {
  try {
    const { projectId, nodeId, authorNote } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json(
        { error: "缺少 projectId 或 nodeId" },
        { status: 400 }
      );
    }

    const [project, currentNode, allNodes, characters, loreEntries, summaries, loreTables] =
      await Promise.all([
        prisma.project.findUnique({ where: { id: projectId } }),
        prisma.storyNode.findUnique({ where: { id: nodeId, deletedAt: null } }),
        prisma.storyNode.findMany({
          where: { projectId, content: { not: null }, deletedAt: null },
          orderBy: { order: "asc" },
        }),
        getApprovedCharacters(prisma, projectId),
        getApprovedLore(prisma, projectId),
        prisma.chapterSummary.findMany({
          where: { projectId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.loreTable.findMany({
          where: { projectId },
        }),
      ]);

    if (!project || !currentNode) {
      return NextResponse.json(
        { error: "项目或节点不存在" },
        { status: 404 }
      );
    }

    // v0.46.55 修复：请求体未显式传 authorNote 时，回退到 project.authorNote
    // （作者指令是持久化配置，上下文预览必须如实反映写作用到的指令）
    const effectiveAuthorNote = authorNote || project.authorNote || undefined;

    // 找到当前节点之前的节点
    const currentNodeIndex = allNodes.findIndex((n) => n.id === nodeId);
    const previousNodes = allNodes.slice(
      Math.max(0, currentNodeIndex - 4),
      currentNodeIndex
    );

    // 构建上下文（v1.6.51.1：同步注入一致性事实基线，预览与真实生成口径一致）
    const consistencyBaseline = await getConsistencyBaselineText(project.id).catch(() => "");
    const promptContext = buildPromptContext({
      project: project as any,
      currentNode: toAppStoryNode(currentNode),
      previousNodes: previousNodes as any,
      characters: characters as any,
      loreEntries: loreEntries as any,
      chapterSummaries: summaries as any,
      authorNote: effectiveAuthorNote,
      loreTables: loreTables as any,
      consistencyBaseline,
    });

    // ── 注入文风模板（与 write 路由保持一致）──
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    const templateId = (llmConfig.styleTemplateId as string) || "";
    const template = getTemplate(templateId);
    const customForbidden = (llmConfig.customForbiddenPatterns as string[]) || [];
    const customStyleNotes = (llmConfig.customStyleNotes as string) || "";

    const injectedSections: string[] = [];

    if (template?.stylePrompt) {
      const section = `【文风模板——${template.name}——最高优先级】\n${template.stylePrompt}`;
      promptContext.systemPrompt += `\n\n${section}`;
      injectedSections.push("✅ 文风模板 stylePrompt 已注入");
    } else {
      injectedSections.push("⚠️ 未找到模板或模板无 stylePrompt");
    }

    const allForbidden = [...(template?.forbiddenPatterns || []), ...customForbidden];
    if (allForbidden.length > 0) {
      promptContext.systemPrompt += `\n\n【🚫 绝对禁用词/句式——以下表达不得出现在正文中】\n${allForbidden.map((p) => `- 禁止：${p}`).join("\n")}`;
      injectedSections.push(`✅ 禁用词已注入 (模板${template?.forbiddenPatterns?.length || 0}条 + 自定义${customForbidden.length}条 = ${allForbidden.length}条)`);
    }

    if (customStyleNotes) {
      promptContext.systemPrompt += `\n\n【作者风格笔记】\n${customStyleNotes}`;
      injectedSections.push(`✅ 自定义风格笔记已注入 (${customStyleNotes.length}字)`);
    }

    if (template?.pacingGuide) {
      promptContext.systemPrompt += `\n\n【节奏指引】${template.pacingGuide}`;
      injectedSections.push("✅ 节奏指引已注入");
    }
    if (template?.dialogueGuide) {
      promptContext.systemPrompt += `\n\n【对话指引】${template.dialogueGuide}`;
      injectedSections.push("✅ 对话指引已注入");
    }

    const effectiveTemp = (llmConfig.temperature as number) ?? template?.temperature ?? 0.85;
    const effectiveTopP = (llmConfig.topP as number) ?? template?.topP ?? 0.95;
    injectedSections.push(`✅ Temperature: ${effectiveTemp} | Top-P: ${effectiveTopP} | 每节字数: ${template?.targetWordsPerSection || "默认"}`);

    // 组装 Prompt（不实际发送）
    const contextWindowSize = parseInt(
      process.env.CONTEXT_WINDOW_SIZE || "131072"
    );
    const { budget } = assemblePrompt(
      promptContext,
      contextWindowSize,
      "【预览模式——不会实际生成】"
    );

    // 各区域 Token 明细
    const breakdown = {
      systemPrompt: {
        tokens: countTokens(promptContext.systemPrompt),
        preview: promptContext.systemPrompt.slice(0, 200),
      },
      globalMemory: {
        tokens: countTokens(promptContext.globalMemory.projectSynopsis),
        preview: promptContext.globalMemory.projectSynopsis.slice(0, 200),
        protagonist: promptContext.globalMemory.currentProtagonist?.name || "无",
        toneKeywords: promptContext.globalMemory.toneKeywords,
      },
      triggeredLore: {
        tokens: countTokens(
          promptContext.triggeredLore.map((t) => t.entry.content).join(" ")
        ),
        count: promptContext.triggeredLore.length,
        entries: promptContext.triggeredLore.map((t) => ({
          title: t.entry.title,
          keyword: t.triggerKeyword,
          contentPreview: t.entry.content.slice(0, 100),
        })),
      },
      shortTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.shortTerm
            .map((n) => n.content || "")
            .join(" ")
        ),
        sectionCount: promptContext.slidingWindow.shortTerm.length,
        sections: promptContext.slidingWindow.shortTerm.map((n) => ({
          title: n.title,
          wordCount: n.wordCount,
        })),
      },
      mediumTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.mediumTerm
            .map((s) => s.summary)
            .join(" ")
        ),
        summaryCount: promptContext.slidingWindow.mediumTerm.length,
        summaries: promptContext.slidingWindow.mediumTerm.map((s) => ({
          chapterTitle: s.chapterTitle,
          summaryPreview: s.summary.slice(0, 100),
        })),
      },
      longTermMemory: {
        tokens: countTokens(
          promptContext.slidingWindow.longTerm
            .map((b) => b.description)
            .join(" ")
        ),
        beatCount: promptContext.slidingWindow.longTerm.length,
      },
      authorNote: {
        tokens: countTokens(promptContext.authorNote || ""),
        content: promptContext.authorNote || "无",
      },
    };

    // 激活的角色（在前文/大纲中出现的）
    const recentText = [
      ...previousNodes.map((n) => n.content || ""),
      currentNode.outline || "",
    ].join(" ");
    const activeCharacters = characters
      .filter((c) => {
        const names = [c.name, ...((c.aliases as string[]) || [])];
        return names.some((name) =>
          recentText.toLowerCase().includes(name.toLowerCase())
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        role: c.role,
      }));

    return NextResponse.json({
      budget,
      breakdown,
      activeCharacters,
      activeCharacterCount: activeCharacters.length,
      totalCharacterCount: characters.length,
      activeLoreCount: promptContext.triggeredLore.length,
      totalPromptTokens: budget.used || countTokens(JSON.stringify(breakdown)),
      contextWindowSize,
      // P_c：usage% 自洽——分母用真实上下文窗口，分子用 budget.used（已含全部区块+writing_task），
      // 并夹取 [0,100] 且防分母为 0，避免误报 100%+ / 负值 / NaN。
      usagePercent: (() => {
        const denom = contextWindowSize > 0 ? contextWindowSize : budget.total || 1;
        const pct = ((budget.used || 0) / denom) * 100;
        return Math.max(0, Math.min(100, pct)).toFixed(1);
      })(),
      // ── 模板注入验证 ──
      templateInjection: {
        templateId: templateId || "未选择",
        templateName: template?.name || "无",
        injectedSections,
        systemPromptTokens: countTokens(promptContext.systemPrompt),
        systemPromptPreview: promptContext.systemPrompt.slice(0, 300),
        // 为了方便验证，展示 systemPrompt 尾部（模板注入在这里）
        // 验证标记：模板内容在 systemPrompt 中的位置
        templateVerification: {
          templateLabelPos: promptContext.systemPrompt.indexOf("【文风模板"),
          templateNamePos: promptContext.systemPrompt.indexOf(template?.name || "NONEXISTENT"),
          forbiddenLabelPos: promptContext.systemPrompt.indexOf("【🚫 绝对禁用词"),
          pacingLabelPos: promptContext.systemPrompt.indexOf("【节奏指引】"),
          dialogueLabelPos: promptContext.systemPrompt.indexOf("【对话指引】"),
          systemPromptLength: promptContext.systemPrompt.length,
          // 如果 templateLabelPos === -1，说明模板没注入
          templateInjected: promptContext.systemPrompt.indexOf("【文风模板") !== -1,
          forbiddenInjected: promptContext.systemPrompt.indexOf("【🚫 绝对禁用词") !== -1,
        },
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
