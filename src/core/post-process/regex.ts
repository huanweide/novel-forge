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
  // P2-④：收集编译失败的规则名，避免在备份/预设注入的非法正则被完全静默丢弃
  const failedRules: string[] = [];
  for (const r of list) {
    if (!r.pattern || typeof r.pattern !== "string") continue;
    try {
      const re = new RegExp(r.pattern, r.flags || "g");
      result = result.replace(re, r.replace ?? "");
    } catch (e) {
      failedRules.push(r.name || "(未命名规则)");
      console.error(`[regex-postprocess] 规则 "${r.name}" 编译失败:`, e instanceof Error ? e.message : e);
    }
  }
  if (failedRules.length) {
    console.warn(
      `[regex-postprocess] 共 ${failedRules.length} 条正则规则编译失败，已被跳过: ${failedRules.join("、")}`,
    );
  }
  return result;
}
