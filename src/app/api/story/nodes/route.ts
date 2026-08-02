import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import {
  readValidatedBody,
  asStr,
  asStrOrNull,
  asInt,
  asBool,
  asStrArray,
} from "@/lib/validators";

// POST /api/story/nodes
export async function POST(request: Request) {
  try {
    const body = await readValidatedBody(request, (raw) => ({
      projectId: asStr(raw.projectId, "projectId", { required: true }),
      parentId: asStrOrNull(raw.parentId, "parentId"),
      type: asStr(raw.type, "type", { max: 30, fallback: "section" }),
      title: asStr(raw.title, "title", { max: 200, fallback: "未命名" }),
      order: asInt(raw.order, "order", 0),
      status: asStr(raw.status, "status", { max: 30, fallback: "outline_only" }),
      outline: asStrOrNull(raw.outline, "outline"),
      content: asStrOrNull(raw.content, "content"),
      wordCount: asInt(raw.wordCount, "wordCount", 0),
      branchId: asStrOrNull(raw.branchId, "branchId"),
      isMainBranch: asBool(raw.isMainBranch, true),
      activeCharacters: asStrArray(raw.activeCharacters, "activeCharacters"),
      activeLoreIds: asStrArray(raw.activeLoreIds, "activeLoreIds"),
      coreConflict: asStrOrNull(raw.coreConflict, "coreConflict"),
      settingDescription: asStrOrNull(raw.settingDescription, "settingDescription"),
      notes: asStrOrNull(raw.notes, "notes"),
    }));
    if (body instanceof NextResponse) return body;

    const node = await prisma.storyNode.create({
      data: {
        projectId: body.projectId,
        parentId: body.parentId,
        type: body.type,
        title: body.title,
        order: body.order,
        status: body.status,
        outline: body.outline,
        content: body.content,
        wordCount: body.wordCount,
        branchId: body.branchId,
        isMainBranch: body.isMainBranch,
        activeCharacters: body.activeCharacters,
        activeLoreIds: body.activeLoreIds,
        coreConflict: body.coreConflict,
        settingDescription: body.settingDescription,
        notes: body.notes,
      },
    });
    return NextResponse.json(node, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
