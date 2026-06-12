/**
 * 禁用词扫描器 —— 生成后自动检查正文中是否出现了禁用词
 *
 * LLM 有时会忽略 prompt 中的禁用指令。
 * 这个模块在正文生成完成后扫描，如有违规则通过 SSE 报告给前端。
 */

export interface ForbiddenMatch {
  /** 匹配到的禁用词/句式 */
  pattern: string;
  /** 在正文中的位置（字符索引） */
  index: number;
  /** 上下文（前后各20字） */
  context: string;
}

export interface ForbiddenReport {
  /** 是否通过（无违规） */
  passed: boolean;
  /** 扫描的正文长度 */
  textLength: number;
  /** 违规列表 */
  matches: ForbiddenMatch[];
  /** 违规统计 */
  summary: string;
}

/**
 * 扫描正文中的禁用词
 *
 * @param text 生成的正文
 * @param forbiddenPatterns 禁用词/句式列表
 * @returns 扫描报告
 */
export function scanForbiddenWords(
  text: string,
  forbiddenPatterns: string[],
): ForbiddenReport {
  if (!text || forbiddenPatterns.length === 0) {
    return {
      passed: true,
      textLength: text.length,
      matches: [],
      summary: "无禁用词可检查",
    };
  }

  const matches: ForbiddenMatch[] = [];

  for (const pattern of forbiddenPatterns) {
    if (!pattern.trim()) continue;
    let searchFrom = 0;

    while (searchFrom < text.length) {
      const idx = text.indexOf(pattern, searchFrom);
      if (idx === -1) break;

      // 提取上下文（前后各20字）
      const contextStart = Math.max(0, idx - 20);
      const contextEnd = Math.min(text.length, idx + pattern.length + 20);
      const context = text.slice(contextStart, contextEnd)
        .replace(/\n/g, " ")
        .replace(/\s+/g, " ");

      matches.push({
        pattern,
        index: idx,
        context: (contextStart > 0 ? "…" : "") + context + (contextEnd < text.length ? "…" : ""),
      });

      searchFrom = idx + pattern.length;
    }
  }

  const passed = matches.length === 0;

  let summary: string;
  if (passed) {
    summary = `✅ 通过 — 未发现禁用词`;
  } else {
    // 按禁用词分组统计
    const counts = new Map<string, number>();
    for (const m of matches) {
      counts.set(m.pattern, (counts.get(m.pattern) || 0) + 1);
    }
    const parts = Array.from(counts.entries()).map(([p, c]) => `"${p}" ×${c}`);
    summary = `❌ 发现 ${matches.length} 处违规：${parts.join("，")}`;
  }

  return { passed, textLength: text.length, matches, summary };
}

/**
 * 从文风模板和自定义禁用词合并完整禁用词列表
 */
export function collectForbiddenPatterns(
  templateForbidden: string[],
  customForbidden: string[],
): string[] {
  // 去重
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of [...templateForbidden, ...customForbidden]) {
    const trimmed = p.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}
