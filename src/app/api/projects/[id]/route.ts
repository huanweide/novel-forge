import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/projects/[id]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        characters: true,
        lorebookEntries: true,
        storyNodes: { orderBy: { order: "asc" } },
        storyBranches: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取项目失败" },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[id]
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const project = await prisma.project.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        genre: body.genre,
        targetWordCount: body.targetWordCount,
        synopsis: body.synopsis,
        toneKeywords: body.toneKeywords,
        povCharacterId: body.povCharacterId,
        authorNote: body.authorNote,
      },
    });
    return NextResponse.json(project);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新项目失败" },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[id] —— 轻量更新（authorNote 等单个字段）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const data: Record<string, unknown> = {};
    if (body.authorNote !== undefined) data.authorNote = body.authorNote;
    if (body.globalPrompt !== undefined) data.globalPrompt = body.globalPrompt;
    if (body.povCharacterId !== undefined) data.povCharacterId = body.povCharacterId;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
    }
    const project = await prisma.project.update({ where: { id }, data });
    return NextResponse.json({ ok: true, authorNote: project.authorNote });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "更新失败" },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[id]
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await prisma.project.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "删除项目失败" },
      { status: 500 }
    );
  }
}
