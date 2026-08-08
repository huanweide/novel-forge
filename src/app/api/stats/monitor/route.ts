/**
 * GET /api/stats/monitor?projectId=xxx&nodeId=xxx
 *
 * 监测面板数据——总字数/当前章字数/Token估算/章节统计。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";
import { STATUS_COMPLETED, STATUS_CONFIRMED, STATUS_PENDING_CONFIRM } from "@/core/story-status";
import { computeAutoRate } from "@/core/auto-rate";

// IMP-020：监控全月聚合（aggregate + groupBy）开销大，而结果仅随 projectId / 当月窗口变化，
// 与切章时的 nodeId 无关。做 30s 内存缓存，避免每次切章重跑全月 groupBy（byProject 分支此前白算）。
const MONITOR_CACHE_TTL_MS = 30_000;
// round-2 修复：缓存 Map 仅 set 不删会随项目数无限增长，长运行泄漏内存。加容量上限，超限清最旧。
const MONITOR_CACHE_MAX_SIZE = 512;
interface MonitorCacheEntry {
  ts: number;
  llmUsage: unknown;
  projectLlm: unknown;
}
const monitorCache = new Map<string, MonitorCacheEntry>();
function getCachedMonitor(projectId: string): MonitorCacheEntry | null {
  const hit = monitorCache.get(projectId);
  if (hit && Date.now() - hit.ts < MONITOR_CACHE_TTL_MS) return hit;
  return null;
}
function setCachedMonitor(projectId: string, llmUsage: unknown, projectLlm: unknown): void {
  monitorCache.set(projectId, { ts: Date.now(), llmUsage, projectLlm });
  // 容量护栏：超出上限时删最旧条目（Map 迭代顺序即插入顺序，firstKey 即最旧）
  if (monitorCache.size > MONITOR_CACHE_MAX_SIZE) {
    const oldestKey = monitorCache.keys().next().value;
    if (oldestKey !== undefined) monitorCache.delete(oldestKey);
  }
}

// F2（round-7 监控去误报延伸）：节点清单 + 三个 count 仅依赖 projectId，与切章(nodeId)无关。
// 此前每次切章都重跑全量 storyNode.findMany（长项目是无效重负载、存在超长请求风险）。
// 复用既有“按 projectId 内存缓存 + 容量护栏”机制，短 TTL 命中即跳过全量扫描。
// 注意：currentNode 依赖 nodeId，仍从（缓存/实查的）nodes 中 find，不随聚合缓存整段跳过。
const NODE_SCAN_CACHE_TTL_MS = 15_000;
const NODE_SCAN_CACHE_MAX_SIZE = 512;
type MonitorNode = {
  id: string;
  title: string;
  type: string;
  status: string;
  wordCount: number;
  order: number;
  updatedAt: Date;
  reviewLogs: unknown;
};
interface NodeScanEntry {
  ts: number;
  nodes: MonitorNode[];
  summaries: number;
  beats: number;
  commitments: number;
}
const nodeScanCache = new Map<string, NodeScanEntry>();
function getCachedNodeScan(projectId: string): NodeScanEntry | null {
  const hit = nodeScanCache.get(projectId);
  if (hit && Date.now() - hit.ts < NODE_SCAN_CACHE_TTL_MS) return hit;
  return null;
}
function setCachedNodeScan(
  projectId: string,
  nodes: MonitorNode[],
  summaries: number,
  beats: number,
  commitments: number,
): void {
  nodeScanCache.set(projectId, { ts: Date.now(), nodes, summaries, beats, commitments });
  if (nodeScanCache.size > NODE_SCAN_CACHE_MAX_SIZE) {
    const oldestKey = nodeScanCache.keys().next().value;
    if (oldestKey !== undefined) nodeScanCache.delete(oldestKey);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get("projectId");
  const nodeId = searchParams.get("nodeId");

  if (!projectId) {
    return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
  }

  try {
    // F2（round-7）：节点清单 + 三个 count 仅依赖 projectId，与切章(nodeId)无关。
    // 缓存命中即跳过全量 findMany，降低长项目切章的超长请求风险。
    const cachedScan = getCachedNodeScan(projectId);
    let nodes: MonitorNode[];
    let summaries: number;
    let beats: number;
    let commitments: number;
    if (cachedScan) {
      nodes = cachedScan.nodes;
      summaries = cachedScan.summaries;
      beats = cachedScan.beats;
      commitments = cachedScan.commitments;
    } else {
      [nodes, summaries, beats, commitments] = await Promise.all([
        prisma.storyNode.findMany({
          where: { projectId, deletedAt: null },
          select: { id: true, title: true, type: true, status: true, wordCount: true, order: true, updatedAt: true, reviewLogs: true },
          orderBy: { order: "asc" },
        }),
        prisma.chapterSummary.count({ where: { projectId } }),
        prisma.storyBeat.count({ where: { projectId } }),
        prisma.pendingCommitment.count({ where: { projectId } }),
      ]);
      setCachedNodeScan(projectId, nodes, summaries, beats, commitments);
    }

    const chapters = nodes.filter((n) => n.type === "chapter" || n.type === "section" || n.type === "scene");
    const totalWords = nodes.reduce((sum, n) => sum + (n.wordCount || 0), 0);
    const completedChapters = chapters.filter((n) => n.status === STATUS_COMPLETED).length;
    const pendingConfirmChapters = chapters.filter((n) => n.status === STATUS_PENDING_CONFIRM).length;
    const confirmedChapters = chapters.filter((n) => n.status === STATUS_CONFIRMED).length;
    const totalChapters = chapters.length;

    // 自动放行率：已确认章中由智能审阅（auto-confirm）自动审定的数量（纯函数，便于单测）
    const { autoConfirmed: autoConfirmedChapters, autoRate } = computeAutoRate(chapters);

    // 当前章节
    let currentNode: typeof nodes[0] | null = null;
    if (nodeId) {
      currentNode = nodes.find((n) => n.id === nodeId) || null;
    }
    const currentWords = currentNode?.wordCount || 0;

    // Token 估算：中文约 1 字 ≈ 0.8 token（生成），prompt 侧约 2x
    const estimatedGeneratedTokens = Math.round(totalWords * 0.8);
    const estimatedPromptTokens = Math.round(estimatedGeneratedTokens * 2.5);
    const estimatedTotalTokens = estimatedGeneratedTokens + estimatedPromptTokens;

    // 章节分布
    const chaptersWithWords = chapters.filter((n) => n.wordCount > 0);
    const avgWordsPerChapter = chaptersWithWords.length > 0
      ? Math.round(totalWords / chaptersWithWords.length)
      : 0;
    const maxChapterWords = chaptersWithWords.length > 0
      ? Math.max(...chaptersWithWords.map((n) => n.wordCount))
      : 0;
    const minChapterWords = chaptersWithWords.length > 0
      ? Math.min(...chaptersWithWords.map((n) => n.wordCount))
      : 0;

    // 近 14 天写作节奏（按章节 updatedAt 聚合字数，近似每日产出）
    const dayMap = new Map<string, number>();
    const base = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const n of nodes) {
      const ts = (n as { updatedAt?: Date | string }).updatedAt ? new Date((n as { updatedAt?: Date | string }).updatedAt as string) : null;
      if (!ts) continue;
      const day = ts.toISOString().slice(0, 10);
      if (dayMap.has(day)) dayMap.set(day, (dayMap.get(day) || 0) + (n.wordCount || 0));
    }
    const dailyWords = [...dayMap.entries()].map(([date, words]) => ({ date, words }));

    // AI 成本看板：本月全站 LLM 调用聚合（自 v0.46.20 起记录，client 层单点落库）。
    // 注：client 层不持有 project 上下文，故此处做「全局」聚合，展示全项目 AI 花费；
    // 不伪装 per-project 精确统计（若需 per-project 需在调用链注入 projectId，属独立优化）。
    const usageMonthStart = new Date();
    usageMonthStart.setDate(1);
    usageMonthStart.setHours(0, 0, 0, 0);
    // IMP-020：全月 LLM 聚合与 projectId 分组聚合开销大，切章（改 nodeId）不改变结果，
    // 故按 projectId 做 30s 缓存；命中则跳过下面两次 groupBy，避免重复全月重聚合。
    const cachedMonitor = getCachedMonitor(projectId);
    const { llmUsage, projectLlm } = cachedMonitor ?? await (async () => {
      const [llmAgg, llmByModel] = await Promise.all([
        prisma.llmCallLog.aggregate({
          where: { createdAt: { gte: usageMonthStart } },
          _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCost: true },
          _count: true,
        }),
        prisma.llmCallLog.groupBy({
          by: ["model"],
          where: { createdAt: { gte: usageMonthStart } },
          _sum: { totalTokens: true, estimatedCost: true },
          _count: true,
          orderBy: { _sum: { totalTokens: "desc" } },
        }),
      ]);
      const llmUsage = {
        since: usageMonthStart.toISOString().slice(0, 10),
        totalCalls: llmAgg._count,
        totalPromptTokens: llmAgg._sum.promptTokens || 0,
        totalCompletionTokens: llmAgg._sum.completionTokens || 0,
        totalTokens: llmAgg._sum.totalTokens || 0,
        totalCost: llmAgg._sum.estimatedCost || 0,
        byModel: llmByModel.map((g: { model: string; _count: number; _sum: { totalTokens?: number | null; estimatedCost?: number | null } }) => ({
          model: g.model,
          calls: g._count,
          tokens: g._sum.totalTokens || 0,
          cost: g._sum.estimatedCost || 0,
        })),
      };

    // P_a/P_c：按 projectId 分组聚合（本月）——使监测面板可展示「当前项目」与「全局」两档 token/费用。
    // 复用既有 llmCallLog（填表路径现也已带 projectId 落库），按 projectId 分组求和 estimatedCost。
    const [projectAgg, projectByProject] = await Promise.all([
      prisma.llmCallLog.aggregate({
        where: { createdAt: { gte: usageMonthStart }, projectId },
        _sum: { promptTokens: true, completionTokens: true, totalTokens: true, estimatedCost: true },
        _count: true,
      }),
      prisma.llmCallLog.groupBy({
        by: ["projectId"],
        where: { createdAt: { gte: usageMonthStart } },
        _sum: { totalTokens: true, estimatedCost: true, promptTokens: true, completionTokens: true },
        _count: true,
        orderBy: { _sum: { totalTokens: "desc" } },
      }),
    ]);
    const projectLlm = {
      since: usageMonthStart.toISOString().slice(0, 10),
      totalCalls: projectAgg._count,
      totalPromptTokens: projectAgg._sum.promptTokens || 0,
      totalCompletionTokens: projectAgg._sum.completionTokens || 0,
      totalTokens: projectAgg._sum.totalTokens || 0,
      totalCost: projectAgg._sum.estimatedCost || 0,
      byProject: projectByProject.map((g: { projectId: string | null; _count: number; _sum: { totalTokens?: number | null; estimatedCost?: number | null } }) => ({
        projectId: g.projectId,
        calls: g._count,
        tokens: g._sum.totalTokens || 0,
        cost: g._sum.estimatedCost || 0,
      })),
    };
      setCachedMonitor(projectId, llmUsage, projectLlm);
      return { llmUsage, projectLlm };
    })();

    return NextResponse.json({
      totalWords,
      totalChapters,
      completedChapters,
      completionRate: totalChapters > 0 ? Math.round((completedChapters / totalChapters) * 100) : 0,
      confirmStats: {
        pending: pendingConfirmChapters,
        confirmed: confirmedChapters,
        total: totalChapters,
        progress: totalChapters > 0 ? Math.round((confirmedChapters / totalChapters) * 100) : 0,
        autoConfirmed: autoConfirmedChapters,
        autoRate,
      },
      currentChapter: currentNode ? {
        id: currentNode.id,
        title: currentNode.title,
        wordCount: currentNode.wordCount,
        status: currentNode.status,
      } : null,
      tokens: {
        estimatedGenerated: estimatedGeneratedTokens,
        estimatedPrompt: estimatedPromptTokens,
        estimatedTotal: estimatedTotalTokens,
        note: "基于字数估算（中文 1字≈0.8生成token），精确值需启用 token 日志",
      },
      distribution: {
        avgWordsPerChapter,
        maxChapterWords,
        minChapterWords,
        chaptersWithContent: chaptersWithWords.length,
      },
      dataStats: {
        chapterSummaries: summaries,
        storyBeats: beats,
        pendingCommitments: commitments,
      },
      dailyWords,
      llmUsage,
      projectLlm,
    });
  } catch (err) {
    return jsonError(err);
  }
}
