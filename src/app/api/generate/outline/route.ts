import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { AgentOrchestrator } from "@/core/agents";
import { safeJoin } from "@/lib/utils";

export const maxDuration = 120;

/**
 * POST /api/generate/outline
 *
 * 生成小说大纲——返回预览，不写入DB。确认后由 PUT 写入。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapterCount?: number;       // 4 / 8 / 12 / 自定义 (默认8)
 *   customPrompt?: string;       // 用户自定义提示词（非空则走 V4 Flash）
 *   useFlash?: boolean;          // 是否用 Flash 模型
 * }
 *
 * 响应：
 * {
 *   chapters: [{ title, summary, coreConflict, characters }],
 *   rawOutline: "完整大纲原文",
 *   modelUsed: "v4-pro" | "v4-flash"
 * }
 */
export async function POST(request: Request) {
  try {
    const {
      projectId,
      chapterCount = 8,
      customPrompt,
      useFlash = false,
    } = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { characters: true, lorebookEntries: true, styleCards: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 构建角色/世界书摘要
    // 精简角色摘要（前30个主角/反派/导师，避免 prompt 炸）
    const allChars = (project.characters || []) as any[];
    const priorityRoles = ["protagonist", "antagonist", "mentor", "love_interest"];
    const priorityChars = allChars.filter((c: any) => priorityRoles.includes(c.role));
    const otherChars = allChars.filter((c: any) => !priorityRoles.includes(c.role));
    const slimChars = [...priorityChars, ...otherChars].slice(0, 30);
    const characterBriefs = slimChars
      .map((c: any) => `[${c.name}] ${c.role} | ${safeJoin(c.personality)}`)
      .join("\n");

    const loreEntries = (project.lorebookEntries || []) as any[];

    // 构建文风描述
    const styleCards = (project.styleCards || []) as any[];
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    let styleText = "";
    if (styleCards.length > 0) {
      const s = styleCards[0];
      styleText = `【文风设定】
- 平均句长：${s.avgSentenceLength || 25}字（短句<15字占${Math.round((s.shortSentenceRatio || 0.3) * 100)}%，长句>40字占${Math.round((s.longSentenceRatio || 0.15) * 100)}%）
- 对话占比：${Math.round((s.dialogueRatio || 0.35) * 100)}%，描写：${Math.round((s.descriptionRatio || 0.25) * 100)}%，动作：${Math.round((s.actionRatio || 0.25) * 100)}%
- 视角：${s.povType || "第三人称限知"}，叙事距离：${s.narrativeDistance || "中等"}`
        + (s.styleDescription ? `\n- 风格说明：${s.styleDescription}` : "");
    }
    if (llmConfig.customStyleNotes) {
      styleText += `\n- 自定义风格：${llmConfig.customStyleNotes}`;
    }

    // ═══════════════════════════════════════════════
    // 模型选择 —— 自动检测 Provider 命名约定
    // ═══════════════════════════════════════════════

    const baseURL = (process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1");
    const apiKey = process.env.LLM_API_KEY || "";
    // 检测 API 提供商 → 选择正确的模型命名
    const isDeepSeekOfficial = baseURL.includes("api.deepseek.com");
    const PRO_MODEL = isDeepSeekOfficial ? "deepseek-v4-pro" : "deepseek-ai/DeepSeek-V4-Pro";
    const FLASH_MODEL = isDeepSeekOfficial ? "deepseek-v4-flash" : "deepseek-ai/DeepSeek-V4-Flash";

    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;
    const shouldUseFlash = useFlash || hasCustomPrompt;
    // 环境变量优先，否则用自动检测的命名
    const model = shouldUseFlash
      ? (process.env.FLASH_MODEL || process.env.EXTRACTOR_MODEL || FLASH_MODEL)
      : (process.env.ARCHITECT_MODEL || process.env.WRITER_MODEL || PRO_MODEL);

    let chapters: any[] = [];
    let rawOutline = "";

    // ── 构建 Prompt ──

    const chineseNumbers = Array.from({ length: chapterCount }, (_, i) => {
      const n = i + 1;
      // 简单中文数字（章节标题用）
      const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
      if (n <= 12) return digits[n];
      if (n < 20) return "十" + digits[n - 10];
      if (n % 10 === 0) return digits[n / 10] + "十";
      return digits[Math.floor(n / 10)] + "十" + digits[n % 10];
    });

    const systemPrompt = hasCustomPrompt
      ? `你是小说大纲拆解专家。用户提供了具体提示词，请严格按照提示词的要求，将小说大纲拆解为${chapterCount}章。
输出严格 JSON：
{
  "chapters": [
    {
      "title": "第X章：标题（简短有力，8-15字）",
      "summary": "本章梗概（2-3句话，不超过100字。写清楚发生了什么、核心冲突是什么）",
      "coreConflict": "核心冲突（一句话）",
      "characters": ["出场角色名"]
    }
  ],
  "rawOutline": "生成的大纲总览（200字以内）"
}
只输出 JSON，不要额外文字。`
      : `你是小说大纲拆解专家。根据作品的类型、基调、角色设定和世界观，将主线总纲拆解为${chapterCount}章的详细大纲。
输出严格 JSON：
{
  "chapters": [
    {
      "title": "第X章：标题（简短有力，8-15字）",
      "summary": "本章梗概（2-3句话，不超过100字。写清楚发生了什么、核心冲突是什么）",
      "coreConflict": "核心冲突（一句话）",
      "characters": ["出场角色名"]
    }
  ],
  "rawOutline": "生成的大纲总览（200字以内）"
}
只输出 JSON，不要额外文字。`;

    const userPrompt = hasCustomPrompt
      ? `【用户提示词——最高优先级，据此生成章纲】
${customPrompt}

【小说背景——作为补充参考】
作品名：${project.name}
类型：${project.genre.join("、")}
总纲：${project.synopsis}
基调：${project.toneKeywords.join("、")}
${styleText}

【已有角色（共${allChars.length}人，展示${slimChars.length}位核心角色）】
${characterBriefs}

【世界观词条（${(project.lorebookEntries || []).length}条）】
${loreEntries.map((l: any) => `[${l.title}] ${l.content?.slice(0, 80)}`).join("\n")}

请优先按照用户提示词的指示生成${chapterCount}章大纲。输出 JSON。`
      : `【小说设定】
作品名：${project.name}
类型：${project.genre.join("、")}
目标字数：${project.targetWordCount.toLocaleString()}字
主线总纲：${project.synopsis}
基调：${project.toneKeywords.join("、")}
${styleText}

【角色设定（共${allChars.length}人，展示${slimChars.length}位核心）】
${characterBriefs}

【世界观设定（${(project.lorebookEntries || []).length}条）】
${loreEntries.map((l: any) => `[${l.title}] ${l.content?.slice(0, 80)}`).join("\n")}

请基于上述设定生成${chapterCount}章大纲。从"第一章"开始，按剧情推进自然编号。输出 JSON。`;

    // ── 调用 LLM ──

    let structuredContent = "";

    try {
      const url = baseURL.endsWith("/v1") ? `${baseURL}/chat/completions` : `${baseURL}/v1/chat/completions`;
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
          temperature: hasCustomPrompt ? 0.7 : 0.4,
          max_tokens: 8192,
          stream: false,
        }),
      });

      if (!llmRes.ok) {
        const err = await llmRes.text().catch(() => "");
        return NextResponse.json(
          { error: `LLM API ${llmRes.status}: ${err.slice(0, 200)}` },
          { status: 502 }
        );
      }

      const data = await llmRes.json();
      structuredContent = data.choices?.[0]?.message?.content || "";
    } catch (err) {
      return NextResponse.json(
        { error: `模型调用失败：${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    // ── 解析 JSON 响应 ──

    try {
      let jsonStr = structuredContent.trim();
      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
      const parsed = JSON.parse(jsonStr.trim());
      chapters = parsed.chapters || [];
      rawOutline = parsed.rawOutline || "";

      // 确保标题从"第一章"开始，按顺序编号
      if (chapters.length > 0) {
        chapters = chapters.map((ch: any, i: number) => {
          const cn = chineseNumbers[i];
          const rawTitle = (ch.title || `第${cn}章`).replace(/^第[^章]*章[：:]?\s*/, "");
          return {
            title: `第${cn}章：${rawTitle}`,
            summary: ch.summary || "",
            coreConflict: ch.coreConflict || "",
            characters: ch.characters || [],
          };
        });
      }
    } catch {
      // JSON 解析失败 → 用正则从原文拆
      console.warn("结构化大纲解析失败，使用正则回退");
      const chapterPattern = /第[一二三四五六七八九十百千\d]+章[：:]\s*(.+)/g;
      let match;
      const titles: string[] = [];
      while ((match = chapterPattern.exec(structuredContent)) !== null) {
        titles.push(match[1] || match[0]);
      }
      chapters = titles.slice(0, chapterCount).map((t, i) => ({
        title: `第${chineseNumbers[i]}章：${t.trim().slice(0, 50)}`,
        summary: "",
        coreConflict: "",
        characters: [],
      }));
      rawOutline = structuredContent.slice(0, 500);
    }

    // ── 兜底：如果解析结果为空 ──
    if (chapters.length === 0) {
      chapters = Array.from({ length: chapterCount }, (_, i) => ({
        title: `第${chineseNumbers[i]}章`,
        summary: "故事继续推进",
        coreConflict: "",
        characters: [],
      }));
      rawOutline = structuredContent.slice(0, 500);
    }

    return NextResponse.json({
      chapters: chapters.slice(0, chapterCount),
      rawOutline: rawOutline || structuredContent.slice(0, 500),
      totalGenerated: Math.min(chapters.length, chapterCount),
      modelUsed: shouldUseFlash ? "v4-flash" : "v4-pro",
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
 * 用户确认后将章节写入 StoryNode。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapters: [{ title, summary, coreConflict, characters }];
 *   replaceAll?: boolean;     // 是否替换所有已有大纲节点（默认 true）
 * }
 */
export async function PUT(request: Request) {
  try {
    const { projectId, chapters, replaceAll = true } = await request.json();

    if (!projectId || !chapters?.length) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    // 可选：删除旧大纲节点（仅删除 root 级别章节，保留子节点）
    if (replaceAll) {
      const oldRootNodes = await prisma.storyNode.findMany({
        where: { projectId, parentId: null, type: { not: "volume" } },
      });
      if (oldRootNodes.length > 0) {
        // 级联删除旧节点（Prisma 会因 onDelete: Cascade 自动删子节点）
        await prisma.storyNode.deleteMany({
          where: { id: { in: oldRootNodes.map((n) => n.id) } },
        });
      }
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
