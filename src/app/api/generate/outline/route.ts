import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { safeJoin } from "@/lib/utils";
import { getActiveRules, injectRules } from "@/core/rules";
import { getSettings } from "@/lib/llm";

export const maxDuration = 300;

/**
 * POST /api/generate/outline
 *
 * 硅基流动 DeepSeek V4 Pro 生成章纲。
 * 全量角色+世界书送入，不省 token。
 * 返回预览，确认后才由 PUT 写入。
 */
export async function POST(request: Request) {
  try {
    const {
      projectId,
      chapterCount = 8,
      customPrompt,
      useFlash = false,
      confirmedCardIds,
      cardNotes,
      newCharacterRequests,
    } = await request.json();

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { characters: true, lorebookEntries: true, styleCards: true },
    });

    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // ── 自建用户要求的角色 ──
    const allChars = [...(project.characters || [])] as any[];
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
              personality: { dominant: "大纲生成时自建，待丰富" } as any,
              background: `[大纲生成] 用户要求自建角色`,
              abilities: [],
              tags: ["🆕 大纲自建"],
              currentStatus: "alive",
            } as any,
          });
          allChars.push(created as any);
        }
      }
    }

    // ── 过滤角色——如果用户确认了卡列表 ──
    let activeChars = allChars;
    if (Array.isArray(confirmedCardIds) && confirmedCardIds.length > 0) {
      const confirmedSet = new Set(confirmedCardIds as string[]);
      activeChars = allChars.filter((c: any) => confirmedSet.has(c.id));
    }

    // ── 全量角色（每人一行，不砍）──
    const characterBriefs = activeChars
      .map((c: any) => {
        const p = typeof c.personality === "object" && !Array.isArray(c.personality)
          ? (c.personality as Record<string, unknown>).dominant || ""
          : Array.isArray(c.personality) ? (c.personality as string[]).slice(0, 2).join("、") : "";
        const role = c.role || "supporting";
        const status = c.currentStatus === "alive" ? "" : `[${c.currentStatus}]`;
        return `[${c.name}] ${role}${status} ${p}`.trim();
      })
      .join("\n");

    // ── 全量世界书词条 ──
    const loreEntries = (project.lorebookEntries || []) as any[];
    const loreBriefs = loreEntries
      .map((l: any) => `[${l.title}](${l.category}) ${(l.content || "").slice(0, 120)}`)
      .join("\n");

    // ── 宝宝流·剧情推进=记忆召回（增量注入）──
    // 根据当前上下文（总纲+基调+提示词）匹配世界书绿灯关键词，召回应注入的记忆片段。
    // 注：大纲阶段尚无章节正文，结构化表格召回主要在章节写作时生效；此处先注入世界书命中项。
    let recallText = "";
    try {
      const { recallContext } = await import("@/core/babylore/recall");
      const recallItems = recallContext(
        `${project.synopsis}\n${project.toneKeywords.join("、")}\n${customPrompt || ""}`,
        loreEntries as any,
        [],
      );
      if (recallItems.length > 0) {
        recallText =
          "\n【记忆召回·精准注入】\n" +
          recallItems.map((it) => `[${it.title}] ${it.content}`).join("\n");
      }
    } catch { /* 召回失败不影响大纲主流程 */ }

    // ── 文风 ──
    const styleCards = (project.styleCards || []) as any[];
    const llmConfig = (project.llmConfig || {}) as Record<string, unknown>;
    let styleText = "";
    if (styleCards.length > 0) {
      const s = styleCards[0];
      styleText = [
        `文风：${s.styleDescription || ""}`,
        `视角：${s.povType || "third_person_limited"}`,
        `句长：${s.avgSentenceLength || 25}字`,
        `对话${Math.round((s.dialogueRatio || 0.35) * 100)}% 描写${Math.round((s.descriptionRatio || 0.25) * 100)}% 动作${Math.round((s.actionRatio || 0.25) * 100)}%`,
      ].join(" · ");
    }
    if (llmConfig.customStyleNotes) {
      styleText += "\n" + String(llmConfig.customStyleNotes).slice(0, 300);
    }

    // ── 从全局设置读取 LLM 配置 ──
    const settings = await getSettings();
    const baseURL = settings.baseUrl;
    const apiKey = settings.apiKey;
    const model = settings.model;
    const hasCustomPrompt = customPrompt && customPrompt.trim().length > 0;
    const shouldUseFlash = useFlash || hasCustomPrompt;

    // ── 中文数字 ──
    const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];
    const cn = (n: number) => {
      if (n <= 12) return digits[n];
      if (n < 20) return "十" + digits[n - 10];
      if (n % 10 === 0) return digits[n / 10] + "十";
      return digits[Math.floor(n / 10)] + "十" + digits[n % 10];
    };

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

    const charCountNote = Array.isArray(confirmedCardIds) && confirmedCardIds.length > 0
      ? `\n【角色出场策略】用户已确认以下${activeChars.length}个角色为全故事主要角色。每章大纲的characters字段应从这些角色中选择，不要引入名单外的角色。如需引入新角色，在rawOutline中说明理由。`
      : "";

    // ── Rules 系统注入 ──
    const outlineRules = await getActiveRules(projectId, "outline_only");
    const finalDirective = injectRules(cardNotesText || "", outlineRules);

    // ── Prompt ──
    const systemPrompt = hasCustomPrompt
      ? `你是小说大纲拆解专家。严格按照用户提示词将大纲拆为${chapterCount}章。每章标注出场角色。输出纯JSON：
{"chapters":[{"title":"第X章：标题（8-15字）","summary":"梗概（2-3句，≤100字）","coreConflict":"核心冲突","characters":["出场角色"]}],"rawOutline":"总览≤200字"}`
      : `你是小说大纲拆解专家。基于作品设定将总纲拆为${chapterCount}章详细大纲。每章标注出场角色。输出纯JSON：
{"chapters":[{"title":"第X章：标题（8-15字）","summary":"梗概（2-3句，≤100字）","coreConflict":"核心冲突","characters":["出场角色"]}],"rawOutline":"总览≤200字"}`;

    const userPrompt = hasCustomPrompt
      ? `【用户提示词——最高优先级】
${customPrompt}

【作品背景】
${project.name} · ${project.genre.join("、")}
总纲：${project.synopsis}
基调：${project.toneKeywords.join("、")}
${styleText}

【全量角色（${activeChars.length}人）】
${characterBriefs}

【世界观（${loreEntries.length}条）】
${loreBriefs}
${finalDirective}${charCountNote}

按用户提示词生成${chapterCount}章大纲。只输出JSON。`
      : `【作品设定】
${project.name} · ${project.genre.join("、")} · 目标${project.targetWordCount.toLocaleString()}字
总纲：${project.synopsis}
基调：${project.toneKeywords.join("、")}
${styleText}

【全量角色（${activeChars.length}人）】
${characterBriefs}

【世界观（${loreEntries.length}条）】
${loreBriefs}
${finalDirective}${charCountNote}

生成${chapterCount}章大纲，从"第一章"开始顺序编号。只输出JSON。`;

    // ── 调用硅基流动 ──
    const url = baseURL.endsWith("/v1") ? `${baseURL}/chat/completions` : `${baseURL}/v1/chat/completions`;

    let structuredContent = "";
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
          temperature: hasCustomPrompt ? 0.7 : 0.4,
          max_tokens: 16384,
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
      structuredContent = data.choices?.[0]?.message?.content || "";
    } catch (err) {
      return NextResponse.json(
        { error: `调用失败：${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    if (!structuredContent || structuredContent.length < 20) {
      return NextResponse.json(
        { error: "模型返回空内容，请重试" },
        { status: 502 }
      );
    }

    // ── 解析 JSON ──
    let chapters: any[] = [];
    let rawOutline = "";

    try {
      let jsonStr = structuredContent.trim();
      const md = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (md) jsonStr = md[1].trim();
      else {
        const a = jsonStr.indexOf("{"), b = jsonStr.lastIndexOf("}");
        if (a >= 0 && b > a) jsonStr = jsonStr.slice(a, b + 1);
      }
      const parsed = JSON.parse(jsonStr);
      chapters = parsed.chapters || [];
      rawOutline = parsed.rawOutline || "";
    } catch {
      // 正则回退
      const re = /第[一二三四五六七八九十百千\d]+章[：:]\s*(.+)/g;
      let m;
      while ((m = re.exec(structuredContent)) !== null) {
        chapters.push({ title: m[0].trim(), summary: "", coreConflict: "", characters: [] });
      }
      rawOutline = structuredContent.slice(0, 500);
    }

    // ── 兜底 ──
    if (chapters.length === 0) {
      chapters = Array.from({ length: chapterCount }, (_, i) => ({
        title: `第${cn(i + 1)}章`,
        summary: "故事继续推进",
        coreConflict: "",
        characters: [],
      }));
    }

    // ── 标题规范化：确保从"第一章"开始 ──
    chapters = chapters.slice(0, chapterCount).map((ch: any, i: number) => {
      const rawTitle = (ch.title || `第${cn(i + 1)}章`).replace(/^第[^章]*章[：:]?\s*/, "");
      return {
        title: `第${cn(i + 1)}章：${rawTitle}`,
        summary: ch.summary || "",
        coreConflict: ch.coreConflict || "",
        characters: ch.characters || [],
      };
    });

    return NextResponse.json({
      chapters,
      rawOutline: rawOutline || structuredContent.slice(0, 500),
      totalGenerated: chapters.length,
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
 * PUT /api/generate/outline —— 确认后写入 StoryNode
 */
export async function PUT(request: Request) {
  try {
    const { projectId, chapters, replaceAll = true } = await request.json();

    if (!projectId || !chapters?.length) {
      return NextResponse.json({ error: "缺少参数" }, { status: 400 });
    }

    if (replaceAll) {
      const oldRootNodes = await prisma.storyNode.findMany({
        where: { projectId, parentId: null, type: { not: "volume" } },
      });
      if (oldRootNodes.length > 0) {
        await prisma.storyNode.deleteMany({
          where: { id: { in: oldRootNodes.map((n) => n.id) } },
        });
      }
    }

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
