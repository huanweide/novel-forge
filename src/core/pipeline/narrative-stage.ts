/**
 * 全书写作节奏控制（v1.8.24）
 *
 * 设计来源：竞品 ai-novel-writer 的「6 阶段渐进节奏控制」——开篇 → 早期发展 →
 * 中期发展 → 后期发展 → 高潮 → 收尾，每个阶段的大纲范围 / 前瞻 / 剧透过滤随进度
 * 渐进变化，并有专属「防抢跑」指令。novel-forge 此前完全没有"全书进度"概念，
 * AI 写几十章后容易提前剧透终局、过早发动决战、或结尾又开新大线。
 *
 * 实现取舍：
 *  - 纯函数、零 schema 变更——阶段完全由「当前章序号 / 已存在章节总数」推导，
 *    不新增 Project 字段、不新增 UI 依赖，直接增强 v1.8.23 的注入链路。
 *  - 「规划总章数」锚点（Project.targetChapters）作为后续增强；当分母取「已存在章节
 *    总数」时，进度会随写作自然前移，本身就是合理的"动态进度"估算。
 *  - 阶段指令聚焦"该阶段不该做什么"（防抢跑），而非规定"必须写什么"——给 AI 足够
 *    的创作自由，只堵住破坏长线节奏的抢跑行为。
 */

export type NarrativeStageKey =
  | "opening"
  | "early"
  | "mid"
  | "late"
  | "climax"
  | "ending";

export interface NarrativeStage {
  /** 阶段标识 */
  key: NarrativeStageKey;
  /** 中文阶段名 */
  label: string;
  /** 全书进度百分比（0–100，基于 (chapterIndex+1)/totalChapters 四舍五入） */
  percent: number;
  /** 该阶段的写作指令 + 防抢跑约束 */
  directive: string;
}

interface StageDef {
  key: NarrativeStageKey;
  label: string;
  /** 进度上限百分比（含本值），用于阶段判定 */
  until: number;
  directive: string;
}

// 阶段阈值（基于全书进度百分比）。directive 全部以"防抢跑"为核心。
const STAGES: StageDef[] = [
  {
    key: "opening",
    label: "开篇",
    until: 8,
    directive:
      "当前处于【开篇】阶段。核心任务：建立世界观基调、引入主角与核心冲突、埋下主要伏笔。" +
      "严禁在本章展开终局走向、严禁提前揭晓终极谜底、严禁安排主线大决战或让主角获得终极力量——" +
      "开篇的价值是「立」，不是「解」。",
  },
  {
    key: "early",
    label: "早期发展",
    until: 30,
    directive:
      "当前处于【早期发展】阶段。在已建立的世界里铺开支线与人物关系，深化主角动机与处境。" +
      "严禁揭晓主线终局、严禁让核心冲突提前进入决战状态——让矛盾在积累中升温，而非提前引爆。",
  },
  {
    key: "mid",
    label: "中期发展",
    until: 55,
    directive:
      "当前处于【中期发展】阶段。让冲突持续升级，把开篇埋下的伏笔逐一铺开并相互交织，" +
      "多条线并行推进。严禁在此揭晓终极谜底、严禁提前发动终极对决——中盘要「厚」，不能过早透支高潮。",
  },
  {
    key: "late",
    label: "后期发展",
    until: 78,
    directive:
      "当前处于【后期发展】阶段。危机正在逼近，多条故事线进入收束前夜，主角力量与处境被推到临界点。" +
      "严禁让终极对决提前发生、严禁过早给出终局答案——把所有张力压到最后一刻再释放。",
  },
  {
    key: "climax",
    label: "高潮",
    until: 92,
    directive:
      "当前处于【高潮】阶段。允许并应当安排最大冲突、关键转折与终极对决，可在此揭晓核心谜底与伏笔收网。" +
      "注意节奏集中、篇幅给足，让此前所有铺垫在这一刻兑现。",
  },
  {
    key: "ending",
    label: "收尾",
    until: 100,
    directive:
      "当前处于【收尾】阶段。解开主要悬念、收束支线与人物弧光、给出情感落点。" +
      "严禁开启新的重大情节线、严禁引入需要长线展开的新设定——结尾的价值是「合」，不是「起」。",
  },
];

/**
 * 计算全书写作节奏阶段。
 *
 * @param chapterIndex  当前章在「章节节点列表」中的 0-based 索引（第 1 章为 0）。
 * @param totalChapters 已存在的章节总数（无规划总章数时作为进度分母）。
 * @param opts.targetChapters   作者规划的本书总章数；提供后用它做进度分母，
 *        避免「已写最后一章被误判为收尾」（用户要写几百章时尤为关键）。
 * @param opts.mainQuestComplete 后台判定：主线任务是否已收尾（主线 Storyline 标记 completed）。
 *        为 true 时直接进入「收尾」阶段，不靠章数硬判、也不显式逼 AI 收尾。
 */
export interface NarrativeStageOptions {
  targetChapters?: number | null;
  mainQuestComplete?: boolean;
}

const LATE_CAP_INDEX = STAGES.findIndex((s) => s.key === "late");

export function computeNarrativeStage(
  chapterIndex: number,
  totalChapters: number,
  opts?: NarrativeStageOptions,
): NarrativeStage {
  // 后台判定主线收尾：直接进入「收尾」阶段（不靠章数硬判）
  if (opts?.mainQuestComplete) {
    const ending = STAGES[STAGES.length - 1];
    return { key: ending.key, label: ending.label, percent: 100, directive: ending.directive };
  }

  const target = opts?.targetChapters && opts.targetChapters > 0 ? opts.targetChapters : null;
  // 分母：优先用作者规划总章数；否则用已存在章节数。
  const denom = target ?? Math.max(1, totalChapters);
  const safeIdx = Math.max(0, Math.min(chapterIndex, denom - 1));
  const percent = Math.round(((safeIdx + 1) / denom) * 100);

  let stageIdx = STAGES.findIndex((s) => percent <= s.until);
  if (stageIdx < 0) stageIdx = STAGES.length - 1;

  // 未声明规划总章数时：我们「不知道是否临近结尾」，故进度仅用于渐进收紧防抢跑，
  // 不得自动触发「高潮 / 收尾」——否则几百章计划只写了十几章就会被误判收尾。
  // 此时把阶段与展示进度都夹在「后期发展」以内。
  if (!target && stageIdx > LATE_CAP_INDEX) {
    stageIdx = LATE_CAP_INDEX;
    // 展示进度也夹住，避免 UI 出现「后期发展 · 100%」这类自相矛盾的数字
    const cappedPercent = Math.min(percent, STAGES[LATE_CAP_INDEX].until);
    const capped = STAGES[LATE_CAP_INDEX];
    return { key: capped.key, label: capped.label, percent: cappedPercent, directive: capped.directive };
  }

  const stage = STAGES[stageIdx];
  return { key: stage.key, label: stage.label, percent, directive: stage.directive };
}

/**
 * 将节奏阶段格式化为注入写作 / 章纲上下文的文本块。
 * stage 为空时返回空串（调用方可据此跳过注入，避免污染 prompt）。
 */
export function formatStage(stage: NarrativeStage | null | undefined): string {
  if (!stage) return "";
  return (
    `【全书进度阶段：${stage.label}（约 ${stage.percent}% 完成）】\n` + stage.directive
  );
}
