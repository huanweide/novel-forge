import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import {
  parseSettings,
  parseLorebookOnly,
  parseStyleOnly,
  upsertParsedSettingsToProject,
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
 *
 * 写入统一委托 upsertParsedSettingsToProject（与探讨模式 adopt-batch / create 共用同一实现）。
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

    if (mode === "lorebook") {
      // ─── 仅世界卡模式 ─────────────────────────
      const entries = await parseLorebookOnly(rawText);

      if (autoCreate && entries.length > 0) {
        const result = await upsertParsedSettingsToProject(projectId, {
          characters: [],
          loreEntries: entries,
          synopsis: "",
          toneKeywords: [],
          styleProfile: null,
        });
        return NextResponse.json({
          parsed: { loreEntries: entries },
          created: {
            characters: 0,
            loreEntries: result.loreEntries,
            newEntries: result.loreEntries,
          },
          mode: "lorebook",
        });
      }

      return NextResponse.json({
        parsed: { loreEntries: entries },
        created: { characters: 0, loreEntries: entries.length, newEntries: entries.length },
        mode: "lorebook",
      });
    }

    if (mode === "style") {
      // ─── 仅风格卡模式 ─────────────────────────
      const styleResult = await parseStyleOnly(rawText);

      if (autoCreate) {
        const result = await upsertParsedSettingsToProject(projectId, {
          characters: [],
          loreEntries: [],
          synopsis: "",
          toneKeywords: [],
          styleProfile: styleResult,
        });
        return NextResponse.json({
          parsed: {
            styleProfile: styleResult,
            writingRules: styleResult.writingRules || [],
          },
          created: { characters: 0, loreEntries: 0, styleCard: result.styleCard },
          mode: "style",
        });
      }

      return NextResponse.json({
        parsed: {
          styleProfile: styleResult,
          writingRules: styleResult.writingRules || [],
        },
        created: { characters: 0, loreEntries: 0, styleCard: false },
        mode: "style",
      });
    }

    // ─── 默认：全部三卡模式 ───────────────────
    const parsed = await parseSettings(rawText);

    if (autoCreate) {
      const result = await upsertParsedSettingsToProject(projectId, parsed);
      return NextResponse.json({
        parsed,
        created: {
          characters: result.characters,
          loreEntries: result.loreEntries,
          styleCard: result.styleCard,
        },
        mode: "all",
      });
    }

    return NextResponse.json({
      parsed,
      created: { characters: 0, loreEntries: 0, styleCard: false },
      mode: "all",
    });
  } catch (err) {
    console.error("设定解析失败:", err);
    return jsonError(err);
  }
}
