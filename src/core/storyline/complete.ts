/**
 * 完结自动填写要素（#199）
 * 当一条故事线被标记为 completed 时，基于它已经发生的事件（主线额外聚合所有子支线事件）
 * 提炼出对应要素骨架并回填。规则：只补全空白字段，绝不覆盖作者已填内容。
 *
 * 不依赖 LLM：.env 中 LLM_API_KEY 可能为空，因此用确定性提炼保证始终可用，
 * 后续若有 LLM 可在此基础上润色（本模块保持纯函数，便于单测与替换）。
 *
 * 主线 → 三要素（起因 origin / 经过 process / 结果 result）
 * 支线 → 七要素（欲望 desire / 阻碍 obstacle / 行动 action / 结果 result / 意外 twist / 转折 turn / 结局 ending）
 * 结局 ending 按前端约定「写时再定，不预填」，始终留空。
 */

export type StorylineType = "main" | "side";

export const MAIN_ELEMENT_KEYS = ["origin", "process", "result"] as const;
export const SIDE_ELEMENT_KEYS = [
  "desire",
  "obstacle",
  "action",
  "result",
  "twist",
  "turn",
  "ending",
] as const;

export type EventLike = {
  kind?: string | null;
  content?: string | null;
  tag?: string | null;
  title?: string | null;
  position?: number | null;
};

function clip(text: string | null | undefined, max = 80): string {
  const t = (text ?? "").toString().trim();
  if (!t) return "";
  return t.length > max ? t.slice(0, max) + "…" : t;
}

// 取非 CLUE 事件，按时间轴排序，输出可作为要素素材的纯文本片段
function toPoints(events: EventLike[]): string[] {
  return (events || [])
    .filter((e) => e.kind !== "CLUE")
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((e) => clip(e.content) || clip(e.tag) || clip(e.title))
    .filter(Boolean);
}

/**
 * 由事件素材确定性提炼要素草稿。
 * - 主线：首尾事件分别作为起因/结果，中间事件串联为经过。
 * - 支线：按剧情节点位置映射到七要素；素材不足时留空（不编造噪声），结局永不留自动内容。
 */
export function deriveSevenElements(
  type: StorylineType,
  events: EventLike[],
): Record<string, string> {
  const pts = toPoints(events);
  const n = pts.length;

  if (type === "main") {
    const origin = n ? pts[0] : "（暂无事件，可手动补充起因）";
    const result = n ? pts[n - 1] : "（暂无事件，可手动补充结果）";
    const processText = n > 2 ? pts.slice(1, -1).join("；") : origin;
    return { origin, process: processText, result };
  }

  const at = (i: number) => (i < n ? pts[i] : "");
  const fromEnd = (k: number) => (k <= n ? pts[n - k] : "");
  return {
    desire: at(0) || "（开篇动机，待补充）",
    obstacle: at(1),
    action: at(2) || (n > 1 ? pts.slice(1).join("；") : ""),
    result: n >= 2 ? pts[n - 1] : "",
    twist: n >= 4 ? at(n - 3) : "", // 意外反转（更靠前）
    turn: n >= 5 ? at(n - 2) : "", // 立场/局势转折（更靠后，收束前）
    ending: "", // 结局交作者定稿，不预填
  };
}

/**
 * v1.8.13 生成主线时的确定性三要素骨架（简约/平常模式下「先把绝对主线的固线项拟定好」）。
 * 生成瞬间还没有事件，只能基于标题/概述拟一个底稿：经过用概述、起因兜底概述或标题、
 * 结果留「推进中」占位由后续完结/续写回填。创意模式不预填（交给 LLM 发挥）。
 */
export function deriveMainElements(seed: {
  title?: string | null;
  description?: string | null;
}): Record<string, string> {
  const title = (seed.title || "").trim();
  const desc = (seed.description || "").trim();
  const fallback = title ? `（${title} 待补充）` : "（主线待补充）";
  return {
    origin: desc || fallback,
    process: desc || fallback,
    result: "（主线推进中，结果待揭晓）",
  };
}

/**
 * 计算完结时应写回的 sevenElements：
 * 1. 主线聚合自身 + 所有子支线事件；支线仅用自身事件。
 * 2. 对每个允许字段：作者已填（非空）则保留，否则用 derived 补全。
 * 3. 只返回当前类型允许的键，顺带清理另一套要素的残留字段。
 */
export function completeStorylineElements(
  type: StorylineType,
  prevSevenElements: unknown,
  ownEvents: EventLike[],
  childEvents: EventLike[] = [],
): Record<string, string> {
  const all = type === "main" ? [...ownEvents, ...childEvents] : ownEvents;
  const derived = deriveSevenElements(type, all);
  const prev =
    prevSevenElements && typeof prevSevenElements === "object"
      ? (prevSevenElements as Record<string, string>)
      : {};
  const keys = (type === "main" ? MAIN_ELEMENT_KEYS : SIDE_ELEMENT_KEYS) as readonly string[];
  const merged: Record<string, string> = {};
  for (const k of keys) {
    const existing = prev[k];
    merged[k] = existing && existing.trim() ? existing : derived[k] ?? "";
  }
  return merged;
}
