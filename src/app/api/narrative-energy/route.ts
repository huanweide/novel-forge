import { NextResponse } from "next/server";
import { computeNarrativeEnergy } from "@/core/narrative-energy";

export const dynamic = "force-dynamic";

/**
 * GET /api/narrative-energy?projectId=xxx
 * 返回该项目的叙事能量曲线（章节能量序列 + 节奏诊断）。
 * 纯只读聚合，无副作用；任何异常由核心兜底返回空结构。
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "缺少 projectId" },
        { status: 400 },
      );
    }
    const result = await computeNarrativeEnergy(projectId);
    return NextResponse.json({ ok: true, ...result });
  } catch {
    return NextResponse.json({ ok: false, error: "计算失败" }, { status: 500 });
  }
}
