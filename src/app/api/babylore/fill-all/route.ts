import { jsonError } from "@/lib/api-error";
import { NextResponse } from "next/server";
import { babyloreFillAll } from "@/core/babylore/fill";

export const maxDuration = 300;

// POST /api/babylore/fill-all  { projectId, tableKeys? }
// 一键填表：按 order 遍历所有有正文的章节，从首章填到最新；
// 已填章节自动跳过（防重复），填完后自动自检地名正确性与信息完整性。
export async function POST(request: Request) {
  try {
    const { projectId, tableKeys } = (await request.json()) as any;
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }
    const res = await babyloreFillAll(projectId, { tableKeys });
    return NextResponse.json(res);
  } catch (e) {
    return jsonError(e);
  }
}
