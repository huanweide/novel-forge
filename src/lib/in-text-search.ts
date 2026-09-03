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

/**
 * 章内替换：把某段正文里匹配的词替换为新词，返回新文本与替换次数。
 *
 * 设计要点（与 countMatches 同源、可单测、零 IO）：
 * - 大小写不敏感、查询词首尾空白先 trim、空查询返回原文（count=0）。
 * - 用 indexOf 收集所有命中起点，按字面子串匹配，**不解析正则**（与 countMatches 一致，查 "a.b" 按字面）。
 * - 替换结果用 slice 拼接（非 String.replace），因此 replacement 里的 $& / $1 等一律按字面写入，绝不解释。
 * - all=true 时从后往前替换，避免前半段替换导致后续索引偏移（"aaaa" 替 "aa"→"b" 得 "bb"）。
 * - occurrenceIndex 指定只替换第几个（0-based）；越界或 all=false 且无有效 index 时返回原文（count=0）。
 */
export interface ReplaceResult {
  newContent: string;
  count: number;
}

export function replaceMatches(
  content: string,
  query: string,
  replacement: string,
  opts: { all?: boolean; occurrenceIndex?: number } = {},
): ReplaceResult {
  const q = (query ?? "").trim();
  if (!q || !content) return { newContent: content, count: 0 };
  const lowerContent = content.toLowerCase();
  const lowerQuery = q.toLowerCase();
  const indices: number[] = [];
  let pos = 0;
  while (pos <= lowerContent.length) {
    const idx = lowerContent.indexOf(lowerQuery, pos);
    if (idx === -1) break;
    indices.push(idx);
    pos = idx + lowerQuery.length;
  }
  if (indices.length === 0) return { newContent: content, count: 0 };

  if (opts.all) {
    let newContent = content;
    for (let i = indices.length - 1; i >= 0; i--) {
      const start = indices[i];
      newContent =
        newContent.slice(0, start) + replacement + newContent.slice(start + q.length);
    }
    return { newContent, count: indices.length };
  }

  const k = opts.occurrenceIndex ?? 0;
  if (k < 0 || k >= indices.length) return { newContent: content, count: 0 };
  const start = indices[k];
  const newContent =
    content.slice(0, start) + replacement + content.slice(start + q.length);
  return { newContent, count: 1 };
}
