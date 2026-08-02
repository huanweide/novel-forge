import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  readValidatedBody,
  asStr,
  asStrArray,
  asStrOrNull,
} from "@/lib/validators";

// POST /api/characters
export async function POST(request: Request) {
  try {
    const body = await readValidatedBody(request, (raw) => ({
      projectId: asStr(raw.projectId, "projectId", { required: true }),
      name: asStr(raw.name, "name", { required: true, max: 100 }),
      aliases: asStrArray(raw.aliases, "aliases"),
      age: asStr(raw.age, "age", { max: 50, fallback: "未知" }),
      gender: asStr(raw.gender, "gender", { max: 20, fallback: "未知" }),
      role: asStr(raw.role, "role", { max: 30, fallback: "supporting" }),
      appearance:
        typeof raw.appearance === "object" && raw.appearance !== null
          ? (raw.appearance as any)
          : {},
      personality:
        typeof raw.personality === "object" && raw.personality !== null
          ? (raw.personality as any)
          : {},
      dialogueStyle:
        typeof raw.dialogueStyle === "object" && raw.dialogueStyle !== null
          ? (raw.dialogueStyle as any)
          : {},
      background: asStrOrNull(raw.background, "background") ?? "",
      abilities: asStrArray(raw.abilities, "abilities"),
      hiddenMotives: asStrArray(raw.hiddenMotives, "hiddenMotives"),
      relationships: (Array.isArray(raw.relationships)
        ? raw.relationships
        : []) as any,
      timeline: (Array.isArray(raw.timeline) ? raw.timeline : []) as any,
      arcProgress: asStrOrNull(raw.arcProgress, "arcProgress") ?? "",
      currentStatus: asStr(raw.currentStatus, "currentStatus", {
        max: 20,
        fallback: "alive",
      }),
      tags: asStrArray(raw.tags, "tags"),
    }));
    if (body instanceof NextResponse) return body;

    const character = await prisma.characterCard.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        aliases: body.aliases,
        age: body.age,
        gender: body.gender,
        role: body.role,
        appearance: body.appearance,
        personality: body.personality,
        dialogueStyle: body.dialogueStyle,
        background: body.background,
        abilities: body.abilities,
        hiddenMotives: body.hiddenMotives,
        relationships: body.relationships,
        timeline: body.timeline,
        arcProgress: body.arcProgress,
        currentStatus: body.currentStatus,
        tags: body.tags,
      },
    });
    // 异步刷新系统提示词
    syncGlobalPrompt(body.projectId).catch(() => {});
    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
