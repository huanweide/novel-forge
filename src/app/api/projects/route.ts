import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import {
  readValidatedBody,
  asStr,
  asStrOrNull,
  asInt,
  asStrArray,
} from "@/lib/validators";

// GET /api/projects —— 获取所有「未删除」项目（回收站内的排除）
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
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

// POST /api/projects —— 创建新项目（接入 ARCH-3 校验：name 必填，脏数据在进入 prisma 前被拦下）
export async function POST(request: Request) {
  try {
    const body = await readValidatedBody(request, (raw) => ({
      name: asStr(raw.name, "name", { required: true, max: 200 }),
      description: asStrOrNull(raw.description, "description", 5000) ?? "",
      genre: asStrArray(raw.genre, "genre"),
      targetWordCount: asInt(raw.targetWordCount, "targetWordCount", 100000),
      synopsis: asStrOrNull(raw.synopsis, "synopsis", 10000) ?? "",
      toneKeywords: asStrArray(raw.toneKeywords, "toneKeywords"),
    }));
    if (body instanceof NextResponse) return body;

    const project = await prisma.project.create({
      data: {
        name: body.name,
        description: body.description,
        genre: body.genre,
        targetWordCount: body.targetWordCount,
        synopsis: body.synopsis,
        toneKeywords: body.toneKeywords,
      },
    });
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
