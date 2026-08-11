import type { IconName } from "@/components/ui/icons";

// ═══════════════════════════════════════════
// 提取结果 / 蒸馏 / 逻辑 等共享类型
// ═══════════════════════════════════════════

export interface ExtractionData {
  characters: any[];
  locations: any[];
  factions: any[];
  items: any[];
  foreshadowings: any[];
  emotions: any[];
  keyDialogues: any[];
  summary: any;
  nextChapter: any;
  writingElements: any;
  characterExperiences: any[];
  relationshipChanges: any[];
  counts: Record<string, number>;
}

export interface DistillSummary {
  entityCount: number;
  stateChangeCount: number;
  foreshadowCount: number;
  consistencyIssueCount: number;
  elapsedMs: number;
  foreshadowCreated: number;
  foreshadowUpdated: number;
  entitiesAutoCreated: number;
  entitiesSkipped: number;
}

export interface LogicIssue {
  type: string;
  severity: "error" | "warning" | "info";
  description: string;
  evidence?: string;
}

export interface LogicCheckResult {
  passed: boolean;
  issues: LogicIssue[];
  summary: string;
}

// 废词扫描结果（与父组件 PostGenPanelProps 原内联类型一致）
export type ForbiddenScanResult = {
  passed: boolean;
  qualityScore: number;
  fuzzyDensity: number;
  bySeverity: Record<string, number>;
  byCategory: Record<string, number>;
  matches: any[];
  totalMatches: number;
  summary: string;
};

// 逻辑自查结果（与父组件 PostGenPanelProps 原内联类型一致）
export type LogicScanResult = {
  passed: boolean;
  issues: any[];
  summary: string;
};

// ── Tab 定义 ──
export type TabKey = "extraction" | "plot" | "forbidden" | "logic" | "distill" | "review" | "style" | "safety";

export const TABS: Array<{ key: TabKey; icon: IconName; label: string }> = [
  { key: "extraction", icon: "chart", label: "章节提取" },
  { key: "plot", icon: "gitBranch", label: "情节" },
  { key: "forbidden", icon: "alert", label: "废词检测" },
  { key: "logic", icon: "search", label: "逻辑自查" },
  { key: "distill", icon: "sparkles", label: "本地蒸馏" },
  { key: "review", icon: "clipboard", label: "审校" },
  { key: "style", icon: "palette", label: "文风" },
  { key: "safety", icon: "shield", label: "安全" },
];

// ── 提取结果采纳控制（6 类可逐条切换），由父组件注入 ──
export interface AdoptGroup {
  set: Set<string>;
  toggle: (idx: string) => void;
}

export interface AdoptControllers {
  chars: AdoptGroup;
  locations: AdoptGroup;
  factions: AdoptGroup;
  items: AdoptGroup;
  foreshadowings: AdoptGroup;
  relationships: AdoptGroup;
  plotEvents: AdoptGroup;
}
