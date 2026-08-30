/**
 * POST /api/explore/adopt
 *
 * 采纳一条探讨设定——写入项目（角色/世界书）。
 *
 * v3.1.50 简化原则（用户反馈"已采纳当大纲处理"+ P2003 防御）：
 * 1. 去掉 LLM 二次解析（aiParseToLore / aiParseToCharacter）——卡本身就是结构化文本（来自
 *    chat ADOPT 块或抽卡模式 parseCardsFromReply），直接 card.title + card.content 落库即可。
 *    避免 LLM 慢/超时/返回无效结构导致的卡死与 500；也满足用户"已采纳内容直接当成大纲写入"的诉求。
 * 2. projectId 校验：旧 session / localStorage 残留的 createdProjectId 可能指向 db 重置后已不存在的
 *    Project（实测多次 P2003 503 真因），加 findUnique 校验，不存在则自动 fallback 建新项目，前端无感。
 * 3. character 分支：tryExtractStructured 规则提取 + card 兜底；lore 分支：直接 card → lorebookEntry。
 * 4. worldview 类设定自动常驻注入（depth=2），其余世界书条目走关键词触发（depth=3）。
 *
 * Body: { projectId?, config, card: { title, content, step } }
 * Response: { projectId, entityType, entityId, message }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";
import type { BuildConfig, ExploreStep } from "@/core/explore/types";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  stepToCategory,
  tryExtractStructured,
  extractCharacterKeys,
} from "@/core/explore/utils";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const { projectId, config, card } = r.body as {
      projectId?: string;
      config?: BuildConfig;
      card?: { title: string; content: string; step: ExploreStep };
    };

    if (!card || !card.title) {
      return NextResponse.json({ error: "缺少卡片数据" }, { status: 400 });
    }

    // ── 获取或创建项目（projectId 校验：旧 session 残留 pid 可能指向 db 重置后已不存在的 Project）──
    let pid = projectId;
    if (pid) {
      const exists = await prisma.project.findUnique({
        where: { id: pid },
        select: { id: true },
      });
      if (!exists) pid = undefined; // 防御 P2003：旧项目不在了 → 当作首次采纳，自动建新项目
    }
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
          // v3.1.49 修复：Project.genre 是 String（不是数组）
          genre: config.genre || "玄幻",
          globalPrompt: "",
          synopsis: "",
        },
      });
      pid = project.id;
    }

    // ── 判断实体类型（character vs lore）──
    const preStructured = tryExtractStructured(card);
    const entityType: "character" | "lore" =
      preStructured && preStructured.name && preStructured.role
        ? "character"
        : classifyCardStep(card.step);

    let entityId: string | undefined;
    let message = "";

    if (entityType === "character") {
      // 规则提取 + card 兜底（v3.1.50 简化：不再调 LLM aiParseToCharacter）
      const name =
        (preStructured?.name || card.title.split(/[·\s\-—:：]/)[0] || "未命名角色").slice(0, 30);
      const char = await prisma.characterCard.create({
        data: {
          projectId: pid,
          name,
          role: preStructured?.role || "supporting",
          background: preStructured?.background || card.content.slice(0, 500),
          abilities: Array.isArray(preStructured?.abilities) ? preStructured!.abilities : [],
          personality: preStructured?.personality || {},
          age: preStructured?.age || "未知",
          gender: preStructured?.gender || "未知",
          appearance: preStructured?.appearance || {},
          aliases: Array.isArray(preStructured?.aliases) ? preStructured!.aliases : [],
          dialogueStyle:
            preStructured?.dialogueStyle && typeof preStructured.dialogueStyle === "object"
              ? preStructured.dialogueStyle
              : {},
          hiddenMotives: Array.isArray(preStructured?.hiddenMotives) ? preStructured!.hiddenMotives : [],
          relationships: Array.isArray(preStructured?.relationships) ? preStructured!.relationships : [],
          tags: ["📥探讨采纳"],
          currentStatus: "alive",
        },
      });
      entityId = char.id;
      message = `✅ 角色「${char.name}」已写入`;
    } else {
      // lore 分支：直接 card 落库（v3.1.50 简化：不再调 LLM aiParseToLore）
      // 用户反馈"已采纳内容当大纲处理"—— 本分支就是把卡当 lorebookEntry 写：
      // title 用 card.title，content 保留 card.content 原文，category 按 step 简单映射
      // （worldview/faction/plot 等），触发词从标题/结构化提取
      const title = (card.title || "未命名词条").slice(0, 60);
      const content = (card.content || "").slice(0, 2500);
      const category = stepToCategory(card.step) || "custom";
      const keys = (() => {
        try {
          return extractCharacterKeys(title, preStructured ?? {}) || [];
        } catch {
          return [];
        }
      })();
      const isWorldviewCat = category === "worldview";
      const entry = await prisma.lorebookEntry.create({
        data: {
          projectId: pid,
          title,
          category,
          keys,
          content,
          depth: isWorldviewCat ? 2 : 3,
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
    return jsonError(err);
  }
}

// ─── 辅助函数 ────────────────────────────────────────────

function classifyCardStep(step: ExploreStep): "character" | "lore" {
  if (step === "protagonist") return "character";
  return "lore";
}
