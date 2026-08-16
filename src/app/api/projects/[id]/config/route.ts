import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api";

// GET /api/projects/[id]/config — 读取写作自动化配置（v0.33.0）
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return jsonError("缺少项目ID", 400);
    const p = await prisma.project.findUnique({
      where: { id },
      select: {
        autoFillEnabled: true,
        fillFrequency: true,
        skipLatestChapter: true,
        contextKeepChapters: true,
        autoConfirmEnabled: true,
        autoDeliverEnabled: true,
      },
    });
    if (!p) return jsonError("项目不存在", 404);
    return NextResponse.json(p);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "读取配置失败", 500);
  }
}

// PUT /api/projects/[id]/config — 更新写作自动化配置（v0.33.0）
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return jsonError("缺少项目ID", 400);

    let body: any;
    try {
      body = await request.json();
    } catch {
      return jsonError("请求体不是合法 JSON", 400);
    }

    const data: Record<string, unknown> = {};

    if (typeof body.autoFillEnabled === "boolean") {
      data.autoFillEnabled = body.autoFillEnabled;
    }
    if (typeof body.fillFrequency === "number") {
      const n = Math.trunc(body.fillFrequency);
      if (n < 1 || n > 50) return jsonError("填表频率须为 1–50 的整数", 400);
      data.fillFrequency = n;
    }
    if (typeof body.skipLatestChapter === "boolean") {
      data.skipLatestChapter = body.skipLatestChapter;
    }
    if (typeof body.autoConfirmEnabled === "boolean") {
      data.autoConfirmEnabled = body.autoConfirmEnabled;
    }
    if (typeof body.autoDeliverEnabled === "boolean") {
      data.autoDeliverEnabled = body.autoDeliverEnabled;
    }
    if (typeof body.contextKeepChapters === "number") {
      const n = Math.trunc(body.contextKeepChapters);
      if (n < 1 || n > 50) return jsonError("上下文楼层须为 1–50 的整数", 400);
      data.contextKeepChapters = n;
    }

    if (Object.keys(data).length === 0) {
      return jsonError("无有效更新字段", 400);
    }

    const p = await prisma.project.update({
      where: { id },
      data,
      select: {
        autoFillEnabled: true,
        fillFrequency: true,
        skipLatestChapter: true,
        contextKeepChapters: true,
        autoConfirmEnabled: true,
        autoDeliverEnabled: true,
      },
    });
    return NextResponse.json(p);
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : "保存配置失败", 500);
  }
}
