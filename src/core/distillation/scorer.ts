/**
 * 事件重要性评分引擎 —— S/A/B/C 四级分类
 *
 * 参考 aixiaoshuojia.cn 蒸馏系统（03-distillation-system.md）：
 *   score = 时效性分 + 事件类型分 + 伏笔关联分 + 角色重要性分
 *   ≥40 → S级, ≥20 → A级, ≥10 → B级, <10 → C级
 *
 * S级：永久影响故事走向（3-5条，完整注入 prompt）
 * A级：重要但非根本性转折（10-15条，压缩注入）
 * B级：推进当前剧情（关键词索引）
 * C级：填充性，不注入（仅存档）
 */

import type { EventTier, EventCategory, EventImportance } from "@/core/types";

// ─── 事件类型基础分映射 ─────────────────────────────────────

const EVENT_TYPE_SCORES: Record<EventCategory, number> = {
  death: 25,          // 角色死亡
  breakthrough: 20,   // 修为突破/境界提升
  inheritance: 15,    // 传承/神器/血脉获得
  plot_twist: 12,     // 剧情重大转折
  revelation: 10,     // 关键信息/秘密揭露
  battle: 5,          // 战斗
  interaction: 3,     // 角色互动
  daily: 1,           // 日常
};

// ─── 角色重要性加分 ────────────────────────────────────────

const CHARACTER_ROLE_SCORES: Record<string, number> = {
  protagonist: 10,    // 主角
  antagonist: 8,      // 反派
  mentor: 6,          // 导师
  love_interest: 5,   // 恋爱对象
  supporting: 3,      // 配角
  catalyst: 4,        // 剧情催化剂
  comic_relief: 2,    // 喜剧担当
  background: 1,      // 背景角色
};

// ─── 阈值 ─────────────────────────────────────────────────

const S_TIER_THRESHOLD = 40;
const A_TIER_THRESHOLD = 20;
const B_TIER_THRESHOLD = 10;

// ─── 事件分类规则 ──────────────────────────────────────────

/**
 * 从事件描述推断事件类型
 */
export function classifyEventCategory(description: string): EventCategory {
  const d = description.toLowerCase();

  // 死亡相关
  if (
    d.includes("死") || d.includes("杀") || d.includes("陨落") ||
    d.includes("牺牲") || d.includes("毙命") || d.includes("逝去")
  ) return "death";

  // 突破相关
  if (
    d.includes("突破") || d.includes("晋级") || d.includes("渡劫") ||
    d.includes("升阶") || d.includes("瓶颈") || d.includes("顿悟") ||
    d.includes("晋升") || d.includes("踏入")
  ) return "breakthrough";

  // 传承/获得
  if (
    d.includes("传承") || d.includes("获得") || d.includes("认主") ||
    d.includes("神器") || d.includes("血脉") || d.includes("觉醒") ||
    d.includes("习得") || d.includes("继承")
  ) return "inheritance";

  // 剧情转折
  if (
    d.includes("背叛") || d.includes("反转") || d.includes("真相") ||
    d.includes("倒戈") || d.includes("阴谋") || d.includes("揭露")
  ) return "plot_twist";

  // 关键信息揭露
  if (
    d.includes("发现") || d.includes("秘密") || d.includes("线索") ||
    d.includes("得知") || d.includes("消息") || d.includes("情报")
  ) return "revelation";

  // 战斗
  if (
    d.includes("战") || d.includes("打斗") || d.includes("对决") ||
    d.includes("比试") || d.includes("交锋") || d.includes("击杀") ||
    d.includes("攻击") || d.includes("防御")
  ) return "battle";

  // 角色互动
  if (
    d.includes("对话") || d.includes("见面") || d.includes("交谈") ||
    d.includes("商量") || d.includes("争执") || d.includes("和解") ||
    d.includes("约定")
  ) return "interaction";

  return "daily";
}

// ─── 核心评分函数 ──────────────────────────────────────────

export interface ScoreEventInput {
  /** 事件描述 */
  description: string;
  /** 距今多少章（0=本章） */
  chapterDiff: number;
  /** 事件类型（可选，不传则自动推断） */
  category?: EventCategory;
  /** 是否关联已埋伏笔（回收/强化） */
  isForeshadowRelated?: boolean;
  /** 是否新埋设伏笔 */
  isForeshadowPlanted?: boolean;
  /** 涉及的角色 ID 列表 */
  characterIds?: string[];
  /** 涉及角色名→角色定位 映射 */
  characterRoleMap?: Record<string, string>;
}

export interface ScoreEventOutput {
  importance: EventImportance;
  tier: EventTier;
  score: number;
}

/**
 * 对单个事件评分
 */
export function scoreEvent(input: ScoreEventInput): ScoreEventOutput {
  const {
    description,
    chapterDiff,
    category,
    isForeshadowRelated = false,
    isForeshadowPlanted = false,
    characterIds = [],
    characterRoleMap = {},
  } = input;

  let score = 0;

  // 1) 时效性分（距今越远分值越低，最多扣到0）
  score += Math.max(0, 10 - chapterDiff * 0.5);

  // 2) 事件类型分
  const cat = category || classifyEventCategory(description);
  score += EVENT_TYPE_SCORES[cat] || 3;

  // 3) 伏笔关联分
  if (isForeshadowRelated) {
    score += isForeshadowPlanted ? 20 : 15; // 回收伏笔比埋设更高
  }

  // 4) 角色重要性分（取最高值）
  let maxRoleScore = 0;
  for (const cid of characterIds) {
    const role = characterRoleMap[cid] || "background";
    const roleScore = CHARACTER_ROLE_SCORES[role] || 1;
    if (roleScore > maxRoleScore) maxRoleScore = roleScore;
  }
  score += maxRoleScore;

  // 5) 分层
  let tier: EventTier;
  if (score >= S_TIER_THRESHOLD) tier = "S";
  else if (score >= A_TIER_THRESHOLD) tier = "A";
  else if (score >= B_TIER_THRESHOLD) tier = "B";
  else tier = "C";

  return {
    importance: {
      description,
      score,
      tier,
      category: cat,
      isBreakthrough: cat === "breakthrough",
      isForeshadowRelated: isForeshadowRelated || isForeshadowPlanted,
      relatedCharacterIds: characterIds,
    },
    tier,
    score,
  };
}

/**
 * 批量评分 + 排序 + 分层截断
 *
 * @returns 分层后的事件容器（S≤5, A≤15, B不限, C不限）
 */
export function scoreAndClassifyEvents(
  events: ScoreEventInput[],
): {
  sTier: EventImportance[];
  aTier: EventImportance[];
  bTier: EventImportance[];
  cTier: EventImportance[];
} {
  // 全部评分
  const scored = events.map((e) => scoreEvent(e));

  // 按分数降序
  scored.sort((a, b) => b.score - a.score);

  // 分层截断
  const sTier = scored
    .filter((r) => r.tier === "S")
    .slice(0, 5)
    .map((r) => r.importance);

  const aTier = scored
    .filter((r) => r.tier === "A")
    .slice(0, 15)
    .map((r) => r.importance);

  const bTier = scored
    .filter((r) => r.tier === "B")
    .map((r) => r.importance);

  const cTier = scored
    .filter((r) => r.tier === "C")
    .map((r) => r.importance);

  return { sTier, aTier, bTier, cTier };
}

/**
 * 将 S/A 层事件格式化为 prompt 注入文本
 *
 * S层：完整事件描述（3-5条，每条带 [S-N] 标签）
 * A层：压缩描述（10-15条，每条带 [A-N] 标签）
 * B层：仅关键词列表
 */
export function formatEventsForPrompt(
  eventImportances: {
    sTier: EventImportance[];
    aTier: EventImportance[];
    bTier: EventImportance[];
  },
): string {
  const sections: string[] = [];

  // S层
  if (eventImportances.sTier.length > 0) {
    const sItems = eventImportances.sTier
      .map((e, i) => `[S-${i + 1}] ${e.description}（${e.category}，${e.score}分）`)
      .join("\n");
    sections.push(`【🔴 核心事件——必须记住】\n${sItems}`);
  }

  // A层
  if (eventImportances.aTier.length > 0) {
    const aItems = eventImportances.aTier
      .map((e, i) => `[A-${i + 1}] ${e.description}`)
      .join("\n");
    sections.push(`【🟡 重要事件——相关时引用】\n${aItems}`);
  }

  // B层——仅关键词
  if (eventImportances.bTier.length > 0) {
    const keywords = eventImportances.bTier
      .map((e) => e.description.slice(0, 30))
      .join("、");
    sections.push(`【🟢 背景事件索引】${keywords}`);
  }

  return sections.join("\n\n");
}
