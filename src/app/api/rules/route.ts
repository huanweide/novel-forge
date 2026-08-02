import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import {
  readValidatedBody,
  asStr,
  asStrOrNull,
  asInt,
  asBool,
} from "@/lib/validators";

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
    const body = await readValidatedBody(request, (raw) => ({
      projectId: asStr(raw.projectId, "projectId", { required: true }),
      name: asStr(raw.name, "name", { required: true, max: 100 }),
      content: asStr(raw.content, "content", { required: true, max: 10000 }),
      category: asStr(raw.category, "category", { max: 30, fallback: "writing" }),
      priority: asInt(raw.priority, "priority", 0),
      scope: asStr(raw.scope, "scope", { max: 20, fallback: "all" }),
      enabled: asBool(raw.enabled, true),
    }));
    if (body instanceof NextResponse) return body;

    const rule = await prisma.rule.create({
      data: {
        projectId: body.projectId,
        name: body.name,
        content: body.content,
        category: body.category,
        priority: body.priority,
        scope: body.scope,
        enabled: body.enabled,
      },
    });
    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    return jsonError(err);
  }
}
