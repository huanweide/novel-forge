/**
 * 摘要大纲聚合模块（v1.8.23）
 *
 * 设计目标（瑞宝宝需求）：
 *  - 每一章都摘要下来，知道"此前各章按时间线大概发生了什么"——这是 AI 长期记忆的一部分。
 *  - 主线大事件（里程碑 / 事件）按时间轴聚合，描述"什么故事线在推进"。
 *  - 摘要大纲既是「更多▾ → 摘要大纲」可读面板，也是被写作 / 章纲上下文"全部读取"的注入块。
 *
 * 实现取舍：
 *  - 采用【纯函数式确定性聚合】，不调用 LLM——直接把各章 ChapterSummary + 主线 StorylineEvent
 *    拼成精简文字。好处：零 token 消耗、幂等、可重复、可被无头测试断言；坏处：文字不如 LLM 凝练。
 *    但对"长期记忆 / 此前发生了什么"这一用途，逐章摘要拼接恰恰是最忠实、最不易幻觉的方案。
 *  - 重建时机：写完一章（post-processor 落库 ChapterSummary 后）与「重新摘要」确认落库后自动触发；
 *    并提供 POST /api/generate/digest/rebuild 供手动按需重算。
 */

import { prisma } from "@/lib/prisma";

export interface ProjectDigest {
  timelineDigest: string;
  storylineDigest: string;
}

const MAX_TIMELINE_CHAPTERS = 20; // 时间线摘要最多保留最近 20 章，保持精简

/**
 * 重建项目级摘要大纲（时间线 + 故事线），落库 Project 两字段并返回。
 *
 * 时间线摘要：按章序聚合各章 ChapterSummary.summary（取最近 N 章）。
 * 故事线摘要：主线(main)的里程碑 / 事件(非 CLUE)按 position 串联，标注角色(推进 / 卡点 / 分支)。
 */
export async function rebuildProjectDigest(projectId: string): Promise<ProjectDigest> {
  const [summaries, nodes, mainLines] = await Promise.all([
    prisma.chapterSummary.findMany({ where: { projectId } }),
    prisma.storyNode.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, order: true, title: true },
    }),
    prisma.storyline.findMany({
      where: { projectId, type: "main" },
      orderBy: { order: "asc" },
    }),
  ]);

  // 章 id → {order, title} 映射，用于对摘要按章序排序
  const orderMap = new Map<string, { order: number; title: string }>();
  for (const n of nodes as Array<{ id: string; order: number; title: string }>) {
    orderMap.set(n.id, { order: n.order, title: n.title });
  }

  const sortedSummaries = (summaries as any[])
    .filter((s) => orderMap.has(s.chapterId))
    .sort((a, b) => {
      const oa = orderMap.get(a.chapterId)!.order;
      const ob = orderMap.get(b.chapterId)!.order;
      return oa - ob;
    });

  const timelineDigest = sortedSummaries
    .slice(-MAX_TIMELINE_CHAPTERS)
    .map((s) => {
      const meta = orderMap.get(s.chapterId)!;
      const chNo = meta.order + 1;
      const titleText = meta.title || `第${chNo}章`;
      // 避免标题已含"第X章"时重复前缀（如标题已是"第一章 启航"）
      const prefixedTitle = /^第\s*\d+\s*章/.test(titleText)
        ? titleText
        : `第${chNo}章 ${titleText}`;
      const text = String(s.summary || "").trim().slice(0, 220);
      return `${prefixedTitle}：${text}`;
    })
    .join("\n");

  // 故事线摘要：逐条主线聚合其大事件时间轴
  const storylineDigestParts: string[] = [];
  for (const line of mainLines as any[]) {
    const events = await prisma.storylineEvent.findMany({
      where: { storylineId: line.id, kind: { not: "CLUE" } },
      orderBy: { position: "asc" },
    });
    const evText = (events as any[])
      .slice(-24)
      .map((e) => {
        const role =
          e.role === "advance" ? "[推进点]" :
          e.role === "probe" ? "[卡点]" :
          e.role === "vote" ? "[分支选择点]" : "";
        const kindLabel = e.kind === "MILESTONE" ? "里程碑·" : "事件·";
        const title =
          e.title || (e.content ? String(e.content).slice(0, 40) : "") || "未命名";
        return `${role}${kindLabel}${title}`;
      })
      .join(" → ");
    const head = `【主线：${line.title}】${line.description ? ` ${line.description}` : ""}`;
    storylineDigestParts.push(evText ? `${head}\n时间轴：${evText}` : head);
  }
  const storylineDigest = storylineDigestParts.join("\n\n");

  await prisma.project.update({
    where: { id: projectId },
    data: { timelineDigest, storylineDigest },
  });

  return { timelineDigest, storylineDigest };
}

/**
 * 将摘要大纲格式化为注入写作 / 章纲上下文的文本块。
 * 两字段都为空时返回空串（调用方可据此跳过注入，避免污染 prompt）。
 */
export function formatDigest(input: {
  timelineDigest?: string | null;
  storylineDigest?: string | null;
}): string {
  const parts: string[] = [];
  const tl = (input.timelineDigest || "").trim();
  const sl = (input.storylineDigest || "").trim();
  if (tl) {
    parts.push(
      "【时间线摘要大纲——此前各章按时间顺序发生了什么（长期记忆，写下一章前必读）】\n" + tl,
    );
  }
  if (sl) {
    parts.push(
      "【故事线摘要大纲——主线大事件进展（长期记忆，写章纲 / 续写必读）】\n" + sl,
    );
  }
  return parts.join("\n\n");
}
