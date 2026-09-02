// ============================================================
// 本地过审自检 · 类型定义
// ============================================================
//
// 设计原则：
//  1. 纯本地 —— 全部规则基于正则与统计，不调用任何 LLM、不发一个字节出本机。
//     这是本功能相对云端检测（要把未发表稿件传上去）唯一的、也是决定性的优势。
//  2. 给证据 —— 每条命中必须带原文片段与位置，作者能立刻定位，不做「黑箱评分」。
//  3. 不越权 —— 只标出痕迹并给建议，绝不自动改写正文，创作主权归作者。
//  4. 说实话 —— 规则引擎只能「降痕迹」，不能「保证过审」，产品层面必须如实声明。

/** 严重度 */
export type Severity = "high" | "medium" | "low";

/** 单条 AI 痕迹命中 */
export interface AiTraceHit {
  /** 规则 id（稳定，供前端做筛选与持久化忽略） */
  ruleId: string;
  /** 规则名（人话） */
  ruleName: string;
  severity: Severity;
  /** 命中的原文片段（证据引用，截断到合理长度） */
  excerpt: string;
  /** 片段在**全文**中的起止下标，供前端高亮 */
  start: number;
  end: number;
  /** 为什么这像 AI 写的（大白话解释） */
  reason: string;
  /** 怎么改（可执行的建议，不是空话） */
  suggestion: string;
}

/** 段落级报告 */
export interface ParagraphReport {
  index: number;
  text: string;
  /** 段首在全文中的下标 */
  start: number;
  end: number;
  hits: AiTraceHit[];
  /** 该段 AI 痕迹强度 0-100 */
  score: number;
}

/** 全文统计（都是可解释的原始数字，不是玄学分数） */
export interface TextStats {
  /** 总字数（不含空白） */
  chars: number;
  /** 每千字破折号「——」个数 */
  dashPerK: number;
  /** 平均句长（字） */
  avgSentenceLen: number;
  /** 句长标准差；越小越机械（真人写作长短句差异大） */
  sentenceLenStd: number;
  /** 短句（≤8 字）占比 0~1 */
  shortSentenceRatio: number;
  /** 每千字 AI 高频词个数 */
  aiWordPerK: number;
  /** 句子总数 */
  sentenceCount: number;
}

/** 按规则聚合的统计 */
export interface RuleSummary {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  count: number;
}

/** 过审自检报告 */
export interface HumanizeReport {
  /** 全文 AI 痕迹指数 0-100，越高越像 AI 写的 */
  score: number;
  /** 等级：干净 / 轻微 / 明显 / 严重 */
  level: "clean" | "mild" | "noticeable" | "heavy";
  levelLabel: string;
  stats: TextStats;
  paragraphs: ParagraphReport[];
  /** 全部命中，按出现顺序 */
  hits: AiTraceHit[];
  /** 按规则聚合，按数量降序 */
  byRule: RuleSummary[];
  /** 免责声明，前端必须展示 */
  disclaimer: string;
}

export const DISCLAIMER =
  "本检测基于规则统计，只能在本地帮你降低「机器味」，不能保证通过任何平台的 AI 率审核；平台算法不公开且持续变化，结果仅供参考。你的稿件全程留在自己电脑上，不会上传到任何服务器。";
