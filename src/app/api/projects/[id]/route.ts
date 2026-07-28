import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

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
        storylines: { orderBy: [{ type: "asc" }, { order: "asc" }] },
        styleCards: true,
        loreTables: true,
      },
    });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (err) {
    return jsonError(err);
  }
}

// PATCH /api/projects/[id] — 更新项目（作者指令等）
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await prisma.project.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
        genre: body.genre,
        targetWordCount: body.targetWordCount,
        synopsis: body.synopsis,
        toneKeywords: body.toneKeywords,
        authorNote: body.authorNote,
        globalPrompt: body.globalPrompt,
        llmConfig: body.llmConfig,
      },
    });
    return NextResponse.json(updated);
  } catch (err) {
    return jsonError(err);
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
    return jsonError(err);
  }
}
