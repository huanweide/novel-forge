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
import { safeJoin, asArray } from "@/lib/utils";

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

    // v3.1.55：genre / abilities 等字段已是数据库原生 Json，读出来是 JsonValue；
    // 下游函数的入参契约仍是 string[]。统一规范化，不用 as any 掩盖形状问题。
    const characterLike = toCharacterLike(character);

    // 检查哪些字段需要补全
    const emptyFields = detectEmptyFields(characterLike);
    if (emptyFields.length === 0) {
      return NextResponse.json({
        filled: [] as string[],
        character,
        message: "所有字段已填写完整",
      });
    }

    // 构建补全 prompt
    const prompt = buildAutofillPrompt(characterLike, emptyFields);

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
    const updateData = buildUpdateData(characterLike, filledData, emptyFields);

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
  storyLine: string;
  // v3.1.55：这三个字段在库里是原生 Json，读出来是 JsonValue。
  // 这里保留精确的 string[] 契约（下游 detectEmptyFields 要读 .length），
  // 由 toCharacterLike 在入口处用 asArray 规范化 —— 不放宽成 unknown，
  // 否则等于放弃类型检查、真实形状问题会一路漏到运行时。
  abilities: string[];
  personality: any;
  appearance: any;
  dialogueStyle: any;
  aliases: string[];
  hiddenMotives: string[];
  arcProgress: string;
  timeline: any;
  relationships: any;
  currentStatus?: string;
  project?: { globalPrompt?: string; synopsis?: string; genre?: string[] };
}

/**
 * 把 Prisma 读出的记录适配成下游函数的入参契约。
 *
 * v3.1.55 起 aliases / abilities / hiddenMotives / project.genre 是数据库原生
 * Json，读出来是 JsonValue（可能是数组、也可能是历史遗留的裸字符串或 null）。
 * asArray 统一收敛为数组：null/undefined → []、数组 → 原样、JSON 字符串 → parse、
 * 裸值 → 单元素数组。这样「旧数据存的是字符串、新数据存的是数组」都能吃下。
 */
function toCharacterLike(c: Record<string, any>): CharacterLike {
  return {
    ...c,
    abilities: asArray<string>(c.abilities),
    aliases: asArray<string>(c.aliases),
    hiddenMotives: asArray<string>(c.hiddenMotives),
    project: c.project
      ? { ...c.project, genre: asArray<string>(c.project.genre) }
      : undefined,
  } as CharacterLike;
}

function detectEmptyFields(c: CharacterLike): string[] {
  const empty: string[] = [];

  if (!c.age || c.age === "未知") empty.push("age");
  if (!c.gender || c.gender === "未知") empty.push("gender");
  if (!c.background || c.background.length < 20) empty.push("background");
  if (!c.abilities || asArray(c.abilities).length === 0) empty.push("abilities");
  if (!c.hiddenMotives || asArray(c.hiddenMotives).length === 0) empty.push("hiddenMotives");
  if (!c.arcProgress || c.arcProgress.length < 10) empty.push("arcProgress");
  if (!c.aliases || asArray(c.aliases).length === 0) empty.push("aliases");
  if (!c.storyLine || c.storyLine.length < 10) empty.push("storyLine");

  // 经历时间线（空数组视为未填）
  if (!c.timeline || (Array.isArray(c.timeline) && c.timeline.length === 0)) {
    empty.push("timeline");
  }

  // 人际关系（空数组视为未填——AI 填满也会检测角色关系并写入）
  if (!c.relationships || (Array.isArray(c.relationships) && c.relationships.length === 0)) {
    empty.push("relationships");
  }

  // 外貌
  const app = (c.appearance || {}) as Record<string, unknown>;
  if (!app.hair && !app.eyes && !app.height && !app.build && !app.features) {
    empty.push("appearance");
  }

  // 性格：无内容，或三层（表层/中层/内核）全空时都触发补全（v1.2.0：AI 填满覆盖性格三层）
  const pers = c.personality;
  const hasPersonality =
    pers &&
    (Array.isArray(pers) ? pers.length > 0 : typeof pers === "object" && Object.keys(pers as object).length > 0);
  const hasLayers =
    pers &&
    typeof pers === "object" &&
    !Array.isArray(pers) &&
    Boolean((pers as Record<string, unknown>).surface || (pers as Record<string, unknown>).middle || (pers as Record<string, unknown>).core);
  if (!hasPersonality || !hasLayers) empty.push("personality");

  // 对话风格
  const ds = (c.dialogueStyle || {}) as Record<string, unknown>;
  if (!ds.description && !ds.examples) empty.push("dialogueStyle");

  return empty;
}

function buildAutofillPrompt(c: CharacterLike, emptyFields: string[]): string {
  const fieldDescriptions: Record<string, string> = {
    age: "年龄（如：25岁、外表18岁实际300岁）",
    gender: "性别（男/女/无/其他）",
    background: `角色背景（3-5句话即可，包含：1)所在位置与境遇 2)当前短期目标 3)长期欲望 4)卷入核心事件的方式）。角色名：${c.name}，定位：${c.role}`,
    abilities: "能力/技能列表（3-6项，逗号分隔，符合角色定位和世界观）",
    hiddenMotives: "隐藏动机列表（1-3项，角色不为人知的真实目的）",
    arcProgress: "人物弧光预登记（1-2句话，信念动摇触发点+蜕变方向）",
    aliases: "别名/称号列表（1-3个，逗号分隔）",
    storyLine: "故事线（3-5句话：该角色在全书主线中的起落——从登场到结局的关键转折，含其与主线冲突的关系）",
    timeline: "经历时间线JSON数组：[{age:事件时年龄, event:事件描述}]，3-6条，从出生/登场到故事起点",
    relationships: "人际关系JSON数组：[{targetName:对方姓名, relation:关系（如师徒/宿敌）, dynamic:关系动态1句}]，1-4条，基于项目上下文推断合理的关联人物",
    appearance: "外貌描述JSON：{hair:发型发色, eyes:眼睛特征, height:身高, build:体型, features:特殊印记, attire:标志性着装}",
    personality: "性格详析JSON：{dominant:主导性格, drive:核心驱动, contradiction:内在矛盾, habits:[习惯1,习惯2], socialMask:社交面具, surface:表层对外展现1句, middle:中层日常互动1句, core:内核本质驱动1句}",
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
- 已有能力：${safeJoin(c.abilities, "、") || "无"}
- 已有别名：${safeJoin(c.aliases, "、") || "无"}

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
  "storyLine": "...",
  "timeline": [{"age": 18, "event": "..."}],
  "relationships": [{"targetName": "张三", "relation": "师徒", "dynamic": "..."}],
  "appearance": {"hair": "...", "eyes": "...", "height": "...", "build": "...", "features": "...", "attire": "..."},
  "personality": {"dominant": "...", "drive": "...", "contradiction": "...", "habits": ["...", "..."], "socialMask": "...", "surface": "...", "middle": "...", "core": "..."},
  "dialogueStyle": {"description": "...", "examples": ["...", "..."], "vocabulary": ["..."], "speechPatterns": ["..."]}
}

只输出需要补全的字段。每个字段力求精简：背景/故事线等长文本控制在 3-5 句，不堆砌套话；列表类 1-6 项即可。内容必须符合角色定位和世界观，原创且合理。`;
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
  if (filledData.storyLine) data.storyLine = filledData.storyLine;
  if (filledData.timeline && Array.isArray(filledData.timeline)) {
    data.timeline = filledData.timeline.map((t: any) => ({ age: Number(t.age) || 0, event: String(t.event || ""), era: String(t.era || "") }));
  }
  if (filledData.relationships && Array.isArray(filledData.relationships)) {
    data.relationships = filledData.relationships.map((r: any) => ({
      targetName: String(r.targetName || ""),
      relation: String(r.relation || ""),
      dynamic: String(r.dynamic || ""),
    })).filter((r) => r.targetName);
  }
  if (filledData.appearance) data.appearance = filledData.appearance;
  if (filledData.personality) {
    // 合并而非覆盖：保留已有主导/驱动等，仅补 surface/middle/core 三层
    const existingPers =
      character.personality && typeof character.personality === "object" && !Array.isArray(character.personality)
        ? (character.personality as Record<string, unknown>)
        : {};
    data.personality = { ...existingPers, ...filledData.personality };
  }
  if (filledData.dialogueStyle) data.dialogueStyle = filledData.dialogueStyle;

  // 移除拆书导入标记——表示已被人工处理过
  const currentTags = (character as any).tags || [];
  if (currentTags.includes("📥拆书导入")) {
    data.tags = currentTags.filter((t: string) => t !== "📥拆书导入");
  }

  return data;
}
