/**
 * 共享 JSON 解析器 —— 容错 AI 输出的各种格式问题
 *
 * 所有 API 路由统一使用此函数，不再各写各的。
 * 处理：BOM、markdown 代码块、尾逗号、最外层大括号提取、未闭合括号补全。
 */

/**
 * 从 AI 原始响应中提取并解析 JSON
 *
 * @param raw AI 返回的原始文本
 * @param repairBrackets 是否尝试修复未闭合的括号（默认 true）
 * @returns 解析出的对象
 * @throws 解析失败时抛错，带截断原文
 */
export function parseAIJson(raw: string, repairBrackets = true): Record<string, unknown> {
  let s = raw.trim();

  // 去 BOM
  if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1);

  // 去 markdown 代码块
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();

  // 提取最外层大括号
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  // 去尾逗号
  s = s.replace(/,(\s*[}\]])/g, "$1");

  // 第一轮：标准解析
  try { return JSON.parse(s) as Record<string, unknown>; } catch { /* continue */ }

  if (!repairBrackets) {
    throw new Error(`JSON解析失败: ${s.slice(0, 200)}`);
  }

  // 第二轮：补未闭合的括号
  let braces = 0, brackets = 0, inString = false, escape = false;
  for (const ch of s) {
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"' && !escape) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') braces++;
    else if (ch === '}') braces--;
    else if (ch === '[') brackets++;
    else if (ch === ']') brackets--;
  }
  while (brackets > 0) { s += ']'; brackets--; }
  while (braces > 0) { s += '}'; braces--; }
  if (s.endsWith(',')) s = s.slice(0, -1);

  return JSON.parse(s) as Record<string, unknown>;
}

/**
 * 安全解析 AI JSON（不抛错）
 */
export function safeParseAIJson(raw: string): Record<string, unknown> | null {
  try { return parseAIJson(raw); } catch { return null; }
}
