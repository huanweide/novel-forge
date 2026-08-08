import { NextResponse } from "next/server";
import { runProjectDiagnostics } from "@/core/diagnostics";

// GET /api/projects/[id]/diagnostics
// 一键项目自检：数据库 / LLM / 内容规模 / 回收站 / 待审卡 / 生成缓存 / 重名角色
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "缺少项目 id" }, { status: 400 });
    const report = await runProjectDiagnostics(id);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "自检失败" }, { status: 500 });
  }
}
