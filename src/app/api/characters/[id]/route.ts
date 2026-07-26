import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

// GET /api/characters/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const character = await prisma.characterCard.findUnique({ where: { id } });
    if (!character) {
      return NextResponse.json({ error: "角色不存在" }, { status: 404 });
    }
    return NextResponse.json(character);
  } catch (err) {
    return jsonError(err);
  }
}

// PUT /api/characters/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const character = await prisma.characterCard.update({
      where: { id },
      data: {
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
        currentStatus: body.currentStatus,
        arcProgress: body.arcProgress,
        tags: body.tags,
      },
    });
    syncGlobalPrompt(body.projectId || character.projectId).catch(() => {});
    return NextResponse.json(character);
  } catch (err) {
    return jsonError(err);
  }
}

// DELETE /api/characters/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const card = await prisma.characterCard.findUnique({ where: { id }, select: { projectId: true } });
    await prisma.characterCard.delete({ where: { id } });
    if (card?.projectId) syncGlobalPrompt(card.projectId).catch(() => {});
    return NextResponse.json({ success: true });
  } catch (err) {
    return jsonError(err);
  }
}
