/**
 * POST /api/generate/update-cards
 * 章节更新系统 —— AI 比对新内容与现有卡面，生成差异更新建议。
 */

export const maxDuration = 300;

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

    // 截取章节内容（最多 8000 字送分析）
    const contentSnippet = chapterContent.slice(0, 8000);

    // ── 角色智能过滤：只送章节中出现的角色 + 主角反派导师，不是全量 178 个 ──
    const contentLower = contentSnippet.toLowerCase();
    const mentionedChars = characters.filter((c) => {
      // 主角/反派/导师一定送
      if (["protagonist", "antagonist", "mentor"].includes(c.role)) return true;
      // 名字在章节内容中出现过的角色
      const nameLower = c.name.toLowerCase();
      if (contentLower.includes(nameLower)) return true;
      // 别名匹配
      return (c.aliases || []).some((a: string) => contentLower.includes(a.toLowerCase()));
    });
    // 限制最多 40 个角色，减少 LLM 处理时间
    const activeChars = mentionedChars.slice(0, 40);

    // 构建现有卡面摘要（只送活跃角色）
    const charSummary = activeChars.map((c) => {
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

🌍 世界观细节——即使不是"重大揭露"，以下也值得记录为新世界书词条：
✅ 比赛/竞技规则（赛制、计分方式、晋级条件、特殊规则）
✅ 战术体系/训练方法（具体的战术名称、训练模式、技术流派）
✅ 设施/地点（训练场、竞技场、特定建筑——只要有名字和特征）
✅ 组织/势力（队伍、俱乐部、赞助商、管理机构——只要有结构和目的）
✅ 物品/装备（特殊的训练器材、比赛用球、队服——只要有独特之处）
✅ 文化/惯例（球队传统、球迷习俗、更衣室规矩、赛前仪式）
✅ 媒体/舆论（解说员风格、报道角度、公众评价体系）
→ 即使看起来不"重大"，只要它让世界观更具体，就应该记录。category 选择最匹配的。

忽略——小事（没有持久影响，一个月后无意义）：
❌ 日常衣食住行、临时情绪波动
❌ 与路人NPC的短暂互动
❌ 普通比赛过程中的一次普通对抗

判断标准：如果把这个变化写在角色卡/世界书上，一个月后再看还有意义吗？

重要：significance只标记high或medium。low的项目会被自动过滤不显示给用户。

输出纯 JSON，不要markdown代码块包裹。`;

    const chapterLabel = chapterNumber ? `第${chapterNumber}章` : "";
    const userPrompt = `【现有卡面——写本章之前的状态（${activeChars.length}/${characters.length}个活跃角色）】
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
        "对话风格": "本章展现的说话特点——口头禅、语速、句式习惯、称呼方式",
        "外貌描述": "本章描写的外貌/穿着/体态新细节",
        "背景更新": "本章揭示的过往信息",
        "人物弧光推进": "本章中角色发生了怎样的信念动摇/成长/堕落",
        "性格信念转变": "角色核心价值观/信念的变化",
        "获得重要物品或身份": "新获得的物品或身份头衔"
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
      "title": "新设定名（简洁，见名知义）",
      "category": "geography(地点/设施)/faction(组织/势力/队伍)/magic_system(规则/战术体系)/history(历史)/culture(文化/惯例/传统)/creature(生物)/item(物品/装备)/law(规则/法则)/custom(自定义)",
      "keys": ["触发关键词——角色名、地点名、术语，用于后续章节自动匹配"],
      "content": "设定内容——写清楚是什么、怎么运作、为什么重要（2-5句）",
      "significance": "high/medium/low——high是主线核心设定，medium是值得记录的细节",
      "evidence": "文本依据——从本章哪段话推断出来的"
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

    let rawContent = "";
    try {
      const response = await client.chat({
        model: config.extractorModel || config.writerModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        maxTokens: 8192,
      });
      rawContent = response.content || "";
    } catch (llmErr) {
      console.error("LLM调用失败:", llmErr);
      return NextResponse.json({
        characterUpdates: [],
        newCharacters: [],
        newLoreEntries: [],
        styleShift: { detected: false },
        newForeshadowings: [],
        summary: `LLM调用失败：${llmErr instanceof Error ? llmErr.message.slice(0, 100) : "模型不可用，请稍后重试"}`,
        meta: { existingCharCount: characters.length, existingLoreCount: loreEntries.length, modelUsed: config.extractorModel || "unknown" },
      });
    }

    // 解析 —— 多层容错
    let result: Record<string, unknown> = {};
    try {
      let jsonStr = rawContent.trim();
      // 1. 尝试提取 markdown 代码块
      const md = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (md) jsonStr = md[1].trim();
      // 2. 尝试从第一个 { 到最后一个 } 截取
      if (!jsonStr.startsWith("{")) {
        const a = jsonStr.indexOf("{"), b = jsonStr.lastIndexOf("}");
        if (a >= 0 && b > a) jsonStr = jsonStr.slice(a, b + 1);
      }
      // 3. 尝试解析
      result = JSON.parse(jsonStr) as Record<string, unknown>;
    } catch {
      // 4. JSON 解析失败 → 返回空结果+原始文本给前端排查
      console.error("JSON解析失败，原始内容前500字:", rawContent.slice(0, 500));
      result = { parseError: true, raw: rawContent.slice(0, 800) };
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
