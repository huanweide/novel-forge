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
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import type { GenerationData } from "./types";
import { STORYLINE_STATUS, COMMITMENT_STATUS } from "@/core/story-status";
import type { Project, StoryNodeLight } from "@/core/types";
import { toAppStoryNode } from "@/core/story-node-bridge";
import { computeNarrativeStage } from "./narrative-stage";

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

  const [project, currentNode, allNodesLight, characters, loreEntries, summariesRaw, storyBeatsRaw, styleCard, pendingCommitmentsRaw, pendingItemsRaw, storylinesRaw, loreTablesRaw] =
    await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      // R2-012 按需加载：全量节点只取结构字段（id/parentId/type/title/order/status
      // 等），不拉每章正文 content——长项目可省 10~20MB 无效内存。
      // 仅当前章之前的「近期窗口」章节按需拉全量正文（供承接/连续性注入）。
      prisma.storyNode.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { order: "asc" },
        select: {
          id: true,
          parentId: true,
          type: true,
          title: true,
          order: true,
          status: true,
          branchId: true,
          activeLoreIds: true,
          activeCharacters: true,
        },
      }),
      // L1-002：与 loadOutlineData 对齐加 take 上限，避免长书每次生成搬运角色/世界书全集。
      // 注意：此处保留完整字段——下游编排器(buildPromptContext)与 lorebook 触发匹配
      // (matchLoreEntries/recall) 实际消费 background/aliases/personality/appearance/
      // storyLine/timeline/relationships 及 keys/depth/insertionOrder，窄列会破坏功能。
      getApprovedCharacters(prisma, projectId, { take: 50 }),
      getApprovedLore(prisma, projectId, { take: 50 }),
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
        where: { projectId, status: COMMITMENT_STATUS.PENDING },
        orderBy: [{ priority: "asc" }, { createdAt: "desc" }],
        take: 30,
      }),
      // 活跃剧情线：参与每章生成上下文（v0.33.0 接通）
      prisma.storyline.findMany({
        where: { projectId, status: STORYLINE_STATUS.ACTIVE },
        orderBy: { type: "asc" },
      }),
      // 结构化表格（LoreTable）：供触发词匹配吞并更长名候选（Round8 P0）
      prisma.loreTable.findMany({
        where: { projectId },
      }),
    ]);

  // ── 时间线过滤 ──
  // 当前章 order（0-based），用于过滤"未来章节"的数据。
  // chapterNumber 是 1-based (order + 1)。
  const currentOrder = currentNode?.order ?? 0;
  const chapterNum = currentOrder + 1;

  // R2-012：按需补全「当前章之前」章节的全量正文（只补窗口内，不无界全量拉 content）。
  //
  // 下游对「前文」有两种度量口径，必须分别覆盖，否则多卷/多节结构会错位或截断：
  //   (A) write/refine/continue 走「整体节点序号」窗口：
  //       - write/refine: previousNodes = allNodes.slice(idx - keepChapters, idx)
  //       - continue: allNodes.filter(n => n.order <= cur.order && n.content).slice(-5)
  //   (B) extractPrevContext 走「章/节节点序号」窗口（只取 type===chapter||section 的前 N 章）。
  //
  // 原实现只用 (A) 的整体序号窗口（keepWindow），当卷/节/幕节点穿插时，章序号窗口会超出
  // 整体序号窗口，导致 extractPrevContext 注入的前文被截断、且补拉正文与章序号错位（R2-012 退化）。
  //
  // 修复策略：
  //   - (A) 保留整体序号窗口，供 write/refine/continue。
  //   - (B) 新增章/节序号窗口，与 extractPrevContext 过滤口径（chapter||section）完全对齐；
  //         并做多卷感知——窗口下限至少下探到「当前卷起始章」+「上一卷尾部衔接章」，
  //         避免跨卷断崖；不再用单一「最近 5 章」一刀切导致跨卷丢失。
  //   - 两窗口取并集补拉正文；合并时按 id 回填到按 order 升序的骨架列表，章序号 1:1 对齐、不重排。
  const keepChapters = project?.contextKeepChapters ?? 4;
  const keepWindow = Math.max(keepChapters, 5); // 覆盖 continue 硬编码的 -5

  const allLight = allNodesLight as StoryNodeLight[];
  const curIdx = allLight.findIndex((n) => n.id === nodeId);

  // 章/节节点列表（与 extractPrevContext 的过滤口径完全一致：chapter || section）
  const CHAPTER_SECTION = new Set(["chapter", "section"]);
  const chapterNodes = allLight.filter((n: StoryNodeLight) => CHAPTER_SECTION.has(n.type));
  const curChIdx = chapterNodes.findIndex((n: StoryNodeLight) => n.id === nodeId);

  // parentId / 节点索引映射，用于向上回溯卷节点（多卷感知）
  const parentOf = new Map<string, string | null>();
  const nodeById = new Map<string, StoryNodeLight>();
  for (const n of allLight) {
    parentOf.set(n.id, n.parentId ?? null);
    nodeById.set(n.id, n);
  }
  // 返回某节点所属卷的 id（沿 parentId 向上找到 type===volume）；无卷则返回 null
  const findVolumeId = (id: string): string | null => {
    let cur: string | null = id;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const node = nodeById.get(cur);
      if (node && node.type === "volume") return node.id;
      cur = parentOf.get(cur) ?? null;
    }
    return null;
  };
  // 章/节节点对应的卷 id（预计算，避免重复回溯）
  const chVolumeIds = chapterNodes.map((n: any) => findVolumeId(n.id));

  const prevIds = new Set<string>();

  // (A) 整体序号窗口：覆盖 write/refine/continue 的按整体序号切片 / 最近有正文节点
  if (curIdx >= 0) {
    for (let i = Math.max(0, curIdx - keepWindow); i < curIdx; i++) {
      prevIds.add(allLight[i].id);
    }
  }

  // (B) 章/节序号窗口 + 多卷感知：与 extractPrevContext 对齐，并按卷边界扩展下限
  if (curChIdx >= 0) {
    // 默认：取当前章之前的 keepWindow 个章/节节点（对齐 extractPrevContext 的 prevCount=5）
    let windowStart = Math.max(0, curChIdx - keepWindow);

    const curVolumeId = chVolumeIds[curChIdx];
    if (curVolumeId) {
      // 当前卷在章/节数组中的起始下标
      const curVolFirstChIdx = chVolumeIds.indexOf(curVolumeId);
      if (curVolFirstChIdx >= 0) {
        windowStart = Math.min(windowStart, curVolFirstChIdx);
      }
      // 上一卷：order 小于当前卷 order 的最近一个 volume 节点
      const curVolOrder = nodeById.get(curVolumeId)?.order ?? 0;
      const prevVolume = allLight
        .filter((n: any) => n.type === "volume" && n.order < curVolOrder)
        .sort((a: any, b: any) => b.order - a.order)[0];
      if (prevVolume) {
        const prevVolChIdxes = chVolumeIds
          .map((vid: string | null, i: number) => ({ i, vid }))
          .filter((x: any) => x.vid === prevVolume.id)
          .map((x: any) => x.i);
        if (prevVolChIdxes.length > 0) {
          const prevVolLastChIdx = prevVolChIdxes[prevVolChIdxes.length - 1];
          const TAIL_BRIDGING = 3; // 上一卷尾部衔接章数量，避免跨卷断崖
          const extendStart = Math.max(0, prevVolLastChIdx - TAIL_BRIDGING + 1);
          windowStart = Math.min(windowStart, extendStart);
        }
      }
    }

    // 安全上限：避免超大卷导致无界补拉（保留 R2-012 性能收益）
    const MAX_CHAPTER_WINDOW = 60;
    if (curChIdx - windowStart > MAX_CHAPTER_WINDOW) {
      windowStart = Math.max(0, curChIdx - MAX_CHAPTER_WINDOW);
    }

    for (let i = windowStart; i < curChIdx; i++) {
      prevIds.add(chapterNodes[i].id);
    }
  }

  const prevIdsArr = [...prevIds];
  const prevFull =
    prevIdsArr.length > 0
      ? await prisma.storyNode.findMany({
          where: { id: { in: prevIdsArr } },
          orderBy: { order: "asc" }, // 显式按 order 排序，确保与章序号一一对应
        })
      : [];
  const prevFullMap = new Map((prevFull as any[]).map((n: any) => [n.id, n]));
  // 轻量结构列表 + 窗口内章/节补回全量正文；保持 allNodesLight 原有（按 order 升序）骨架顺序，
  // 下游逻辑无感、章序号不重排、与章节序号一一对应。
  const allNodes: any[] = allLight.map((n: any) => {
    const full = prevFullMap.get(n.id);
    return full ? full : n;
  });

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

  // v1.8.24：全书写作节奏阶段——基于当前章在章节列表中的位置 / 已存在章节总数估算进度。
  // 直接用本函数已算好的 chapterNodes（chapter||section 全量）与 curChIdx，零额外查询。
  const stageTotalChapters = chapterNodes.length;
  let stageChapterIndex = curChIdx;
  if (stageChapterIndex < 0) {
    // 当前节点不是 chapter/section 类型（如卷/幕节点）时的回退：用全局 order 估算相对位置。
    const maxOrder = allLight.reduce((m, n) => Math.max(m, (n as any).order ?? 0), 0);
    stageChapterIndex = Math.min(currentOrder, maxOrder);
  }
  const narrativeStage = computeNarrativeStage(stageChapterIndex, stageTotalChapters);

  return {
    project: project as Project,
    // currentNode 来自 prisma.storyNode.findUnique（可空），但 loadGenerationContext 的全部调用方
    // （write/refine/continue 路由）均在解构后 `if (!currentNode) return` 守卫，运行时保证此处非空；
    // 故用非空断言桥接 toAppStoryNode（集中处理 type/status 联合 + reviewLogs Json 鸿沟），
    // 不把 GenerationData.currentNode 改为可空（避免波及下游复制字段的 Narrow 连锁，属 D 类蔓延）。
    currentNode: toAppStoryNode(currentNode!),
    allNodes: allNodes as any,
    characters: characters as any,
    loreEntries: loreEntries as any,
    summaries: summaries as any,
    storyBeats: storyBeats as any,
    styleCard: styleCard as any,
    pendingCommitments: pendingCommitments as any,
    pendingItems: pendingItemsRaw as any,
    storylines: storylinesRaw as any,
    loreTables: (loreTablesRaw || []) as any,
    // v1.8.23：项目级摘要大纲（时间线 + 故事线），供写作上下文注入"此前发生了什么"
    timelineDigest: (project as any)?.timelineDigest ?? "",
    storylineDigest: (project as any)?.storylineDigest ?? "",
    // v1.8.24：全书写作节奏阶段，供写作上下文注入防抢跑指令
    narrativeStage,
  };
}
