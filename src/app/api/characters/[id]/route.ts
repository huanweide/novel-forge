import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取角色失败" },
      { status: 500 }
    );
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
        hiddenMotives: body.hiddenMotives,
        relationships: body.relationships,
        currentStatus: body.currentStatus,
        arcProgress: body.arcProgress,
        tags: body.tags,
      },
    });
    return NextResponse.json(character);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新角色失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/characters/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.characterCard.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "删除角色失败" },
      { status: 500 }
    );
  }
}
