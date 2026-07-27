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
  abilities?: string[];
  hiddenMotives?: string[];
  relationships?: Record<string, unknown>[];
  dialogueStyle?: Record<string, unknown>;
  timeline?: { age: number; event: string; era: string }[];
  arcProgress?: string;
  currentStatus: string;
  tags?: string[];
}

export interface LorebookData {
  id: string;
  title: string;
  category: string;
  keys: string[];
  content: string;
  enabled: boolean;
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
}

export interface StorylineData {
  id: string; projectId: string;
  type: "main" | "side"; parentId?: string | null;
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
}

export function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    geography: "地理", faction: "势力组织", magic_system: "力量体系",
    technique: "功法体系", history: "历史", culture: "文化风俗",
    creature: "生物种族", item: "器物法宝", law: "规则法则",
    currency: "货币体系", custom: "自定义",
  };
  return map[cat] || cat;
}
