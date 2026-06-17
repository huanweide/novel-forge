/**
 * 禁用词扫描器 v2.0 —— 生成后自动检查正文中是否出现了禁用词/句式
 *
 * v2.0 升级：
 *   - 正则表达式支持（`/pattern/flags` 格式自动识别）
 *   - 三级严重度（error/warning/info）
 *   - 替换建议（在匹配中附带推荐替代词）
 *
 * LLM 有时会忽略 prompt 中的禁用指令。
 * 这个模块在正文生成完成后扫描，如有违规则通过 SSE 报告给前端。
 */

// ─── 类型 ─────────────────────────────────────────────────

export interface ForbiddenMatch {
  /** 匹配到的禁用词/句式 */
  pattern: string;
  /** 是否为正则匹配 */
  isRegex: boolean;
  /** 在正文中的位置（字符索引） */
  index: number;
  /** 上下文（前后各20字） */
  context: string;
  /** 严重度 */
  severity: ForbiddenSeverity;
  /** 建议替换词（可选） */
  suggestion?: string;
}

export interface ForbiddenPattern {
  /** 匹配文本——如果以 / 开头和结尾则为正则，否则为精确匹配 */
  pattern: string;
  /** 严重度：error=必须修改, warning=建议修改, info=仅提示 */
  severity?: ForbiddenSeverity;
  /** 建议替换词 */
  suggestion?: string;
}

export type ForbiddenSeverity = "error" | "warning" | "info";

export interface ForbiddenReport {
  /** 是否通过（无 error 级别违规） */
  passed: boolean;
  /** 扫描的正文长度 */
  textLength: number;
  /** 违规列表 */
  matches: ForbiddenMatch[];
  /** 违规统计 */
  summary: string;
  /** 按严重度分组的计数 */
  bySeverity: Record<ForbiddenSeverity, number>;
}

// ─── 正则检测 ─────────────────────────────────────────────

/** 合法的正则标志字符集 */
const VALID_REGEX_FLAGS = /^[dgimsuvy]*$/;

/**
 * 判断一个 pattern 字符串是否是正则表达式。
 * 严格模式：以 / 开头、以 / 结尾（排除单斜杠），且 flags 只含合法字符。
 */
function isRegexPattern(pattern: string): boolean {
  if (!pattern.startsWith("/")) return false;
  const lastSlash = pattern.lastIndexOf("/");
  if (lastSlash <= 0) return false; // pattern == "/" 或没有 / → 不是正则
  const flags = pattern.slice(lastSlash + 1);
  return VALID_REGEX_FLAGS.test(flags);
}

/**
 * 解析正则字符串 "/pattern/flags" → { regex: RegExp, source: "pattern" }
 * 强制追加 g 标志，防止 exec 循环中死循环。
 */
function parseRegexPattern(pattern: string): { regex: RegExp; source: string } | null {
  try {
    const lastSlash = pattern.lastIndexOf("/");
    const source = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    // 强制 g 标志——exec 循环依赖 lastIndex 推进
    const allFlags = flags.includes("g") ? flags : "g" + flags;
    return { regex: new RegExp(source, allFlags), source };
  } catch {
    return null; // 无效正则 → 在调用方降级为精确匹配
  }
}

// ─── 核心扫描 ─────────────────────────────────────────────

/**
 * 扫描正文中的禁用词/句式。
 *
 * @param text              生成的正文
 * @param forbiddenPatterns  禁用词列表（支持纯文本和 /regex/ 格式）
 * @returns 扫描报告
 */
export function scanForbiddenWords(
  text: string,
  forbiddenPatterns: (string | ForbiddenPattern)[],
): ForbiddenReport {
  if (!text || forbiddenPatterns.length === 0) {
    return {
      passed: true,
      textLength: text?.length || 0,
      matches: [],
      summary: "无禁用词可检查",
      bySeverity: { error: 0, warning: 0, info: 0 },
    };
  }

  // 标准化为 ForbiddenPattern 对象
  const normalized: Array<{ pattern: string; severity: ForbiddenSeverity; suggestion?: string; isRegex: boolean }> = [];
  for (const fp of forbiddenPatterns) {
    if (typeof fp === "string") {
      const isRegex = isRegexPattern(fp);
      normalized.push({ pattern: fp, severity: "error", isRegex });
    } else {
      const isRegex = isRegexPattern(fp.pattern);
      normalized.push({
        pattern: fp.pattern,
        severity: fp.severity || "error",
        suggestion: fp.suggestion,
        isRegex,
      });
    }
  }

  const matches: ForbiddenMatch[] = [];
  const bySeverity: Record<ForbiddenSeverity, number> = { error: 0, warning: 0, info: 0 };

  for (const item of normalized) {
    if (!item.pattern.trim()) continue;

    if (item.isRegex) {
      // ── 正则匹配 ──
      const parsed = parseRegexPattern(item.pattern);
      if (!parsed) {
        // 正则解析失败 → 降级为精确匹配（提取 / / 之间的文本）
        const lastSlash = item.pattern.lastIndexOf("/");
        const fallbackText = item.pattern.slice(1, lastSlash);
        if (!fallbackText) continue;
        // 以内联方式执行精确匹配
        let searchFrom = 0;
        while (searchFrom < text.length) {
          const idx = text.indexOf(fallbackText, searchFrom);
          if (idx === -1) break;
          const ctxStart = Math.max(0, idx - 20);
          const ctxEnd = Math.min(text.length, idx + fallbackText.length + 20);
          const ctx = text.slice(ctxStart, ctxEnd).replace(/\n/g, " ").replace(/\s+/g, " ");
          matches.push({
            pattern: item.pattern, isRegex: false, index: idx,
            context: (ctxStart > 0 ? "…" : "") + ctx + (ctxEnd < text.length ? "…" : ""),
            severity: item.severity, suggestion: item.suggestion,
          });
          bySeverity[item.severity]++;
          searchFrom = idx + fallbackText.length;
        }
        continue; // 已处理完毕，跳过正则循环
      }

      // 重置 lastIndex（全局正则需要）
      parsed.regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = parsed.regex.exec(text)) !== null) {
        const idx = match.index;
        const matchedText = match[0];

        const contextStart = Math.max(0, idx - 20);
        const contextEnd = Math.min(text.length, idx + matchedText.length + 20);
        const context = text.slice(contextStart, contextEnd)
          .replace(/\n/g, " ")
          .replace(/\s+/g, " ");

        matches.push({
          pattern: item.pattern,
          isRegex: true,
          index: idx,
          context: (contextStart > 0 ? "…" : "") + context + (contextEnd < text.length ? "…" : ""),
          severity: item.severity,
          suggestion: item.suggestion,
        });

        bySeverity[item.severity]++;

        // 防止空匹配死循环
        if (matchedText.length === 0) {
          parsed.regex.lastIndex = idx + 1;
          if (parsed.regex.lastIndex >= text.length) break;
        }
      }
    } else {
      // ── 精确匹配（原逻辑）──
      let searchFrom = 0;
      const plainPattern = item.pattern;

      while (searchFrom < text.length) {
        const idx = text.indexOf(plainPattern, searchFrom);
        if (idx === -1) break;

        const contextStart = Math.max(0, idx - 20);
        const contextEnd = Math.min(text.length, idx + plainPattern.length + 20);
        const context = text.slice(contextStart, contextEnd)
          .replace(/\n/g, " ")
          .replace(/\s+/g, " ");

        matches.push({
          pattern: item.pattern,
          isRegex: false,
          index: idx,
          context: (contextStart > 0 ? "…" : "") + context + (contextEnd < text.length ? "…" : ""),
          severity: item.severity,
          suggestion: item.suggestion,
        });

        bySeverity[item.severity]++;
        searchFrom = idx + plainPattern.length;
      }
    }
  }

  // passed = 没有 error 级别违规
  const passed = bySeverity.error === 0;

  let summary: string;
  if (matches.length === 0) {
    summary = "✅ 通过 — 未发现禁用词";
  } else {
    const parts: string[] = [];
    if (bySeverity.error > 0) parts.push(`❌ ${bySeverity.error}处必须修改`);
    if (bySeverity.warning > 0) parts.push(`⚠️ ${bySeverity.warning}处建议修改`);
    if (bySeverity.info > 0) parts.push(`ℹ️ ${bySeverity.info}处提示`);
    summary = parts.join("，");
  }

  return { passed, textLength: text.length, matches, summary, bySeverity };
}

/**
 * 从文风模板和自定义禁用词合并完整禁用词列表。
 * 支持 string 和 ForbiddenPattern 混合格式。
 */
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
