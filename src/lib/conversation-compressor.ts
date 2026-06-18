/**
 * 对话历史压缩器 —— 三层压缩策略
 *
 * 防止 AI 对话面板的上下文无限膨胀。
 * 不依赖 LLM——纯规则驱动，零 Token 消耗。
 *
 * 三层策略：
 *   第1层 自然淘汰：对话超过 8000 token → 早期对话被上下文窗口自然挤出
 *   第2层 主动压缩：超过 6000 token → 把早期对话压成 200-300 token 摘要
 *   第3层 极端压缩：只保留最近 3 轮完整对话 + 之前全部内容的摘要
 *
 * 摘要规则（来自架构文档 C-记忆与上下文 §5）：
 *   记录"做了什么"不记录"具体数据"。
 *   ✅ "用户查询了当前章节正文、角色列表和伏笔信息。"
 *   ❌ "用户查询了正文（3000字）、角色列表（50个角色，包括李尘、苏月瑶...）"
 */

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface Turn {
  role: "user" | "assistant";
  content: string;
  /** 该轮涉及的工具 */
  toolsUsed?: string[];
  /** 时间戳（用于排序） */
  timestamp?: number;
}

export interface CompressionStats {
  originalTurns: number;
  compressedTurns: number;
  originalTokens: number;
  compressedTokens: number;
  strategy: "none" | "compress" | "extreme";
  summary: string;
}

export interface CompressionResult {
  /** 压缩后的消息列表 */
  messages: Turn[];
  /** 压缩统计 */
  stats: CompressionStats;
}

// ═══════════════════════════════════════════
// 阈值配置
// ═══════════════════════════════════════════

const TOKEN_THRESHOLDS = {
  /** 超过此值触发主动压缩 */
  COMPRESS: 6000,
  /** 超过此值触发极端压缩 */
  EXTREME: 8000,
  /** 自然淘汰上限 */
  NATURAL_LIMIT: 12000,
  /** 主动压缩后的摘要 token */
  SUMMARY_TOKENS: 300,
  /** 极端压缩保留的完整轮数 */
  EXTREME_KEEP_RECENT: 3,
} as const;

// ═══════════════════════════════════════════
// 简易 Token 计数（中文）
// ═══════════════════════════════════════════

/**
 * 粗略估算 token 数。
 * 中文：1 字符 ≈ 2 token；英文：1 词 ≈ 1.3 token。
 * 不需要精确——压缩是预防性的。
 */
function estimateTokens(text: string): number {
  let tokens = 0;
  // 中文字符
  const cjk = (text.match(/[一-鿿㐀-䶿]/g) || []).length;
  tokens += cjk * 2;
  // 英文单词
  const nonCjk = text.replace(/[一-鿿㐀-䶿]/g, " ");
  const words = nonCjk.split(/\s+/).filter(Boolean).length;
  tokens += words;
  return tokens;
}

function estimateTotalTokens(turns: Turn[]): number {
  return turns.reduce((sum, t) => sum + estimateTokens(t.content), 0);
}

// ═══════════════════════════════════════════
// 第2层：主动压缩
// ═══════════════════════════════════════════

/**
 * 把多轮对话压缩为一段摘要。
 * 只保留"做了什么"，丢弃"具体数据"。
 *
 * 算法（纯规则，不调 LLM）：
 *   - 每轮用户消息取其意图摘要（首句，截断到 60 字）
 *   - 每轮 assistant 消息记录使用了哪些工具
 *   - 合并为一段连贯的叙事摘要
 */
function compressTurns(turns: Turn[], maxSummaryTokens: number): string {
  const summaryParts: string[] = [];

  for (const turn of turns) {
    if (turn.role === "user") {
      // 取用户消息的首句（截断到 60 字）
      const firstSentence = turn.content.split(/[。！？\n]/)[0].slice(0, 60);
      summaryParts.push(`用户查询：${firstSentence}`);
    } else {
      const tools = turn.toolsUsed && turn.toolsUsed.length > 0
        ? turn.toolsUsed.join("、")
        : "回复";
      // assistant 内容取首句
      const firstLine = turn.content.split(/\n/)[0].slice(0, 60);
      summaryParts.push(`AI ${tools}：${firstLine}`);
    }
  }

  let summary = summaryParts.join("；");
  // 截断到目标 token 数
  while (estimateTokens(summary) > maxSummaryTokens && summaryParts.length > 1) {
    summaryParts.pop();
    summary = summaryParts.join("；");
  }

  return `【以下为历史对话摘要，你可以记住"发生了什么"但不依赖其中的具体数据】\n${summary}`;
}

// ═══════════════════════════════════════════
// 第3层：极端压缩
// ═══════════════════════════════════════════

/**
 * 极端压缩：只保留最近 N 轮完整对话 + 历史摘要。
 */
function extremeCompress(turns: Turn[], keepRecent: number): CompressionResult {
  if (turns.length <= keepRecent * 2) {
    return {
      messages: [...turns],
      stats: {
        originalTurns: turns.length,
        compressedTurns: turns.length,
        originalTokens: estimateTotalTokens(turns),
        compressedTokens: estimateTotalTokens(turns),
        strategy: "none",
        summary: "",
      },
    };
  }

  const recent = turns.slice(-keepRecent * 2);
  const oldTurns = turns.slice(0, turns.length - keepRecent * 2);

  const summary = compressTurns(oldTurns, TOKEN_THRESHOLDS.SUMMARY_TOKENS);
  const summaryTurn: Turn = {
    role: "assistant",
    content: summary,
    timestamp: oldTurns[0]?.timestamp || Date.now(),
  };

  const compressed = [summaryTurn, ...recent];
  const originalTokens = estimateTotalTokens(turns);

  return {
    messages: compressed,
    stats: {
      originalTurns: turns.length,
      compressedTurns: compressed.length,
      originalTokens,
      compressedTokens: estimateTotalTokens(compressed),
      strategy: "extreme",
      summary,
    },
  };
}

// ═══════════════════════════════════════════
// 公共 API
// ═══════════════════════════════════════════

/**
 * 对对话历史应用压缩。
 *
 * @param turns        按时间升序排列的对话轮次
 * @param maxTokens    目标最大 token 数（默认 6000）
 * @returns 压缩后的消息列表 + 统计
 */
export function compressConversation(
  turns: Turn[],
  maxTokens: number = TOKEN_THRESHOLDS.COMPRESS,
): CompressionResult {
  if (turns.length === 0) {
    return {
      messages: [],
      stats: {
        originalTurns: 0, compressedTurns: 0,
        originalTokens: 0, compressedTokens: 0,
        strategy: "none", summary: "",
      },
    };
  }

  const totalTokens = estimateTotalTokens(turns);

  // 不需要压缩
  if (totalTokens < maxTokens) {
    return {
      messages: [...turns],
      stats: {
        originalTurns: turns.length,
        compressedTurns: turns.length,
        originalTokens: totalTokens,
        compressedTokens: totalTokens,
        strategy: "none",
        summary: "",
      },
    };
  }

  // 极端压缩
  if (totalTokens > TOKEN_THRESHOLDS.EXTREME) {
    return extremeCompress(turns, TOKEN_THRESHOLDS.EXTREME_KEEP_RECENT);
  }

  // 主动压缩：找出需要压缩的早期轮次
  // 从后往前累计 token，直到剩下的轮次超过 maxTokens
  let keptTokens = 0;
  let splitPoint = turns.length;

  for (let i = turns.length - 1; i >= 0; i--) {
    const t = estimateTokens(turns[i].content);
    if (keptTokens + t > maxTokens * 0.6) {
      // 保留约 60% 的完整轮次
      splitPoint = i + 1;
      break;
    }
    keptTokens += t;
  }

  const toCompress = turns.slice(0, splitPoint);
  const toKeep = turns.slice(splitPoint);

  if (toCompress.length === 0) {
    return {
      messages: [...turns],
      stats: {
        originalTurns: turns.length, compressedTurns: turns.length,
        originalTokens: totalTokens, compressedTokens: totalTokens,
        strategy: "none", summary: "",
      },
    };
  }

  const summary = compressTurns(toCompress, TOKEN_THRESHOLDS.SUMMARY_TOKENS);
  const summaryTurn: Turn = {
    role: "assistant",
    content: summary,
    timestamp: toCompress[0]?.timestamp || Date.now(),
  };

  const compressed = [summaryTurn, ...toKeep];

  return {
    messages: compressed,
    stats: {
      originalTurns: turns.length,
      compressedTurns: compressed.length,
      originalTokens: totalTokens,
      compressedTokens: estimateTotalTokens(compressed),
      strategy: "compress",
      summary,
    },
  };
}

/**
 * 获取当前压缩策略建议（不实际压缩）。
 */
export function getCompressionAdvice(
  turns: Turn[],
): { strategy: "none" | "compress" | "extreme"; totalTokens: number; reason: string } {
  const totalTokens = estimateTotalTokens(turns);

  if (totalTokens < TOKEN_THRESHOLDS.COMPRESS) {
    return { strategy: "none", totalTokens, reason: "上下文未超过阈值，无需压缩" };
  }

  if (totalTokens > TOKEN_THRESHOLDS.EXTREME) {
    return {
      strategy: "extreme",
      totalTokens,
      reason: `已超过 ${TOKEN_THRESHOLDS.EXTREME} token——建议极端压缩：保留最近 ${TOKEN_THRESHOLDS.EXTREME_KEEP_RECENT} 轮完整对话`,
    };
  }

  return {
    strategy: "compress",
    totalTokens,
    reason: `已超过 ${TOKEN_THRESHOLDS.COMPRESS} token——建议主动压缩：早期对话压缩为摘要`,
  };
}
