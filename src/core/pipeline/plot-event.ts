/**
 * 自动情节化：把「章节抽取的关键事件」(summary.keyEvents) 归纳为故事线事件 (StorylineEvent)。
 *
 * 设计：纯函数负责「算应新建哪些事件 + 分配 position + 去重」，落库由调用方
 * （apply-extraction 路由）执行。这样既能被单测覆盖真实逻辑，又不耦合数据库。
 *
 * 去重规则：同一章节(nodeId)已采纳过同标题的事件不重复新建；本批次内重复标题也只建一次。
 * 这保证用户多次点击「全部采纳」不会污染故事线。
 */

export interface PlotEventAdoptInput {
  /** 待采纳的情节文本（来自抽取 summary.keyEvents） */
  plotEvents: string[];
  /** 目标主线已有事件（只需 title 与 sourceRefs） */
  existingEvents: { title: string; sourceRefs: unknown }[];
  /** 来源章节节点 id，用于去重判定 */
  nodeId: string;
  /** 当前主线最大 position（无事件则为 0） */
  startPosition: number;
}

export interface PlotEventToCreate {
  title: string;
  content: string;
  position: number;
  sourceRefs: Array<{ type: "chapter"; ref: string }>;
}

export interface PlotEventAdoptOutput {
  toCreate: PlotEventToCreate[];
  adoptedCount: number;
}

/**
 * 容错归一 sourceRefs → 数组。
 * 历史存储有两种形态：直接存数组 [{...}]（storyline-writer / events 路由），
 * 或存 JSON 字符串（plan-chapter 旧写法）。两者都兼容。
 */
function normalizeRefs(v: unknown): any[] {
  if (Array.isArray(v)) return v as any[];
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/**
 * 计算情节事件采纳清单（纯函数）。
 * - 跳过空串
 * - 跳过「同一章节(nodeId)已采纳过同标题」的事件
 * - 跳过本批次内重复的标题
 * - 顺序分配 position：从 startPosition 之后逐个 +1（跳过项不占位，保持紧凑）
 */
export function computePlotEventAdoptions(input: PlotEventAdoptInput): PlotEventAdoptOutput {
  const alreadyAdopted = new Set(
    (input.existingEvents || [])
      .filter((e) =>
        normalizeRefs(e.sourceRefs).some(
          (r: any) => r && r.type === "chapter" && r.ref === input.nodeId,
        ),
      )
      .map((e) => (e.title || "").trim())
      .filter(Boolean),
  );

  const toCreate: PlotEventToCreate[] = [];
  const localSeen = new Set<string>();
  let pos = input.startPosition;

  for (const raw of input.plotEvents || []) {
    const text = (raw || "").trim();
    if (!text) continue;
    if (alreadyAdopted.has(text) || localSeen.has(text)) continue;
    pos += 1;
    toCreate.push({
      title: text,
      content: text,
      position: pos,
      sourceRefs: [{ type: "chapter", ref: input.nodeId }],
    });
    localSeen.add(text);
  }

  return { toCreate, adoptedCount: toCreate.length };
}
