import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { enrichForeshadow } from "@/core/foreshadowing";

/**
 * POST /api/foreshadowing/update
 *
 * 伏笔面板编辑入口：作者可手动更新伏笔的后续发展思路（developmentHint）、
 * 描述、状态、优先级；或请求 LLM 重新生成后续发展思路（regenerateHint）。
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      id?: string;
      projectId?: string;
      developmentHint?: string;
      description?: string;
      status?: string;
      priority?: string;
      regenerateHint?: boolean;
    };

    const { id, projectId, developmentHint, description, status, priority, regenerateHint } = body;

    if (!id) return NextResponse.json({ error: "缺少伏笔 id" }, { status: 400 });

    const existing = await prisma.pendingCommitment.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "伏笔不存在" }, { status: 404 });

    // 重新生成后续发展思路（需 projectId 以确定剧情上下文）
    if (regenerateHint) {
      if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
      const hint = await enrichForeshadow(projectId, id);
      if (!hint) return NextResponse.json({ error: "生成失败，请稍后重试" }, { status: 502 });
      return NextResponse.json({ ok: true, developmentHint: hint });
    }

    const data: any = {};
    if (typeof developmentHint === "string") data.developmentHint = developmentHint;
    if (typeof description === "string" && description.trim()) data.description = description;
    if (typeof status === "string") data.status = status;
    if (typeof priority === "string") data.priority = priority;

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有要修改的字段" }, { status: 400 });
    }

    await prisma.pendingCommitment.update({ where: { id }, data });
    return NextResponse.json({ ok: true, updated: { id, ...data } });
  } catch (err) {
    return jsonError(err);
  }
}
