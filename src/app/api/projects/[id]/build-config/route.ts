/**
 * PATCH /api/projects/[id]/build-config
 *
 * 更新探讨模式布置配置（BuildConfig），并据此重建 globalPrompt。
 * 重建逻辑：读取项目世界书条目 → 反向映射为 adopted → buildGlobalPromptFromExplore。
 * 保证 workspace 内修改布置后，globalPrompt 与结构化配置保持一致。
 *
 * Body: Partial<BuildConfig>
 * Response: { ok: true, projectId }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BuildConfig, ExploreStep } from "@/core/explore/types";
import { DEFAULT_BUILD_CONFIG } from "@/core/explore/types";
import { buildGlobalPromptFromExplore, lorebookToAdopted } from "@/core/explore/build-prompt";
import { jsonError } from "@/lib/api-error";

export const maxDuration = 60;

const CATEGORY_TO_STEP: Record<string, ExploreStep> = {
  worldview: "worldview",
  custom: "protagonist",
  plot: "core_conflict",
  faction: "factions",
  magic_system: "power_system",
  economy: "currency",
  geography: "map",
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const patch = (await req.json()) as Partial<BuildConfig>;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return jsonError("项目不存在");

    // 合并：旧 buildConfig（或默认） ← 前端传入的增量
    const prev = (project.buildConfig as unknown as BuildConfig) || DEFAULT_BUILD_CONFIG;
    const merged: BuildConfig = { ...prev, ...patch };

    // 重建 globalPrompt：从世界书条目反向重建 adopted
    const entries = await prisma.lorebookEntry.findMany({
      where: { projectId: id },
      select: { title: true, content: true, category: true },
    });
    const adopted = lorebookToAdopted(entries, CATEGORY_TO_STEP);
    const globalPrompt = buildGlobalPromptFromExplore(merged, adopted);

    await prisma.project.update({
      where: { id },
      data: {
        buildConfig: merged as any,
        globalPrompt,
        genre: merged.genre ? [merged.genre] : project.genre,
        toneKeywords: merged.stylePreference ? [merged.stylePreference] : project.toneKeywords,
      },
    });

    return NextResponse.json({ ok: true, projectId: id });
  } catch (err) {
    console.error("[build-config] 更新失败:", err);
    return jsonError(err);
  }
}
