import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { badRequest } from "@/lib/validators";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  readValidatedBody,
  asStr,
  asStrArray,
  asStrOrNull,
  asInt,
  asBool,
} from "@/lib/validators";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";

// 应用级白名单：category 只能取 15 类世界卡分类之一（不改 schema，避免迁移风险与
// 历史错字数据导致 db push 失败；非法值在此被拒绝，防静默错分/错字，R2-014）。
const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES);

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

    // R2-014：应用级白名单——category 必须落在 15 类世界卡分类内，否则拒绝（400）。
    if (!VALID_CATEGORIES.has(body.category)) {
      return badRequest(
        `category「${body.category}」非法：必须为 15 类世界卡分类之一`,
        "category",
      );
    }

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
