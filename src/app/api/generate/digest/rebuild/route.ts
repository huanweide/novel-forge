import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { rebuildProjectDigest } from "@/core/pipeline/digest";

/**
 * POST /api/generate/digest/rebuild
 *
 * 手动重建项目级摘要大纲（时间线 + 故事线）。
 * 前端「摘要大纲」面板的「重新生成」按钮调用此端点；
 * 写章 / 重新摘要落库后会自动触发，此处供用户按需强制重算。
 *
 * 请求体：{ projectId }
 * 返回：{ timelineDigest, storylineDigest }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId } = body as { projectId?: string };
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const digest = await rebuildProjectDigest(projectId);
    return NextResponse.json(digest);
  } catch (err) {
    return jsonError(err);
  }
}
