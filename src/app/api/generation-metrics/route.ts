/**
 * 生成延迟硬指标聚合接口
 *
 * 呼应马斯克优化计划 P2「生成延迟当硬指标 / 超过两秒就是失败」：
 * 从已有的 LlmCallLog 表聚合真实生成的延迟分布，把延迟写进可观测面板。
 *
 * 数据来源：src/core/llm/client.ts 在 chat / chatStream 成功返回时，经
 * recordLlmCall（fire-and-forget）落库的 durationMs（端到端总耗时）与
 * firstTokenMs（到首个正文 token 的 TTFB）。失败/重试的记账（role 以
 * "fail:" 前缀）不计入延迟统计，避免拉高数值失真。
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** 马斯克铁律：P95 总延迟超过此阈值即判「失败」（毫秒） */
export const LATENCY_THRESHOLD_MS = 2000;

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] !== undefined) return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
  return sorted[base];
}

function summarize(values: number[]): { median: number; p95: number; avg: number } | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const avg = s.reduce((sum, v) => sum + v, 0) / s.length;
  return {
    median: Math.round(s[Math.floor(s.length / 2)]),
    p95: Math.round(quantile(s, 0.95)),
    avg: Math.round(avg),
  };
}

function isLocal(baseURL: string | null): boolean {
  if (!baseURL) return false;
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|:11434/.test(baseURL);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    const where: Record<string, unknown> = {
      role: { not: { startsWith: "fail:" } },
      durationMs: { not: null },
    };
    if (projectId) where.projectId = projectId;

    const logs = await prisma.llmCallLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      select: {
        durationMs: true,
        firstTokenMs: true,
        completionTokens: true,
        baseURL: true,
        createdAt: true,
      },
    });

    if (logs.length === 0) {
      return NextResponse.json({ ok: true, empty: true });
    }

    const durations = logs
      .map((l) => l.durationMs)
      .filter((v): v is number => typeof v === "number" && v > 0);
    const firstTokens = logs
      .map((l) => l.firstTokenMs)
      .filter((v): v is number => typeof v === "number" && v > 0);

    const total = summarize(durations);
    const firstToken = summarize(firstTokens);

    // 整体吞吐：总输出 token / 总耗时（秒）
    const totalCompletion = logs.reduce((s, l) => s + (l.completionTokens || 0), 0);
    const totalDurationSec = durations.reduce((s, d) => s + d, 0) / 1000;
    const throughput = totalDurationSec > 0 ? Math.round(totalCompletion / totalDurationSec) : null;

    // 本地 vs 云端分组对比 P95 总延迟
    const localDurations: number[] = [];
    const cloudDurations: number[] = [];
    for (const l of logs) {
      const d = l.durationMs;
      if (typeof d !== "number" || d <= 0) continue;
      if (isLocal(l.baseURL)) localDurations.push(d);
      else cloudDurations.push(d);
    }
    const local = summarize(localDurations);
    const cloud = summarize(cloudDurations);

    const timeSpanMs =
      logs.length > 1
        ? new Date(logs[0].createdAt).getTime() - new Date(logs[logs.length - 1].createdAt).getTime()
        : 0;

    return NextResponse.json({
      ok: true,
      empty: false,
      sampleSize: logs.length,
      firstToken, // { median, p95, avg } | null（仅流式生成有）
      total, // { median, p95, avg }
      throughput, // 整体输出吞吐 token/s | null
      byProvider: { local, cloud },
      overThreshold: (total?.p95 ?? 0) > LATENCY_THRESHOLD_MS,
      thresholdMs: LATENCY_THRESHOLD_MS,
      timeSpanMs,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
