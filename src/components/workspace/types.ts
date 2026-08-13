import { WORLD_CATEGORY_SECTIONS, type WorldCategory } from "@/lib/world-category-classifier";
/**
 * Workspace 共享类型
 * 从 page.tsx 内联类型提取，供各子组件复用。
 */

export interface ProjectData {
  id: string;
  name: string;
  genre: string[];
  synopsis: string;
  toneKeywords: string[];
  characters: CharacterData[];
  lorebookEntries: LorebookData[];
  storyNodes: StoryNodeData[];
  storylines?: StorylineData[];
  styleCard?: {
    styleDescription?: string;
    povType?: string;
    narrativeDistance?: string;
    dialogueRatio?: number;
    descriptionRatio?: number;
    actionRatio?: number;
    innerThoughtRatio?: number;
    tonalMarkers?: Record<string, number>;
    lexicalFeatures?: Record<string, number>;
    avgSentenceLength?: number;
  } | null;
  /** 探讨模式布置配置（结构化保存，含 plotStructure/forceOriginalNames/autoGenerateStoryline 等） */
  buildConfig?: Record<string, unknown> | null;
  /** 确认流程：整本交付完成时间戳（null=未整体确认交付） */
  confirmedAt: string | null;
  /** Round3：智能审阅（auto-confirm）开关，默认开 */
  autoConfirmEnabled?: boolean;
  /** v1.1.0：全书智能交付自动执行开关，默认开 */
  autoDeliverEnabled?: boolean;
  /** v1.8.23：摘要大纲——项目级聚合（时间线 + 故事线），被写作/章纲上下文读取 */
  timelineDigest?: string;
  storylineDigest?: string;
}

export interface CharacterData {
  id: string;
  name: string;
  aliases?: string[];
  role: string;
  age: string;
  gender: string;
  appearance?: Record<string, unknown>;
  personality: string[] | Record<string, unknown>;
  background?: string;
  storyLine?: string;
  abilities?: string[];
  hiddenMotives?: string[];
  relationships?: Record<string, unknown>[];
  dialogueStyle?: Record<string, unknown>;
  timeline?: { age: number; event: string; era: string }[];
  arcProgress?: string;
  currentStatus: string;
  tags?: string[];
  reviewStatus?: string; // 自动填表待审：pending=待确认 approved=已确认（v1.6.24 审批闭环）
}

export interface LorebookData {
  id: string;
  title: string;
  category: string;
  keys: string[];
  content: string;
  enabled: boolean;
  depth: number;   // 注入深度 0-4（酒馆 depth 迁移）
  reviewStatus?: string; // 自动填表待审：pending=待确认 approved=已确认
}

export interface StoryNodeData {
  id: string;
  title: string;
  type: string;
  status: string;
  outline: string | null;
  content: string | null;
  wordCount: number;
  order: number;
  parentId: string | null;
  activeCharacters: string[];
  // FE-N8 乐观锁版本号：每次成功保存 +1，保存时携带以检测并发冲突
  editVersion: number;
  // FE-N6 时间线：书中世界时间标记（自由文本），用于按时间轴排序视图
  worldTime: string | null;
  // v2.9.0：写作质量分（0–100）。经 /api/generate/audit/book POST persist 回写 StoryNode.qualityScore；null=未体检
  qualityScore?: number | null;
}

export interface StorylineData {
  id: string; projectId: string;
  type: "main" | "side" | "thread"; parentId?: string | null;
  title: string; order: number; status: string; description: string;
  desire: string; obstacle: string; action: string; result: string;
  twist: string; turn: string; ending: string;
  chapterBindings: { element: string; chapterId: string; note: string }[];
}

export interface ReviewIssue {
  type: string;
  severity: string;
  description: string;
  location?: string | null;
  suggestion?: string | null;
}

export interface SSEEvent {
  type: string;
  content: string;
  severity?: string;
  passed?: boolean;
  issues?: ReviewIssue[];
  usage?: { completionTokens: number; totalTokens: number };
  nodeId?: string;
  status?: string;
  // 本地蒸馏事件
  stats?: { totalElapsedMs: number; entityCount: number; stateChangeCount: number; foreshadowCount: number; consistencyIssueCount: number };
  stateChanges?: Array<{ type: string; description: string }>;
  foreshadowEvents?: Array<{ type: string; description: string }>;
  consistencyIssues?: Array<{ type: string; description: string; severity: string }>;
  newEntities?: Array<{ name: string; type: string; confidence: number }>;
  // 伏笔更新
  created?: string[];
  updated?: string[];
  // 实体自动创建
  skipped?: string;
  matches?: Array<{ word: string; locations: string[] }>;
  totalMatches?: number;
  // 废词扫描 v3
  qualityScore?: number;
  fuzzyDensity?: number;
  bySeverity?: Record<string, number>;
  byCategory?: Record<string, number>;
  // 逻辑自查
  summary?: string;
  // 宝宝流自动填表
  ok?: boolean;
  operations?: number;
  applied?: number;
  error?: string;
  // 宝宝流记忆召回列表
  items?: Array<{ source: string; title: string; content: string }>;
  // #124：精修预算上限提醒
  kind?: string;
  ceiling?: number;
  existingLen?: number;
  requested?: number;
  budgetCapped?: boolean;
  budgetCeiling?: number;
  newLen?: number;
  mode?: string;
}

// 中文标签单一来源：引用分类器权威源 WORLD_CATEGORY_LABELS 纯中文派生，
// 与 ENTITY_LEGEND、rehype categoryLabel、sync-global-prompt catLabel 同一权威源。
export function categoryLabel(cat: string): string {
  return WORLD_CATEGORY_SECTIONS[cat as WorldCategory]?.label || cat;
}
