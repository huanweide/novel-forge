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

// ─── P1-② ReDoS 防护：静态启发式 ──────────────────────────────────
const MAX_PATTERN_LENGTH = 500;
// 仅允许常见、无副作用的 flags（禁止如 x / n 等不常见组合，缩小攻击面）
const SAFE_FLAGS = /^[gimsuy]*$/;
// 单量词重复次数上限（过大不报错但会增加引擎负担，这里直接拦截异常值）
const QUANT_MAX = 100000;

/**
 * 启发式判断用户可控正则是否存在灾难性回溯风险。
 * 命中则返回原因字符串，安全返回 null。
 * 覆盖：嵌套量词（(a+)+ / (a*)*）、超长 pattern、非法 flags、超大重复量词。
 */
export function isLikelyUnsafeRegex(pattern: string, flags = ""): string | null {
  if (!pattern || typeof pattern !== "string") return "pattern 为空或非字符串";
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `pattern 长度 ${pattern.length} 超过上限 ${MAX_PATTERN_LENGTH}`;
  }
  if (!SAFE_FLAGS.test(flags)) {
    return `非法 flags "${flags}"（仅允许 g/i/m/s/u/y 的组合）`;
  }

  // 用栈跟踪分组，检测「组内含量词 + 组外紧跟重复量词」的嵌套量词结构
  // P1-②：同时跟踪组内交替，检测「重叠交替 + 重复组」类灾难性回溯
  const stack: { hasQuantInside: boolean; hasAlternation: boolean }[] = [];
  let inClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (inClass) {
      if (ch === "]") inClass = false;
      continue;
    }
    if (ch === "\\") {
      i++;
      continue;
    }
    if (ch === "[") {
      inClass = true;
      continue;
    }
    if (ch === "(") {
      // 跳过 (?: (?= (?! (?<= (?<! 等非捕获/断言组标记，它们后面的 ? 不是重复量词
      if (pattern[i + 1] === "?") {
        stack.push({ hasQuantInside: false, hasAlternation: false });
        // 标记整个 ?... 已被消费，循环会 i++ 到下一组字符
        continue;
      }
      stack.push({ hasQuantInside: false, hasAlternation: false });
      continue;
    }
    if (ch === "|") {
      // 记录当前组内（栈顶）存在交替分支
      if (stack.length) stack[stack.length - 1].hasAlternation = true;
      continue;
    }
    if (ch === ")") {
      const top = stack.pop();
      const next = pattern[i + 1];
      // 仅 * + { 视为重复量词（? 最多匹配一次，风险低，排除以避免误伤 (?:x)?）
      const repeated = next === "*" || next === "+" || next === "{";
      if (top && repeated) {
        // 嵌套量词（组内含量词）或被重复组内含重叠交替，均可能触发灾难性回溯
        if (top.hasQuantInside) {
          return "检测到嵌套量词，存在灾难性回溯风险";
        }
        if (top.hasAlternation) {
          return "检测到重复组内含交替（重叠分支），存在灾难性回溯风险";
        }
      }
      continue;
    }
    if (ch === "*" || ch === "+") {
      if (stack.length) stack[stack.length - 1].hasQuantInside = true;
      continue;
    }
    if (ch === "{") {
      let j = i + 1;
      let num = "";
      while (j < pattern.length && /[0-9]/.test(pattern[j])) {
        num += pattern[j];
        j++;
      }
      let comma = false;
      if (pattern[j] === ",") {
        comma = true;
        j++;
      }
      let num2 = "";
      while (j < pattern.length && /[0-9]/.test(pattern[j])) {
        num2 += pattern[j];
        j++;
      }
      if (pattern[j] === "}") {
        const n = num ? parseInt(num, 10) : 0;
        const m = num2 ? parseInt(num2, 10) : comma ? QUANT_MAX : n;
        if (n > QUANT_MAX || m > QUANT_MAX) {
          return `量词重复次数过大（>${QUANT_MAX}）`;
        }
        if (stack.length) stack[stack.length - 1].hasQuantInside = true;
      }
      i = j;
      continue;
    }
  }
  return null;
}

export function applyRegexRules(text: string, rules: unknown[]): string {
  const list = Array.isArray(rules) ? (rules as RegexRule[]) : [];
  let result = text;
  // P2-④：收集编译/被拦截的规则名，避免在备份/预设注入的非法正则被完全静默丢弃
  const failedRules: string[] = [];
  for (const r of list) {
    if (!r.pattern || typeof r.pattern !== "string") continue;
    // P1-②：应用用户可控正则前先做 ReDoS 防护，命中则拒绝并告警，避免挂死生成热路径
    const unsafe = isLikelyUnsafeRegex(r.pattern, r.flags || "g");
    if (unsafe) {
      failedRules.push(r.name || "(未命名规则)");
      console.warn(
        `[regex-postprocess] 规则 "${r.name || "(未命名规则)"}" 被拒绝（ReDoS 防护）: ${unsafe}`,
      );
      continue;
    }
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
      `[regex-postprocess] 共 ${failedRules.length} 条正则规则被跳过（编译失败/ReDoS 防护）: ${failedRules.join("、")}`,
    );
  }
  return result;
}
