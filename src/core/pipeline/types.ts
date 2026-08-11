/**
 * 管线共享类型
 *
 * 这些类型被 context-loader / pre-processor / post-processor 共用，
 * 消除 write/refine/continue 三个路由间 ~60% 的重复代码。
 */

import type { CharacterCard, LorebookEntry, ChapterSummary, StoryNode, StoryBeat, Project } from "@/core/types";
import type { AgentOrchestrator } from "@/core/agents";

// ─── 数据加载 ─────────────────────────────────────────────

export interface GenerationData {
  project: Project;
  currentNode: StoryNode;
  allNodes: StoryNode[];
  characters: CharacterCard[];
  loreEntries: LorebookEntry[];
  summaries: ChapterSummary[];
  storyBeats: StoryBeat[];
  styleCard: Record<string, unknown> | null;
  pendingCommitments?: any[];
  pendingItems?: any[];
  storylines?: any[];
  /** 结构化表格（LoreTable）——供触发词匹配吞并更长名候选，避免3字 lorebook key 在表值前缀内误召回 */
  loreTables?: Array<{ name: string; columns: any[]; rows: any[] }>;
  /** v1.8.23：项目级摘要大纲（时间线 + 故事线），被写作上下文注入 */
  timelineDigest?: string;
  storylineDigest?: string;
}

// ─── 预处理 ───────────────────────────────────────────────

export interface LLMExtract {
  template: ReturnType<typeof import("@/core/templates").getTemplate>;
  customForbidden: string[];
  effectiveTemperature: number;
  effectiveTopP: number;
}

// ─── 后处理 ───────────────────────────────────────────────

export interface PostPipelineParams {
  /** SSE 发送回调 */
  send: (data: object) => void;
  /** 调度器实例 */
  orchestrator: AgentOrchestrator;
  /** 项目ID */
  projectId: string;
  /** 节点ID */
  nodeId: string;
  /** 完整生成内容 */
  content: string;
  /** 大纲文本（审校用） */
  nodeOutline: string;
  /** 当前活跃角色 */
  activeCharacters: CharacterCard[];
  /** 当前活跃世界书条目 */
  activeLore: LorebookEntry[];
  /** 前文章节摘要（审校用） */
  chapterSummaries: ChapterSummary[];
  /** 当前节点（保存审校日志用） */
  currentNode: StoryNode;
  /** 章节标题 */
  chapterTitle: string;
  /** 章节序号 */
  chapterOrder: number;
  /** 禁用词列表 */
  forbiddenPatterns: (string | import("@/lib/forbidden-checker").ForbiddenPattern)[];
  /** 跳过审校（refine 用） */
  skipReview?: boolean;
  /** 跳过摘要（refine 用） */
  skipSummarize?: boolean;
  /** 跳过一致性事实自动重抽（Next-3 护栏：纯续写意图不重抽基线，避免高频浪费；手动重抽仍可用） */
  skipConsistencyExtract?: boolean;
}

export interface PostPipelineResult {
  nodeId: string;
  status: string;
  reviewLog?: import("@/core/types").ReviewLog;
}
