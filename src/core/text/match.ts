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

const WORDCHAR_RE = /[A-Za-z0-9]/;
/**
 * 判断字符是否为「真实词边界」。
 * - keywordIsCjk=true（中文关键词）：相邻非汉字即边界（含拉丁/标点/空格）；
 * - keywordIsCjk=false（英文/拼音关键词）：仅在空白/标点/中文相邻处为边界，
 *   相邻拉丁字母不算边界——否则 "AI" 会命中 "waitAI" 这类伪边界。
 */
function isBoundaryChar(ch: string, keywordIsCjk: boolean): boolean {
  if (ch === "") return true;
  if (keywordIsCjk) return !isCjkChar(ch);
  return !WORDCHAR_RE.test(ch);
}

/**
 * 判断 keyword 是否「真实命中」text。
 *
 * 规则：
 *  - 文本不含 keyword → false
 *  - keyword 长度 ≥ 3 且非纯数字 → true（足够具体，如「青龙镇」「碎玉轩」）
 *  - keyword 为纯数字（如「1949」「2049」）→ 无论多长都走词边界判定，否则「2049」会误命中「120499」
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
  if (len <= 1) return false; // 单字直接拒绝

  // 纯数字关键词（如「1949」「2049」）：无论长度都走下方词边界判定，
  // 否则「2049」会误命中「120499」这类包含子串的数字串（R-F4 数字子串误伤）。
  const isPureDigit = /^[0-9]+$/.test(needle);
  if (len >= 3 && !isPureDigit) return true;

  // 长度 2：逐位置检查，只要有一处满足「至少一侧是真实词边界」即视为命中。
  // 中文词：相邻非汉字即边界；非中文词：仅在空白/标点/中文相邻处为边界（灭 "AI" 命中 "waitAI"）。
  const keywordIsCjk = needle.split("").every(isCjkChar);
  let idx = hay.indexOf(needle);
  while (idx >= 0) {
    const before = idx > 0 ? hay[idx - 1] : "";
    const after = idx + len < hay.length ? hay[idx + len] : "";
    const beforeBoundary = isBoundaryChar(before, keywordIsCjk);
    const afterBoundary = isBoundaryChar(after, keywordIsCjk);
    // 中文关键词：任一侧为边界即命中（中文无空格，允许词首/词尾紧贴）。
    // 英文/拼音关键词：必须两侧都为边界（两端都不是字母数字）才是独立词，
    //   否则 "AI" 会误命中 "waitAI"/"xAI"/"AIx" 这类紧贴拉丁字母的伪词。
    if (keywordIsCjk ? (beforeBoundary || afterBoundary) : (beforeBoundary && afterBoundary)) return true;
    idx = hay.indexOf(needle, idx + 1);
  }
  return false;
}

/**
 * 严格边界匹配（角色名 / 短 key 召回专用）。
 *
 * 语义（青砚 Round 4 修正）：
 *  - 单字 (len===1, CJK)：走「紧后非 CJK」前缀守卫——匹配处紧后字符非汉字（句尾/标点/文末）
 *    才命中；紧后是汉字说明它只是更长词的前缀（如「云」在「云海」），拒绝。不查前导。
 *  - 2字 (len===2, CJK)：直接子串命中（P0 修复）。中文无空格，2字名（叶凡/萧炎/林动）几乎
 *    总被 CJK 前后包围，任何边界约束都会令最常见名长全漏检（OOC/召回失效）。纯错字由
 *    includes 前置检查排除（如「叶凡」不会命中「叶帆」）。
 *  - 3字及以上 (len>=3, CJK)：走「前缀守卫」——仅当匹配处「紧后字符非 CJK」（句尾/标点/文末）
 *    才命中；若紧后是 CJK 说明是更长词的前缀（如「李星云」+「剑法」），拒绝（P1 修复）。
 *    不检查前导字符，避免误杀句首合法名。
 *  - 纯数字 / 非 CJK 2字：完全沿用 matchKeyword 行为（含纯数字边界、英文2字两侧边界），无回归。
 */
export function matchNameStrict(text: string, keyword: string): boolean {
  if (!keyword || !text) return false;
  const hay = text.toLowerCase();
  const needle = keyword.toLowerCase();
  if (!hay.includes(needle)) return false;

  const len = needle.length;
  const keywordIsCjk = needle.split("").every(isCjkChar);

  if (len === 1 && keywordIsCjk) {
    // 单字：紧后非 CJK 才认（前缀守卫）。
    let idx = hay.indexOf(needle);
    while (idx >= 0) {
      const afterIdx = idx + len;
      const after = afterIdx < hay.length ? hay[afterIdx] : "";
      if (after === "" || !isCjkChar(after)) return true; // 紧后非CJK → 命中
      idx = hay.indexOf(needle, idx + 1);
    }
    return false;
  }

  // 2字 CJK：直接子串命中（P0 修复），不依赖 matchKeyword 的边界判定，
  // 否则中文无空格场景下「叶凡」夹在 CJK 间会全漏检。纯错字由 includes 前置排除。
  if (len === 2 && keywordIsCjk) {
    return true;
  }

  // 长度 ≥3（及非 CJK 2字/纯数字）：先走共享 matchKeyword（含纯数字边界、英文2字两侧边界、≥3 直命中）。
  const base = matchKeyword(text, keyword);
  if (!base) return false;

  if (len >= 3 && keywordIsCjk) {
    // P1 修复：前缀守卫——「李星云」+「剑法」这类前缀复合词不应误命中。
    // 任一处匹配满足「紧后字符非 CJK」（句尾/标点/文末）即视为合法名命中。
    let idx = hay.indexOf(needle);
    while (idx >= 0) {
      const afterIdx = idx + len;
      const after = afterIdx < hay.length ? hay[afterIdx] : "";
      if (after === "" || !isCjkChar(after)) return base; // 紧后非CJK → 命中
      idx = hay.indexOf(needle, idx + 1);
    }
    return false; // 所有匹配都紧接 CJK（纯前缀）→ 拒绝
  }

  return base;
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
