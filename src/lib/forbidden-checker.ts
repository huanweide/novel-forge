/**
 * 禁用词扫描器 v3.0 —— 五类检测 + 密度评分
 *
 * v3.0 升级：
 *   1. 精确禁用词（indexOf，原逻辑保留）
 *   2. 句式模式（正则：/不是…而是…/、/让…感到…/ 等）
 *   3. 身体模板（正则：瞳孔一缩/身体一僵/呼吸一滞 等）
 *   4. 模糊词密度（每500字统计"似乎/也许/大概/仿佛"等）
 *   5. AI高频特征词（"至关重要""深入探讨""充满活力"等）
 *
 * 所有检测结果统一为 ForbiddenReport，severity 分 error/warning/info 三级。
 */

// 复用正则后处理层的 ReDoS 静态启发式，避免禁用词扫描单独一套正则编译路径漏掉灾难性回溯防护
import { isLikelyUnsafeRegex } from "@/core/post-process/regex";

// ─── 类型 ─────────────────────────────────────────────────

export interface ForbiddenMatch {
  /** 匹配到的禁用词/句式 */
  pattern: string;
  /** 检测类别 */
  category: ForbiddenCategory;
  /** 是否为正则匹配 */
  isRegex: boolean;
  /** 在正文中的位置（字符索引），密度类为 -1 */
  index: number;
  /** 上下文（前后各20字） */
  context: string;
  /** 严重度 */
  severity: ForbiddenSeverity;
  /** 建议替换词（可选） */
  suggestion?: string;
}

export interface ForbiddenPattern {
  /** 匹配文本——以 / 开头和结尾则为正则，否则精确匹配 */
  pattern: string;
  /** 严重度 */
  severity?: ForbiddenSeverity;
  /** 建议替换词 */
  suggestion?: string;
  /** 检测类别 */
  category?: ForbiddenCategory;
}

export type ForbiddenSeverity = "error" | "warning" | "info";
export type ForbiddenCategory = "exact_word" | "sentence_pattern" | "body_template" | "fuzzy_word" | "ai_frequent";

export interface ForbiddenReport {
  passed: boolean;
  textLength: number;
  matches: ForbiddenMatch[];
  summary: string;
  bySeverity: Record<ForbiddenSeverity, number>;
  byCategory: Record<ForbiddenCategory, number>;
  /** 模糊词密度（每500字） */
  fuzzyDensity: number;
  /** 整体质量评分 0-100 */
  qualityScore: number;
}

export interface CategoryInfo {
  key: ForbiddenCategory;
  label: string;
  icon: string;
  description: string;
}

/** 五类检测器元信息 */
export const FORBIDDEN_CATEGORIES: CategoryInfo[] = [
  { key: "exact_word", label: "精确禁用词", icon: "🚫", description: "直接匹配的禁用词汇" },
  { key: "sentence_pattern", label: "句式模式", icon: "📝", description: "\"不是…而是…\"\"让…感到…\"等AI腔句式" },
  { key: "body_template", label: "身体模板", icon: "🧍", description: "\"瞳孔一缩\"\"身体一僵\"等套路化身体描写" },
  { key: "fuzzy_word", label: "模糊词", icon: "🌫️", description: "\"似乎\"\"也许\"\"大概\"\"仿佛\"等模糊表达" },
  { key: "ai_frequent", label: "AI高频词", icon: "🤖", description: "\"至关重要\"\"深入探讨\"\"充满活力\"等AI偏爱表达" },
];

// ─── 内置检测规则 ─────────────────────────────────────────

/** 1. 精确禁用词（error 级别——出现即违规） */
const BUILTIN_EXACT_WORDS: ForbiddenPattern[] = [
  { pattern: "此外", severity: "error", suggestion: "删掉或用顺承句替代", category: "exact_word" },
  { pattern: "总而言之", severity: "error", suggestion: "删掉，直接总结", category: "exact_word" },
  { pattern: "综上所述", severity: "error", suggestion: "删掉", category: "exact_word" },
  { pattern: "不可否认", severity: "error", suggestion: "\"确实\"或直接陈述", category: "exact_word" },
  { pattern: "显而易见", severity: "error", suggestion: "删掉，用具体描写替代", category: "exact_word" },
  { pattern: "值得注意的是", severity: "error", suggestion: "删掉，直接写值得注意的内容", category: "exact_word" },
  { pattern: "需要指出的是", severity: "error", suggestion: "删掉", category: "exact_word" },
  { pattern: "从某种意义上说", severity: "error", suggestion: "删掉，直接说", category: "exact_word" },
  { pattern: "众所周知", severity: "error", suggestion: "删掉", category: "exact_word" },
  { pattern: "太棒了", severity: "warning", suggestion: "用具体描写替代感叹", category: "exact_word" },
  { pattern: "说得好", severity: "warning", suggestion: "用动作或表情替代", category: "exact_word" },
  { pattern: "你完全正确", severity: "warning", suggestion: "用点头/沉默/眼神替代", category: "exact_word" },
  { pattern: "这是个好问题", severity: "warning", suggestion: "用角色反应替代", category: "exact_word" },
];

/** 2. 句式模式（正则——error 级别） */
const BUILTIN_SENTENCE_PATTERNS: ForbiddenPattern[] = [
  { pattern: "/不是.{1,30}而是/u", severity: "error", suggestion: "拆成两句：先说不是什么，再说是什么", category: "sentence_pattern" },
  { pattern: "/没有.{1,30}只是/u", severity: "error", suggestion: "直接陈述事实", category: "sentence_pattern" },
  { pattern: "/让.{1,15}(感到|觉得|想起|意识到)/u", severity: "error", suggestion: "去掉\"让\"字，改为角色主动感受：\"他感到…\"→\"他心里…\"", category: "sentence_pattern" },
  { pattern: "/令.{1,10}(感到|觉得|想起)/u", severity: "error", suggestion: "同\"让\"字句处理", category: "sentence_pattern" },
  { pattern: "/使.{1,10}(感到|觉得)/u", severity: "error", suggestion: "同\"让\"字句处理", category: "sentence_pattern" },
  { pattern: "/当.{1,40}时/u", severity: "warning", suggestion: "拆成独立短句，不要\"当…时\"套娃", category: "sentence_pattern" },
  { pattern: "/与此同时/u", severity: "error", suggestion: "\"同时\"或\"此刻\"", category: "sentence_pattern" },
  { pattern: "/于是.{1,20}然而/u", severity: "warning", suggestion: "拆成两句，不要\"于是…然而…\"连用", category: "sentence_pattern" },
  { pattern: "/随即.{1,20}紧接着/u", severity: "warning", suggestion: "只保留一个连接词", category: "sentence_pattern" },
];

/** 3. 身体模板（正则——warning 级别） */
const BUILTIN_BODY_TEMPLATES: ForbiddenPattern[] = [
  { pattern: "/瞳孔.{0,5}缩/u", severity: "warning", suggestion: "用具体眼部动作替代：\"他眯起眼\"\"眼神一凝\"", category: "body_template" },
  { pattern: "/身体.{0,5}僵/u", severity: "warning", suggestion: "\"他停住了\"\"动作顿了一下\"", category: "body_template" },
  { pattern: "/倒吸.{0,5}凉气/u", severity: "warning", suggestion: "用具体场景描写替代", category: "body_template" },
  { pattern: "/呼吸.{0,5}滞/u", severity: "warning", suggestion: "\"他屏住呼吸\"或删掉用动作替代", category: "body_template" },
  { pattern: "/心头.{0,5}暖/u", severity: "warning", suggestion: "用具体感受描写：\"胸口热了一下\"", category: "body_template" },
  { pattern: "/心里.{0,5}沉/u", severity: "warning", suggestion: "\"胃里一阵发紧\"\"手脚发凉\"", category: "body_template" },
  { pattern: "/眼神.{0,5}(闪烁|游离)/u", severity: "info", suggestion: "用具体行为替代", category: "body_template" },
  { pattern: "/嘴角.{0,5}(上扬|勾起|翘起)/u", severity: "info", suggestion: "用更具体的表情描写", category: "body_template" },
  { pattern: "/面色.{0,5}(一变|微变|大变)/u", severity: "info", suggestion: "\"脸白了一下\"\"脸红到耳根\"", category: "body_template" },
];

/** 4. 模糊词（统计密度——每500字出现次数） */
const FUZZY_WORDS = ["似乎", "也许", "大概", "仿佛", "好像", "隐约", "莫名", "某种", "一丝", "些许"];
const FUZZY_THRESHOLD_PER_500 = 3; // 每500字超过3个 → warning

/** 5. AI高频特征词（warning 级别） */
const BUILTIN_AI_FREQUENT: ForbiddenPattern[] = [
  { pattern: "至关重要", severity: "warning", suggestion: "\"关键\"\"决定性的\"", category: "ai_frequent" },
  { pattern: "深入探讨", severity: "warning", suggestion: "用具体对话或思考场景替代", category: "ai_frequent" },
  { pattern: "充满活力", severity: "warning", suggestion: "用具体描写表现活力", category: "ai_frequent" },
  { pattern: "不可磨灭", severity: "info", suggestion: "删掉或用具体事件说明", category: "ai_frequent" },
  { pattern: "焕然一新", severity: "info", suggestion: "用具体变化描写替代", category: "ai_frequent" },
  { pattern: "不言而喻", severity: "warning", suggestion: "删掉，让读者自己体会", category: "ai_frequent" },
  { pattern: "意味深长", severity: "info", suggestion: "用具体对话或表情替代", category: "ai_frequent" },
  { pattern: "翻天覆地", severity: "info", suggestion: "用具体变化描写替代", category: "ai_frequent" },
];

// ─── 正则工具 ─────────────────────────────────────────────

const VALID_REGEX_FLAGS = /^[dgimsuvy]*$/;

function isRegexPattern(pattern: string): boolean {
  if (!pattern.startsWith("/")) return false;
  const lastSlash = pattern.lastIndexOf("/");
  if (lastSlash <= 0) return false;
  const flags = pattern.slice(lastSlash + 1);
  return VALID_REGEX_FLAGS.test(flags);
}

function parseRegexPattern(pattern: string): { regex: RegExp; source: string } | null {
  let regex: RegExp;
  let source: string;
  let allFlags: string;
  try {
    const lastSlash = pattern.lastIndexOf("/");
    source = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    allFlags = flags.includes("g") ? flags : "g" + flags;
    regex = new RegExp(source, allFlags);
  } catch {
    // 编译期错误（非法语法）静默返回 null，交由调用方跳过该规则
    return null;
  }
  // P2-① 纵深防御：编译通过后额外做 ReDoS 预判；命中则抛出友好错误而非静默放行，
  // 避免未来若有用户可控正则进入此路径时被灾难性回溯挂死。
  const unsafe = isLikelyUnsafeRegex(source, allFlags);
  if (unsafe) {
    throw new Error(`正则存在灾难性回溯风险，已拒绝（${unsafe}）`);
  }
  return { regex, source };
}

// ─── 核心扫描（v3.0 五类检测） ──────────────────────────

export interface EnhancedScanOptions {
  /** 自定义精确禁用词（追加到内置列表） */
  customExactWords?: (string | ForbiddenPattern)[];
  /** 自定义句式模式（追加） */
  customSentencePatterns?: (string | ForbiddenPattern)[];
  /** 自定义身体模板（追加） */
  customBodyTemplates?: (string | ForbiddenPattern)[];
  /** 自定义AI高频词（追加） */
  customAiFrequent?: (string | ForbiddenPattern)[];
  /** 是否禁用内置规则 */
  disableBuiltin?: boolean;
}

/**
 * 五类增强扫描——一次性检测所有维度。
 */
export function scanForbiddenWordsEnhanced(
  text: string,
  options: EnhancedScanOptions = {},
): ForbiddenReport {
  const allMatches: ForbiddenMatch[] = [];
  const bySeverity: Record<ForbiddenSeverity, number> = { error: 0, warning: 0, info: 0 };
  const byCategory: Record<ForbiddenCategory, number> = {
    exact_word: 0, sentence_pattern: 0, body_template: 0, fuzzy_word: 0, ai_frequent: 0,
  };

  if (!text || text.length === 0) {
    return {
      passed: true, textLength: 0, matches: [], summary: "无文本可检查",
      bySeverity, byCategory, fuzzyDensity: 0, qualityScore: 100,
    };
  }

  // ═══ 1. 精确禁用词 ═══
  const exactPatterns: ForbiddenPattern[] = [
    ...(options.disableBuiltin ? [] : BUILTIN_EXACT_WORDS),
    ...(options.customExactWords || []).map(normalizePattern("exact_word")),
  ];
  for (const item of exactPatterns) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(item.pattern, searchFrom);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd = Math.min(text.length, idx + item.pattern.length + 20);
      allMatches.push({
        pattern: item.pattern, category: "exact_word", isRegex: false, index: idx,
        context: (ctxStart > 0 ? "…" : "") + text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ") + (ctxEnd < text.length ? "…" : ""),
        severity: item.severity || "error", suggestion: item.suggestion,
      });
      bySeverity[item.severity || "error"]++;
      byCategory.exact_word++;
      searchFrom = idx + item.pattern.length;
    }
  }

  // ═══ 2. 句式模式（正则） ═══
  const sentencePatterns: ForbiddenPattern[] = [
    ...(options.disableBuiltin ? [] : BUILTIN_SENTENCE_PATTERNS),
    ...(options.customSentencePatterns || []).map(normalizePattern("sentence_pattern")),
  ];
  for (const item of sentencePatterns) {
    let parsed: { regex: RegExp; source: string } | null = null;
    try {
      parsed = parseRegexPattern(item.pattern);
    } catch (e) {
      // P2-①：正则被 ReDoS 防护拒绝——记录友好提示并跳过该规则，避免扫描崩溃
      allMatches.push({
        pattern: item.pattern, category: "sentence_pattern", isRegex: true, index: -1,
        context: e instanceof Error ? e.message : "正则存在灾难性回溯风险，已拒绝",
        severity: "info",
        suggestion: "该句式正则存在灾难性回溯风险，已被拒绝，请改用更安全的写法或直接删除该规则。",
      });
      bySeverity.info++;
      byCategory.sentence_pattern++;
      continue;
    }
    if (!parsed) continue;
    parsed.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = parsed.regex.exec(text)) !== null) {
      const idx = match.index;
      const matchedText = match[0];
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd = Math.min(text.length, idx + matchedText.length + 20);
      allMatches.push({
        pattern: item.pattern, category: "sentence_pattern", isRegex: true, index: idx,
        context: (ctxStart > 0 ? "…" : "") + text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ") + (ctxEnd < text.length ? "…" : ""),
        severity: item.severity || "error", suggestion: item.suggestion,
      });
      bySeverity[item.severity || "error"]++;
      byCategory.sentence_pattern++;
      if (matchedText.length === 0) {
        parsed.regex.lastIndex = idx + 1;
        if (parsed.regex.lastIndex >= text.length) break;
      }
    }
  }

  // ═══ 3. 身体模板（正则） ═══
  const bodyPatterns: ForbiddenPattern[] = [
    ...(options.disableBuiltin ? [] : BUILTIN_BODY_TEMPLATES),
    ...(options.customBodyTemplates || []).map(normalizePattern("body_template")),
  ];
  for (const item of bodyPatterns) {
    let parsed: { regex: RegExp; source: string } | null = null;
    try {
      parsed = parseRegexPattern(item.pattern);
    } catch (e) {
      // P2-①：正则被 ReDoS 防护拒绝——记录友好提示并跳过该规则，避免扫描崩溃
      allMatches.push({
        pattern: item.pattern, category: "body_template", isRegex: true, index: -1,
        context: e instanceof Error ? e.message : "正则存在灾难性回溯风险，已拒绝",
        severity: "info",
        suggestion: "该身体模板正则存在灾难性回溯风险，已被拒绝，请改用更安全的写法或直接删除该规则。",
      });
      bySeverity.info++;
      byCategory.body_template++;
      continue;
    }
    if (!parsed) continue;
    parsed.regex.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = parsed.regex.exec(text)) !== null) {
      const idx = match.index;
      const matchedText = match[0];
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd = Math.min(text.length, idx + matchedText.length + 20);
      allMatches.push({
        pattern: item.pattern, category: "body_template", isRegex: true, index: idx,
        context: (ctxStart > 0 ? "…" : "") + text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ") + (ctxEnd < text.length ? "…" : ""),
        severity: item.severity || "warning", suggestion: item.suggestion,
      });
      bySeverity[item.severity || "warning"]++;
      byCategory.body_template++;
      if (matchedText.length === 0) {
        parsed.regex.lastIndex = idx + 1;
        if (parsed.regex.lastIndex >= text.length) break;
      }
    }
  }

  // ═══ 4. 模糊词密度 ═══
  let totalFuzzyCount = 0;
  for (const word of FUZZY_WORDS) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(word, searchFrom);
      if (idx === -1) break;
      totalFuzzyCount++;
      searchFrom = idx + word.length;
    }
  }
  const blocks500 = Math.ceil(text.length / 500);
  const fuzzyDensity = blocks500 > 0 ? totalFuzzyCount / blocks500 : 0;

  if (fuzzyDensity > FUZZY_THRESHOLD_PER_500) {
    // 找出具体出现位置（最多5处作示例）
    let found = 0;
    for (const word of FUZZY_WORDS) {
      if (found >= 5) break;
      let searchFrom = 0;
      while (searchFrom < text.length && found < 5) {
        const idx = text.indexOf(word, searchFrom);
        if (idx === -1) break;
        const ctxStart = Math.max(0, idx - 20);
        const ctxEnd = Math.min(text.length, idx + word.length + 20);
        allMatches.push({
          pattern: word, category: "fuzzy_word", isRegex: false, index: idx,
          context: (ctxStart > 0 ? "…" : "") + text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ") + (ctxEnd < text.length ? "…" : ""),
          severity: fuzzyDensity > FUZZY_THRESHOLD_PER_500 * 2 ? "error" : "warning",
          suggestion: "删掉或改成确定性的表达",
        });
        bySeverity[fuzzyDensity > FUZZY_THRESHOLD_PER_500 * 2 ? "error" : "warning"]++;
        byCategory.fuzzy_word++;
        found++;
        searchFrom = idx + word.length;
      }
    }

    // 添加密度摘要
    if (totalFuzzyCount > found) {
      allMatches.push({
        pattern: `模糊词密度过高：每500字 ${fuzzyDensity.toFixed(1)} 个`,
        category: "fuzzy_word", isRegex: false, index: -1,
        context: `全文共 ${totalFuzzyCount} 处模糊词（${FUZZY_WORDS.join("、")}），建议削减到每500字 ≤${FUZZY_THRESHOLD_PER_500} 个`,
        severity: fuzzyDensity > FUZZY_THRESHOLD_PER_500 * 2 ? "error" : "warning",
      });
      bySeverity[fuzzyDensity > FUZZY_THRESHOLD_PER_500 * 2 ? "error" : "warning"]++;
      byCategory.fuzzy_word++;
    }
  }

  // ═══ 5. AI高频特征词 ═══
  const aiPatterns: ForbiddenPattern[] = [
    ...(options.disableBuiltin ? [] : BUILTIN_AI_FREQUENT),
    ...(options.customAiFrequent || []).map(normalizePattern("ai_frequent")),
  ];
  for (const item of aiPatterns) {
    let searchFrom = 0;
    while (searchFrom < text.length) {
      const idx = text.indexOf(item.pattern, searchFrom);
      if (idx === -1) break;
      const ctxStart = Math.max(0, idx - 20);
      const ctxEnd = Math.min(text.length, idx + item.pattern.length + 20);
      allMatches.push({
        pattern: item.pattern, category: "ai_frequent", isRegex: false, index: idx,
        context: (ctxStart > 0 ? "…" : "") + text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ") + (ctxEnd < text.length ? "…" : ""),
        severity: item.severity || "warning", suggestion: item.suggestion,
      });
      bySeverity[item.severity || "warning"]++;
      byCategory.ai_frequent++;
      searchFrom = idx + item.pattern.length;
    }
  }

  // ── 汇总 ──
  const passed = bySeverity.error === 0;
  const parts: string[] = [];
  if (bySeverity.error > 0) parts.push(`❌ ${bySeverity.error}处必须修改`);
  if (bySeverity.warning > 0) parts.push(`⚠️ ${bySeverity.warning}处建议修改`);
  if (bySeverity.info > 0) parts.push(`ℹ️ ${bySeverity.info}处提示`);
  const summary = parts.length > 0 ? parts.join("，") : "✅ 全部通过";

  // 质量评分（100 - 扣分）
  let qualityScore = 100;
  qualityScore -= bySeverity.error * 5;
  qualityScore -= bySeverity.warning * 2;
  qualityScore -= bySeverity.info * 0.5;
  if (fuzzyDensity > FUZZY_THRESHOLD_PER_500) qualityScore -= (fuzzyDensity - FUZZY_THRESHOLD_PER_500) * 5;
  qualityScore = Math.max(0, Math.round(qualityScore));

  return { passed, textLength: text.length, matches: allMatches, summary, bySeverity, byCategory, fuzzyDensity, qualityScore };
}

/** 标准化 pattern 条目 */
function normalizePattern(defaultCategory: ForbiddenCategory): (raw: string | ForbiddenPattern) => ForbiddenPattern {
  return (raw) => {
    if (typeof raw === "string") {
      return { pattern: raw, severity: "error", category: defaultCategory };
    }
    return { ...raw, category: raw.category || defaultCategory };
  };
}

// ─── 兼容旧 API ──────────────────────────────────────────

/**
 * @deprecated 使用 scanForbiddenWordsEnhanced 替代
 */
export function scanForbiddenWords(
  text: string,
  forbiddenPatterns: (string | ForbiddenPattern)[],
): ForbiddenReport {
  if (!text || forbiddenPatterns.length === 0) {
    return {
      passed: true, textLength: text?.length || 0, matches: [], summary: "无禁用词可检查",
      bySeverity: { error: 0, warning: 0, info: 0 },
      byCategory: { exact_word: 0, sentence_pattern: 0, body_template: 0, fuzzy_word: 0, ai_frequent: 0 },
      fuzzyDensity: 0, qualityScore: 100,
    };
  }

  // 使用增强扫描，旧 patterns 全部当作 exact_word 处理
  return scanForbiddenWordsEnhanced(text, {
    disableBuiltin: true,
    customExactWords: forbiddenPatterns,
  });
}

export function collectForbiddenPatterns(
  templateForbidden: (string | ForbiddenPattern)[],
  customForbidden: (string | ForbiddenPattern)[],
): (string | ForbiddenPattern)[] {
  const seen = new Set<string>();
  const result: (string | ForbiddenPattern)[] = [];
  for (const p of [...templateForbidden, ...customForbidden]) {
    const key = typeof p === "string" ? p : p.pattern;
    const trimmed = key.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(p);
    }
  }
  return result;
}

// ─── 工具导出 ────────────────────────────────────────────

/** 按类别分组匹配结果 */
export function groupMatchesByCategory(matches: ForbiddenMatch[]): Record<ForbiddenCategory, ForbiddenMatch[]> {
  const groups: Record<ForbiddenCategory, ForbiddenMatch[]> = {
    exact_word: [], sentence_pattern: [], body_template: [], fuzzy_word: [], ai_frequent: [],
  };
  for (const m of matches) {
    groups[m.category].push(m);
  }
  return groups;
}

/** 获取内置规则总数 */
export function getBuiltinRuleCounts() {
  return {
    exactWords: BUILTIN_EXACT_WORDS.length,
    sentencePatterns: BUILTIN_SENTENCE_PATTERNS.length,
    bodyTemplates: BUILTIN_BODY_TEMPLATES.length,
    fuzzyWords: FUZZY_WORDS.length,
    aiFrequent: BUILTIN_AI_FREQUENT.length,
    total: BUILTIN_EXACT_WORDS.length + BUILTIN_SENTENCE_PATTERNS.length
      + BUILTIN_BODY_TEMPLATES.length + FUZZY_WORDS.length + BUILTIN_AI_FREQUENT.length,
  };
}
