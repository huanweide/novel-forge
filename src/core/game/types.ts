/**
 * 游戏模式（交互式文本冒险）—— 类型定义
 *
 * 游戏模式是"写正文的另一种方式"：
 * 用户输入行动 → AI 生成 1-3 段叙事 → 给出 2-4 个选项 → 循环
 * 最终累积正文保存为章节内容。
 */

// ─── 行动类型（6 个快捷按钮 + 自定义输入 + 选项选择）──────────

export type GameActionType =
  | "observe"   // 观察环境/人物
  | "dialogue"  // 与 NPC 对话
  | "combat"    // 战斗
  | "explore"   // 探索新区域
  | "use_item"  // 使用背包物品
  | "rest"      // 休息/恢复
  | "option"    // 选择了编号选项
  | "custom";   // 自定义文本输入

export const ACTION_LABELS: Record<GameActionType, string> = {
  observe: "观察",
  dialogue: "对话",
  combat: "战斗",
  explore: "探索",
  use_item: "使用物品",
  rest: "休息",
  option: "选项",
  custom: "自定义",
};

export const ACTION_ICONS: Record<GameActionType, string> = {
  observe: "🔍",
  dialogue: "💬",
  combat: "⚔️",
  explore: "🗺️",
  use_item: "🎒",
  rest: "💤",
  option: "🔢",
  custom: "✏️",
};

// ─── 游戏实体 ─────────────────────────────────────────────────

export interface GameEntity {
  name: string;
  type: string;       // character | location | item | faction | technique | creature | other
  description: string;
  firstSeenRound?: number; // 由引擎在持久化时设置
}

// ─── 背包物品 ─────────────────────────────────────────────────

export interface GameItem {
  name: string;
  quantity: number;
  category: string;   // consumable | equipment | quest | currency | other
  source: string;     // 获得来源描述
  acquiredRound: number;
}

// ─── 物品变动记录 ─────────────────────────────────────────────

export interface ItemChange {
  operation: "gain" | "consume" | "equip" | "discard";
  name: string;
  quantity?: number;
}

// ─── 游戏选项（下一轮）─────────────────────────────────────────

export interface GameOption {
  index: number;  // 1-4
  text: string;
}

// ─── 玩家行动输入 ─────────────────────────────────────────────

export interface GameActionInput {
  sessionId: string;
  actionType: GameActionType;
  actionText: string;       // 自定义文本 或 按钮标签
  selectedOption?: number;  // 如果选了编号选项
  targetItem?: string;      // 如果用物品，目标物品名
}

// ─── AI 回合输出 ──────────────────────────────────────────────

export interface GameTurnOutput {
  narrative: string;        // 1-3 段叙事正文
  options: GameOption[];    // 2-4 个选项
  newEntities: GameEntity[];
  itemChanges: ItemChange[];
  plotProgress: number;     // 0-100
  wordCount: number;        // 本轮字数
}

// ─── 游戏会话上下文（组装提示词用）────────────────────────────

export interface GameSessionContext {
  bookName: string;
  chapterTitle: string;
  outline: string | null;           // 章纲原文
  characters: Array<{
    name: string;
    role: string;
    currentStatus: string;
    briefDescription: string;
  }>;
  worldLore: Array<{
    title: string;
    content: string;
  }>;
  previousTurns: Array<{
    round: number;
    playerAction: string;
    narrative: string;
  }>;
  entities: GameEntity[];
  items: GameItem[];
  currentRound: number;
  totalWords: number;
  maxWords: number;
  plotProgress: number;
}

// ─── 游戏会话摘要（返回给前端）────────────────────────────────

export interface GameSessionSummary {
  id: string;
  projectId: string;
  nodeId: string;
  status: string;
  currentRound: number;
  totalWords: number;
  maxWords: number;
  plotProgress: number;
  entities: GameEntity[];
  items: GameItem[];
  lastOptions: GameOption[];
  allNarrative: string;     // 全部累积正文
  turns: Array<{
    round: number;
    playerAction: string;
    narrative: string;
    options: GameOption[];
  }>;
}
