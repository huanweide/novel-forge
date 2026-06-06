import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// GET /api/projects —— 获取所有项目
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            characters: true,
            lorebookEntries: true,
            storyNodes: true,
          },
        },
      },
    });
    return NextResponse.json(projects);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "获取项目失败" },
      { status: 500 }
    );
  }
}

// POST /api/projects —— 创建新项目
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const project = await prisma.project.create({
      data: {
        name: body.name || "未命名项目",
        description: body.description || "",
        genre: body.genre || [],
        targetWordCount: body.targetWordCount || 100000,
        synopsis: body.synopsis || "",
        toneKeywords: body.toneKeywords || [],
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "创建项目失败" },
      { status: 500 }
    );
  }
}
