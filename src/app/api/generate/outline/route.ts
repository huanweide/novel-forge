import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";

/**
 * POST /api/generate/outline
 *
 * 生成小说大纲——按需生成，不一次全建节点。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapterCount?: number;       // 生成几章（默认8章）
 *   instructions?: string;       // 额外指令（如"重点写比赛场面"）
 *   regenerateChapterIds?: string[]; // 重新生成指定章节的大纲
 * }
 *
 * 响应：
 * {
 *   chapters: [{ title, summary, coreConflict, characters }],
 *   rawOutline: "完整大纲原文"
 * }
 */
export async function POST(request: Request) {
  try {
    const {
      projectId,
      chapterCount = 8,
      instructions,
      regenerateChapterIds,
    } = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { characters: true, lorebookEntries: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const orchestrator = new AgentOrchestrator();

    // 构建 Prompt：要求输出结构化大纲
    const characterBriefs = (project.characters as any[])
      .map((c: any) => `[${c.name}] ${c.role} | ${(c.personality || []).join("、")}`)
      .join("\n");

    const regenerateHint = regenerateChapterIds?.length
      ? `\n特别注意：请重新生成第 ${regenerateChapterIds.join("、")} 章的大纲。${instructions || ""}`
      : "";

    const instructionText = instructions
      ? `\n额外要求：${instructions}`
      : "";

    const outlineText = await orchestrator.generateOutline(
      project as any,
      (project.characters || []) as any,
      (project.lorebookEntries || []) as any
    );

    // 用 LLM 再做一次结构化提取：从大纲原文中拆出每章的标题+梗概
    const structuredResponse = await fetch(
      `${process.env.LLM_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.LLM_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.ARCHITECT_MODEL || "deepseek-ai/DeepSeek-V4-Pro",
          messages: [
            {
              role: "system",
              content: `你是一个大纲结构化专家。将小说大纲原文拆解为每章的简要信息。
输出严格 JSON，格式：
{
  "chapters": [
    {
      "title": "章节标题（简短有力）",
      "summary": "本章梗概（2-3句话，不超过100字。写清楚：发生了什么、核心冲突是什么）",
      "coreConflict": "核心冲突（一句话）",
      "characters": ["出场角色名"]
    }
  ]
}
只输出 JSON，不要额外文字。每章 summary 必须简洁——只说关键情节，不展开细节。`,
            },
            {
              role: "user",
              content: `请将以下小说大纲拆解为${chapterCount}章的结构化大纲。${instructionText}${regenerateHint}

大纲原文：
${outlineText}`,
            },
          ],
          temperature: 0.4,
          max_tokens: 4096,
        }),
      }
    );

    let chapters: any[] = [];

    if (structuredResponse.ok) {
      const data = await structuredResponse.json();
      const content = data.choices?.[0]?.message?.content || "";
      try {
        let jsonStr = content.trim();
        if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
        if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
        if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
        const parsed = JSON.parse(jsonStr.trim());
        chapters = parsed.chapters || [];
      } catch {
        // 解析失败就回退到旧方法
        console.warn("结构化大纲解析失败，使用原文");
      }
    }

    // 如果结构化提取失败，从原文拆
    if (chapters.length === 0) {
      const chapterPattern = /第[一二三四五六七八九十百千\d]+章[：:]\s*(.+)/g;
      let match;
      const titles: string[] = [];
      while ((match = chapterPattern.exec(outlineText)) !== null) {
        titles.push(match[1] || match[0]);
      }
      chapters = titles.slice(0, chapterCount).map((t) => ({
        title: t.trim().slice(0, 50),
        summary: "",
        coreConflict: "",
        characters: [],
      }));
    }

    // 如果还是没有，创建默认
    if (chapters.length === 0) {
      chapters = [{ title: "第一章", summary: "故事开始", coreConflict: "", characters: [] }];
    }

    return NextResponse.json({
      chapters: chapters.slice(0, chapterCount),
      rawOutline: outlineText,
      totalGenerated: chapters.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "生成大纲失败" },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/generate/outline
 *
 * 把选中的大纲章节创建为 StoryNode。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapters: [{ title, summary, coreConflict, characters }]
 * }
 */
export async function PUT(request: Request) {
  try {
    const { projectId, chapters } = await request.json();

    if (!projectId || !chapters?.length) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 获取当前最大 order
    const lastNode = await prisma.storyNode.findFirst({
      where: { projectId },
      orderBy: { order: "desc" },
    });
    const startOrder = (lastNode?.order ?? -1) + 1;

    const nodes = [];
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const node = await prisma.storyNode.create({
        data: {
          projectId,
          parentId: null,
          type: "chapter",
          title: ch.title || `第${i + 1}章`,
          order: startOrder + i,
          status: "outline_only",
          outline: ch.summary || "",
          coreConflict: ch.coreConflict || null,
          activeCharacters: ch.characters || [],
        },
      });
      nodes.push(node);
    }

    return NextResponse.json({ nodes, count: nodes.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建章节失败" },
      { status: 500 }
    );
  }
}
