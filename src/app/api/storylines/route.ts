/**
 * GET /api/storylines — 列出项目的所有故事线
 * POST /api/storylines — 创建故事线
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const storylines = await prisma.storyline.findMany({
      where: { projectId },
      orderBy: [{ type: "asc" }, { order: "asc" }],
      include: { events: { orderBy: { position: "asc" } } },
    });
    return NextResponse.json(storylines);
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, type, parentId, title, description, order, ...rest } = body;

    if (!projectId || !title?.trim()) {
      return NextResponse.json({ error: "缺少 projectId 或 title" }, { status: 400 });
    }

    // #223：伏笔(thread)必须依附主线；若未显式指定 parentId，则挂到活跃主线，避免孤立成树
    let resolvedParentId = parentId || null;
    const resolvedType = type === "main" || type === "side" || type === "thread" ? type : "side";
    if (resolvedType === "thread" && !resolvedParentId) {
      const activeMain = await prisma.storyline.findFirst({
        where: { projectId, type: "main", status: "active" },
        orderBy: { order: "asc" },
      });
      resolvedParentId = activeMain?.id ?? null;
    }

    const storyline = await prisma.storyline.create({
      data: {
        projectId,
        type: resolvedType,
        parentId: resolvedParentId,
        title: title.trim(),
        description: description || "",
        order: order ?? 0,
        sevenElements: rest.sevenElements ?? null,
      },
    });
    return NextResponse.json(storyline, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
