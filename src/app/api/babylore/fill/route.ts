import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { babyloreFill } from "@/core/babylore/fill";

export const maxDuration = 120;

// POST /api/babylore/fill  { projectId, chapterText, tableKeys? }
// 宝宝流填表：每写完一章，DeepSeek 自动抽取结构化事实写入表格。
export async function POST(request: Request) {
  try {
    const { projectId, chapterText, tableKeys } = (await request.json()) as any;
    if (!projectId || !chapterText) {
      return NextResponse.json({ error: "缺少 projectId 或 chapterText" }, { status: 400 });
    }
    const res = await babyloreFill(projectId, chapterText, { tableKeys });
    return NextResponse.json(res);
  } catch (e) {
    return jsonError(e);
  }
}
