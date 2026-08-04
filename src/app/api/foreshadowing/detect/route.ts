/**
 * POST /api/foreshadowing/detect — 触发伏笔收束率检测
 *
 * 扫描埋设点之后的全部章节摘要，用语义种子回写每条伏笔的
 * status / fulfillmentRatio / fulfilledAt，并返回聚合收束率。
 * 设计为可重复调用的幂等操作；任何异常返回 ok:false 不抛 500。
 */

import { NextResponse } from "next/server";
import { detectPayoffs } from "@/core/foreshadowing";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const projectId =
      typeof body.projectId === "string" ? body.projectId : null;

    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "缺少 projectId" },
        { status: 400 },
      );
    }

    const stats = await detectPayoffs(projectId);
    return NextResponse.json({ ok: true, stats });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "检测失败" },
      { status: 500 },
    );
  }
}
