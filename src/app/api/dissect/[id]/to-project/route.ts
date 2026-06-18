import { NextRequest, NextResponse } from "next/server";
import { convertToProject } from "@/core/dissect/engine";

/**
 * POST /api/dissect/[id]/to-project
 *
 * 将已完成的拆书任务转为 Novel Forge 项目。
 *
 * Body（可选）:
 *   { modifications?: string }  — 用户与Agent讨论后的修改要求
 *     - 不传 → 100%忠实还原原著
 *     - 传入 → 先应用修改再创建项目（修改要求会注入全局prompt）
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    let modifications: string | undefined;
    try {
      const body = await req.json();
      modifications = body?.modifications || undefined;
    } catch {
      // 无 body 或解析失败 → 原样转换
    }

    const projectId = await convertToProject(id, modifications);

    return NextResponse.json({
      success: true,
      projectId,
      adapted: !!modifications,
      message: modifications
        ? "改编项目已创建，已应用你的修改要求"
        : "项目已创建，100%忠实还原原著设定",
    });
  } catch (err: any) {
    console.error("[dissect/to-project] 转换失败:", err);

    const status =
      err.message === "拆书任务不存在" ? 404
      : err.message === "拆解尚未完成，无法转为项目" ? 400
      : 500;

    return NextResponse.json(
      { error: err?.message || "转换失败" },
      { status },
    );
  }
}
