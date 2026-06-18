/**
 * POST /api/explore/adopt
 *
 * 采纳一条探讨设定——AI自动判断类型并写入项目实体。
 *
 * Body: {
 *   projectId?: string,
 *   config: BuildConfig,
 *   card: { title, content, step }
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import type { BuildConfig, ExploreStep } from "@/core/explore/types";
import { STEP_LABELS } from "@/core/explore/types";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  stepToCategory,
  tryExtractStructured,
  extractCharacterKeys,
} from "@/core/explore/utils";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { projectId, config, card } = body as {
      projectId?: string;
      config?: BuildConfig;
      card?: { title: string; content: string; step: ExploreStep };
    };

    if (!card || !card.title) {
      return NextResponse.json({ error: "缺少卡片数据" }, { status: 400 });
    }

    // ── 获取或创建项目 ──
    let pid = projectId;
    if (!pid) {
      if (!config) {
        return NextResponse.json(
          { error: "首次采纳需要提供config" },
          { status: 400 },
        );
      }
      const project = await prisma.project.create({
        data: {
          name: config.novelName || "探讨中的小说",
          description: config.direction?.slice(0, 500) || "",
          genre: [config.genre || "玄幻"],
          globalPrompt: "",
          synopsis: "",
        },
      });
      pid = project.id;
    }

    // ── 判断卡片的实体类型 ──
    const preStructured = tryExtractStructured(card);
    let entityType: "character" | "lore" = classifyCardStep(card.step);
    if (preStructured && preStructured.name && preStructured.role) {
      entityType = "character";
    }

    let entityId: string | undefined;
    let message = "";

    if (entityType === "character") {
      let structured: Record<string, any>;
      if (preStructured) {
        structured = preStructured;
      } else {
        const llmConfig = await getEffectiveConfig();
        const client = createLLMClient(llmConfig);
        const model = llmConfig.extractorModel || llmConfig.writerModel;
        structured = await aiParseToCharacter(client, model, card);
      }

      const char = await prisma.characterCard.create({
        data: {
          projectId: pid,
          name: structured.name || card.title.slice(0, 30),
          role: structured.role || "supporting",
          background: structured.background || card.content.slice(0, 500),
          abilities: Array.isArray(structured.abilities)
            ? structured.abilities
            : [],
          personality: structured.personality || {},
          age: structured.age || "未知",
          gender: structured.gender || "未知",
          appearance: structured.appearance || {},
          aliases: Array.isArray(structured.aliases)
            ? structured.aliases
            : [],
          tags: ["📥探讨采纳"],
          currentStatus: "alive",
        },
      });
      entityId = char.id;
      message = `✅ 角色「${char.name}」已写入`;
    } else {
      let structured: Record<string, any>;
      if (preStructured) {
        structured = {
          title: preStructured.name || card.title,
          content: preStructured.background || card.content.slice(0, 2500),
          category: stepToCategory(card.step),
          keys: extractCharacterKeys(card.title, preStructured),
        };
      } else {
        const llmConfig = await getEffectiveConfig();
        const client = createLLMClient(llmConfig);
        const model = llmConfig.extractorModel || llmConfig.writerModel;
        structured = await aiParseToLore(client, model, card, config);
      }

      const entry = await prisma.lorebookEntry.create({
        data: {
          projectId: pid,
          title: structured.title || card.title.slice(0, 60),
          category: structured.category || stepToCategory(card.step),
          keys: Array.isArray(structured.keys) ? structured.keys : [],
          content: structured.content || card.content.slice(0, 2500),
          insertionOrder: 50,
          enabled: true,
        },
      });
      entityId = entry.id;
      message = `✅ 词条「${entry.title}」已写入（${entry.category}）`;
    }

    syncGlobalPrompt(pid).catch((e) =>
      console.warn("[explore/adopt] syncGlobalPrompt 失败:", e),
    );

    return NextResponse.json({
      projectId: pid,
      entityType,
      entityId,
      message,
    });
  } catch (err: any) {
    console.error("[explore/adopt] 采纳失败:", err);
    return NextResponse.json(
      { error: err?.message || "采纳失败" },
      { status: 500 },
    );
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

function classifyCardStep(step: ExploreStep): "character" | "lore" {
  if (step === "protagonist") return "character";
  return "lore";
}

async function aiParseToCharacter(
  client: ReturnType<typeof createLLMClient>,
  model: string,
  card: { title: string; content: string },
): Promise<Record<string, any>> {
  const prompt = `将以下小说设定解析为角色卡JSON。

【原始设定】
标题：${card.title}
内容：${card.content}

【输出JSON格式】
{
  "name": "角色名（2-4字）",
  "role": "protagonist|antagonist|mentor|supporting",
  "age": "年龄描述",
  "gender": "男|女|未知",
  "background": "2-4句话角色背景",
  "abilities": ["能力1", "能力2"],
  "personality": {"dominant": "主导性格", "drive": "驱动力"},
  "appearance": {"hair": "", "eyes": "", "height": "", "build": ""}
}
只输出JSON。`;

  try {
    const resp = await client.chat({
      model,
      messages: [
        { role: "system", content: "你是小说设定解析器。只输出JSON，不客套。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 1024,
    });
    const raw = resp.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return {};
  }
}

async function aiParseToLore(
  client: ReturnType<typeof createLLMClient>,
  model: string,
  card: { title: string; content: string },
  config?: BuildConfig,
): Promise<Record<string, any>> {
  const prompt = `将以下小说设定整理为世界书词条JSON。

【原始设定】
标题：${card.title}
内容：${card.content}
${config?.genre ? `小说类型：${config.genre}` : ""}

【输出JSON格式】
{
  "title": "优化后的词条标题（≤20字）",
  "category": "worldview|faction|magic_system|geography|economy|plot|custom",
  "content": "整理后的设定内容（200-500字，保留所有关键信息）",
  "keys": ["触发词1", "触发词2", "触发词3", "触发词4", "触发词5"]
}
只输出JSON。`;

  try {
    const resp = await client.chat({
      model,
      messages: [
        { role: "system", content: "你是小说设定整理器。只输出JSON，不客套。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.2,
      maxTokens: 1024,
    });
    const raw = resp.content || "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    return jsonMatch ? JSON.parse(jsonMatch[0]) : {};
  } catch {
    return {};
  }
}
