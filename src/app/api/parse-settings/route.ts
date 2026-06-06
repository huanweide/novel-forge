import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { parseSettings, toCharacterCreateParams, toLorebookCreateParams } from "@/core/settings";

/**
 * POST /api/parse-settings
 *
 * AI 批量解析设定文本 —— 贴一段文字，自动拆成角色卡+世界书词条。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;      // 任意长度的设定文本
 *   autoCreate: boolean;  // 是否自动写入数据库（默认true）
 * }
 *
 * 响应：
 * {
 *   parsed: { characters: [...], loreEntries: [...], synopsis: "...", toneKeywords: [...] },
 *   created: { characters: number, loreEntries: number }
 * }
 */
export async function POST(request: Request) {
  try {
    const { projectId, rawText, autoCreate = true } = await request.json();

    if (!projectId || !rawText) {
      return NextResponse.json(
        { error: "缺少 projectId 或 rawText" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // 1. AI 解析设定文本
    const parsed = await parseSettings(rawText);

    const created = { characters: 0, loreEntries: 0 };

    // 2. 批量创建角色卡
    if (autoCreate && parsed.characters.length > 0) {
      const createOps = parsed.characters.map((c) =>
        prisma.characterCard.create({
          data: toCharacterCreateParams(c, projectId),
        })
      );
      await Promise.all(createOps);
      created.characters = parsed.characters.length;
    }

    // 3. 批量创建世界书词条
    if (autoCreate && parsed.loreEntries.length > 0) {
      const createOps = parsed.loreEntries.map((l) =>
        prisma.lorebookEntry.create({
          data: toLorebookCreateParams(l, projectId),
        })
      );
      await Promise.all(createOps);
      created.loreEntries = parsed.loreEntries.length;
    }

    // 4. 如果有总纲/基调，自动更新项目
    if (parsed.synopsis || parsed.toneKeywords.length > 0) {
      const updateData: Record<string, unknown> = {};
      if (parsed.synopsis) updateData.synopsis = parsed.synopsis;
      if (parsed.toneKeywords.length > 0) updateData.toneKeywords = parsed.toneKeywords;
      await prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });
    }

    return NextResponse.json({
      parsed,
      created,
    });
  } catch (err) {
    console.error("设定解析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "解析设定失败" },
      { status: 500 }
    );
  }
}
