import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  readValidatedBody,
  asStr,
  asStrArray,
  asStrOrNull,
  asInt,
  asBool,
} from "@/lib/validators";

// POST /api/lorebook
export async function POST(request: Request) {
  try {
    const body = await readValidatedBody(request, (raw) => ({
      projectId: asStr(raw.projectId, "projectId", { required: true }),
      title: asStr(raw.title, "title", { required: true, max: 120 }),
      category: asStr(raw.category, "category", { max: 40, fallback: "custom" }),
      keys: asStrArray(raw.keys, "keys"),
      content: asStr(raw.content, "content", { required: true, max: 20000 }),
      insertionOrder: asInt(raw.insertionOrder, "insertionOrder", 50),
      depth: asInt(raw.depth, "depth", 3),
      enabled: asBool(raw.enabled, true),
      parentId: asStrOrNull(raw.parentId, "parentId"),
      relatedEntryIds: asStrArray(raw.relatedEntryIds, "relatedEntryIds"),
    }));
    if (body instanceof NextResponse) return body;

    const entry = await prisma.lorebookEntry.create({
      data: {
        projectId: body.projectId,
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
    syncGlobalPrompt(body.projectId).catch(() => {});
    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
