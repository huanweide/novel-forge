import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

// POST /api/characters
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const character = await prisma.characterCard.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        aliases: body.aliases || [],
        age: body.age || "未知",
        gender: body.gender || "未知",
        role: body.role || "supporting",
        appearance: body.appearance || {},
        personality: body.personality || {},
        dialogueStyle: body.dialogueStyle || {},
        background: body.background || "",
        abilities: body.abilities || [],
        hiddenMotives: body.hiddenMotives || [],
        relationships: body.relationships || [],
        timeline: body.timeline || [],
        arcProgress: body.arcProgress || "",
        currentStatus: body.currentStatus || "alive",
        tags: body.tags || [],
      },
    });
    // 异步刷新系统提示词
    syncGlobalPrompt(body.projectId).catch(() => {});
    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
