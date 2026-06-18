// ============================================================
// 拆书系统类型定义
// ============================================================

/** 拆解深度 */
export type DissectDepth = "quick" | "standard" | "deep";

/** 拆书任务状态 */
export type DissectStatus =
  | "pending"
  | "chunking"
  | "extracting"
  | "completed"
  | "failed";

/** 15个维度标识 */
export const DISSECT_DIMENSIONS = [
  "basic_info",
  "worldview",
  "story_core",
  "characters",
  "plot_thread",
  "outline_summary",
  "foreshadowing",
  "map",
  "factions",
  "power_system",
  "special_settings",
  "currency",
  "items",
  "cultivation",
  "style_analysis",
] as const;

export type DimensionKey = (typeof DISSECT_DIMENSIONS)[number];

/** 维度中文名映射 */
export const DIMENSION_LABELS: Record<DimensionKey, string> = {
  basic_info: "基本信息",
  worldview: "世界观",
  story_core: "故事核心",
  characters: "角色",
  plot_thread: "情节脉络",
  outline_summary: "大纲摘要",
  foreshadowing: "伏笔",
  map: "地图",
  factions: "势力阵营",
  power_system: "力量体系",
  special_settings: "特殊设定",
  currency: "货币体系",
  items: "物品",
  cultivation: "功法体系",
  style_analysis: "写作风格分析",
};

/** 维度图标 */
export const DIMENSION_ICONS: Record<DimensionKey, string> = {
  basic_info: "📋",
  worldview: "🌍",
  story_core: "💎",
  characters: "👥",
  plot_thread: "🧵",
  outline_summary: "📑",
  foreshadowing: "🔮",
  map: "🗺️",
  factions: "⚔️",
  power_system: "⚡",
  special_settings: "🔧",
  currency: "💰",
  items: "🎒",
  cultivation: "📜",
  style_analysis: "✍️",
};

/** 维度分组（用于分批提取） */
export const DIMENSION_GROUPS: Record<DissectDepth, DimensionKey[][]> = {
  quick: [DISSECT_DIMENSIONS as unknown as DimensionKey[]], // 一次全提
  standard: [
    ["basic_info", "worldview", "story_core", "characters", "factions"],
    ["plot_thread", "outline_summary", "foreshadowing", "map"],
    ["power_system", "special_settings", "currency", "items", "cultivation"],
    ["style_analysis"],
  ],
  deep: DISSECT_DIMENSIONS.map((d) => [d]), // 每个维度单独调 LLM
};

/** 每个维度的提取结果 */
export interface DimensionResult {
  dimension: DimensionKey;
  label: string;
  icon: string;
  content: string; // Markdown 格式
  status: "pending" | "extracting" | "completed" | "failed";
  error?: string;
}

/** 章节信息 */
export interface ChapterInfo {
  index: number;
  title: string;
  startPos: number;
  endPos: number;
  summary?: string;
}

/** 仿写模式 */
export type ImitationMode = "full" | "partial" | "creative";

/** 仿写请求参数 */
export interface ImitationRequest {
  dissectionId: string;
  mode: ImitationMode;
  similarity: number; // 0-100
  selectedDimensions: DimensionKey[];
  customRequirement?: string;
  targetWordCount: number;
  chapterCount: number;
  genre?: string;
}

/** 拆书任务完整数据（从 DB 读出的形状） */
export interface DissectionTaskData {
  id: string;
  taskName: string;
  bookName: string;
  bookAuthor: string;
  depth: DissectDepth;
  extractChapterSummaries: boolean;
  status: DissectStatus;
  progress: number;
  totalChapters: number;
  completedChapters: number;
  dimensions: Record<string, DimensionResult>;
  chapterList: ChapterInfo[];
  error?: string;
  convertedToProjectId?: string;
  createdAt: Date;
  updatedAt: Date;
}
