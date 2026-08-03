// CJK 关键词匹配引擎 —— 专治「林」误命中「森林」这类瞎匹配。
//
// 中文无空格分词，纯 includes 会把「林」在「森林」「园林」里不断命中，
// 导致错误世界书/表格内容被注入正文。本模块提供三把锁：
//  1. matchKeyword：长度≥3 直接命中；长度2 需处于词边界；长度1 直接拒绝（太泛）。
//  2. dedupSubstring：最长匹配优先——短关键词若被更长的已命中关键词包含则剔除。
//  3. scoreKeyword：按特异性打分（越长越具体，越长分越高）。

const CJK_RE = /[一-鿿]/;

/** 判断单个字符是否为中日韩表意文字（CJK 汉字） */
export function isCjkChar(ch: string): boolean {
  if (!ch) return false;
  return CJK_RE.test(ch);
}

/**
 * 判断 keyword 是否「真实命中」text。
 *
 * 规则：
 *  - 文本不含 keyword → false
 *  - keyword 长度 ≥ 3 → true（足够具体，如「青龙镇」「碎玉轩」）
 *  - keyword 长度 = 2 → 任一出现位置满足「至少一侧是词边界」（开头/结尾/相邻非汉字）才 true；
 *                     两侧都是汉字（说明夹在更长词里，如「云山」夹在「青云山」）则 false
 *  - keyword 长度 = 1 → false（单字太泛，如「林」会命中「森林」「园林」，一律拒绝）
 *
 * 大小写不敏感（兼顾英文/拼音关键词）。
 */
export function matchKeyword(text: string, keyword: string): boolean {
  if (!keyword || !text) return false;
  const hay = text.toLowerCase();
  const needle = keyword.toLowerCase();
  if (!hay.includes(needle)) return false;

  const len = needle.length;
  if (len >= 3) return true;
  if (len <= 1) return false; // 单字直接拒绝

  // 长度 2：逐位置检查，只要有一处满足「至少一侧是边界」即视为命中
  let idx = hay.indexOf(needle);
  while (idx >= 0) {
    const before = idx > 0 ? hay[idx - 1] : "";
    const after = idx + len < hay.length ? hay[idx + len] : "";
    const beforeBoundary = before === "" || !isCjkChar(before);
    const afterBoundary = after === "" || !isCjkChar(after);
    if (beforeBoundary || afterBoundary) return true;
    idx = hay.indexOf(needle, idx + 1);
  }
  return false;
}

/** 关键词特异性打分：越长越具体，单字/空返回 0（不参与召回） */
export function scoreKeyword(keyword: string): number {
  const len = keyword ? keyword.length : 0;
  if (len <= 1) return 0;
  return len;
}

/**
 * 最长匹配优先：从已命中关键词集合里剔除「被更长关键词包含的短关键词」。
 * 例：text 含「青龙镇」，同时命中关键词「青龙」与「青龙镇」→ 剔除「青龙」。
 * 仅当真的存在一个更长且不同的已命中关键词包含它时才压制，否则保留。
 */
export function dedupSubstring(keywords: string[]): string[] {
  const uniq = Array.from(new Set(keywords));
  return uniq.filter((k) => {
    return !uniq.some((other) => other !== k && other.length > k.length && other.includes(k));
  });
}
