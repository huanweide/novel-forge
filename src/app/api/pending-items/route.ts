// @deprecated: PendingItem 模型仍被写库，但此 HTTP 端点前端无调用
/**
 * GET/POST /api/pending-items
 *
 * 待兑现事项追踪 —— 用户说"下次让李尘去那个秘境"，
 * 系统自动记住并在下次写正文时注入提醒。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const status = searchParams.get("status") || "pending";

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const items = await prisma.pendingItem.findMany({
      where: { projectId, status },
      orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
      take: 50,
    });

    return NextResponse.json({ items });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, itemType, content, priority = "medium", source = "user", deadlineChapter } = body;

    if (!projectId || !content) {
      return NextResponse.json({ error: "缺少 projectId 或 content" }, { status: 400 });
    }

    const item = await prisma.pendingItem.create({
      data: {
        projectId,
        itemType: itemType || "user_note",
        content,
        priority,
        source,
        deadlineChapter,
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
