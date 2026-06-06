/**
 * POST /api/generate/update-cards
 *
 * 章节更新系统 —— 写完整章后，AI 比对新内容与现有卡面，生成差异更新建议。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   chapterContent: string;    // 刚完成的章节正文
 *   chapterTitle?: string;
 * }
 *
 * 响应：
 * {
 *   characterUpdates: [{ characterId?, name, fields: { 位置→, 情绪→, 能力+, 新关系, ... } }],
 *   newLoreEntries: [{ title, category, keys, content, evidence }],
 *   styleShift?: { old, new, description },
 *   newForeshadowings: [{ description, relatedCharacter?, relatedLore? }]
 * }
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, chapterContent, chapterTitle = "" } = body;

    if (!projectId || !chapterContent) {
      return NextResponse.json({ error: "缺少 projectId 或 chapterContent" }, { status: 400 });
    }

    // 加载现有数据
    const [project, characters, loreEntries, styleCard] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
      prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
    ]);

    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    // 构建现有卡面摘要（省 Token）
    const charSummary = characters.map((c) => {
      const personality = (typeof c.personality === "object" && c.personality !== null)
        ? c.personality : {};
      const pObj = personality as Record<string, unknown>;
      const dominant = typeof pObj.dominant === "string" ? pObj.dominant
        : Array.isArray(c.personality) ? (c.personality as string[]).slice(0, 2).join("、")
        : "未知";
      return `[${c.name}] 角色=${c.role} | 性格=${dominant} | 能力=${(c.abilities || []).slice(0, 3).join("、")} | 状态=${c.currentStatus} | 背景=${c.background?.slice(0, 60)}`;
    }).join("\n");

    const loreSummary = loreEntries.map((l) =>
      `[${l.title}] 分类=${l.category} | ${l.content?.slice(0, 80)}`
    ).join("\n");

    const styleSummary = styleCard
      ? `POV=${styleCard.povType} | 对话占比=${(styleCard.dialogueRatio * 100).toFixed(0)}% | 描写密度=${(styleCard.descriptionRatio * 100).toFixed(0)}% | 文风=${styleCard.styleDescription?.slice(0, 60)}`
      : "（未设定）";

    // 截取章节内容（最多 8000 字送分析）
    const contentSnippet = chapterContent.slice(0, 8000);

    // 构建 Prompt
    const systemPrompt = `你是一位小说编辑，负责在每章写完后追踪故事的变化。你的任务是比对"现有卡面"和"新章节"，找出需要更新的地方。

核心原则：
1. 只报告真正发生变化的内容——状态改变、新能力展现、新关系建立、新地点/规则出现
2. 没变化的不要报告
3. 推断必须有文本依据，不确定的标注"（推断）"

输出纯 JSON。`;

    const userPrompt = `【现有卡面——写本章之前的状态】
=== 角色卡 ===
${charSummary || "（无现有角色）"}

=== 世界书 ===
${loreSummary || "（无现有词条）"}

=== 风格卡 ===
${styleSummary}

【新章节内容】
${chapterTitle ? `标题：${chapterTitle}\n` : ""}
${contentSnippet}

【任务】
分析新章节中发生了哪些变化。输出 JSON：

{
  "characterUpdates": [
    {
      "name": "角色名",
      "characterId": "如果现有角色中有同名则填ID，否则留空",
      "isNew": false,
      "changes": {
        "位置": "现在的所在地",
        "情绪": "当前情绪状态",
        "新能力": ["本章展现的新能力"],
        "状态变化": "alive/dead/missing等",
        "新关系": [{"targetName": "对象名", "relation": "关系", "evidence": "文本依据"}],
        "背景更新": "本章揭示的过往信息",
        "人物弧光推进": "本章中角色发生了怎样的信念动摇/成长/堕落"
      }
    }
  ],
  "newCharacters": [
    {
      "name": "新角色名",
      "role": "推断角色定位",
      "personality": {"dominant": "从本章言行推断"},
      "abilities": ["展现的能力"],
      "evidence": "首次出场的文本片段"
    }
  ],
  "newLoreEntries": [
    {
      "title": "新设定名",
      "category": "geography/faction/magic_system/history/culture/creature/item/law/custom",
      "keys": ["触发关键词"],
      "content": "设定内容",
      "evidence": "文本依据"
    }
  ],
  "styleShift": {
    "detected": false,
    "description": "如果文风有变化，描述具体变化。没变化填 null"
  },
  "newForeshadowings": [
    {
      "description": "新埋下的伏笔或未解线索",
      "relatedCharacters": ["相关角色名"],
      "suggestedPayoff": "建议回收方式"
    }
  ],
  "summary": "一句话概括本章的主要变化"
}

注意：
- characterUpdates 中的 changes 字段只填发生变化的部分，没变的省略
- 如果某角色本章没有变化，不列入 characterUpdates
- newCharacters 是新出场的、现有角色卡中没有的角色
- 所有推断标注文本依据`;

    // 调用 LLM
    const config = getDefaultLLMConfig();
    const client = getDefaultClient();

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 8192,
    });

    // 解析
    let result: Record<string, unknown> = {};
    try {
      let jsonStr = response.content.trim();
      const md = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (md) jsonStr = md[1].trim();
      result = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      result = { parseError: true, raw: response.content.slice(0, 500) };
    }

    // 匹配现有角色 ID
    const charUpdates = (Array.isArray(result.characterUpdates) ? result.characterUpdates : []) as Record<string, unknown>[];
    for (const update of charUpdates) {
      if (!update.characterId) {
        const name = String(update.name || "").toLowerCase();
        const matched = characters.find((c) =>
          c.name.toLowerCase() === name || c.aliases.some((a) => a.toLowerCase() === name)
        );
        if (matched) update.characterId = matched.id;
      }
    }

    return NextResponse.json({
      characterUpdates: charUpdates,
      newCharacters: result.newCharacters || [],
      newLoreEntries: result.newLoreEntries || [],
      styleShift: result.styleShift || { detected: false },
      newForeshadowings: result.newForeshadowings || [],
      summary: result.summary || "",
      meta: {
        existingCharCount: characters.length,
        existingLoreCount: loreEntries.length,
        hasStyleCard: !!styleCard,
        modelUsed: config.extractorModel || config.writerModel,
      },
    });
  } catch (err) {
    console.error("更新分析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新分析失败" },
      { status: 500 }
    );
  }
}
