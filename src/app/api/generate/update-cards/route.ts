/**
 * POST /api/generate/update-cards
 * 章节更新系统 —— AI 比对新内容与现有卡面，生成差异更新建议。
 */

export const maxDuration = 60;

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, chapterContent, chapterTitle = "", chapterNumber = "" } = body;

    if (!projectId || !chapterContent) {
      return NextResponse.json(
        { error: "缺少 projectId 或 chapterContent", details: "请确保当前节点已有正文内容" },
        { status: 400 }
      );
    }

    if (chapterContent.trim().length < 50) {
      return NextResponse.json(
        { error: "章节内容过短", details: "正文至少需要50字才能进行有效分析" },
        { status: 400 }
      );
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

    // 截取章节内容（最多 10000 字送分析）
    const contentSnippet = chapterContent.slice(0, 10000);

    // 构建 Prompt
    const systemPrompt = `你是小说编辑，每章结束后追踪故事变化。核心职责：区分"大事"与"小事"。

必须记录——大事（对角色/世界观有持久影响，会写入三卡供后续章节使用）：
✅ 获得/失去能力、技能升级
✅ 性格信念明显转变（从懦弱变勇敢、从天真变世故）
✅ 建立重要关系（师徒、恋人、宿敌、盟友）——标记relation关系类型
✅ 角色死亡/重伤/失踪
✅ 世界观重大揭露（力量体系的秘密、历史真相）——要标记category
✅ 人物弧光推进（成长/堕落/醒悟的关键时刻）
✅ 获得重要物品或身份

忽略——小事（没有持久影响，一个月后无意义）：
❌ 日常衣食住行、临时情绪波动
❌ 与路人NPC的短暂互动
❌ 普通战斗擦伤，天气/环境变化

判断标准：如果把这个变化写在角色卡/世界书上，一个月后再看还有意义吗？

重要：significance只标记high或medium。low的项目会被自动过滤不显示给用户。

输出纯 JSON，不要markdown代码块包裹。`;

    const chapterLabel = chapterNumber ? `第${chapterNumber}章` : "";
    const userPrompt = `【现有卡面——写本章之前的状态】
=== 角色卡 ===
${charSummary || "（无现有角色）"}

=== 世界书 ===
${loreSummary || "（无现有词条）"}

=== 风格卡 ===
${styleSummary}

【新章节内容${chapterLabel ? `——${chapterLabel}` : ""}】
${chapterTitle ? `标题：${chapterTitle}\n` : ""}
${contentSnippet}

【任务】
分析新章节的变化。只报告"大事"——有持久影响的才报。每个变化必须标注重要性。

输出 JSON：

{
  "characterUpdates": [
    {
      "name": "角色名",
      "characterId": "如果现有角色中有同名则填ID",
      "significance": "high/medium/low",
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
      "significance": "high/medium/low",
      "personality": {"dominant": "从本章言行推断"},
      "abilities": ["展现的能力"],
      "evidence": "出场片段"
    }
  ],
  "newLoreEntries": [
    {
      "title": "新设定名",
      "category": "geography/faction/magic_system/history/culture/creature/item/law/custom",
      "keys": ["触发关键词"],
      "content": "设定内容",
      "significance": "high/medium/low",
      "evidence": "文本依据"
    }
  ],
  "styleShift": {
    "detected": false,
    "description": "如果有明显文风变化描述之，无则填null"
  },
  "summary": "一句话概括本章的主要变化"
}

注意：
- significance 为 low 的项会被用户忽略，所以 trivial 的事干脆不要报
- changes 字段只填发生变化的部分，没变的省略
- 没变化不列入 characterUpdates
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
