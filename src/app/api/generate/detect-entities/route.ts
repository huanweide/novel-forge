import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { createLLMClientFromSettings } from "@/core/llm/client";
import { getSettings } from "@/lib/llm";

/**
 * POST /api/generate/detect-entities
 *
 * v2: 分块扫描 + 三卡完整性检查（角色/世界/大纲一致性）
 *
 * - 文本自动分块（每块 12K 字符），逐块扫描合并
 * - maxTokens 16384，不截断 AI 输出
 * - 新增第三维：大纲偏离检测（角色 OOC 迹象、情节走向偏差）
 * - 模型：deepseek-ai/DeepSeek-V4-Flash
 *
 * 请求体：{ projectId: string; text: string; nodeId?: string }
 * 响应：{ newCharacters, newLore, outlineDrifts, stats }
 */
export async function POST(request: Request) {
  try {
    const { projectId, text, nodeId } = await request.json();

    if (!projectId || !text) {
      return NextResponse.json(
        { error: "缺少 projectId 或 text" },
        { status: 400 }
      );
    }

    const CHUNK_SIZE = 12000;
    const MAX_TOKENS = 16384;

    // 获取现有角色和词条列表
    const [existingCharacters, existingLore, currentNode] = await Promise.all([
      prisma.characterCard.findMany({
        where: { projectId },
        select: { name: true, aliases: true },
      }),
      prisma.lorebookEntry.findMany({
        where: { projectId },
        select: { title: true, keys: true },
      }),
      nodeId
        ? prisma.storyNode.findUnique({
            where: { id: nodeId },
            select: { outline: true, title: true },
          })
        : null,
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

    const client = await createLLMClientFromSettings();
    const settings = await getSettings();
    const model = settings.model;

    // ── 分块扫描 ──────────────────────────────────────

    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      chunks.push(text.slice(i, i + CHUNK_SIZE));
    }

    const allNewCharacters: Map<string, any> = new Map();
    const allNewLore: Map<string, any> = new Map();

    const DETECT_SYSTEM = `你是一个小说实体检测专家。阅读以下文本片段，找出其中出现的所有：
1. **角色**：有名字或明确身份的人物（包括配角、路人、龙套）
2. **地点/组织/特殊设定**：具体地名、组织名、特殊物品等

对每个实体，判断它是否"值得建卡"：
- 角色：有名字、有台词、或对剧情有影响 → 值得建卡
- 地点/设定：有具体描述、可能反复出现 → 值得建卡

输出严格 JSON 格式，不要任何额外文字。`;

    const knownNamesList = Array.from(knownNames).join("、");
    const knownLoreList = Array.from(knownLore).join("、");

    for (let ci = 0; ci < chunks.length; ci++) {
      const chunk = chunks[ci];

      try {
        const response = await client.chat({
          model,
          messages: [
            { role: "system", content: DETECT_SYSTEM },
            {
              role: "user",
              content: `已知角色（已建卡）：${knownNamesList}
已知世界书词条：${knownLoreList}

请扫描以下文本片段（第${ci + 1}/${chunks.length}块），找出【不在已知列表中】的新实体：

${chunk}

输出格式：
{
  "newCharacters": [
    {
      "name": "角色名",
      "evidence": "文中出现的片段",
      "suggestedRole": "protagonist|antagonist|supporting|mentor|love_interest|catalyst|background",
      "suggestedPersonality": ["性格1", "性格2"],
      "suggestedDialogue": "对话风格简述",
      "worthCreating": true
    }
  ],
  "newLore": [
    {
      "title": "词条名",
      "category": "geography|faction|magic_system|history|culture|creature|item|law|custom",
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
          maxTokens: MAX_TOKENS,
        });

        // 解析结果
        let parsed: any;
        try {
          let jsonStr = response.content.trim();
          if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
          if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
          if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
          parsed = JSON.parse(jsonStr.trim());
        } catch {
          // 单块解析失败不阻塞整体
          continue;
        }

        // 合并角色
        for (const c of parsed.newCharacters || []) {
          if (c.worthCreating === false) continue;
          const key = c.name?.toLowerCase().trim();
          if (!key || knownNames.has(key)) continue;
          if (allNewCharacters.has(key)) {
            // 合并 evidence
            const existing = allNewCharacters.get(key)!;
            if (c.evidence && !existing.evidence.includes(c.evidence)) {
              existing.evidence += "；" + c.evidence;
            }
          } else {
            allNewCharacters.set(key, c);
            knownNames.add(key); // 防止后续块重复
          }
        }

        // 合并世界书
        for (const l of parsed.newLore || []) {
          if (l.worthCreating === false) continue;
          const key = l.title?.toLowerCase().trim();
          if (!key || knownLore.has(key)) continue;
          if (!allNewLore.has(key)) {
            allNewLore.set(key, l);
            knownLore.add(key);
          }
        }
      } catch {
        // 单块调用失败不阻塞
        continue;
      }
    }

    const newCharacters = Array.from(allNewCharacters.values());
    const newLore = Array.from(allNewLore.values());

    // ── 第三维：大纲偏离检测 ──────────────────────────

    let outlineDrifts: any[] = [];

    if (currentNode?.outline && text.length > 100) {
      try {
        const driftResponse = await client.chat({
          model,
          messages: [
            {
              role: "system",
              content: `你是一个小说一致性检查专家。对照大纲检查已生成的正文，找出偏离之处。

检查维度：
1. **角色OOC**：角色的言行是否偏离了其人设？（如果有已知角色信息则对照）
2. **情节偏离**：正文是否偏离了大纲的预设走向？
3. **节奏问题**：是否该快的地方拖沓，该慢的地方一笔带过？
4. **视角一致**：叙事视角是否保持一致？

输出严格JSON：`,
            },
            {
              role: "user",
              content: `【本节大纲】
${currentNode.outline}

【已生成正文（尾部，用于检查）】
${text.slice(-5000)}

请检测是否存在上述问题。输出格式：
{
  "hasIssues": true/false,
  "drifts": [
    {
      "type": "ooc|plot_drift|pacing|pov_break",
      "severity": "critical|major|minor",
      "character": "角色名（如适用）",
      "description": "具体问题描述",
      "evidence": "正文中出问题的片段",
      "suggestion": "修改建议"
    }
  ],
  "summary": "一句话总结"
}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 4096,
        });

        try {
          let jsonStr = driftResponse.content.trim();
          if (jsonStr.startsWith("```json")) jsonStr = jsonStr.slice(7);
          if (jsonStr.startsWith("```")) jsonStr = jsonStr.slice(3);
          if (jsonStr.endsWith("```")) jsonStr = jsonStr.slice(0, -3);
          const parsed = JSON.parse(jsonStr.trim());
          outlineDrifts = parsed.drifts || [];
        } catch {
          outlineDrifts = [];
        }
      } catch {
        outlineDrifts = [];
      }
    }

    return NextResponse.json({
      newCharacters,
      newLore,
      outlineDrifts,
      stats: {
        textLength: text.length,
        chunksScanned: chunks.length,
        knownCharactersBefore: existingCharacters.length,
        knownLoreBefore: existingLore.length,
        newCharactersFound: newCharacters.length,
        newLoreFound: newLore.length,
        driftsFound: outlineDrifts.length,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "实体检测失败" },
      { status: 500 }
    );
  }
}
