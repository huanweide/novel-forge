/**
 * 上下文加载器 —— 统一数据加载
 *
 * write / refine / continue 三个路由在生成前都需要加载同样的7张表。
 * 这个函数消除了每个路由 ~40 行的复制粘贴。
 */

import { prisma } from "@/lib/prisma";
import type { GenerationData } from "./types";

/**
 * 加载单章生成所需的所有上下文数据。
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
  const [project, currentNode, allNodes, characters, loreEntries, summaries, storyBeats, styleCard] =
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
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: summaryTake,
      }),
      prisma.storyBeat.findMany({
        where: { projectId },
        orderBy: { chapterNumber: "desc" },
        take: 20,
      }),
      prisma.styleCard.findFirst({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
      }),
    ]);

  return {
    project: project as any,
    currentNode: currentNode as any,
    allNodes: allNodes as any,
    characters: characters as any,
    loreEntries: loreEntries as any,
    summaries: summaries as any,
    storyBeats: storyBeats as any,
    styleCard: styleCard as any,
  };
}
