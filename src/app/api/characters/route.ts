import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
    return NextResponse.json(character, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建角色失败" },
      { status: 500 }
    );
  }
}
