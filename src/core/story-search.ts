/**
 * v3.1.75 全文检索（GLOBAL-SEARCH）—— 纯函数核心，零 IO、零依赖，便于单测。
 *
 * 解决的长篇痛点：写到几十万字后，想找「某个角色第一次出现的地方」「那把铜钥匙在哪章提过」，
 * 只能一章章点开翻。这里在内存里对全部章节正文做子串扫描，返回命中章节 + 上下文片段。
 *
 * 设计取舍：
 * - 子串匹配（indexOf）而非分词/倒排：中文没有空格分词，子串匹配最符合直觉且零依赖；
 *   几十万字 = 几 MB 字符串，indexOf 是原生实现，毫秒级，不需要引入搜索引擎。
 * - 大小写不敏感：英文搜 "Key" 与 "key" 等价；片段回显保留原文大小写。
 * - 命中来源区分 content / outline / title：让用户知道是正文里写的、还是大纲里提的。
 */

/** 命中片段在命中词前后各取多少字符作为上下文 */
export const SEARCH_CONTEXT_CHARS = 60;

/** 单章最多返回几个命中片段（防爆） */
export const MAX_HITS_PER_CHAPTER = 5;

/** 最多返回多少个命中章节（防爆） */
export const MAX_CHAPTERS = 50;

/** 可被检索的字段 */
export type SearchField = "content" | "outline" | "title";

export interface SearchHit {
  /** 命中来源字段 */
  field: SearchField;
  /** 命中位置在该字段文本中的字符下标 */
  position: number;
  /** 上下文片段（含命中词，前后各 SEARCH_CONTEXT_CHARS 字符，两端按需加省略号） */
  snippet: string;
}

export interface SearchChapterResult {
  nodeId: string;
  title: string;
  type: string;
  order: number;
  /** 该章命中次数（受 MAX_HITS_PER_CHAPTER 截断） */
  hitCount: number;
  hits: SearchHit[];
}

export interface SearchSummary {
  query: string;
  /** 命中章节数（受 MAX_CHAPTERS 截断） */
  chapterCount: number;
  /** 命中总次数（受两处上限截断，用于「共 N 处」展示） */
  totalHits: number;
  /** 是否因上限被截断（前端提示「结果较多，换个更具体的词」） */
  truncated: boolean;
  results: SearchChapterResult[];
}

/** 参与检索的最小节点视图（API 层从 DB 取好后传进来，本模块不碰 IO） */
export interface SearchableNode {
  id: string;
  title: string;
  type: string;
  order: number;
  content?: string | null;
  outline?: string | null;
}

interface ScanOptions {
  contextChars?: number;
  maxHits?: number;
}

/**
 * 在一段文本里找全部命中位置，并提取上下文片段。
 * 空关键词返回空数组（不做无意义的全量命中）。
 */
export function scanHits(
  text: string | null | undefined,
  query: string,
  opts: ScanOptions = {},
): { positions: number[]; hits: Array<Omit<SearchHit, "field">> } {
  const q = query.trim();
  if (!q || !text) return { positions: [], hits: [] };

  const ctx = opts.contextChars ?? SEARCH_CONTEXT_CHARS;
  const maxHits = opts.maxHits ?? MAX_HITS_PER_CHAPTER;

  const haystack = text.toLowerCase();
  const needle = q.toLowerCase();

  const positions: number[] = [];
  let from = 0;
  while (positions.length < maxHits) {
    const pos = haystack.indexOf(needle, from);
    if (pos === -1) break;
    positions.push(pos);
    from = pos + needle.length;
  }

  const hits = positions.map((pos) => ({
    position: pos,
    snippet: buildSnippet(text, pos, q.length, ctx),
  }));

  return { positions, hits };
}

/**
 * 从原文中提取带上下文的片段：命中词前后各 ctx 字符，两端按需补省略号。
 * 导出以便单测覆盖边界（开头命中不加前省略号、结尾命中不加后省略号）。
 */
export function buildSnippet(
  text: string,
  position: number,
  queryLength: number,
  contextChars = SEARCH_CONTEXT_CHARS,
): string {
  const start = Math.max(0, position - contextChars);
  const end = Math.min(text.length, position + queryLength + contextChars);
  const raw = text.slice(start, end);
  return `${start > 0 ? "…" : ""}${raw}${end < text.length ? "…" : ""}`;
}

/**
 * 对全部章节做全文检索。
 *
 * 匹配顺序：正文 content → 大纲 outline → 标题 title。
 * 只要任一字段命中，该章就进结果；同一章内多个字段命中会合并展示（正文优先）。
 * 结果按章节 order 升序（即正文章节顺序），符合「从头往后找」的直觉。
 */
export function searchStoryNodes(
  nodes: SearchableNode[],
  query: string,
  opts: { maxChapters?: number } = {},
): SearchSummary {
  const q = query.trim();
  const maxChapters = opts.maxChapters ?? MAX_CHAPTERS;

  if (!q) {
    return { query: q, chapterCount: 0, totalHits: 0, truncated: false, results: [] };
  }

  const sorted = [...nodes].sort((a, b) => a.order - b.order);
  const results: SearchChapterResult[] = [];
  let totalHits = 0;
  let truncated = false;

  for (const node of sorted) {
    if (results.length >= maxChapters) {
      truncated = true;
      break;
    }

    const hits: SearchHit[] = [];
    const fields: SearchField[] = ["content", "outline", "title"];

    for (const field of fields) {
      if (hits.length >= MAX_HITS_PER_CHAPTER) break;
      const text = field === "title" ? node.title : (field === "content" ? node.content : node.outline);
      const found = scanHits(text, q, { maxHits: MAX_HITS_PER_CHAPTER - hits.length });
      for (const h of found.hits) hits.push({ ...h, field });
    }

    if (hits.length === 0) continue;

    totalHits += hits.length;
    results.push({
      nodeId: node.id,
      title: node.title,
      type: node.type,
      order: node.order,
      hitCount: hits.length,
      hits,
    });
  }

  return {
    query: q,
    chapterCount: results.length,
    totalHits,
    truncated,
    results,
  };
}
