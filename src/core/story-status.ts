// 章节状态机枚举（Max Loop Round5）：单一真相源，取代散落的状态字符串字面量
// 合法状态：
// - outline_only   : 仅章纲（未生成正文）
// - drafting       : 已生成，待确认
// - pending_confirm: 已提交，待确认通过
// - confirmed      : 已确认（定稿）
// - completed      : 打回重写中（v0.46.90 前也为"已完成"终态语义，打回后复用）
// - reviewing      : 遗留态（v0.46.90 前审校中，不再写入新数据，遇则需人工处理，不得自动放行）
export const STORY_NODE_STATUSES = [
  "outline_only",
  "drafting",
  "pending_confirm",
  "confirmed",
  "completed",
  "reviewing",
] as const;

export type StoryNodeStatus = (typeof STORY_NODE_STATUSES)[number];

// 单态常量（Max Loop Round9）：核心链路引用单一真相，取代散落字面量
export const STATUS_OUTLINE_ONLY: StoryNodeStatus = "outline_only";
export const STATUS_DRAFTING: StoryNodeStatus = "drafting";
export const STATUS_PENDING_CONFIRM: StoryNodeStatus = "pending_confirm";
export const STATUS_CONFIRMED: StoryNodeStatus = "confirmed";
export const STATUS_COMPLETED: StoryNodeStatus = "completed";
export const STATUS_REVIEWING: StoryNodeStatus = "reviewing";

// 可被自动/批量确认处理的状态（applyConfirm 条件更新的 where 用）
export const CONFIRMABLE_STATUSES: StoryNodeStatus[] = [STATUS_DRAFTING, STATUS_PENDING_CONFIRM];
