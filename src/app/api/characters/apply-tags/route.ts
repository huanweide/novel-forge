/**
 * POST /api/characters/apply-tags
 *
 * 接收用户自定义标签，批量更新角色 tags。
 * 合并逻辑：保留旧标签（含系统标签 📥📝 与既有自定义标签），追加新标签（并集）。
 * v2.0.4：改为「并集追加」语义——用户可往多个自定义标签里加同一个人，不会互相覆盖。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const assignments = body.assignments as Array<{ characterId: string; labels: string[] }> | undefined;

  if (!projectId || !assignments || assignments.length === 0) {
    return NextResponse.json({ error: "缺少 projectId 或 assignments" }, { status: 400 });
  }

  try {
    // 批量验证 — 确保所有 characterId 属于该项目
    const validIds = new Set(
      (await prisma.characterCard.findMany({
        where: { projectId, id: { in: assignments.map(a => a.characterId).filter(Boolean) } },
        select: { id: true },
      })).map(c => c.id)
    );

    let updated = 0;
    let skipped = 0;

    for (const a of assignments) {
      if (!a.characterId || !Array.isArray(a.labels)) { skipped++; continue; }
      if (!validIds.has(a.characterId)) { skipped++; continue; }

      const character = await prisma.characterCard.findUnique({
        where: { id: a.characterId },
        select: { tags: true },
      });
      if (!character) { skipped++; continue; }

      const oldTags = Array.isArray(character.tags) ? character.tags : [];
      const allLabels = a.labels.filter((l: unknown) => typeof l === "string" && l.length > 0);
      // 并集：保留所有旧标签（系统标签 + 既有自定义标签），追加本次新标签
      const merged = [...new Set([...oldTags, ...allLabels])];

      await prisma.characterCard.update({
        where: { id: a.characterId },
        data: { tags: merged },
      });
      updated++;
    }

    // v1.6.26 实时性：角色标签写入 globalPrompt（sync-global-prompt 渲染「标签」段落），
    // 改标签后必须刷新缓存，否则生成上下文不反映新分类标签。
    syncGlobalPrompt(projectId).catch(() => {});

    return NextResponse.json({ ok: true, updated, skipped, total: assignments.length });
  } catch (err) {
    return jsonError(err);
  }
}
