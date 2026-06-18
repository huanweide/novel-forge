import { NextRequest, NextResponse } from "next/server";
import { convertToProject } from "@/core/dissect/engine";

/**
 * POST /api/dissect/[id]/to-project
 *
 * 将已完成的拆书任务转为 Novel Forge 项目。
 * 自动创建：项目基本信息、角色卡、世界观条目、风格卡、章节大纲。
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const projectId = await convertToProject(id);

    return NextResponse.json({
      success: true,
      projectId,
      message: "已转为项目，点击跳转",
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
