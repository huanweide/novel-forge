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
import {
  buildTimelineDigest,
  buildStorylineDigest,
  type RawStorylineEvent,
} from "./digest-aggregate";

export interface ProjectDigest {
  timelineDigest: string;
  storylineDigest: string;
}

/**
 * 重建项目级摘要大纲（时间线 + 故事线），落库 Project 两字段并返回。
 *
 * 聚合逻辑已下沉到纯函数 digest-aggregate.ts（去重 + 垃圾过滤 + 排序），
 * 本函数只负责「取数 → 调纯函数 → 落库」，因此面板不可能再吐模板残片。
 *
 * 时间线摘要：按章序聚合各章 ChapterSummary.summary（去重 + 过滤垃圾，取最近 N 章）。
 * 故事线摘要：主线(main)的里程碑 / 事件(非 CLUE)按 position 串联，标注角色(推进 / 卡点 / 分支)。
 */
export async function rebuildProjectDigest(projectId: string): Promise<ProjectDigest> {
  const [nodes, mainLines] = await Promise.all([
    // v2.0.4：时间线直接抄各章章纲（node.outline），不再读 ChapterSummary
    prisma.storyNode.findMany({
      where: { projectId, deletedAt: null, type: { in: ["chapter", "section"] } },
      select: { id: true, order: true, title: true, outline: true },
      orderBy: { order: "asc" },
    }),
    prisma.storyline.findMany({
      where: { projectId, type: "main" },
      orderBy: { order: "asc" },
    }),
  ]);

  // 一次性取出本项目的全部主线事件，避免逐条主线 N+1 查询
  const allEvents = await prisma.storylineEvent.findMany({
    where: {
      storylineId: { in: (mainLines as Array<{ id: string }>).map((l) => l.id) },
    },
  });

  // v2.0.4：时间线 = 各章章纲按章序排列
  const timelineDigest = buildTimelineDigest(
    (nodes as Array<{ id: string; order: number; title: string; outline: string | null }>).map((n) => ({
      chapterId: n.id,
      order: n.order,
      title: n.title,
      outline: n.outline,
    })),
  );

  // 把事件按 storylineId 分组，喂给纯函数
  const eventsByLine: Record<string, RawStorylineEvent[]> = {};
  for (const e of allEvents as RawStorylineEvent[]) {
    (eventsByLine[e.storylineId as string] ??= []).push(e);
  }
  const storylineDigest = buildStorylineDigest(
    (mainLines as Array<{ id: string; title: string | null; description: string | null }>).map(
      (l) => ({ id: l.id, title: l.title, description: l.description }),
    ),
    eventsByLine,
  );

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
