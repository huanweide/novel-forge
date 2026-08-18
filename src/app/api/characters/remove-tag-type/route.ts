/**
 * POST /api/characters/remove-tag-type
 *
 * 删除一个用户自建标签类型：从项目内所有角色上移除该标签。
 * v2.27.0：支持清理误建/废弃的自定义标签。
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
  const tag = body.tag as string;

  if (!projectId || !tag || typeof tag !== "string" || tag.length === 0) {
    return NextResponse.json({ error: "缺少 projectId 或 tag" }, { status: 400 });
  }

  // 防止删除系统标签
  if (tag.startsWith("📥") || tag.startsWith("📝") || tag === "🗂 已合并") {
    return NextResponse.json({ error: "系统标签不可删除" }, { status: 400 });
  }

  try {
    // 查找所有包含该标签的角色
    // 注：SQLite 不支持标量数组的 has 过滤，改为取出本项目全部角色后在 JS 端按 tags 数组过滤
    const allChars = await prisma.characterCard.findMany({
      where: { projectId },
      select: { id: true, tags: true },
    });
    const characters = allChars.filter(
      (c: { id: string; tags: unknown }) =>
        Array.isArray(c.tags) && (c.tags as string[]).includes(tag),
    );

    if (characters.length === 0) {
      return NextResponse.json({ ok: true, removed: 0, total: 0 });
    }

    let removed = 0;

    for (const c of characters) {
      const oldTags = Array.isArray(c.tags) ? c.tags : [];
      const newTags = oldTags.filter((t: string) => t !== tag);

      // 只有确实变化时才 update（避免空写）
      if (newTags.length !== oldTags.length) {
        await prisma.characterCard.update({
          where: { id: c.id },
          data: { tags: newTags },
        });
        removed++;
      }
    }

    // 刷新 globalPrompt 缓存
    syncGlobalPrompt(projectId).catch(() => {});

    return NextResponse.json({ ok: true, removed, total: characters.length });
  } catch (err) {
    return jsonError(err);
  }
}
