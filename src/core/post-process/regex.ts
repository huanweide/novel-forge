/**
 * 项目级正则后处理（来自酒馆 regex 预设）
 * 规则结构：{ name: string; pattern: string; flags?: string; replace: string }[]
 */
export interface RegexRule {
  name: string;
  pattern: string;
  flags?: string;
  replace: string;
}

export function applyRegexRules(text: string, rules: unknown[]): string {
  const list = Array.isArray(rules) ? (rules as RegexRule[]) : [];
  let result = text;
  for (const r of list) {
    if (!r.pattern || typeof r.pattern !== "string") continue;
    try {
      const re = new RegExp(r.pattern, r.flags || "g");
      result = result.replace(re, r.replace ?? "");
    } catch (e) {
      console.error(`[regex-postprocess] 规则 "${r.name}" 编译失败:`, e instanceof Error ? e.message : e);
    }
  }
  return result;
}
