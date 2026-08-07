// 故事线进度量化（v1.6.3）
// ───────────────────────────────────────────────────────────────
// 把一条故事线的「七要素填充度」+「章节进展数」折算为可展示的进度，
// 供故事线列表卡片下的进度条使用。
//
// 进度获取方式（明确、可复现）：
// - 七要素：desire(欲望)/obstacle(阻碍)/action(行动)/result(结果)/twist(意外)/turn(转折)/ending(结局)
//   任意一项为非空字符串即记 1 分；填充率 = 已填 / 7。
// - 章节进展：storyline.chapterBindings（写章/规划时回填的已绑定章节数组）长度；
//   以经验预期 12 章为完整故事线，封顶 100%。
// - 综合进度 = 七要素 60% + 章节 40%（七要素是「设定完整度」主权重，章节是「推进度」）。

export const SEVEN_ELEMENT_KEYS = [
  "desire", "obstacle", "action", "result", "twist", "turn", "ending",
] as const;

export type SevenElementKey = (typeof SEVEN_ELEMENT_KEYS)[number];

export const EXPECTED_CHAPTERS_PER_STORYLINE = 12;

export interface StorylineProgress {
  elementFilled: number;
  elementTotal: number;
  elementPercent: number; // 0-100
  chapterCount: number;
  chapterPercent: number; // 0-100
  overallPercent: number; // 0-100
  label: string;
}

export function computeStorylineProgress(s: any): StorylineProgress {
  const filled = SEVEN_ELEMENT_KEYS.filter(
    (k) => s && typeof s[k] === "string" && (s[k] as string).trim().length > 0,
  ).length;
  const elementTotal = SEVEN_ELEMENT_KEYS.length;
  const elementPercent = Math.round((filled / elementTotal) * 100);

  const bindings = Array.isArray(s?.chapterBindings) ? (s.chapterBindings as unknown[]) : [];
  const chapterCount = bindings.length;
  const chapterPercent = Math.min(
    100,
    Math.round((chapterCount / EXPECTED_CHAPTERS_PER_STORYLINE) * 100),
  );

  const overallPercent = Math.round(elementPercent * 0.6 + chapterPercent * 0.4);
  const label = `七要素 ${filled}/${elementTotal} · 已绑定 ${chapterCount} 章`;

  return {
    elementFilled: filled,
    elementTotal,
    elementPercent,
    chapterCount,
    chapterPercent,
    overallPercent,
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
