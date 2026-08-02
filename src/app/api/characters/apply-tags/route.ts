/**
 * POST /api/characters/apply-tags
 *
 * 接收用户勾选的分类标签，批量更新角色 tags。
 * 合并逻辑：保留旧标签中的系统标签（📥📝），替换分类标签。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
      const systemTags = oldTags.filter((t: unknown) =>
        typeof t === "string" && (t.startsWith("📥") || t.startsWith("📝"))
      );
      const allLabels = a.labels.filter(l => typeof l === "string" && l.length > 0);
      const merged = [...new Set([...allLabels, ...systemTags])];

      await prisma.characterCard.update({
        where: { id: a.characterId },
        data: { tags: merged },
      });
      updated++;
    }

    return NextResponse.json({ ok: true, updated, skipped, total: assignments.length });
  } catch (err) {
    return jsonError(err);
  }
}
