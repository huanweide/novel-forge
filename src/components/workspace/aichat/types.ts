export interface AIChatBarProps {
  projectId: string;
  chapterContent?: string;
  selectedText?: string;
  className?: string;
}

export interface AnalysisDiff {
  characterName: string;
  characterId: string;
  field: string;
  current: string;
  suggested: string;
  evidence: string;
  confidence: number;
}

export interface MessageItem {
  role: "user" | "agent";
  text: string;
  trace?: Array<{ tool: string; args: Record<string, unknown>; summary: string }>;
  /** 写后分析结果 */
  analysis?: { differences: AnalysisDiff[]; summary: string };
  ts: number;
}

export interface PendingStep {
  text: string;
  done: boolean;
}
