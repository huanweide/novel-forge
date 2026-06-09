/**
 * POST /api/generate/chapter-outline
 *
 * 单章章纲生成 —— 用 V4 Flash 快速为指定章节生成/重新生成大纲。
 * 接收章节上下文（前后文 + 角色 + 世界书 + 用户提示词），返回单章大纲文本。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   nodeId: string;          // 目标章节（获取上下文）
 *   prompt?: string;         // 可选的用户提示词（不填则自动生成）
 * }
 */
export const maxDuration = 120;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, prompt: customPrompt, confirmedCardIds, cardNotes, newCharacterRequests } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const [project, node, allNodes, characters, loreEntries, summaries] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.storyNode.findMany({
        where: { projectId, parentId: null, type: { not: "volume" } },
        orderBy: { order: "asc" },
      }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    const nodeIndex = allNodes.findIndex((n) => n.id === nodeId);

    // 前后章节上下文
    const prevNodes = allNodes.slice(Math.max(0, nodeIndex - 2), nodeIndex);
    const nextNodes = allNodes.slice(nodeIndex + 1, Math.min(allNodes.length, nodeIndex + 3));

    const prevContext = prevNodes.map(n =>
      `[${n.title}]${n.outline ? ` 大纲：${n.outline.slice(0, 200)}` : ""}${n.content ? ` 正文前200字：${(n.content || "").slice(0, 200)}` : ""}`
    ).join("\n");

    const nextContext = nextNodes.map(n =>
      `[${n.title}]${n.outline ? ` 大纲：${n.outline.slice(0, 200)}` : ""}`
    ).join("\n");

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
              personality: { dominant: "章纲生成时自建，待丰富" } as any,
              background: `[章纲生成] 用户要求自建角色`,
              abilities: [],
              tags: ["🆕 章纲自建"],
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

    // 最近的摘要
    const recentSummary = summaries.length > 0
      ? summaries.map(s => s.summary).join("\n")
      : "暂无前文摘要";

    // 角色简表
    const charBriefs = activeChars.slice(0, 50).map((c: any) => {
      const p = typeof c.personality === "object" && !Array.isArray(c.personality)
        ? (c.personality as Record<string, unknown>).dominant || ""
        : Array.isArray(c.personality) ? (c.personality as string[]).slice(0, 2).join("、") : "";
      return `[${c.name}] ${c.role || "supporting"} ${p}`;
    }).join("\n");

    // 世界书简表
    const loreBriefs = (loreEntries as any[]).slice(0, 20).map((l: any) =>
      `[${l.title}](${l.category}) ${(l.content || "").slice(0, 100)}`
    ).join("\n");

    // ── V4 Flash 调用 ──
    const baseURL = (process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1");
    const apiKey = process.env.LLM_API_KEY || "";
    const model = process.env.FLASH_MODEL || "deepseek-ai/DeepSeek-V4-Flash";

    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;

    const systemPrompt = `你是小说章纲专家。根据上下文为指定章节生成 200-500 字的详细章纲。章纲需包含：
1. 本章核心冲突（一句话）
2. 主要事件序列（3-5个关键场景/节拍）
3. 出场角色及其动作
4. 情感弧线（角色情绪起点→转折→终点）
5. 与前后章的衔接点

输出纯文本，不要 JSON，不要编号。直接回答章纲内容。`;

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

    const userPrompt = hasCustomPrompt
      ? `【用户提示词——最高优先级】
${customPrompt}

【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【本文标题】${node.title}（第${nodeIndex + 1}章）

【现有大纲（如果有）】
${node.outline || "暂无大纲"}

【前后章节】
──前文──
${prevContext || "无（本章为开头）"}
──后文──
${nextContext || "无（本章为结尾）"}

【最近摘要】
${recentSummary}

【角色】
${charBriefs}

【世界观】
${loreBriefs}
${cardNotesText}

请为「${node.title}」生成一份详细的章纲。`
      : `【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【本文标题】${node.title}（第${nodeIndex + 1}章）

【现有大纲（如果有）】
${node.outline || "暂无大纲"}

【前后章节】
──前文──
${prevContext || "无（本章为开头）"}
──后文──
${nextContext || "无（本章为结尾）"}

【最近摘要】
${recentSummary}

【角色】
${charBriefs}

【世界观】
${loreBriefs}
${cardNotesText}

请为「${node.title}」生成一份详细的章纲。`;

    const url = baseURL.endsWith("/v1") ? `${baseURL}/chat/completions` : `${baseURL}/v1/chat/completions`;

    let outlineText = "";
    try {
      const llmRes = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 2048,
          stream: false,
        }),
      });

      if (!llmRes.ok) {
        const err = await llmRes.text().catch(() => "");
        return NextResponse.json(
          { error: `API ${llmRes.status}: ${err.slice(0, 300)}` },
          { status: 502 }
        );
      }

      const data = await llmRes.json();
      outlineText = data.choices?.[0]?.message?.content || "";
    } catch (err) {
      return NextResponse.json(
        { error: `调用失败：${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    if (!outlineText || outlineText.length < 10) {
      return NextResponse.json(
        { error: "模型返回空内容，请重试" },
        { status: 502 }
      );
    }

    // 写入大纲到数据库
    await prisma.storyNode.update({
      where: { id: nodeId },
      data: { outline: outlineText, status: node.status === "outline_only" ? "outline_only" : node.status },
    });

    return NextResponse.json({
      outline: outlineText,
      nodeId,
      title: node.title,
      modelUsed: "v4-flash",
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成章纲失败" },
      { status: 500 }
    );
  }
}
