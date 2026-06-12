import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  parseSettings,
  toCharacterCreateParams,
  toLorebookCreateParams,
  toStyleCardCreateParams,
} from "@/core/settings";

/**
 * POST /api/parse-settings
 *
 * AI 批量解析设定文本 —— 贴一段文字，自动拆成三卡：角色卡 + 世界书 + 风格卡。
 *
 * v2: 补全风格卡（StyleCard）创建，三卡齐全。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;      // 任意长度的设定文本，无上限
 *   autoCreate: boolean;  // 是否自动写入数据库（默认true）
 * }
 *
 * 响应：
 * {
 *   parsed: { characters, loreEntries, synopsis, toneKeywords, styleProfile },
 *   created: { characters, loreEntries, styleCard }
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

    // 1. AI 解析设定文本 → 三卡
    const parsed = await parseSettings(rawText);

    const created = { characters: 0, loreEntries: 0, styleCard: false };

    // 2. 三卡并行写入
    const writeOps: Promise<unknown>[] = [];

    // 角色卡
    if (autoCreate && parsed.characters.length > 0) {
      for (const c of parsed.characters) {
        writeOps.push(
          prisma.characterCard.create({
            data: toCharacterCreateParams(c, projectId),
          })
        );
      }
      created.characters = parsed.characters.length;
    }

    // 世界书词条
    if (autoCreate && parsed.loreEntries.length > 0) {
      for (const l of parsed.loreEntries) {
        writeOps.push(
          prisma.lorebookEntry.create({
            data: toLorebookCreateParams(l, projectId),
          })
        );
      }
      created.loreEntries = parsed.loreEntries.length;
    }

    // 风格卡 —— v2 新增
    if (autoCreate && parsed.styleProfile) {
      writeOps.push(
        (async () => {
          // 删除旧风格卡（一个项目只保留最新）
          await prisma.styleCard.deleteMany({ where: { projectId } });
          await prisma.styleCard.create({
            data: toStyleCardCreateParams(parsed.styleProfile!, projectId, 0),
          });
          created.styleCard = true;
        })()
      );
    }

    await Promise.all(writeOps);

    // 3. 如果有总纲/基调，自动更新项目
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
