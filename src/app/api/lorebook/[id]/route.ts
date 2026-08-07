import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { badRequest } from "@/lib/validators";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";

// 应用级白名单（与 POST 同源）：category 只能取 15 类世界卡分类之一。
// 非法值在此被拒绝，杜绝通过 PUT 写入错字/越界分类后静默消失于 globalPrompt（F1）。
const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES);

// PUT /api/lorebook/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // F1：category 是可选的部分更新字段；仅当显式提供时才做白名单校验，
    // 避免无 category 的局部更新被误拒。非法值直接 400，与 POST 规则一致。
    const incomingCategory = body.category;
    if (
      incomingCategory !== undefined &&
      (typeof incomingCategory !== "string" || !VALID_CATEGORIES.has(incomingCategory))
    ) {
      return badRequest(
        `category「${String(incomingCategory)}」非法：必须为 15 类世界卡分类之一`,
        "category",
      );
    }

    const entry = await prisma.lorebookEntry.update({
      where: { id },
      data: {
        title: body.title,
        category: body.category,
        keys: body.keys,
        content: body.content,
        insertionOrder: body.insertionOrder,
        depth: body.depth,
        enabled: body.enabled,
        parentId: body.parentId,
        relatedEntryIds: body.relatedEntryIds,
      },
    });
    syncGlobalPrompt(body.projectId || entry.projectId).catch(() => {});
    return NextResponse.json(entry);
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/lorebook/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const entry = await prisma.lorebookEntry.findUnique({ where: { id }, select: { projectId: true } });
    await prisma.lorebookEntry.delete({ where: { id } });
    if (entry?.projectId) syncGlobalPrompt(entry.projectId).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
