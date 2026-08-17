/**
 * PATCH /api/projects/[id]/build-config
 *
 * 更新探讨模式布置配置（BuildConfig），并通过 syncGlobalPrompt 统一重建 globalPrompt。
 * v1.6.41：改为单一真相源——只写 buildConfig/genre/toneKeywords，随后调 syncGlobalPrompt(id)，
 * 由 sync 统一渲染「作品信息 + 探讨布置(buildConfig) + 角色卡 + 世界书 + 风格卡」。
 * 不再直接用 buildGlobalPromptFromExplore 直写 globalPrompt（旧逻辑会覆盖 sync 渲染的
 * 角色/世界观段落，且 sync 又反过来丢弃 explore 布置字段，两套来源互相覆盖）。
 *
 * Body: Partial<BuildConfig>
 * Response: { ok: true, projectId }
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BuildConfig } from "@/core/explore/types";
import { DEFAULT_BUILD_CONFIG } from "@/core/explore/types";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { jsonError } from "@/lib/api-error";
import { safeJson } from "@/lib/api-body";

export const maxDuration = 60;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const r = await safeJson(req);
    if (!r.ok) return r.response;
    const patch = r.body as Partial<BuildConfig>;

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) return jsonError("项目不存在");

    // 合并：旧 buildConfig（或默认） ← 前端传入的增量
    const prev = (project.buildConfig as unknown as BuildConfig) || DEFAULT_BUILD_CONFIG;
    const merged: BuildConfig = { ...prev, ...patch };

    // 只写结构化字段；globalPrompt 交由 syncGlobalPrompt 统一重建（单一真相源）。
    await prisma.project.update({
      where: { id },
      data: {
        buildConfig: merged as any,
        genre: merged.genre ? [merged.genre] : project.genre,
        toneKeywords: merged.stylePreference ? [merged.stylePreference] : project.toneKeywords,
      },
    });

    // 统一重建：sync 现在也会读取 buildConfig 段，explore 布置字段不再丢失。
    syncGlobalPrompt(id).catch(() => {});

    return NextResponse.json({ ok: true, projectId: id });
  } catch (err) {
    console.error("[build-config] 更新失败:", err);
    return jsonError(err);
  }
}
