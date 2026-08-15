import type { ProjectData, StoryNodeData } from "@/components/workspace/types";
import { NODE_TYPE } from "./node-type";
import {
  computeNarrativeStage,
  type NarrativeStage,
} from "./pipeline/narrative-stage";

/**
 * 工作区纯派生逻辑（从上帝组件 WorkspacePage 外提，便于单测、消除重复）。
 * 全部为纯函数：输入相同则输出相同，不触碰 React 状态 / 副作用。
 */

/**
 * 从项目数据中筛出「章节级」节点。
 * 卷（volume）只用于结构分组，不计入写作进度与确认统计；
 * 只有 章/节/幕（chapter/section/scene）参与。
 */
export function chapterNodesOf(
  project: ProjectData | null | undefined,
): StoryNodeData[] {
  if (!project?.storyNodes) return [];
  return project.storyNodes.filter(
    (n) =>
      n.type === NODE_TYPE.CHAPTER ||
      n.type === NODE_TYPE.SECTION ||
      n.type === NODE_TYPE.SCENE,
  );
}

/**
 * 全书章节是否全部已确认（无章节时视为未确认，避免空项目误显示「已定稿」）。
 */
export function allConfirmedOf(chapterNodes: StoryNodeData[]): boolean {
  return (
    chapterNodes.length > 0 &&
    chapterNodes.every((n) => n.status === "confirmed")
  );
}

/**
 * 基于当前选中章在全书章节列表中的进度位置推导叙事阶段。
 * 复用 computeNarrativeStage；主线 Storyline 标记 completed 时视为收尾。
 *
 * @param selectedNodeId  当前选中节点 id（未选中传 undefined/null）
 * @param chapterNodes    章节级节点列表（来自 chapterNodesOf）
 * @param storylines      项目故事线数组（用于判定主线是否收尾）
 */
export function narrativeStageOf(
  selectedNodeId: string | undefined | null,
  chapterNodes: StoryNodeData[],
  storylines: unknown[] | undefined | null,
): NarrativeStage | null {
  if (!selectedNodeId || chapterNodes.length === 0) return null;
  const idx = chapterNodes.findIndex((n) => n.id === selectedNodeId);
  if (idx < 0) return null;
  const mainQuestComplete =
    Array.isArray(storylines) &&
    storylines.some(
      (sl: any) => sl?.type === "main" && sl?.status === "completed",
    );
  return computeNarrativeStage(idx, chapterNodes.length, { mainQuestComplete });
}
