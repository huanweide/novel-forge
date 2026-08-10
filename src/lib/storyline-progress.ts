// 故事线进度量化（v1.8.4 重构）
// ───────────────────────────────────────────────────────────────
// 把一条故事线的「七要素填充度」折算为可展示的进度，供故事线列表卡片下的进度条使用。
//
// v1.8.4 变更：
// - 七要素从独立列（desire/obstacle/...）迁移为 Storyline.sevenElements JSON 字段；
// - 结局（ending）不计入填充度（用户要求结局不可预填，仅作「待收束/已收束」标记）；
// - 不再依赖 chapterBindings（已废弃），章节推进改由 StorylineEvent 时间轴记录。

export const SEVEN_ELEMENT_FILL_KEYS = [
  "desire", "obstacle", "action", "result", "twist", "turn",
] as const;

export type SevenElementFillKey = (typeof SEVEN_ELEMENT_FILL_KEYS)[number];

export interface StorylineProgress {
  elementFilled: number;
  elementTotal: number;
  elementPercent: number; // 0-100
  overallPercent: number; // 0-100（v1.8.4 起与 elementPercent 一致）
  hasEnding: boolean; // 结局是否已收束
  label: string;
}

export function computeStorylineProgress(s: any): StorylineProgress {
  const se = s?.sevenElements && typeof s.sevenElements === "object" ? s.sevenElements : {};
  const filled = SEVEN_ELEMENT_FILL_KEYS.filter(
    (k) => typeof se[k] === "string" && (se[k] as string).trim().length > 0,
  ).length;
  const elementTotal = SEVEN_ELEMENT_FILL_KEYS.length;
  const elementPercent = Math.round((filled / elementTotal) * 100);
  const hasEnding = typeof se.ending === "string" && se.ending.trim().length > 0;
  const overallPercent = elementPercent;
  const label = `要素 ${filled}/${elementTotal}（不含结局）${hasEnding ? " · 已收束" : ""}`;

  return {
    elementFilled: filled,
    elementTotal,
    elementPercent,
    overallPercent,
    hasEnding,
    label,
  };
}

// ─── 多主线分组（N2 修复） ─────────────────────────────────────
// 旧逻辑把主线当成单一对象（`find(s => s.type === "main")` 只取第一条），
// 多主线项目下（如 newMain 缝合怪产生「旧 completed 主线 + 新 active 主线」）
// 新活跃主线会被吞掉、支线误归属第一条主线。这里按所有主线分别聚合。
//
// 解析规则：
// - 优先用 parentId 精确匹配已知剧情线；
// - parentId 为空/悬空时，回退到「活跃（status=active）主线」，而非数组第一条；
//   若没有活跃主线则回退到第一条主线（保持旧单主线行为），再无则 null。

export interface StorylineGroup {
  mains: any[];
  sides: any[];
  /** 回退主线：parentId 解析失败时的默认归属 */
  fallbackMain: any | null;
  /** 解析某条线的归属主线（可能为自身若是主线） */
  resolveParent: (s: any) => any | null;
  /** 取某条主线名下的支线集合 */
  childrenOf: (mainId: string) => any[];
}

export function groupStorylinesByMain(storylines: any[]): StorylineGroup {
  const list = Array.isArray(storylines) ? storylines : [];
  const mains = list.filter((s) => s && s.type === "main");
  const sides = list.filter((s) => s && s.type === "side");
  const fallbackMain = mains.find((m) => m.status === "active") || mains[0] || null;

  const resolveParent = (s: any): any | null => {
    if (s && s.parentId) {
      const p = list.find((m) => m.id === s.parentId);
      if (p) return p;
    }
    return fallbackMain;
  };

  const childrenOf = (mainId: string) =>
    sides.filter((s) => resolveParent(s)?.id === mainId);

  return { mains, sides, fallbackMain, resolveParent, childrenOf };
}
