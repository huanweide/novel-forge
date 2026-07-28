import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

// PUT /api/lorebook/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
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
