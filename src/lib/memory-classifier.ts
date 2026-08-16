/**
 * 记忆分级引擎 —— S/A/B 三级分类
 *
 * S 级（必须记住）：未回收伏笔 + impact=major 的转折点 + 核心角色状态变化
 * A 级（应该记住）：最近 5 章的 keyEvents + 相关角色事件
 * B 级（可以归档）：更早章节的 1 行摘要
 *
 * 不新建数据库表——复用 ChapterSummary / StoryBeat / PendingCommitment。
 */

// Prisma 类型在运行时不校验，这里用 any 避免导入问题
type ChapterSummary = any;
type StoryBeat = any;
type PendingCommitment = any;
type CharacterCard = any;

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface TieredMemory {
  /** S 级——每条都是独立的关键信息 */
  sTier: TieredEvent[];
  /** A 级——近期重要事件 */
  aTier: TieredEvent[];
  /** B 级——归档摘要 */
  bTier: TieredEvent[];
}

export interface TieredEvent {
  content: string;
  source: "foreshadowing" | "story_beat" | "chapter_summary" | "character_change";
  chapterNumber?: number;
  importance: "critical" | "high" | "medium";
}

// ═══════════════════════════════════════════
// 分类引擎
// ═══════════════════════════════════════════

/**
 * 对所有记忆数据做 S/A/B 三级分类。
 *
 * @param summaries    - 所有章节摘要（按时间升序）
 * @param beats        - 所有故事转折点
 * @param commitments  - 所有伏笔（含已回收和未回收）
 * @param characters   - 所有角色（用于检测核心角色状态变化）
 * @param currentChapter - 当前正在写的章号
 */
export function classifyEvents(
  summaries: ChapterSummary[],
  beats: StoryBeat[],
  commitments: PendingCommitment[],
  characters: CharacterCard[],
  currentChapter: number,
): TieredMemory {
  const sTier: TieredEvent[] = [];
  const aTier: TieredEvent[] = [];
  const bTier: TieredEvent[] = [];

  // ── S 级 ①：未回收伏笔（最近5章和即将到期的） ──
  const unresolved = commitments.filter((c) => c.status !== "resolved");
  for (const c of unresolved) {
    const urgency =
      c.expiryChapter != null && c.expiryChapter - currentChapter <= 3
        ? "critical"
        : "high";
    sTier.push({
      content: `【伏笔·待回收】${c.description}${c.expiryChapter ? `（预计第${c.expiryChapter}章回收）` : ""}`,
      source: "foreshadowing",
      chapterNumber: c.chapterNumber ?? undefined,
      importance: urgency,
    });
  }

  // ── S 级 ②：impact=major 的故事转折点 ──
  for (const b of beats) {
    if (b.impact === "major") {
      sTier.push({
        content: `【关键转折】第${b.chapterNumber}章 — ${b.description}`,
        source: "story_beat",
        chapterNumber: b.chapterNumber,
        importance: "high",
      });
    }
  }

  // ── S 级 ③：核心角色状态变化（主角/反派/导师） ──
  const coreRoles = new Set(["protagonist", "antagonist", "mentor"]);
  const coreChars = characters.filter((c) => coreRoles.has(c.role));
  for (const char of coreChars) {
    if (char.arcProgress && char.arcProgress.length > 5) {
      sTier.push({
        content: `【核心角色·${char.name}·${char.role}】弧光：${char.arcProgress} | 状态：${char.currentStatus}`,
        source: "character_change",
        importance: "high",
      });
    }
  }

  // ── A 级：最近 5 章的 keyEvents + minor beats ──
  const recentSummaries = summaries
    .filter((s) => {
      const cn = extractChapterNumber(s);
      return cn > currentChapter - 5 && cn <= currentChapter;
    })
    .sort((a, b) => extractChapterNumber(b) - extractChapterNumber(a));

  for (const s of recentSummaries) {
    const cn = extractChapterNumber(s);
    // 已有的 eventImportances 优先用
    if (s.eventImportances && typeof s.eventImportances === "object") {
      const ei = s.eventImportances as Record<string, unknown>;
      const aEvents = (ei.aTier as string[]) || [];
      for (const e of aEvents) {
        aTier.push({
          content: `第${cn}章 — ${e}`,
          source: "chapter_summary",
          chapterNumber: cn,
          importance: "medium",
        });
      }
    }
    // 兜底：用 keyEvents
    if (s.keyEvents && s.keyEvents.length > 0) {
      for (const ke of s.keyEvents) {
        aTier.push({
          content: `第${cn}章 — ${ke}`,
          source: "chapter_summary",
          chapterNumber: cn,
          importance: "medium",
        });
      }
    }
  }

  // A 级也加入 impact=minor 的 StoryBeat
  for (const b of beats) {
    if (b.impact === "minor" && b.chapterNumber > currentChapter - 5) {
      aTier.push({
        content: `第${b.chapterNumber}章 — ${b.description}`,
        source: "story_beat",
        chapterNumber: b.chapterNumber,
        importance: "medium",
      });
    }
  }

  // ── B 级：更早章节的 1 行摘要（归档） ──
  const oldSummaries = summaries.filter((s) => {
    const cn = extractChapterNumber(s);
    // 修复 off-by-one：原阈值 `cn <= currentChapter - 6` 与 A 级 `cn > currentChapter - 5`
    // 之间存在夹缝——第 (currentChapter-5) 章摘要既不满足 A（严格大于）也不满足 B（<= -6），
    // 被静默丢弃，AI 在该章附近丢失上下文且无报错。改为 `- 5` 让中间章归 B 归档，A/B 互补覆盖全部 cn<=current。
    return cn <= currentChapter - 5;
  });

  for (const s of oldSummaries) {
    const cn = extractChapterNumber(s);
    const short = s.summary ? s.summary.slice(0, 80) : "";
    if (short) {
      bTier.push({
        content: `第${cn}章 — ${short}…`,
        source: "chapter_summary",
        chapterNumber: cn,
        importance: "medium",
      });
    }
  }

  // ── 去重 + 排序 ──
  return {
    sTier: dedupeAndSort(sTier),
    aTier: dedupeAndSort(aTier),
    bTier: dedupeAndSort(bTier),
  };
}

// ═══════════════════════════════════════════
// 辅助
// ═══════════════════════════════════════════

function extractChapterNumber(s: ChapterSummary): number {
  // chapterTitle 通常是 "第N章 xxx"
  const match = s.chapterTitle?.match(/第(\d+)章/);
  if (match) return parseInt(match[1]);
  // 或者直接用 createdAt 的序号
  return 0;
}

function dedupeAndSort(events: TieredEvent[]): TieredEvent[] {
  const seen = new Set<string>();
  const result: TieredEvent[] = [];
  for (const e of events) {
    const key = e.content.slice(0, 60);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(e);
    }
  }
  // critical > high > medium
  const order = { critical: 0, high: 1, medium: 2 };
  // 修复：critical 权重是 0，必须用 ?? 兜底（不能 ||，否则 0 被 falsy 吞掉变成 2，
  // 导致 critical 反而排到 medium 同级、最终排在 S 级最后，与「critical 最优先」意图相反）。
  result.sort((a, b) => (order[a.importance] ?? 2) - (order[b.importance] ?? 2));
  return result;
}

/**
 * 将 classifyEvents 输出的 TieredMemory 转换为 EventImportances 格式，
 * 方便存入 ChapterSummary.eventImportances 供 engine.ts 读取。
 */
export function tieredMemoryToImportances(memory: TieredMemory): {
  sTier: Array<{ description: string; score: number; tier: string; category: string; isBreakthrough: boolean; isForeshadowRelated: boolean; relatedCharacterIds: string[] }>;
  aTier: Array<{ description: string; score: number; tier: string; category: string; isBreakthrough: boolean; isForeshadowRelated: boolean; relatedCharacterIds: string[] }>;
  bTier: Array<{ description: string; score: number; tier: string; category: string; isBreakthrough: boolean; isForeshadowRelated: boolean; relatedCharacterIds: string[] }>;
  cTier: Array<{ description: string; score: number; tier: string; category: string; isBreakthrough: boolean; isForeshadowRelated: boolean; relatedCharacterIds: string[] }>;
} {
  const mapTier = (events: TieredEvent[], tier: string, defaultScore: number) =>
    events.map((e) => ({
      description: e.content,
      score: e.importance === "critical" ? 50 : e.importance === "high" ? 30 : defaultScore,
      tier,
      category: e.source === "foreshadowing" ? "plot_twist" : e.source === "story_beat" ? "plot_twist" : e.source === "character_change" ? "breakthrough" : "interaction",
      isBreakthrough: e.source === "character_change",
      isForeshadowRelated: e.source === "foreshadowing",
      relatedCharacterIds: [] as string[],
    }));

  return {
    sTier: mapTier(memory.sTier, "S", 40),
    aTier: mapTier(memory.aTier, "A", 20),
    bTier: mapTier(memory.bTier, "B", 10),
    cTier: [], // classifyEvents 不产出 C 级
  };
}

/**
 * 一站式：分类 + 转换，返回可直接存入 ChapterSummary.eventImportances 的对象。
 * 用于后处理器在 LLM summarization 后补充基于规则的分级数据。
 */
export function classifyAndConvert(
  summaries: ChapterSummary[],
  beats: StoryBeat[],
  commitments: PendingCommitment[],
  characters: CharacterCard[],
  currentChapter: number,
) {
  const memory = classifyEvents(summaries, beats, commitments, characters, currentChapter);
  return tieredMemoryToImportances(memory);
}

/**
 * 将分级记忆序列化为可注入 prompt 的文本块。
 * 自动做 token 预算截断。
 */
export function formatTieredMemory(
  memory: TieredMemory,
  maxTokens: number,
  countTokens: (text: string) => number,
): string {
  const lines: string[] = [];

  // S 级——全部注入（量少，不超过 10 条）
  if (memory.sTier.length > 0) {
    lines.push("## 🔴 S级记忆——核心不可遗忘");
    for (const e of memory.sTier) {
      lines.push(`- ${e.content}`);
    }
    lines.push("");
  }

  // A 级——按 token 预算注入
  if (memory.aTier.length > 0) {
    lines.push("## 🟡 A级记忆——近期关键事件");
    let aTokens = 0;
    const aMax = Math.floor(maxTokens * 0.4); // A 级占 40%
    for (const e of memory.aTier) {
      const line = `- ${e.content}`;
      const t = countTokens(line);
      if (aTokens + t > aMax) break;
      lines.push(line);
      aTokens += t;
    }
    lines.push("");
  }

  // B 级——更激进截断
  if (memory.bTier.length > 0) {
    lines.push("## ⚪ B级记忆——历史归档");
    let bTokens = 0;
    const bMax = Math.floor(maxTokens * 0.2); // B 级占 20%
    for (const e of memory.bTier) {
      const line = `- ${e.content}`;
      const t = countTokens(line);
      if (bTokens + t > bMax) break;
      lines.push(line);
      bTokens += t;
    }
    lines.push("");
  }

  return lines.join("\n");
}
