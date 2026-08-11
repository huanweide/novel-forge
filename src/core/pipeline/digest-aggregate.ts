/**
 * 摘要大纲聚合纯函数（digest-aggregate）
 *
 * 把"聚合逻辑"从 Prisma / Next 运行时里抽出来，做成无副作用的纯函数：
 *  - 不依赖 prisma，便于单测断言；
 *  - 承担两件事：【去重】（同章多条遗留行只留一条）、【过滤垃圾】（AI 对空 / 模板内容
 *    生成的"元应答"残片，例如"您提供的章节内容似乎为空……"这种向用户要内容的话）。
 *
 * 设计背景（瑞宝宝需求）：摘要大纲面板曾经吐出 AI 应答模板残片，根因是底层
 * ChapterSummary.summary 数据脏（重复行 + 元应答被原样存库），旧聚合只是"忠实拼接"，
 * 所以把脏数据全吐出来了。此处从源头过滤，面板从此不可能再吐模板残片。
 *
 * 取舍：不引入 LLM 重算——脏数据由 #285 一次性清理，本模块负责"逻辑上根治"，
 * 保证任何新写入的脏摘要都不可能进入大纲（见 summarize 入口守卫）。
 */

export const MAX_TIMELINE_CHAPTERS = 20; // 时间线摘要最多保留最近 20 章，保持精简

/**
 * 垃圾摘要判定：AI 对空 / 模板内容生成的"元应答"（向用户索要正文、复述模板字段），
 * 而非真实章节摘要。命中任意一条即判为垃圾。
 *
 * 判定维度（任一命中即垃圾）：
 *  1) 空 / 纯空白；
 *  2) 过短（< 12 字，基本不可能是真实摘要）；
 *  3) 命中模板元应答特征词（向用户要正文、复述章节结构字段等）。
 */
const GARBAGE_PATTERNS: RegExp[] = [
  // 向用户索要正文 / 内容
  /您提供(?:的|了).*?(?:章节内容|内容).*?(?:似乎|好像|看起来)?\s*为空/,
  /没有提供(?:实际)?\s*(?:的)?\s*(?:正文|内容)/,
  /(?:正文|内容)\s*(?:似乎|好像)?\s*为空/,
  /等待您补充/,
  /(?:正文|内容).*(?:粘贴|贴).*进来/,
  /需要以下信息才能完成/,
  /以下(?:信息|内容).*(?:缺失|缺少|不足|不全)/,
  /(?:请|麻烦(?:您)?|烦请).*(?:提供|补充|粘贴|贴).*(?:正文|内容|章节)/,
  // 复述模板结构字段（而非真的在写摘要）
  /出场角色/,
  /章末原文/,
  /完整正文/,
  /(?:我注意到|我发现).*(?:提供了模板|您提供了)/,
  /(?:模板|章节标题|占位)/,
];

export function isGarbageSummary(summary: string | null | undefined): boolean {
  if (summary == null) return true;
  const s = String(summary).trim();
  if (s.length === 0) return true;
  if (s.length < 12) return true; // 过短：基本不可能是真实摘要
  for (const re of GARBAGE_PATTERNS) {
    if (re.test(s)) return true;
  }
  return false;
}

export interface RawChapterSummary {
  chapterId: string;
  summary: string | null | undefined;
}

export interface ChapterOrderMeta {
  order: number;
  title: string | null | undefined;
}

/**
 * 构建时间线摘要大纲（纯函数）。
 *
 * 流程：
 *  1) 按章分组：每章只保留「非垃圾且最长」的一条（去重 + 过滤垃圾）；
 *  2) 仅保留仍存在的章（orderMap 命中才纳入，过滤已删节点遗留行）；
 *  3) 按章序排序，取最近 MAX_TIMELINE_CHAPTERS 章；
 *  4) 拼装「第N章 标题：文本」。
 *
 * 关键性质：无论底层有多少重复行 / 垃圾行，返回的字符串里每一章最多出现一次，
 * 且绝不出现模板元应答残片。
 */
export function buildTimelineDigest(
  summaries: RawChapterSummary[],
  orderMap: Map<string, ChapterOrderMeta>,
): string {
  // 1) 按章去重：每章只留「非垃圾 + 最长」一条
  const bestByChapter = new Map<string, string>();
  for (const s of summaries) {
    if (!orderMap.has(s.chapterId)) continue; // 跳过已删章的遗留行
    const text = String(s.summary ?? "").trim();
    if (isGarbageSummary(text)) continue; // 直接丢弃垃圾
    const prev = bestByChapter.get(s.chapterId);
    if (prev === undefined || text.length > prev.length) {
      bestByChapter.set(s.chapterId, text);
    }
  }

  // 2) 按章序排序，取最近 N 章
  const ordered = [...bestByChapter.entries()]
    .sort((a, b) => {
      const oa = orderMap.get(a[0])!.order;
      const ob = orderMap.get(b[0])!.order;
      return oa - ob;
    })
    .slice(-MAX_TIMELINE_CHAPTERS);

  // 3) 拼装
  return ordered
    .map(([chapterId, text]) => {
      const meta = orderMap.get(chapterId)!;
      const chNo = meta.order + 1;
      const rawTitle = meta.title || "";
      // 规范化：循环剥离标题里自带的"第X章"前缀（中文 / 阿拉伯数字都算），
      // 避免与下方 canonical 前缀叠加成"第3章 第三章：第3章"式三重前缀
      // （曾出现过节点标题本身就是"第三章：第3章"的畸形数据）。
      let cleanTitle = rawTitle;
      const titlePrefixRe = /^第\s*[0-9零一二三四五六七八九十百千]+\s*章[\s:：·\-—]*/;
      let m: RegExpExecArray | null;
      while ((m = titlePrefixRe.exec(cleanTitle))) {
        cleanTitle = cleanTitle.slice(m[0].length);
      }
      cleanTitle = cleanTitle.trim();
      const prefixedTitle = cleanTitle ? `第${chNo}章 ${cleanTitle}` : `第${chNo}章`;
      // 摘要文本若自身又以"第N章"开头（AI 摘要常带此前缀），剥离避免前缀叠加
      const cleanText = text.replace(/^第\s*\d+\s*章[\s:：·\-—]*/, "");
      return `${prefixedTitle}：${cleanText.slice(0, 220)}`;
    })
    .join("\n");
}

export interface RawStorylineEvent {
  storylineId?: string | null;
  role?: string | null;
  kind?: string | null;
  title?: string | null;
  content?: string | null;
  position?: number | null;
}

export interface RawMainLine {
  id: string;
  title: string | null | undefined;
  description?: string | null | undefined;
}

/**
 * 将一条主线的事件列表格式化为时间轴文本（纯函数）。
 * 过滤 CLUE（线索型，不进主线时间轴），按 position 排序，取最近 24 个。
 */
export function formatStorylineEvents(events: RawStorylineEvent[]): string {
  return (events as RawStorylineEvent[])
    .filter((e) => e.kind !== "CLUE")
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .slice(-24)
    .map((e) => {
      const role =
        e.role === "advance" ? "[推进点]" :
        e.role === "probe" ? "[卡点]" :
        e.role === "vote" ? "[分支选择点]" : "";
      const kindLabel = e.kind === "MILESTONE" ? "里程碑·" : "事件·";
      const title =
        e.title || (e.content ? String(e.content).slice(0, 40) : "") || "未命名";
      return `${role}${kindLabel}${title}`;
    })
    .join(" → ");
}

/**
 * 构建故事线摘要大纲（纯函数）。
 * mainLines 为各主线元信息，eventsByLine 为「主线 id → 其事件列表」映射。
 */
export function buildStorylineDigest(
  mainLines: RawMainLine[],
  eventsByLine: Record<string, RawStorylineEvent[]>,
): string {
  const parts: string[] = [];
  for (const line of mainLines) {
    const evText = formatStorylineEvents(eventsByLine[line.id] ?? []);
    const head = `【主线：${line.title}】${line.description ? ` ${line.description}` : ""}`;
    parts.push(evText ? `${head}\n时间轴：${evText}` : head);
  }
  return parts.join("\n\n");
}
