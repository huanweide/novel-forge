// 游戏模式 —— 前后端对账（纯函数，无服务端依赖，可被客户端组件安全引用）

import type { GameItem, GameEntity, GameOption } from "./types";

// 后端 GET /api/game/state 返回的权威摘要（字段子集，兼容性宽松）
export interface BackendGameSummary {
  currentRound: number;
  totalWords: number;
  plotProgress: number;
  items?: GameItem[];
  entities?: GameEntity[];
  narrative?: string;          // 拼接后的全文
  options?: GameOption[];      // 兼容别名
  turns?: Array<{ round: number; playerAction: string; narrative: string; options?: GameOption[] }>;
  allNarrative?: string;       // GameSessionSummary 全量字段
  lastOptions?: GameOption[];  // GameSessionSummary 全量字段
}

export interface ReconciledGameState {
  currentRound: number;
  totalWords: number;
  plotProgress: number;
  narrative: string;
  items: GameItem[];
  entities: GameEntity[];
  options: GameOption[];
  turns: Array<{ round: number; playerAction: string; narrative: string }>;
}

/**
 * 前端不可变背包更新（阿游 P1-1）。
 * 与后端 applyItemChanges 语义一致，但作为纯函数独立存在，避免把服务端 prisma 依赖带入客户端组件。
 * 关键点：绝不原地改写入参（prevItems 或其内部对象），始终返回新数组/新对象，保证 React 不可变更新。
 */
export function applyFrontendItemChanges(
  prevItems: GameItem[],
  changes: Array<{ operation: string; name: string; quantity?: number; owner?: string }>,
  newRound: number
): GameItem[] {
  const DEFAULT_OWNER = "主角";
  let items: GameItem[] = prevItems.map((i) => ({ ...i }));
  for (const change of changes) {
    const owner = change.owner || DEFAULT_OWNER;
    const match = (i: GameItem) =>
      i.name === change.name && (i.owner || DEFAULT_OWNER) === owner;

    if (change.operation === "gain") {
      const idx = items.findIndex(match);
      if (idx >= 0) {
        items = items.map((i, k) =>
          k === idx
            ? { ...i, quantity: i.quantity + (change.quantity || 1), owner: i.owner || owner }
            : i
        );
      } else {
        items = [
          ...items,
          {
            name: change.name,
            quantity: change.quantity || 1,
            category: "other",
            source: `第${newRound}轮获得`,
            acquiredRound: newRound,
            owner,
          },
        ];
      }
    } else if (change.operation === "consume" || change.operation === "discard") {
      const idx = items.findIndex(match);
      if (idx >= 0) {
        const q = items[idx].quantity - (change.quantity || 1);
        items =
          q <= 0
            ? items.filter((_, k) => k !== idx)
            : items.map((i, k) => (k === idx ? { ...i, quantity: q } : i));
      }
    } else if (change.operation === "equip") {
      const idx = items.findIndex(match);
      if (idx >= 0) {
        items = items.map((i, k) => (k === idx ? { ...i, equipped: true } : i));
      }
    } else if (change.operation === "unequip") {
      // 与后端 game-engine.ts:71-74 对齐：仅清 equipped 标记，物品仍在背包（不删）。
      const idx = items.findIndex(match);
      if (idx >= 0) {
        items = items.map((i, k) => (k === idx ? { ...i, equipped: false } : i));
      }
    } else if (change.operation === "destroy") {
      // 与后端 game-engine.ts:85-95 对齐：数量递减，归零即从背包移除（splice）。
      const idx = items.findIndex(match);
      if (idx >= 0) {
        const q = items[idx].quantity - (change.quantity || 1);
        items =
          q <= 0
            ? items.filter((_, k) => k !== idx)
            : items.map((i, k) => (k === idx ? { ...i, quantity: q } : i));
      }
    } else if (change.operation === "skip") {
      // 与后端 game-engine.ts:96-98 对齐：流转/出售类，安全跳过，不改动背包。
      // no-op
    } else {
      // 与后端 applyItemChanges 兜底对齐（阿游 P1-1）：未知动词不全盘丢弃。
      // 解析器仅归一 OP_MAP 内动词，OP_MAP 外的「获得类」近义词（如「捞到」「赢取」）
      // 会原样透传；后端 GAIN_LIKE 兜底按 gain 入库，前端此前静默丢弃 → 背包暂态错位。
      // 此处与后端同语义：GAIN_LIKE 类按 gain 处理，SAFE_SKIP 类（流转/出售）与真正未知动词安全跳过（不污染背包计数）。
      const SAFE_SKIP = new Set([
        "出售", "售卖", "交换", "交易", "卖出", "买出", "当掉", "典当", "抵押", "典押",
      ]);
      const GAIN_LIKE = new Set([
        "获得", "得到", "获取", "收下", "赢得", "缴获", "收到", "得手", "到手",
        "拾取", "捡到", "取得", "拾起", "拿", "捞到", "赢取", "劫得", "霸占",
      ]);
      if (GAIN_LIKE.has(change.operation)) {
        const idx = items.findIndex(match);
        if (idx >= 0) {
          items = items.map((i, k) =>
            k === idx
              ? { ...i, quantity: i.quantity + (change.quantity || 1), owner: i.owner || owner }
              : i
          );
        } else {
          items = [
            ...items,
            {
              name: change.name,
              quantity: change.quantity || 1,
              category: "other",
              source: `第${newRound}轮获得`,
              acquiredRound: newRound,
              owner,
            },
          ];
        }
      }
      // SAFE_SKIP / 其余真正未知动词：no-op（不改动背包，与后端一致）
    }
  }
  return items;
}

/**
 * 将后端权威摘要映射为前端需要整体覆盖的字段。
 * 用于 abort/停止/断网后对账回拉，使前端轮次/背包/正文与后端一致（阿游 P0-2）。
 * 纯函数，便于单测。
 */
export function reconcileFromSummary(summary: BackendGameSummary): ReconciledGameState {
  return {
    currentRound: summary.currentRound,
    totalWords: summary.totalWords,
    plotProgress: summary.plotProgress,
    narrative: summary.allNarrative ?? summary.narrative ?? "",
    items: summary.items || [],
    entities: summary.entities || [],
    options: summary.lastOptions ?? summary.options ?? [],
    turns: (summary.turns || []).map((t) => ({
      round: t.round,
      playerAction: t.playerAction,
      narrative: t.narrative,
    })),
  };
}
