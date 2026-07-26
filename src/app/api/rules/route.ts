import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

// GET /api/rules —— 获取规则列表（按 projectId 过滤）
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const rules = await prisma.rule.findMany({
      where: { projectId },
      orderBy: [{ enabled: "desc" }, { priority: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json(rules);
  } catch (err) {
    return jsonError(err);
  }
}

// POST /api/rules —— 创建新规则
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, name, content, category, priority, scope } = body;

    if (!projectId || !name?.trim() || !content?.trim()) {
      return NextResponse.json(
        { error: "缺少必填字段：projectId, name, content" },
        { status: 400 }
      );
    }

    const rule = await prisma.rule.create({
      data: {
        projectId,
        name: name.trim(),
        content: content.trim(),
        category: category || "writing",
        priority: priority ?? 0,
        scope: scope || "all",
        enabled: true,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
