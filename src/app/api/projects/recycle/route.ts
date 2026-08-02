import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// GET /api/projects/recycle —— 列出回收站（已软删除）项目
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      where: { deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
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
