// ============================================================
// 本地过审自检 · 分析入口
// ============================================================
//
// 评分是怎么算出来的（完全公开，不是黑箱）：
//
//   总分 = AI词密度分(≤30) + 破折号密度分(≤15) + 句长均匀度分(≤15)
//        + 短句率分(≤10) + 句式模式密度分(≤30)
//
// 每一项都是可解释的原始统计量（每千字多少个、标准差是多少），
// 作者能对照数字自己判断该改哪里，而不是对着一个凭空冒出来的百分比发懵。

import {
  PARAGRAPH_RULES,
  TEXT_LEVEL_RULES,
  countChars,
  splitParagraphs,
  splitSentences,
} from "./rules";
import type {
  AiTraceHit,
  HumanizeReport,
  ParagraphReport,
  RuleSummary,
  Severity,
  TextStats,
} from "./types";
import { DISCLAIMER } from "./types";

const SEVERITY_WEIGHT: Record<Severity, number> = { high: 6, medium: 3, low: 1 };

/** 干净的分界线（每千字多少个算满分） */
const CAP = {
  aiWordPerK: 25,
  dashPerK: 12,
  patternPerK: 15,
};

const LEVEL_LABEL: Record<HumanizeReport["level"], string> = {
  clean: "基本干净",
  mild: "轻微痕迹",
  noticeable: "痕迹明显",
  heavy: "痕迹严重",
};

/** 主入口：分析一段文本，产出完整报告。纯同步、纯本地、无 IO。 */
export function analyzeText(text: string): HumanizeReport {
  const safe = typeof text === "string" ? text : "";
  const chars = countChars(safe);

  if (chars === 0) {
    return emptyReport();
  }

  // ── 段落级分析 ──
  const paras = splitParagraphs(safe);
  const paragraphs: ParagraphReport[] = [];
  const allHits: AiTraceHit[] = [];

  for (let i = 0; i < paras.length; i++) {
    const p = paras[i];
    const hits: AiTraceHit[] = [];
    for (const rule of PARAGRAPH_RULES) {
      hits.push(...rule(p.text, p.start));
    }
    hits.sort((a, b) => a.start - b.start);
    allHits.push(...hits);
    const w = hits.reduce((s, h) => s + SEVERITY_WEIGHT[h.severity], 0);
    const pChars = Math.max(1, countChars(p.text));
    paragraphs.push({
      index: i,
      text: p.text,
      start: p.start,
      end: p.end,
      hits,
      score: clamp(Math.round((w / pChars) * 1000 * 1.8), 0, 100),
    });
  }

  // ── 全文级规则（统计型，只在整篇跑一次） ──
  const globalHits: AiTraceHit[] = [];
  for (const rule of TEXT_LEVEL_RULES) {
    globalHits.push(...rule(safe, 0));
  }

  // 全文级命中要归并进对应段落（作者需要看到它落在哪一段）
  for (const gh of globalHits) {
    const target = paragraphs.find((p) => gh.start >= p.start && gh.start < p.end);
    if (target) {
      target.hits.push(gh);
      target.hits.sort((a, b) => a.start - b.start);
      const w = target.hits.reduce((s, h) => s + SEVERITY_WEIGHT[h.severity], 0);
      const pChars = Math.max(1, countChars(target.text));
      target.score = clamp(Math.round((w / pChars) * 1000 * 1.8), 0, 100);
    }
    allHits.push(gh);
  }

  allHits.sort((a, b) => a.start - b.start);

  const stats = computeStats(safe, allHits);
  const score = computeScore(stats, safe, allHits);

  return {
    score,
    level: levelOf(score),
    levelLabel: LEVEL_LABEL[levelOf(score)],
    stats,
    paragraphs,
    hits: allHits,
    byRule: summarize(allHits),
    disclaimer: DISCLAIMER,
  };
}

// ─── 统计 ────────────────────────────────────────────────────

function computeStats(text: string, hits: AiTraceHit[]): TextStats {
  const chars = Math.max(1, countChars(text));
  const k = chars / 1000;

  const dashCount = (text.match(/——/g) ?? []).length;
  const aiWordCount = hits.filter((h) => h.ruleId === "ai-vocab").length;

  const sents = splitSentences(text).filter((s) => countChars(s.text) >= 1);
  const lens = sents.map((s) => countChars(s.text));
  const avg = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const variance = lens.length ? lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length : 0;
  const std = Math.sqrt(variance);
  const shortRatio = lens.length ? lens.filter((l) => l <= 8).length / lens.length : 0;

  return {
    chars,
    dashPerK: round1(dashCount / k),
    avgSentenceLen: round1(avg),
    sentenceLenStd: round1(std),
    shortSentenceRatio: round2(shortRatio),
    aiWordPerK: round1(aiWordCount / k),
    sentenceCount: sents.length,
  };
}

// ─── 评分 ────────────────────────────────────────────────────

function computeScore(stats: TextStats, text: string, hits: AiTraceHit[]): number {
  const chars = Math.max(1, countChars(text));
  const k = chars / 1000;

  // 1) AI 强特征词密度 ≤30
  const aiWord = clamp((stats.aiWordPerK / CAP.aiWordPerK) * 30, 0, 30);

  // 2) 破折号密度 ≤15
  const dash = clamp((stats.dashPerK / CAP.dashPerK) * 15, 0, 15);

  // 3) 句长均匀度 ≤15：变异系数越小越机械
  const cv = stats.avgSentenceLen > 0 ? stats.sentenceLenStd / stats.avgSentenceLen : 1;
  const uniform = stats.sentenceCount >= 6 ? clamp(((0.35 - cv) / 0.35) * 15, 0, 15) : 0;

  // 4) 短句率 ≤10：AI 爱把长句切成一串短句
  const short = clamp(((stats.shortSentenceRatio - 0.45) / 0.4) * 10, 0, 10);

  // 5) 句式模式命中密度 ≤30（按严重度加权）
  const patternHits = hits.filter((h) => h.ruleId !== "ai-vocab");
  const wSum = patternHits.reduce((s, h) => s + SEVERITY_WEIGHT[h.severity], 0);
  const pattern = clamp((wSum / k / CAP.patternPerK) * 30, 0, 30);

  return clamp(Math.round(aiWord + dash + uniform + short + pattern), 0, 100);
}

function levelOf(score: number): HumanizeReport["level"] {
  if (score < 25) return "clean";
  if (score < 50) return "mild";
  if (score < 75) return "noticeable";
  return "heavy";
}

function summarize(hits: AiTraceHit[]): RuleSummary[] {
  const map = new Map<string, RuleSummary>();
  for (const h of hits) {
    const cur = map.get(h.ruleId);
    if (cur) cur.count++;
    else
      map.set(h.ruleId, {
        ruleId: h.ruleId,
        ruleName: h.ruleName,
        severity: h.severity,
        count: 1,
      });
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

function emptyReport(): HumanizeReport {
  return {
    score: 0,
    level: "clean",
    levelLabel: LEVEL_LABEL.clean,
    stats: {
      chars: 0,
      dashPerK: 0,
      avgSentenceLen: 0,
      sentenceLenStd: 0,
      shortSentenceRatio: 0,
      aiWordPerK: 0,
      sentenceCount: 0,
    },
    paragraphs: [],
    hits: [],
    byRule: [],
    disclaimer: DISCLAIMER,
  };
}

function clamp(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
function round1(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : 0;
}
function round2(n: number): number {
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

export * from "./types";
export { splitParagraphs, splitSentences, countChars } from "./rules";
