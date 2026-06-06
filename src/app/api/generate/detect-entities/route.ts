import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";

/**
 * POST /api/generate/detect-entities
 *
 * AI 实体检测 —— 扫描生成的文本，找出还没建卡的新角色/新地点/新组织。
 * 这是防止 OOC 的关键：写到的角色必须有卡面约束。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   text: string;       // 要扫描的文本
 * }
 *
 * 响应：
 * {
 *   newCharacters: [{ name, evidence, suggestedTraits, ... }],
 *   newLore: [{ title, category, evidence, suggestedContent, ... }]
 * }
 */
export async function POST(request: Request) {
  try {
    const { projectId, text } = await request.json();

    if (!projectId || !text) {
      return NextResponse.json(
        { error: "缺少 projectId 或 text" },
        { status: 400 }
      );
    }

    // 获取现有角色和词条列表
    const [existingCharacters, existingLore] = await Promise.all([
      prisma.characterCard.findMany({
        where: { projectId },
        select: { name: true, aliases: true },
      }),
      prisma.lorebookEntry.findMany({
        where: { projectId },
        select: { title: true, keys: true },
      }),
    ]);

    const knownNames = new Set<string>();
    for (const c of existingCharacters) {
      knownNames.add(c.name.toLowerCase());
      (c.aliases as string[])?.forEach((a) => knownNames.add(a.toLowerCase()));
    }

    const knownLore = new Set<string>();
    for (const l of existingLore) {
      knownLore.add(l.title.toLowerCase());
      (l.keys as string[])?.forEach((k) => knownLore.add(k.toLowerCase()));
    }

    // AI 检测新实体
    const client = getDefaultClient();
    const config = getDefaultLLMConfig();

    const response = await client.chat({
      model: config.summarizeModel || config.architectModel,
      messages: [
        {
          role: "system",
          content: `你是一个小说实体检测专家。阅读以下文本，找出其中出现的所有：
1. **角色**：有名字或明确身份的人物（包括配角、路人）
2. **地点/组织/特殊设定**：具体地名、组织名、特殊物品等

对每个实体，判断它是否"值得建卡"：
- 角色：有名字、有台词、或对剧情有影响 → 值得建卡
- 地点/设定：有具体描述、可能反复出现 → 值得建卡

输出严格 JSON 格式，不要任何额外文字。`,
        },
        {
          role: "user",
          content: `已知角色（已建卡）：${Array.from(knownNames).join("、")}
已知世界书词条：${Array.from(knownLore).join("、")}

请扫描以下文本，找出【不在已知列表中】的新实体：

${text.slice(0, 8000)}

输出格式：
{
  "newCharacters": [
    {
      "name": "角色名",
      "evidence": "文中出现的片段",
      "suggestedRole": "protagonist|antagonist|supporting|mentor|background",
      "suggestedPersonality": ["性格1", "性格2"],
      "suggestedDialogue": "对话风格简述",
      "worthCreating": true
    }
  ],
  "newLore": [
    {
      "title": "词条名",
      "category": "geography|faction|magic_system|history|culture|item|custom",
      "evidence": "文中出现的片段",
      "suggestedKeys": ["触发词1", "触发词2"],
      "suggestedContent": "根据文本推断的设定内容",
      "worthCreating": true
    }
  ]
}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 4096,
    });

    // 解析结果
    let parsed;
    try {
      let jsonStr = response.content.trim();
      if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
      if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
      parsed = JSON.parse(jsonStr.trim());
    } catch {
      return NextResponse.json({
        newCharacters: [],
        newLore: [],
        rawResponse: response.content,
        error: "解析 AI 返回失败",
      });
    }

    // 过滤掉不值得建卡的
    const newCharacters = (parsed.newCharacters || []).filter(
      (c: any) => c.worthCreating !== false
    );
    const newLore = (parsed.newLore || []).filter(
      (l: any) => l.worthCreating !== false
    );

    return NextResponse.json({
      newCharacters,
      newLore,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "实体检测失败" },
      { status: 500 }
    );
  }
}
