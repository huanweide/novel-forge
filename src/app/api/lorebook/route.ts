import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

// POST /api/lorebook
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entry = await prisma.lorebookEntry.create({
      data: {
        projectId: body.projectId,
        title: body.title,
        category: body.category || "custom",
        keys: body.keys || [],
        content: body.content,
        insertionOrder: body.insertionOrder || 50,
        enabled: body.enabled ?? true,
        parentId: body.parentId || null,
        relatedEntryIds: body.relatedEntryIds || [],
      },
    });
    syncGlobalPrompt(body.projectId).catch(() => {});
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建词条失败" },
      { status: 500 }
    );
  }
}
