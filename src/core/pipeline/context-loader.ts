/**
 * 上下文加载器 —— 统一数据加载 + 时间线感知过滤
 *
 * write / refine / continue 三个路由在生成前都需要加载同样的7张表。
 * 这个函数消除了每个路由 ~40 行的复制粘贴。
 *
 * v3.1 时间线过滤：只加载 ≤ 当前章的数据，防止"未来章节"污染当前章的生成上下文。
 * 典型场景：写第7章时不会把第10章的角色状态/事件/伏笔注入进去。
 */

import { prisma } from "@/lib/prisma";
import type { GenerationData } from "./types";

/**
 * 加载单章生成所需的所有上下文数据。
 *
 * 自动按当前章 order 做时间线过滤——只加载 ≤ 当前章的数据，
 * 防止"未来章节"污染生成上下文（写第7章不会注入第10章的角色状态）。
 *
 * @param projectId  项目ID
 * @param nodeId     当前节点ID
 * @param summaryTake 摘要取最近几条（write/refine 默认3，continue 默认5）
 */
export async function loadGenerationContext(
  projectId: string,
  nodeId: string,
  summaryTake = 3,
): Promise<GenerationData> {

  const [project, currentNode, allNodes, characters, loreEntries, summariesRaw, storyBeatsRaw, styleCard, pendingCommitmentsRaw, pendingItemsRaw, storylinesRaw] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.storyNode.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
      }),
      prisma.characterCard.findMany({ where: { projectId } }),
      prisma.lorebookEntry.findMany({
        where: { projectId, enabled: true },
      }),
      // 摘要：先多拉一些，再按时间线过滤（ChapterSummary 无 chapterOrder 字段，需关联 node）
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 20, // 多拉一些，后续按 node order 过滤再截断
      }),
      // StoryBeat：先多拉一些，再按时间线过滤（chapterNum 在 Promise.all 外部才可用）
      prisma.storyBeat.findMany({
        where: { projectId },
        orderBy: { chapterNumber: "desc" },
        take: 30,
      }),
      prisma.styleCard.findFirst({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
      }),
      prisma.pendingCommitment.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 50, // 多拉一些，后续按 sourceNode 时间线过滤
      }),
      prisma.pendingItem.findMany({
        where: { projectId, status: "pending" },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 30,
      }),
      // 活跃剧情线：参与每章生成上下文（v0.33.0 接通）
      prisma.storyline.findMany({
        where: { projectId, status: "active" },
        orderBy: { type: "asc" },
      }),
    ]);

  // ── 时间线过滤 ──
  // 当前章 order（0-based），用于过滤"未来章节"的数据。
  // chapterNumber 是 1-based (order + 1)。
  const currentOrder = (currentNode as any).order as number;
  const chapterNum = currentOrder + 1;

  // 构建 nodeId → order 映射（用于 ChapterSummary / PendingCommitment 过滤）
  const nodeOrderMap = new Map<string, number>();
  for (const n of allNodes) {
    nodeOrderMap.set(n.id, (n as any).order ?? 0);
  }

  // ChapterSummary：只保留 order ≤ currentOrder 的摘要
  const summaries = summariesRaw
    .filter((s) => {
      const order = nodeOrderMap.get(s.chapterId);
      return order == null || order <= currentOrder;
    })
    .slice(0, summaryTake);

  // PendingCommitment：只保留 sourceNodeId ≤ 当前章的伏笔
  const pendingCommitments = pendingCommitmentsRaw
    .filter((pc) => {
      if (!pc.sourceNodeId) return true; // 用户手动创建的伏笔不过滤
      const order = nodeOrderMap.get(pc.sourceNodeId);
      return order == null || order <= currentOrder;
    })
    .slice(0, 30);

  // StoryBeat：只保留 chapterNumber ≤ 当前章的节拍
  const storyBeats = storyBeatsRaw
    .filter((b) => b.chapterNumber <= chapterNum)
    .slice(0, 20);

  return {
    project: project as any,
    currentNode: currentNode as any,
    allNodes: allNodes as any,
    characters: characters as any,
    loreEntries: loreEntries as any,
    summaries: summaries as any,
    storyBeats: storyBeats as any,
    styleCard: styleCard as any,
    pendingCommitments: pendingCommitments as any,
    pendingItems: pendingItemsRaw as any,
    storylines: storylinesRaw as any,
  };
}
