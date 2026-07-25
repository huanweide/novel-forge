import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

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
    return jsonError(err);
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
    return jsonError(err);
  }
}
