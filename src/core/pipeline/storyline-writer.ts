/**
 * 故事线进度回写（v1.4.0 / v1.8.4 重构）
 *
 * 背景：orchestrator.summarizeChapter 会计算 threadProgress（每章主/支线进展，
 * Array<{ storylineId, stage, progressNote, impactScore }>），但 post-processor 只存了
 * ChapterSummary 与 StoryBeat，threadProgress 被丢弃——「填表时把故事线进展填进去」的缺口。
 *
 * 规则（用户要求「只记录大事、不记录一起吃个饭这种细节」）：
 *  - stage 白名单：七要素 desire/obstacle/action/result/twist/turn/ending；
 *  - 仅 active 故事线；
 *  - impactScore < 4 跳过（orchestrator 语义：1-3 为日常过渡，4+ 才算大事）；
 *  - v1.8.4 起改为向 StorylineEvent 写入「时间轴大事件」（MILESTONE），
 *    不再覆写 sevenElements 框架、不再维护 chapterBindings 数组，
 *    满足用户「时间轴记录大事件」需求且不污染总纲七要素。
 *  - 非法 storylineId / 项目不匹配 / 单条失败 → 静默降级，不影响主流程。
 */

import { prisma } from "@/lib/prisma";
import { STORYLINE_STATUS, withStorylineLock } from "@/core/story-status";

const STAGE_LABELS: Record<string, string> = {
  desire: "欲望推进",
  obstacle: "障碍显现",
  action: "行动展开",
  result: "结果落定",
  twist: "意外转折",
  turn: "局势转向",
  ending: "走向收束",
};

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
    if (!stage || !(stage in STAGE_LABELS)) continue;
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
        const label = STAGE_LABELS[stage] || "进展";
        const position = typeof chapterOrder === "number" ? chapterOrder : 0;
        await prisma.storylineEvent.create({
          data: {
            storylineId: sl.id,
            kind: "MILESTONE",
            tag: stage,
            title: `${label}（第 ${position} 章）`,
            content: note,
            position,
            sourceRefs: [{ nodeId, chapterOrder: position }],
          },
        });
      });
    } catch {
      /* 单条回写失败不影响主流程 */
    }
  }
}
