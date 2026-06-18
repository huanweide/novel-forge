/**
 * 六维质量矩阵自动评分 —— 纯本地算法，零 Token 消耗
 *
 * 六个维度全部用正则 + 统计实现，不需要调 LLM。
 * 每维 0-100 分，加权合计 0-100 总质量分。
 *
 * 维度：
 *   1. 废词率 —— 禁用词密度
 *   2. 展示vs讲述比 —— 描写/动作 vs 直接叙述
 *   3. 视角一致性 —— PoV 跳变频率
 *   4. 句式多样性 —— 连续相同句式开头
 *   5. 对话自然度 —— 乒乓球式对话检测
 *   6. 主语多样性 —— 连续相同主语开头
 */

import { scanForbiddenWordsEnhanced, type ForbiddenMatch } from "./forbidden-checker";

// ─── 类型 ─────────────────────────────────────────────────

export interface DimensionScore {
  name: string;           // 中文名
  key: string;            // 英文 key
  score: number;          // 0-100
  weight: number;         // 权重
  detail: string;         // 一句话解释
  issues: string[];       // 发现的问题
}

export interface QualityReport {
  overallScore: number;           // 0-100 加权总分
  dimensions: DimensionScore[];   // 各维度详情
  passed: boolean;                // overallScore >= 60
  summary: string;                // 一句话质量概述
  grade: "A" | "B" | "C" | "D"; // A≥85, B≥70, C≥60, D<60
}

export interface QualityAnalyzerOptions {
  /** 已有禁用词扫描结果（复用，避免重复扫描） */
  forbiddenMatches?: ForbiddenMatch[];
  /** 自定义禁用词阈值（默认 3%） */
  forbiddenDensityThreshold?: number;
}

// ─── 维度权重 ─────────────────────────────────────────────

const WEIGHTS = {
  wasteWordRate: 0.20,
  showVsTell: 0.20,
  povConsistency: 0.15,
  sentenceVariety: 0.15,
  dialogueNaturalness: 0.15,
  subjectDiversity: 0.15,
};

// ─── 句末标点 ─────────────────────────────────────────────

const SENTENCE_END = /[。！？\n](?![」』"”）])/g;

/** 把正文拆成句子列表 */
function splitSentences(text: string): string[] {
  const sentences: string[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  const re = new RegExp(SENTENCE_END.source, "g");
  while ((match = re.exec(text)) !== null) {
    const end = match.index + match[0].length;
    sentences.push(text.slice(lastIdx, end).trim());
    lastIdx = end;
  }
  if (lastIdx < text.length) {
    const remaining = text.slice(lastIdx).trim();
    if (remaining) sentences.push(remaining);
  }
  return sentences.filter((s) => s.length > 0);
}

// ─── 段落切分 ─────────────────────────────────────────────

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n\n|\n(?=[一-鿿"A-Z"「」"'])/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

// ─── 各维度实现 ───────────────────────────────────────────

/**
 * 1. 废词率
 * 复用已有 forbidden-checker 扫描结果来计算密度。
 * 阈值 > 3% 严重扣分。
 */
function analyzeWasteWordRate(
  text: string,
  existingMatches?: ForbiddenMatch[],
  threshold = 0.03,
): DimensionScore {
  const matches = existingMatches || scanForbiddenWordsEnhanced(text).matches;
  const errorMatches = matches.filter((m) => m.severity === "error");
  const warningMatches = matches.filter((m) => m.severity === "warning");

  const density = matches.length / Math.max(1, text.length);
  const errorCount = errorMatches.length;
  const warningCount = warningMatches.length;

  // 计分：密度为 0 满分，超过阈值一线扣分
  let score = 100;
  score -= Math.min(40, density * 2000);     // 密度惩罚
  score -= Math.min(30, errorCount * 5);      // 每错误 -5
  score -= Math.min(20, warningCount * 2);    // 每警告 -2

  const issues: string[] = [];
  if (density > threshold) {
    issues.push(`废词密度 ${(density * 100).toFixed(1)}%，超过阈值 ${(threshold * 100).toFixed(0)}%`);
  }
  if (errorCount > 0) issues.push(`${errorCount} 个严重禁用词`);
  // 取前 5 个示例
  for (const m of matches.slice(0, 5)) {
    if (!issues.some((i) => i.includes(m.pattern))) {
      issues.push(`发现「${m.pattern}」→ ${m.suggestion || "建议删除或替换"}`);
    }
  }

  return {
    name: "废词率",
    key: "wasteWordRate",
    score: Math.max(0, Math.round(score)),
    weight: WEIGHTS.wasteWordRate,
    detail: `禁用词密度 ${(density * 100).toFixed(2)}%（错误${errorCount} 警告${warningCount}）`,
    issues,
  };
}

/**
 * 2. 展示vs讲述比
 * "展示" = 有动作动词 / 感官描写 / 对话的句子
 * "讲述" = 直接叙述/说明/内心独白
 *
 * 检测方式：统计含以下特征的句子比例
 *   - 动作动词：打、走、跑、飞、握、推、拉、劈、刺、挥...
 *   - 感官词：看见、听到、闻到、感到
 *   - 对话标记：说、道、问、答、「」
 *   - 叙述标记：是、因为、所以、于是、便、原来
 */
function analyzeShowVsTell(text: string): DimensionScore {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return { name: "展示vs讲述比", key: "showVsTell", score: 100, weight: WEIGHTS.showVsTell, detail: "无有效句子", issues: [] };
  }

  const actionVerbs = /(?:打|杀|刺|劈|砍|挥|斩|握|推|拉|拽|踢|踹|跑|飞|跃|跳|翻|转|退|进|冲|闯|夺|扔|掷|抛|接|取|拿|放|收|祭|催|运|施)/;
  const sensoryWords = /(?:看见|看到|望见|听到|听见|闻到|嗅到|感到|觉得|触到|摸到|察觉)/;
  const dialogueMarkers = /(?:说|道|问|答|喊|叫|吼|嚷|骂|笑|哭|叹|言|曰|「|」)/;
  const narrativeMarkers = /(?:^.{0,5}(?:是|乃|即|属|因为|所以|于是|便|原来|其实|实际上|事实上|按理|照理|应该|本该|原本|本来|此后|此后|从此|之后|而后|然后|接着))/;

  let showCount = 0;
  let tellCount = 0;

  for (const s of sentences) {
    const isShow = actionVerbs.test(s) || sensoryWords.test(s) || dialogueMarkers.test(s);
    const isTell = narrativeMarkers.test(s);

    if (isShow && !isTell) showCount++;
    else if (isTell && !isShow) tellCount++;
    else if (isShow) showCount++; // 同时有 show 和 tell 算 show
    else tellCount++;             // 都没有算 tell
  }

  const total = showCount + tellCount;
  const showRatio = total > 0 ? showCount / total : 0;
  const threshold = 0.30;

  // 展示比例越高越好，低于 30% 严重扣分
  let score = Math.round(showRatio * 100);
  const issues: string[] = [];
  if (showRatio < threshold) {
    issues.push(`展示比例仅 ${(showRatio * 100).toFixed(0)}%（建议 ≥ 30%），叙述偏多——多用动作和感官替代直接说明`);
  }

  return {
    name: "展示vs讲述比",
    key: "showVsTell",
    score: Math.max(0, Math.min(100, score)),
    weight: WEIGHTS.showVsTell,
    detail: `展示句 ${showCount} / 叙述句 ${tellCount} = ${(showRatio * 100).toFixed(0)}%`,
    issues,
  };
}

/**
 * 3. 视角一致性
 * 检测段落间 PoV（视角人物）是否频繁跳变。
 *
 * 近似：每段统计出现最多的角色名，如果相邻段主角不同 → PoV 跳变。
 * 需要 knownCharacterNames 来识别角色。
 */
function analyzePoVConsistency(text: string, knownCharacterNames: string[] = []): DimensionScore {
  if (knownCharacterNames.length === 0) {
    return {
      name: "视角一致性",
      key: "povConsistency",
      score: 100,
      weight: WEIGHTS.povConsistency,
      detail: "无角色词典，跳过 PoV 检测",
      issues: [],
    };
  }

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length <= 1) {
    return { name: "视角一致性", key: "povConsistency", score: 100, weight: WEIGHTS.povConsistency, detail: "段落过少", issues: [] };
  }

  // 每段选出"视角角色"（出现最多的角色）
  const povPerParagraph: (string | null)[] = paragraphs.map((para) => {
    const counts = new Map<string, number>();
    for (const name of knownCharacterNames) {
      const re = new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const count = (para.match(re) || []).length;
      if (count > 0) counts.set(name, count);
    }
    if (counts.size === 0) return null;
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  });

  // 检测 PoV 跳变次数
  let jumpCount = 0;
  let lastPoV: string | null = povPerParagraph[0];
  for (let i = 1; i < povPerParagraph.length; i++) {
    const current = povPerParagraph[i];
    if (current !== null && lastPoV !== null && current !== lastPoV) {
      jumpCount++;
    }
    if (current !== null) lastPoV = current;
  }

  const jumpRate = jumpCount / paragraphs.length;
  const issues: string[] = [];

  let score = 100;
  if (jumpCount > 0) {
    score -= Math.min(60, jumpCount * 10);
    issues.push(`${jumpCount} 次 PoV 跳变——每段视角最好保持一致`);
  }

  return {
    name: "视角一致性",
    key: "povConsistency",
    score: Math.max(0, score),
    weight: WEIGHTS.povConsistency,
    detail: `${paragraphs.length} 段，${jumpCount} 次视角切换（${(jumpRate * 100).toFixed(0)}%）`,
    issues,
  };
}

/**
 * 4. 句式多样性
 * 检测连续句子是否用相同句式开头。
 *
 * 取每句前 2-3 字做"句式指纹"，连续 3 句相同指纹 = 句式单调。
 */
function analyzeSentenceVariety(text: string): DimensionScore {
  const sentences = splitSentences(text);
  if (sentences.length < 5) {
    return { name: "句式多样性", key: "sentenceVariety", score: 100, weight: WEIGHTS.sentenceVariety, detail: "句子过少", issues: [] };
  }

  // 提取每句的"开头指纹"（前 2 字或第一个词）
  const openers = sentences.map((s) => {
    // 跳过引号
    const clean = s.replace(/^["'「『"']+/, "");
    return clean.slice(0, 3); // 取前三字做指纹
  });

  // 检测连续相同开头
  let monotoneStreaks = 0;
  const issues: string[] = [];
  let streakStart = 0;

  for (let i = 1; i < openers.length; i++) {
    if (openers[i] === openers[i - 1] && openers[i].length >= 2) {
      if (i - streakStart >= 2) { // 连续 3 句
        monotoneStreaks++;
        if (monotoneStreaks <= 3) { // 最多报 3 处
          issues.push(`连续 ${i - streakStart + 1} 句以「${openers[i]}」开头（第${streakStart + 1}-${i + 1}句）`);
        }
      }
    } else {
      streakStart = i;
    }
  }

  let score = 100;
  score -= Math.min(40, monotoneStreaks * 10);

  // 额外：句式指纹多样性
  const uniqueOpeners = new Set(openers.filter((o) => o.length >= 2));
  const diversityRatio = uniqueOpeners.size / sentences.length;
  if (diversityRatio < 0.3) {
    score -= 20;
    issues.push(`句式多样性过低（${(diversityRatio * 100).toFixed(0)}%），建议变换句子开头方式`);
  }

  return {
    name: "句式多样性",
    key: "sentenceVariety",
    score: Math.max(0, Math.round(score)),
    weight: WEIGHTS.sentenceVariety,
    detail: `${sentences.length} 句，${uniqueOpeners.size} 种开头，${monotoneStreaks} 处连续重复`,
    issues,
  };
}

/**
 * 5. 对话自然度
 * 检测：纯对话段落中是否出现"乒乓球式"的 A→B→A→B→A 连续多轮。
 *
 * 检测方式：提取对话句（含「」或 "说/道/问"），
 * 统计连续对话轮数，≥ 5 轮 = 可能缺乏动作/场景穿插。
 */
function analyzeDialogueNaturalness(text: string): DimensionScore {
  const sentences = splitSentences(text);
  if (sentences.length < 10) {
    return { name: "对话自然度", key: "dialogueNaturalness", score: 100, weight: WEIGHTS.dialogueNaturalness, detail: "句子过少", issues: [] };
  }

  // 判断每句是否为对话句
  const isDialogue = sentences.map((s) => {
    return /[「」]/.test(s) || /说|道|问|答|喊|叫|吼|嚷|骂/.test(s.slice(0, 10));
  });

  // 找最长连续对话段
  let maxStreak = 0;
  let currentStreak = 0;
  for (const d of isDialogue) {
    if (d) {
      currentStreak++;
      if (currentStreak > maxStreak) maxStreak = currentStreak;
    } else {
      currentStreak = 0;
    }
  }

  const issues: string[] = [];
  let score = 100;

  if (maxStreak >= 7) {
    score -= 40;
    issues.push(`连续 ${maxStreak} 句纯对话，严重缺乏动作和场景穿插——像在看剧本而不是小说`);
  } else if (maxStreak >= 5) {
    score -= 20;
    issues.push(`连续 ${maxStreak} 句对话，建议在第 3-4 句后插入动作或环境描写`);
  }

  return {
    name: "对话自然度",
    key: "dialogueNaturalness",
    score: Math.max(0, score),
    weight: WEIGHTS.dialogueNaturalness,
    detail: `最长连续对话 ${maxStreak} 句（≥5 建议中断插入描写）`,
    issues,
  };
}

/**
 * 6. 主语多样性
 * 检测连续句子是否用相同主语开头（如连续 3 句"他..."）。
 *
 * 提取每句主语（第一人称代词或角色名）→ 检测连续重复。
 */
function analyzeSubjectDiversity(text: string, knownCharacterNames: string[] = []): DimensionScore {
  const sentences = splitSentences(text);
  if (sentences.length < 5) {
    return { name: "主语多样性", key: "subjectDiversity", score: 100, weight: WEIGHTS.subjectDiversity, detail: "句子过少", issues: [] };
  }

  // 提取每句主语
  const subjects = sentences.map((s) => {
    const clean = s.replace(/^["'「『"']+/, "").trim();
    // 常见主语模式
    const subjectPatterns = [
      /^(他|她|它|他们|她们|它们)(?!的)/,
      /^(我|我们)(?!的)/,
      /^(你|你们)(?!的)/,
      /^(这|那)(?!个|些|里|边|儿)/,
      ...knownCharacterNames.map((n) => new RegExp(`^${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?!的)`)),
    ];

    for (const pat of subjectPatterns) {
      const m = clean.match(pat);
      if (m) return m[0];
    }
    return clean.slice(0, 2); // 兜底：前两字作为主语指纹
  });

  // 检测连续相同主语
  let sameSubjectStreaks = 0;
  const issues: string[] = [];
  let streakStart = 0;

  for (let i = 1; i < subjects.length; i++) {
    if (subjects[i] === subjects[i - 1] && subjects[i].length >= 1) {
      if (i - streakStart >= 2) { // 连续 3 句相同主语
        sameSubjectStreaks++;
        if (sameSubjectStreaks <= 3) {
          issues.push(`连续 ${i - streakStart + 1} 句以「${subjects[i]}」开头（第${streakStart + 1}-${i + 1}句）`);
        }
      }
    } else {
      streakStart = i;
    }
  }

  let score = 100;
  score -= Math.min(50, sameSubjectStreaks * 12);

  return {
    name: "主语多样性",
    key: "subjectDiversity",
    score: Math.max(0, Math.round(score)),
    weight: WEIGHTS.subjectDiversity,
    detail: `${sentences.length} 句，${sameSubjectStreaks} 处连续相同主语`,
    issues,
  };
}

// ─── 主分析函数 ───────────────────────────────────────────

/**
 * 对生成正文运行六维质量分析。
 *
 * @param text 正文内容
 * @param knownCharacterNames 已知角色名列表（用于 PoV 和主语检测）
 * @param options 可选配置
 * @returns 完整质量报告
 */
export function analyzeQuality(
  text: string,
  knownCharacterNames: string[] = [],
  options: QualityAnalyzerOptions = {},
): QualityReport {
  const { forbiddenMatches, forbiddenDensityThreshold = 0.03 } = options;

  const dimensions: DimensionScore[] = [
    analyzeWasteWordRate(text, forbiddenMatches, forbiddenDensityThreshold),
    analyzeShowVsTell(text),
    analyzePoVConsistency(text, knownCharacterNames),
    analyzeSentenceVariety(text),
    analyzeDialogueNaturalness(text),
    analyzeSubjectDiversity(text, knownCharacterNames),
  ];

  // 加权总分
  const overallScore = Math.round(
    dimensions.reduce((sum, d) => sum + d.score * d.weight, 0),
  );

  // 分级
  let grade: QualityReport["grade"];
  if (overallScore >= 85) grade = "A";
  else if (overallScore >= 70) grade = "B";
  else if (overallScore >= 60) grade = "C";
  else grade = "D";

  // 概述
  const totalIssues = dimensions.reduce((sum, d) => sum + d.issues.length, 0);
  const summary = totalIssues === 0
    ? "六维质量全部达标，文本质量优秀"
    : `${totalIssues} 个质量问题，评级 ${grade}。重点改善：${dimensions
        .filter((d) => d.score < 70)
        .map((d) => d.name)
        .join("、")}`;

  return {
    overallScore,
    dimensions,
    passed: overallScore >= 60,
    summary,
    grade,
  };
}
