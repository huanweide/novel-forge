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

export interface ReviewIssue {
  type: string;
  severity: string;
  description: string;
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
}

export function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    geography: "地理", faction: "势力组织", magic_system: "力量体系",
    history: "历史", culture: "文化风俗", creature: "生物种族",
    item: "器物法宝", custom: "自定义",
  };
  return map[cat] || cat;
}
