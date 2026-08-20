/**
 * POST /api/explore/adopt-batch
 *
 * 批量采纳探讨模式的结构化设定（角色卡 + 世界书 + 情节总纲），
 * 直接写入已存在的项目，不再二次 LLM 解析、不再逐条 HTTP。
 *
 * 与工作台 /api/parse-settings 共用同一套 upsertParsedSettingsToProject，
 * 保证「求同存异」合并逻辑在任何入口都一致。
 *
 * Body: {
 *   projectId: string,
 *   characters: ParsedCharacter[],
 *   loreEntries: ParsedLoreEntry[],
 *   plotOutline?: string,
 *   toneKeywords?: string[],
 *   styleProfile?: StyleProfile | null
 * }
 * Response: { success: true, characters, loreEntries, styleCard, plotOutline }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { upsertParsedSettingsToProject } from "@/core/settings";
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const {
      projectId,
      characters = [],
      loreEntries = [],
      plotOutline = "",
      toneKeywords = [],
      styleProfile = null,
    } = r.body as {
      projectId?: string;
      characters?: any[];
      loreEntries?: any[];
      plotOutline?: string;
      toneKeywords?: string[];
      styleProfile?: any;
    };

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const result = await upsertParsedSettingsToProject(projectId, {
      characters,
      loreEntries,
      synopsis: plotOutline || "",
      toneKeywords,
      styleProfile,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    console.error("[explore/adopt-batch] 批量采纳失败:", err);
    return jsonError(err);
  }
}
