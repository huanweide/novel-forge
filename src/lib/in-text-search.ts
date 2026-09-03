/**
 * 章内查找：统计某段正文里某个词出现多少次。
 *
 * 设计要点（贴合写作台场景）：
 * - 大小写不敏感（中文搜索直接命中，英文 "Li" / "li" 都算）。
 * - 查询词首尾空白先 trim，空查询返回 0（UI 实时计数用，避免空词刷屏）。
 * - 用 indexOf 做字面子串匹配，**不解析正则**——用户查 "a.b" 或 "1+1" 也按字面算，绝不把查询词当正则导致崩溃或误匹配。
 * - 纯函数、零 IO，便于单测，也供 UI 实时计数与「第 N/共 M 处」展示。
 */
export function countMatches(content: string, query: string): number {
  const q = (query ?? "").trim();
  if (!q || !content) return 0;
  const haystack = content.toLowerCase();
  const needle = q.toLowerCase();
  let count = 0;
  let pos = 0;
  while (pos <= haystack.length) {
    const idx = haystack.indexOf(needle, pos);
    if (idx === -1) break;
    count++;
    pos = idx + needle.length;
  }
  return count;
}

/**
 * 浏览器原生页面查找（window.find）是否可用。
 * 该 API 非标准、SSR / 无头环境下不存在，必须特性探测后再调用，避免运行时抛错。
 */
export function hasNativeFind(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { find?: unknown }).find === "function"
  );
}

/**
 * 触发浏览器原生查找，跳转到下一处 / 上一处命中。
 * 复用浏览器自带高亮 + 滚动，零侵入正文渲染；不支持时返回 false（UI 降级为仅显示计数）。
 * @param query 要查找的词
 * @param backward true=上一处，false=下一处
 */
export function jumpToMatch(query: string, backward: boolean): boolean {
  if (!hasNativeFind()) return false;
  const find = (window as unknown as {
    find: (
      str: string,
      caseSensitive?: boolean,
      backward?: boolean,
      wrap?: boolean,
      wholeWord?: boolean,
      showDialog?: boolean,
    ) => boolean;
  }).find;
  try {
    return find(query, false, backward, true, false, true);
  } catch {
    return false;
  }
}
