/**
 * 故事线进度回写（v1.4.0）
 *
 * 背景：orchestrator.summarizeChapter 会计算 threadProgress（每章主/支线进展，
 * Array<{ storylineId, stage, progressNote, impactScore }>），但 post-processor 只存了
 * ChapterSummary 与 StoryBeat，threadProgress 被丢弃——「填表时把故事线进展填进去」的缺口。
 *
 * 规则（用户要求「只记录大事、不记录一起吃个饭这种细节」）：
 *  - stage 白名单：七要素 desire/obstacle/action/result/twist/turn/ending；
 *  - 仅 active 故事线；
 *  - impactScore < 4 跳过（orchestrator 语义：1-3 为日常过渡，4+ 才算大事）；
 *  - 覆写该七要素为 progressNote（一句话），并 push 进 chapterBindings 留痕（cap 200）。
 *  - 非法 storylineId / 项目不匹配 / 单条失败 → 静默降级，不影响主流程。
 */

import { prisma } from "@/lib/prisma";

const STAGES = ["desire", "obstacle", "action", "result", "twist", "turn", "ending"] as const;

export interface ThreadProgressItem {
  storylineId?: string;
  stage?: string;
  progressNote?: string;
  impactScore?: number;
}

export async function writeStorylineProgress(
  projectId: string,
  nodeId: string,
  chapterOrder: number | null | undefined,
  threadProgress: ThreadProgressItem[] | null | undefined,
): Promise<void> {
  if (!Array.isArray(threadProgress) || threadProgress.length === 0) return;
  for (const tp of threadProgress) {
    if (!tp || !tp.storylineId) continue;
    const stage = tp.stage;
    if (!stage || !(STAGES as readonly string[]).includes(stage)) continue;
    const note = (tp.progressNote || "").trim();
    if (!note) continue;
    // 只记录大事：impactScore 4+（1-3 为日常过渡，用户明确不要细节）
    if (typeof tp.impactScore === "number" && tp.impactScore < 4) continue;
    try {
      const sl = await prisma.storyline.findUnique({ where: { id: tp.storylineId } });
      if (!sl || sl.projectId !== projectId || sl.status !== "active") continue;
      const updateData: Record<string, unknown> = { [stage]: note };
      const bindings = Array.isArray(sl.chapterBindings) ? (sl.chapterBindings as unknown[]).slice() : [];
      bindings.push({
        element: stage,
        chapterId: nodeId,
        chapterOrder: chapterOrder ?? null,
        note,
        at: new Date().toISOString(),
      });
      updateData.chapterBindings = bindings.slice(-200);
      await prisma.storyline.update({ where: { id: sl.id }, data: updateData as any });
    } catch {
      /* 单条回写失败不影响主流程 */
    }
  }
}
