import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  parseSettings,
  parseLorebookOnly,
  parseStyleOnly,
  toCharacterCreateParams,
  toLorebookCreateParams,
  toStyleCardCreateParams,
} from "@/core/settings";

/**
 * POST /api/parse-settings
 *
 * AI 批量解析设定文本。支持三种模式：
 *
 * mode: "all" (默认) — 三卡全提：角色卡 + 世界书 + 风格卡
 * mode: "lorebook"   — 仅世界卡：复述蒸馏，提取全部世界观设定
 * mode: "style"      — 仅风格卡：复述蒸馏，分析全部风格维度 + 写作规则
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;
 *   mode: "all" | "lorebook" | "style";  // 默认 "all"
 *   autoCreate: boolean;                  // 默认 true
 * }
 */
export async function POST(request: Request) {
  try {
    const { projectId, rawText, mode = "all", autoCreate = true } = await request.json();

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

    const created = { characters: 0, loreEntries: 0, styleCard: false };

    if (mode === "lorebook") {
      // ─── 仅世界卡模式 ─────────────────────────
      const entries = await parseLorebookOnly(rawText);

      if (autoCreate && entries.length > 0) {
        const ops = entries.map((l) =>
          prisma.lorebookEntry.create({
            data: toLorebookCreateParams(l, projectId),
          })
        );
        await Promise.all(ops);
        created.loreEntries = entries.length;
      }

      return NextResponse.json({
        parsed: { loreEntries: entries },
        created,
        mode: "lorebook",
      });
    }

    if (mode === "style") {
      // ─── 仅风格卡模式 ─────────────────────────
      const styleResult = await parseStyleOnly(rawText);

      if (autoCreate && styleResult) {
        await prisma.styleCard.deleteMany({ where: { projectId } });
        await prisma.styleCard.create({
          data: toStyleCardCreateParams(styleResult, projectId, 0),
        });
        created.styleCard = true;
      }

      return NextResponse.json({
        parsed: {
          styleProfile: styleResult,
          writingRules: styleResult.writingRules || [],
        },
        created,
        mode: "style",
      });
    }

    // ─── 默认：全部三卡模式 ───────────────────
    const parsed = await parseSettings(rawText);

    const writeOps: Promise<unknown>[] = [];

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

    if (autoCreate && parsed.styleProfile) {
      writeOps.push(
        (async () => {
          await prisma.styleCard.deleteMany({ where: { projectId } });
          await prisma.styleCard.create({
            data: toStyleCardCreateParams(parsed.styleProfile!, projectId, 0),
          });
          created.styleCard = true;
        })()
      );
    }

    await Promise.all(writeOps);

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
      mode: "all",
    });
  } catch (err) {
    console.error("设定解析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "解析设定失败" },
      { status: 500 }
    );
  }
}
