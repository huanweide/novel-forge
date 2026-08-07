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
import { STORYLINE_STATUS, withStorylineLock } from "@/core/story-status";

const STAGES = ["desire", "obstacle", "action", "result", "twist", "turn", "ending"] as const;

// 统一 bindings 数据结构（L3-003）：applyChapterPlanToStorylines 与 writeStorylineProgress
// 写入同形状，消除解析脆弱。两个函数各自只填自己关心的字段，其余补默认空值。
export interface ChapterBinding {
  storylineId: string;
  chapterId: string | null;
  chapterOrder: number | null;
  element: string | null;
  focus: string;
  advance: string[];
  note: string;
  at: string;
}

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
    const storylineId = tp.storylineId;
    try {
      // L3-003：按 storylineId 串行化读改写，避免并发写不同章时彼此覆盖丢失更新
      await withStorylineLock(storylineId, async () => {
        const sl = await prisma.storyline.findUnique({ where: { id: storylineId } });
        if (!sl || sl.projectId !== projectId || sl.status !== STORYLINE_STATUS.ACTIVE) return;
        const updateData: Record<string, unknown> = { [stage]: note };
        const bindings = Array.isArray(sl.chapterBindings) ? (sl.chapterBindings as unknown[]).slice() : [];
        // L3-003：写入统一形状（其余字段补默认空值，消除两种形状混存的解析脆弱）
        const binding: ChapterBinding = {
          storylineId,
          chapterId: nodeId,
          chapterOrder: chapterOrder ?? null,
          element: stage,
          focus: "",
          advance: [],
          note,
          at: new Date().toISOString(),
        };
        bindings.push(binding);
        updateData.chapterBindings = bindings.slice(-200);
        await prisma.storyline.update({ where: { id: sl.id }, data: updateData as any });
      });
    } catch {
      /* 单条回写失败不影响主流程 */
    }
  }
}
