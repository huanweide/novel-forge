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
