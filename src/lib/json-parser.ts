/**
 * 共享 JSON 解析器 —— 容错 AI 输出的各种格式问题
 *
 * 所有 API 路由统一使用此函数，不再各写各的。
 * 处理：BOM、markdown 代码块、尾逗号、最外层大括号提取、
 *        字符串内未转义控制字符、未闭合括号补全。
 *
 * v2: 新增字符串内容清理——AI 在 JSON 字符串值里写真实换行符
 *     是 "Expected ',' or '}'" 错误的头号根因。
 */

/**
 * 修复 JSON 字符串值中的未转义控制字符
 *
 * AI 经常在 background/content 等长文本字段中写入真实换行符、
 * tab、或其他控制字符，导致 JSON.parse 失败。
 * 此函数扫描 JSON 字符串，在识别到的字符串字面量内部，
 * 将控制字符替换为转义形式。
 */
function sanitizeStringLiterals(s: string): string {
  const out: string[] = [];
  let i = 0;
  let inString = false;
  let escape = false;

  while (i < s.length) {
    const ch = s[i];

    if (!inString) {
      // 不在字符串内——原样输出
      out.push(ch);
      if (ch === '"' && !escape) {
        inString = true;
      }
      escape = false;
      i++;
      continue;
    }

    // 在字符串内
    if (escape) {
      out.push(ch);
      escape = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      out.push(ch);
      escape = true;
      i++;
      continue;
    }

    if (ch === '"') {
      // 字符串结束
      out.push(ch);
      inString = false;
      i++;
      continue;
    }

    // 字符串内的控制字符 → 转义
    if (ch === '\n') {
      out.push('\\n');
    } else if (ch === '\r') {
      // 跳过 \r，或者转义
      if (i + 1 < s.length && s[i + 1] === '\n') {
        out.push('\\n');
        i++; // 跳过 \r\n 中的 \n
      } else {
        out.push('\\r');
      }
    } else if (ch === '\t') {
      out.push('\\t');
    } else if (ch < ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') {
      // 其他控制字符 → 移除
    } else {
      out.push(ch);
    }
    i++;
  }

  return out.join('');
}

/**
 * 修复 JSON 中字符串值内的未转义双引号
 *
 * AI 偶尔在字符串值中直接写双引号（如对话内容），
 * 导致字符串提前闭合。典型场景：\"他说：\"你好\"\"
 * 修复策略：在字符串值内部，如果双引号前后有中文字符或常见标点，
 * 将其转义。
 */
function sanitizeUnescapedQuotes(s: string): string {
  // 简单策略：在已被 sanitizeStringLiterals 处理过的字符串上，
  // 检查是否有明显的字符串内裸引号模式。
  // 中文语境："某某说："你好"" → 这种模式的双引号需要转义。
  //
  // 保守策略：不做自动修复（风险太高，可能破坏合法 JSON）。
  // 改为在 prompt 中强调"字符串内的双引号必须转义为 \\"\"。
  return s;
}

/**
 * 从 AI 原始响应中提取并解析 JSON
 *
 * 容错层级（逐层加深）：
 *   1. 去 BOM + markdown 代码块 + 提取最外层大括号
 *   2. 去尾逗号 → JSON.parse
 *   3. 失败 → 修复字符串内未转义控制字符 → JSON.parse
 *   4. 失败 → 补未闭合括号 → JSON.parse
 *   5. 全失败 → 抛错（带上下文截断）
 *
 * @param raw AI 返回的原始文本
 * @param repairBrackets 是否尝试修复未闭合的括号（默认 true）
 * @returns 解析出的对象
 * @throws 解析失败时抛错，带截断原文
 */
export function parseAIJson(raw: string, repairBrackets = true): Record<string, unknown> {
  let s = raw.trim();

  // ── 第0层：BOM ──
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);

  // ── 第1层：去 markdown 代码块 ──
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();

  // ── 第2层：提取最外层大括号 ──
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  // ── 第3层：去尾逗号 ──
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // ── 第4层：标准解析 ──
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* 继续 */ }

  // ── 第5层：修复字符串内未转义控制字符 ──
  try {
    const cleaned = sanitizeStringLiterals(s);
    const result = JSON.parse(cleaned) as Record<string, unknown>;
    return result;
  } catch { /* 继续 */ }

  // ── 第6层：修复字符串内未转义控制字符 + 去尾逗号再试 ──
  try {
    const cleaned = sanitizeStringLiterals(s);
    const retried = cleaned.replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(retried) as Record<string, unknown>;
  } catch { /* 继续 */ }

  if (!repairBrackets) {
    throw new Error(`JSON解析失败: ${s.slice(0, 200)}`);
  }

  // ── 第7层：补未闭合的括号 ──
  try {
    let repaired = sanitizeStringLiterals(s);
    let braces = 0, brackets = 0, inString = false, escape = false;
    for (const ch of repaired) {
      if (escape) { escape = false; continue; }
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"' && !escape) { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
    }
    while (brackets > 0) { repaired += ']'; brackets--; }
    while (braces > 0) { repaired += '}'; braces--; }
    if (repaired.endsWith(',')) repaired = repaired.slice(0, -1);

    return JSON.parse(repaired) as Record<string, unknown>;
  } catch { /* 继续 */ }

  // ── 全失败 ──
  throw new Error(`JSON解析失败: ${s.slice(0, 200)}`);
}

/**
 * 安全解析 AI JSON（不抛错）
 */
export function safeParseAIJson(raw: string): Record<string, unknown> | null {
  try { return parseAIJson(raw); } catch { return null; }
}
