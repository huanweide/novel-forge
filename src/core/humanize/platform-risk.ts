/**
 * 平台级过审预检 —— 站在「平台风控」视角，预判稿件被判 AI 代写的风险
 *
 * 来源：2026-09-04 董事会路线图 M2（张雪峰① / PG③）。
 *
 * ── 它解决什么真实问题 ──
 * 网文作者最怕的不是写得差，是**被平台判定 AI 代写而拒签 / 封号**
 * （番茄小说 2026-05 单月拒签低质书 11.27 万本、永久封禁 17 个账号，多为 AI 全篇代写）。
 * 现有 analyzeText 给的是「AI 痕迹指数」，回答的是「这段文字像不像 AI 写的」；
 * 本模块回答的是另一个问题：**「按目标平台的审稿口味，这段有多容易被盯上」**。
 *
 * ── 与 analyzeText 的分工（不重复造轮子）──
 * analyzeText 是通用痕迹检测（词频 / 破折号 / 句长 / 短句率 / 句式模式）。
 * 本模块新增三个它没覆盖、但平台审稿特别在意的维度：
 *   1. 套路句密度（「就在这时」「空气仿佛凝固」这类模板腔）
 *   2. 对话人味（真人对话有口语、有打断；AI 的对话往往规整得像念稿）
 *   3. 段落节奏机械度（真人段落长短错落，AI 的段落长度常常过分均匀）
 * 再按目标平台加权——同一份稿子，投番茄（重对话与节奏）和投起点（重设定与描写），
 * 风险点本来就不一样，用一套权重一刀切是不诚实的。
 *
 * ── 三条铁律（与 humanize/types.ts 的设计原则一脉相承）──
 *   1. 纯本地：全部正则 + 统计，不联网、不传稿、不调 LLM。
 *   2. 给证据：每条命中带原文片段与位置，作者能立刻定位。
 *   3. 说实话：规则引擎只能「预判风险」，不能「保证过审」——平台算法不公开且持续变化。
 */

import { countChars, splitParagraphs, splitSentences } from "./rules";
import type { Severity } from "./types";

export type PlatformId = "fanqie" | "qidian" | "jjwxc" | "general";

type DimensionKey = "cliche" | "vocab" | "rhythm" | "dialogue" | "emotion";

export interface PlatformFinding {
  ruleId: string;
  ruleName: string;
  severity: Severity;
  excerpt: string;
  start: number;
  end: number;
  reason: string;
  suggestion: string;
}

export interface PlatformDimension {
  key: DimensionKey;
  label: string;
  /** 该维度风险分 0-100，越高越危险 */
  score: number;
  /** 原始统计量的人话描述，作者对数字自己就能判断 */
  detail: string;
}

export interface PlatformRiskReport {
  platform: PlatformId;
  platformLabel: string;
  /** 过审风险分 0-100，越高越可能被判 AI */
  riskScore: number;
  riskLevel: "low" | "medium" | "high";
  riskLevelLabel: string;
  dimensions: PlatformDimension[];
  findings: PlatformFinding[];
  /** 该平台的审稿口味说明（人话） */
  platformNote: string;
  disclaimer: string;
}

// ─── 平台画像：同一组维度，不同权重与口味说明 ───

interface PlatformProfile {
  id: PlatformId;
  label: string;
  weights: Record<DimensionKey, number>;
  note: string;
}

export const PLATFORM_PROFILES: Record<PlatformId, PlatformProfile> = {
  fanqie: {
    id: "fanqie",
    label: "番茄（新媒体快节奏）",
    // 番茄吃对话与节奏：对话没人味、句长机械最容易被盯上
    weights: { cliche: 20, vocab: 15, rhythm: 25, dialogue: 30, emotion: 10 },
    note: "番茄偏快节奏新媒体风：重对话推进、重短段落。对话念稿腔、句长过分整齐是主要雷区。",
  },
  qidian: {
    id: "qidian",
    label: "起点（世界观与描写）",
    // 起点吃设定与描写：模板化描写、AI 高频词堆砌最致命
    weights: { cliche: 30, vocab: 25, rhythm: 15, dialogue: 15, emotion: 15 },
    note: "起点偏完整世界观与细腻描写：模板化描写句式、AI 高频词堆砌最容易被编辑一眼看穿。",
  },
  jjwxc: {
    id: "jjwxc",
    label: "晋江（情感与人物互动）",
    // 晋江吃情感与互动：情感扁平、段落机械最要命
    weights: { cliche: 20, vocab: 15, rhythm: 10, dialogue: 25, emotion: 30 },
    note: "晋江偏情感张力与人物互动：情感曲线扁平、段落长度过分均匀是最常见的问题。",
  },
  general: {
    id: "general",
    label: "通用（均衡口径）",
    weights: { cliche: 20, vocab: 20, rhythm: 20, dialogue: 20, emotion: 20 },
    note: "未指定平台时按通用口径：五个维度等权，适合先自查再决定投向。",
  },
};

// ─── 词表（刻意收窄，宁可少报也不误伤正常写作）───

/** 套路句 / 模板腔：AI 与套路文的高频开场白 */
const CLICHE_PATTERNS: RegExp[] = [
  /就在这时/g,
  /说时迟那时快/g,
  /空气仿佛凝固/g,
  /仿佛整个世界/g,
  /嘴角勾起?一?[抹丝]/g,
  /眸子里?闪过/g,
  /眼神一[沉凛冷寒]/g,
  /心中一[凛紧惊动]/g,
  /不禁[心头一|暗自|感到]/g,
  /下定决心/g,
  /从今往后/g,
  /命运的齿轮/g,
  /这一刻[,，]/g,
  /冥冥之中/g,
  /毫无疑问的是/g,
  /值得一提的是/g,
];

/** AI 高频修饰词：单独出现无害，成片堆砌就有味了 */
const AI_VOCAB_PATTERNS: RegExp[] = [
  /凝视/g,
  /深邃/g,
  /缓缓/g,
  /轻轻/g,
  /淡淡/g,
  /微微/g,
  /静静/g,
  /默默/g,
  /悄然/g,
  /莫名/g,
  /一丝/g,
  /一抹/g,
  /苦涩/g,
  /无奈/g,
  /复杂地?/g,
  /似乎/g,
  /仿佛/g,
  /显然/g,
  /不由得/g,
];

/** 对话里的口语标记：真人有，AI 常常没有 */
const COLLOQUIAL_PATTERN = /嗯|啊|吧|嘛|呢|哦|唉|嘿|哈|呃|吗|…|\?|？|——|打断|结巴|支支吾吾/g;

const QUOTE_RE = /[""「」『』“"][^""「」『』“”]{1,300}?[""「」『』“”]/g;

const DISCLAIMER =
  "本预检基于本地规则统计，只能帮你预判「按该平台审稿口味，哪些地方容易被盯上」，不能保证通过任何平台的 AI 率审核；平台算法不公开且持续变化，结果仅供参考。你的稿件全程留在自己电脑上。";

// ─── 小工具 ───

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface RawMatch {
  start: number;
  end: number;
  excerpt: string;
}

/** 扫一组正则，收集命中位置与原文片段（供前端高亮定位） */
function collectMatches(text: string, patterns: RegExp[], max: number): RawMatch[] {
  const out: RawMatch[] = [];
  for (const re of patterns) {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      out.push({
        start: m.index,
        end: m.index + m[0].length,
        excerpt: makeExcerpt(text, m.index, m[0].length),
      });
      if (m[0].length === 0) r.lastIndex++; // 防空匹配死循环
      if (out.length >= max) return out;
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

function makeExcerpt(text: string, start: number, len: number): string {
  const pad = 12;
  const from = Math.max(0, start - pad);
  const to = Math.min(text.length, start + len + pad);
  return (from > 0 ? "…" : "") + text.slice(from, to).replace(/\s+/g, " ").trim() + (to < text.length ? "…" : "");
}

/** 变异系数 CV = 标准差 / 均值：越小说明越整齐（越机械） */
function coefficientOfVariation(values: number[]): number {
  if (values.length < 2) return 1;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg <= 0) return 1;
  const variance = values.reduce((a, b) => a + (b - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance) / avg;
}

// ─── 五个维度 ───

/** 1. 套路句密度：每千字 10 个算满分 */
function scoreCliche(text: string, k: number): { score: number; detail: string; hits: RawMatch[] } {
  const hits = collectMatches(text, CLICHE_PATTERNS, 40);
  const perK = hits.length / Math.max(k, 0.001);
  const score = clamp((perK / 10) * 100, 0, 100);
  return {
    score: Math.round(score),
    detail: `套路句 ${hits.length} 处（每千字 ${round1(perK)} 个，≥10 为高危）`,
    hits,
  };
}

/** 2. AI 高频词堆砌：每千字 25 个算满分（与 analyzeText 的 aiWordPerK 口径一致） */
function scoreVocab(text: string, k: number): { score: number; detail: string; hits: RawMatch[] } {
  const hits = collectMatches(text, AI_VOCAB_PATTERNS, 40);
  const perK = hits.length / Math.max(k, 0.001);
  const score = clamp((perK / 25) * 100, 0, 100);
  return {
    score: Math.round(score),
    detail: `AI 高频修饰词 ${hits.length} 处（每千字 ${round1(perK)} 个，≥25 为高危）`,
    hits,
  };
}

/** 3. 句长机械度：CV < 0.2 高度机械，> 0.45 视为自然 */
function scoreRhythm(text: string): { score: number; detail: string } {
  const sents = splitSentences(text)
    .map((s) => countChars(s.text))
    .filter((n) => n >= 1);
  if (sents.length < 6) {
    return { score: 0, detail: `句子仅 ${sents.length} 句，样本不足，不判节奏` };
  }
  const cv = coefficientOfVariation(sents);
  const avg = sents.reduce((a, b) => a + b, 0) / sents.length;
  const score = clamp(((0.45 - cv) / 0.25) * 100, 0, 100);
  return {
    score: Math.round(score),
    detail: `平均句长 ${round1(avg)} 字，长短波动 CV=${round1(cv)}（<0.2 说明句长过分整齐，像机器排的）`,
  };
}

/** 4. 对话人味：对话里的口语标记越少，越像 AI 念稿 */
function scoreDialogue(text: string): { score: number; detail: string } {
  const quotes = text.match(QUOTE_RE) ?? [];
  if (quotes.length === 0) {
    // 通篇无对话：不直接判死，给中性分并提示（纯叙述也可能是人写的）
    return { score: 35, detail: "通篇没有对话，无法按对话人味判断（纯叙述稿请重点看其他维度）" };
  }
  const dialogueText = quotes.join("");
  const dialogueChars = Math.max(1, countChars(dialogueText));
  const colloquial = (dialogueText.match(COLLOQUIAL_PATTERN) ?? []).length;
  const perK = (colloquial / dialogueChars) * 1000;
  // 每千字口语标记 ≥6 个算自然，0 个算念稿
  const score = clamp(((6 - perK) / 6) * 100, 0, 100);
  return {
    score: Math.round(score),
    detail: `对话 ${quotes.length} 段，口语标记每千字 ${round1(perK)} 个（真人说话常有「嗯/啊/吧/……」，<2 会显得像念稿）`,
  };
}

/** 5. 段落节奏机械度：段落长度过分均匀 = 机器排版的典型特征 */
function scoreEmotion(text: string): { score: number; detail: string } {
  const paras = splitParagraphs(text).filter((p) => countChars(p.text) >= 1);
  if (paras.length < 4) {
    return { score: 0, detail: `段落仅 ${paras.length} 段，样本不足，不判节奏` };
  }
  const lens = paras.map((p) => countChars(p.text));
  const cv = coefficientOfVariation(lens);
  const score = clamp(((0.6 - cv) / 0.4) * 100, 0, 100);
  return {
    score: Math.round(score),
    detail: `${paras.length} 段，段落长度波动 CV=${round1(cv)}（真人常长短错落，过分均匀会显得情感曲线扁平）`,
  };
}

// ─── 主入口 ───

const RISK_LEVEL_LABEL = { low: "风险较低", medium: "需要留意", high: "风险较高" } as const;

/**
 * 按目标平台预判过审风险。
 *
 * @param text 待检正文
 * @param platform 目标平台；不传按通用口径
 */
export function analyzePlatformRisk(text: string, platform: PlatformId = "general"): PlatformRiskReport {
  const safe = typeof text === "string" ? text : "";
  const profile = PLATFORM_PROFILES[platform] ?? PLATFORM_PROFILES.general;
  const chars = Math.max(1, countChars(safe));
  const k = chars / 1000;

  if (countChars(safe) === 0) {
    return {
      platform: profile.id,
      platformLabel: profile.label,
      riskScore: 0,
      riskLevel: "low",
      riskLevelLabel: RISK_LEVEL_LABEL.low,
      dimensions: [],
      findings: [],
      platformNote: profile.note,
      disclaimer: DISCLAIMER,
    };
  }

  const cliche = scoreCliche(safe, k);
  const vocab = scoreVocab(safe, k);
  const rhythm = scoreRhythm(safe);
  const dialogue = scoreDialogue(safe);
  const emotion = scoreEmotion(safe);

  const raw: Record<DimensionKey, { score: number; detail: string }> = {
    cliche,
    vocab,
    rhythm,
    dialogue,
    emotion,
  };

  const dimensions: PlatformDimension[] = (
    [
      ["cliche", "套路句密度"],
      ["vocab", "AI 词堆砌"],
      ["rhythm", "句长机械度"],
      ["dialogue", "对话人味"],
      ["emotion", "段落节奏"],
    ] as Array<[DimensionKey, string]>
  ).map(([key, label]) => ({
    key,
    label,
    score: raw[key].score,
    detail: raw[key].detail,
  }));

  // 加权求和（各平台权重和为 100，故结果天然落在 0-100）
  const weighted = dimensions.reduce(
    (sum, d) => sum + (d.score * (profile.weights[d.key] ?? 20)) / 100,
    0,
  );
  const riskScore = clamp(Math.round(weighted), 0, 100);
  const riskLevel: PlatformRiskReport["riskLevel"] =
    riskScore >= 60 ? "high" : riskScore >= 35 ? "medium" : "low";

  // 证据清单：只取套路句与 AI 词两类（这两类能定位到原文；统计型维度给不出具体位置）
  const findings: PlatformFinding[] = [
    ...cliche.hits.slice(0, 8).map((h) => ({
      ruleId: "platform-cliche",
      ruleName: "套路句式",
      severity: "medium" as Severity,
      excerpt: h.excerpt,
      start: h.start,
      end: h.end,
      reason: "这类固定腔调是 AI 与套路文的高频开场白，平台审稿容易盯上。",
      suggestion: "换成具体的动作或感官细节，别用现成的套路句起头。",
    })),
    ...vocab.hits.slice(0, 8).map((h) => ({
      ruleId: "platform-vocab",
      ruleName: "AI 高频词",
      severity: "low" as Severity,
      excerpt: h.excerpt,
      start: h.start,
      end: h.end,
      reason: "这些修饰词单个无害，成片出现就会形成「机器味」。",
      suggestion: "删掉一半修饰，或换成更具体、更带个人习惯的说法。",
    })),
  ].sort((a, b) => a.start - b.start);

  return {
    platform: profile.id,
    platformLabel: profile.label,
    riskScore,
    riskLevel,
    riskLevelLabel: RISK_LEVEL_LABEL[riskLevel],
    dimensions,
    findings,
    platformNote: profile.note,
    disclaimer: DISCLAIMER,
  };
}
