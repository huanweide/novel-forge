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

    const storyline = await prisma.storyline.create({
      data: {
        projectId,
        type: type || "side",
        parentId: parentId || null,
        title: title.trim(),
        description: description || "",
        order: order ?? 0,
        desire: rest.desire || "",
        obstacle: rest.obstacle || "",
        action: rest.action || "",
        result: rest.result || "",
        twist: rest.twist || "",
        turn: rest.turn || "",
        ending: rest.ending || "",
        chapterBindings: rest.chapterBindings || [],
      },
    });
    return NextResponse.json(storyline, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
