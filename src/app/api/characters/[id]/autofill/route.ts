/**
 * POST /api/characters/[id]/autofill
 *
 * AI 自动补全角色卡空白字段。
 * 检查哪些字段为空/默认值，调用 LLM 根据角色名+已有数据+项目上下文补全。
 *
 * Response: { filled: string[], character: CharacterCard }
 */
import { jsonError } from "@/lib/api-error";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export const maxDuration = 60;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const character = await prisma.characterCard.findUnique({
      where: { id },
      include: { project: { select: { globalPrompt: true, synopsis: true, genre: true } } },
    });
    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }

    // 检查哪些字段需要补全
    const emptyFields = detectEmptyFields(character);
    if (emptyFields.length === 0) {
      return NextResponse.json({
        filled: [] as string[],
        character,
        message: "所有字段已填写完整",
      });
    }

    // 构建补全 prompt
    const prompt = buildAutofillPrompt(character, emptyFields);

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const model = config.writerModel;

    const response = await client.chat({
      model,
      messages: [
        {
          role: "system",
          content:
            "你是一位专业小说角色设计师。根据角色名和已有信息，补全缺失字段。只返回JSON，不要其他文字。所有内容必须原创，符合中文小说风格。",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      maxTokens: 2048,
    });

    const rawContent = response.content || "";
    const filledData = parseAutofillResponse(rawContent, emptyFields);

    // 合并到现有数据
    const updateData = buildUpdateData(character, filledData, emptyFields);

    // 更新数据库
    await prisma.characterCard.update({
      where: { id },
      data: updateData as any,
    });

    syncGlobalPrompt(character.projectId).catch(() => {});

    const updated = await prisma.characterCard.findUnique({ where: { id } });

    return NextResponse.json({
      filled: emptyFields,
      character: updated,
      message: `已补全 ${emptyFields.length} 个字段: ${emptyFields.join("、")}`,
    });
  } catch (err: any) {
    console.error("[autofill] 补全失败:", err);
    return jsonError(err);
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

interface CharacterLike {
  name: string;
  age: string;
  gender: string;
  role: string;
  background: string;
  abilities: string[];
  personality: any;
  appearance: any;
  dialogueStyle: any;
  aliases: string[];
  hiddenMotives: string[];
  arcProgress: string;
  project?: { globalPrompt?: string; synopsis?: string; genre?: string[] };
}

function detectEmptyFields(c: CharacterLike): string[] {
  const empty: string[] = [];

  if (!c.age || c.age === "未知") empty.push("age");
  if (!c.gender || c.gender === "未知") empty.push("gender");
  if (!c.background || c.background.length < 20) empty.push("background");
  if (!c.abilities || c.abilities.length === 0) empty.push("abilities");
  if (!c.hiddenMotives || c.hiddenMotives.length === 0) empty.push("hiddenMotives");
  if (!c.arcProgress || c.arcProgress.length < 10) empty.push("arcProgress");
  if (!c.aliases || c.aliases.length === 0) empty.push("aliases");

  // 外貌
  const app = (c.appearance || {}) as Record<string, unknown>;
  if (!app.hair && !app.eyes && !app.height && !app.build && !app.features) {
    empty.push("appearance");
  }

  // 性格
  const pers = c.personality;
  const hasPersonality =
    pers &&
    (Array.isArray(pers) ? pers.length > 0 : typeof pers === "object" && Object.keys(pers as object).length > 0);
  if (!hasPersonality) empty.push("personality");

  // 对话风格
  const ds = (c.dialogueStyle || {}) as Record<string, unknown>;
  if (!ds.description && !ds.examples) empty.push("dialogueStyle");

  return empty;
}

function buildAutofillPrompt(c: CharacterLike, emptyFields: string[]): string {
  const fieldDescriptions: Record<string, string> = {
    age: "年龄（如：25岁、外表18岁实际300岁）",
    gender: "性别（男/女/无/其他）",
    background: `角色背景（4-8句话，包含：1)所在位置与境遇 2)当前短期目标 3)长期欲望 4)所持资源与限制 5)卷入核心事件的方式）。角色名：${c.name}，定位：${c.role}`,
    abilities: "能力/技能列表（3-8项，逗号分隔，符合角色定位和世界观）",
    hiddenMotives: "隐藏动机列表（1-3项，角色不为人知的真实目的）",
    arcProgress: "人物弧光预登记（1-2句话，信念动摇触发点+蜕变方向）",
    aliases: "别名/称号列表（1-3个，逗号分隔）",
    appearance: "外貌描述JSON：{hair:发型发色, eyes:眼睛特征, height:身高, build:体型, features:特殊印记, attire:标志性着装}",
    personality: "性格详析JSON：{dominant:主导性格, drive:核心驱动, contradiction:内在矛盾, habits:[习惯1,习惯2], socialMask:社交面具}",
    dialogueStyle: "对话风格JSON：{description:风格描述(1句), examples:[典型台词1,台词2], vocabulary:[用词特点], speechPatterns:[句式模式]}",
  };

  const fieldsToFill = emptyFields.map((f) => `- ${f}: ${fieldDescriptions[f] || f}`).join("\n");

  return `请为以下小说角色补全缺失信息。

【角色基本信息】
- 姓名：${c.name}
- 角色定位：${c.role || "supporting"}
- 已有年龄：${c.age || "未知"}
- 已有性别：${c.gender || "未知"}
- 已有背景：${(c.background || "").slice(0, 300) || "无"}
- 已有能力：${(c.abilities || []).join("、") || "无"}
- 已有别名：${(c.aliases || []).join("、") || "无"}

【项目上下文】
${(c.project?.synopsis || "").slice(0, 500)}
${(c.project?.globalPrompt || "").slice(0, 1000)}

【需要补全的字段】
${fieldsToFill}

【输出格式】
严格输出JSON，键名对应上述字段名：
{
  "age": "...",
  "gender": "...",
  "background": "...",
  "abilities": ["...", "..."],
  "hiddenMotives": ["..."],
  "arcProgress": "...",
  "aliases": ["..."],
  "appearance": {"hair": "...", "eyes": "...", "height": "...", "build": "...", "features": "...", "attire": "..."},
  "personality": {"dominant": "...", "drive": "...", "contradiction": "...", "habits": ["...", "..."], "socialMask": "..."},
  "dialogueStyle": {"description": "...", "examples": ["...", "..."], "vocabulary": ["..."], "speechPatterns": ["..."]}
}

只输出需要补全的字段。内容必须符合角色定位和世界观，原创且合理。`;
}

function parseAutofillResponse(
  rawContent: string,
  emptyFields: string[],
): Record<string, any> {
  try {
    // 尝试直接解析JSON
    const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // 只保留需要补全的字段
      const result: Record<string, any> = {};
      for (const field of emptyFields) {
        if (parsed[field] !== undefined) {
          result[field] = parsed[field];
        }
      }
      return result;
    }
  } catch (e) {
    console.error("[autofill] JSON解析失败，原始输出:", rawContent.slice(0, 300));
  }
  return {};
}

function buildUpdateData(
  character: CharacterLike,
  filledData: Record<string, any>,
  _emptyFields: string[],
): Record<string, any> {
  const data: Record<string, any> = {};

  if (filledData.age) data.age = filledData.age;
  if (filledData.gender) data.gender = filledData.gender;
  if (filledData.background) data.background = filledData.background;
  if (filledData.abilities) data.abilities = filledData.abilities;
  if (filledData.hiddenMotives) data.hiddenMotives = filledData.hiddenMotives;
  if (filledData.arcProgress) data.arcProgress = filledData.arcProgress;
  if (filledData.aliases) data.aliases = filledData.aliases;
  if (filledData.appearance) data.appearance = filledData.appearance;
  if (filledData.personality) data.personality = filledData.personality;
  if (filledData.dialogueStyle) data.dialogueStyle = filledData.dialogueStyle;

  // 移除拆书导入标记——表示已被人工处理过
  const currentTags = (character as any).tags || [];
  if (currentTags.includes("📥拆书导入")) {
    data.tags = currentTags.filter((t: string) => t !== "📥拆书导入");
  }

  return data;
}
