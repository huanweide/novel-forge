/**
 * 世界观 Codex 活注入引擎 —— 按相关性筛选「本章该注入哪些设定」
 *
 * 来源：2026-09-04 董事会路线图 M1（PG① / 乔布斯② / 张雪峰② 三角色共识）。
 *
 * ── 它解决什么真实问题 ──
 * 生成正文时，角色卡走 filterByConfirmedCards：用户在生成前没勾选任何角色时，
 * 该函数**原样返回全部角色**。短篇没事，但长篇写到几十个角色后，
 * 与本章毫无关系的角色会被全量塞进 prompt——既浪费 token，
 * 又把「本章真正该写谁」的重点稀释掉，AI 反而抓不住重点（人设被无关信息带偏）。
 * 伏笔同理：pendingCommitments 全量注入，已完结的、八竿子打不着的都混在里面。
 *
 * ── 怎么做 ──
 * 纯本地相关性打分 + Top-K 截断，四条铁律：
 *   1. 用户勾选的出场角色：强制注入，永不裁剪（人机关系里「人说了算」）
 *   2. 本章大纲 / 作者指令 / 上一章结尾提到的名字（含别名）：高分注入
 *   3. 临近应回收的伏笔加优先分；已完结 / 已废弃的伏笔直接排除
 *   4. 候选总数 ≤ 名额时全量保留 —— 小项目零行为变化，绝不误伤
 *
 * 零 IO、零外部依赖、不联网，全部可单测。
 */

import { matchNameStrict } from "@/core/text/match";

export type CodexKind = "character" | "lore" | "commitment";

/** 一条被选中注入的设定（同时用于 prompt 注入与前端可视化） */
export interface CodexItem {
  id: string;
  kind: CodexKind;
  title: string;
  /** 注入给 AI 的内容摘要（已按 contentLimit 截断，防爆上下文） */
  content: string;
  /** 相关性得分，越高越该注入 */
  score: number;
  /** 给用户看的「为什么注入它」——可视化面板直接展示这句 */
  reason: string;
  /** 用户勾选 / 常驻设定：永不裁剪 */
  forced: boolean;
}

export interface CodexStats {
  /** 参与打分的候选总数 */
  candidates: number;
  /** 最终选中数 */
  selected: number;
  /** 因与本章无关被略过的数量 */
  dropped: number;
  byKind: Record<CodexKind, number>;
}

export interface CodexSelection {
  items: CodexItem[];
  stats: CodexStats;
  /** 筛选后的角色（供 buildGenerationContext 使用，替代原「全量注入」） */
  characters: any[];
  /** 筛选后的伏笔（同上） */
  commitments: any[];
}

// ─── 输入类型（duck typing，避免耦合 Prisma 生成的类型，便于单测）───

export interface CharacterLike {
  id: string;
  name?: string | null;
  /** JSON 字符串数组（Prisma String 字段存的 JSON） */
  aliases?: unknown;
  personality?: string | null;
  background?: string | null;
  currentStatus?: string | null;
  storyLine?: string | null;
  tags?: unknown;
}

export interface CommitmentLike {
  id: string;
  description?: string | null;
  status?: string | null;
  entityId?: string | null;
  fulfillmentRatio?: number | null;
  /** JSON：回收条件，可能含章节号 */
  closureConditions?: unknown;
  createdChapterId?: string | null;
}

export interface LoreLike {
  id: string;
  title?: string | null;
  content?: string | null;
  /** 0-4，≤2 为常驻（项目既有规则），≥3 关键词触发 */
  depth?: number | null;
  keys?: unknown;
  enabled?: boolean | null;
}

export interface SelectCodexOptions {
  /** 用户在生成前勾选的出场角色 id —— 强制注入，永不裁剪 */
  forcedCharacterIds?: string[];
  /** 用户在可视化面板手动排除的条目 id */
  excludedIds?: string[];
  /** 当前章节序号（order），用于伏笔「临近回收」加分 */
  currentOrder?: number;
  maxCharacters?: number;
  maxLore?: number;
  maxCommitments?: number;
  /** 单条内容摘要的最大字符数（防爆上下文） */
  contentLimit?: number;
}

const DEFAULTS = {
  maxCharacters: 8,
  maxLore: 20,
  maxCommitments: 10,
  contentLimit: 400,
};

/** 已完结 / 已废弃的伏笔状态：直接排除，不参与打分 */
const COMMITMENT_DONE_RE =
  /fulfilled|closed|resolved|completed|done|abandoned|cancel|完成|已收|已兑现|已回收|废弃|作废/i;

// ─── 小工具 ───

/** 把 Prisma 的 JSON 字符串字段安全解析成字符串数组 */
function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    // 已是 JSON 数组
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          return parsed.filter((x): x is string => typeof x === "string" && !!x.trim());
        }
      } catch {
        /* 解析失败走下面的分隔兜底 */
      }
    }
    // 逗号 / 顿号 / 分号 分隔的别名串
    return s
      .split(/[,，、;；]/)
      .map((x) => x.trim())
      .filter(Boolean);
  }
  return [];
}

function clip(text: string | null | undefined, limit: number): string {
  const s = (text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  return s.length > limit ? `${s.slice(0, limit)}…` : s;
}

/** 从伏笔的回收条件里抠出章节号（用于判断「是否临近回收」） */
function extractChapterHints(c: CommitmentLike): number[] {
  const out: number[] = [];
  const scan = (v: unknown) => {
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push(v);
      return;
    }
    if (typeof v === "string") {
      const m = v.match(/第?\s*(\d{1,4})\s*[章回节]/g);
      if (m) for (const one of m) {
        const n = parseInt(one.replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(n)) out.push(n);
      }
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) scan(x);
      return;
    }
    if (v && typeof v === "object") {
      for (const x of Object.values(v as Record<string, unknown>)) scan(x);
    }
  };
  scan(c.closureConditions);
  return out;
}

// ─── 打分 ───

interface Scored {
  score: number;
  reason: string;
  forced: boolean;
}

/** 角色相关性打分：-1 表示淘汰 */
function scoreCharacter(
  c: CharacterLike,
  text: string,
  knownNames: string[],
  forced: boolean,
): Scored {
  const name = (c.name || "").trim();
  if (!name) return { score: -1, reason: "", forced };

  if (forced) {
    return { score: 10000, reason: "你勾选的出场角色", forced: true };
  }

  let score = 0;
  const reasons: string[] = [];

  // 名字命中（词边界精确匹配，灭「林」误中「森林」）
  if (matchNameStrict(text, name, { knownNames })) {
    score += 60;
    reasons.push(`本章提到了「${name}」`);
  }
  // 别名命中
  const aliases = asStringArray(c.aliases);
  const hitAlias = aliases.find((a) => a !== name && matchNameStrict(text, a, { knownNames }));
  if (hitAlias) {
    score += 45;
    reasons.push(`本章提到了别名「${hitAlias}」`);
  }
  // 弱信号：人设 / 现状 / 标签里有词被提到
  const weakFields = [c.personality, c.currentStatus, c.tags];
  const weakHit = weakFields.some((f) => {
    const words = asStringArray(f);
    return words.some((w) => w.length >= 2 && matchNameStrict(text, w, { knownNames }));
  });
  if (weakHit) {
    score += 12;
    reasons.push("人设/标签与本章内容相关");
  }

  if (score === 0) {
    // 本章完全没提到——仅作「余量候选」，分数极低，靠后的排序
    return { score: 1, reason: "本章未提及，按余量保留", forced: false };
  }
  return { score, reason: reasons.join("；"), forced: false };
}

/** 伏笔相关性打分：-1 表示淘汰（已完结 / 无描述） */
function scoreCommitment(
  c: CommitmentLike,
  text: string,
  knownNames: string[],
  currentOrder: number | undefined,
): Scored {
  const desc = (c.description || "").trim();
  if (!desc) return { score: -1, reason: "", forced: false };

  const status = (c.status || "").trim();
  if (status && COMMITMENT_DONE_RE.test(status)) {
    return { score: -1, reason: "", forced: false };
  }

  let score = 10; // 基础分：未兑现的承诺本身就值得留意
  const reasons: string[] = ["尚未回收"];

  // 描述里的实体名命中本章内容
  const hitEntity = knownNames.some((n) => n.length >= 2 && desc.includes(n));
  if (hitEntity) {
    score += 35;
    reasons.push("涉及本章出现的角色/设定");
  }
  // 临近回收：回收章节越接近当前章越优先
  if (typeof currentOrder === "number") {
    const hints = extractChapterHints(c);
    if (hints.length > 0) {
      const nearest = Math.min(...hints.map((h) => Math.abs(h - currentOrder)));
      if (nearest <= 1) {
        score += 30;
        reasons.push("临近回收章节");
      } else if (nearest <= 3) {
        score += 15;
        reasons.push("回收章节临近");
      }
    }
  }
  // 兑现度越低越该提醒（越拖越久）
  const ratio = typeof c.fulfillmentRatio === "number" ? c.fulfillmentRatio : null;
  if (ratio !== null && ratio < 0.3) {
    score += 10;
    reasons.push("长期未推进");
  }

  return { score, reason: reasons.join("；"), forced: false };
}

// ─── 主入口 ───

export interface CodexInput {
  characters?: CharacterLike[];
  lore?: LoreLike[];
  commitments?: CommitmentLike[];
}

/**
 * 按相关性筛选本章应注入的设定。
 *
 * @param queryText 检索依据：本章大纲 + 作者指令 + 上一章结尾 + 已确认角色名
 */
export function selectCodex(
  queryText: string,
  input: CodexInput,
  options: SelectCodexOptions = {},
): CodexSelection {
  const text = queryText || "";
  const maxCharacters = options.maxCharacters ?? DEFAULTS.maxCharacters;
  const maxLore = options.maxLore ?? DEFAULTS.maxLore;
  const maxCommitments = options.maxCommitments ?? DEFAULTS.maxCommitments;
  const contentLimit = options.contentLimit ?? DEFAULTS.contentLimit;

  const forcedSet = new Set(options.forcedCharacterIds || []);
  const excludedSet = new Set(options.excludedIds || []);

  const characters = input.characters || [];
  const commitments = input.commitments || [];
  const lore = input.lore || [];

  // 候选实体名集合（供 matchNameStrict 做「最长匹配优先」，短名被长名吞并）
  const knownNames: string[] = [];
  for (const c of characters) {
    const n = (c.name || "").trim();
    if (n) knownNames.push(n);
    for (const a of asStringArray(c.aliases)) knownNames.push(a);
  }
  for (const l of lore) {
    for (const k of asStringArray(l.keys)) knownNames.push(k);
  }

  // ── 1. 角色打分 ──
  const scoredChars: Array<{ raw: CharacterLike; scored: Scored }> = [];
  for (const c of characters) {
    if (excludedSet.has(c.id)) continue;
    const scored = scoreCharacter(c, text, knownNames, forcedSet.has(c.id));
    if (scored.score < 0) continue;
    scoredChars.push({ raw: c, scored });
  }
  scoredChars.sort((a, b) => b.scored.score - a.scored.score);

  // 名额分配：强制项不占名额，其余按分数取前 N
  const forcedChars = scoredChars.filter((x) => x.scored.forced);
  const restChars = scoredChars.filter((x) => !x.scored.forced);
  const keepChars = [...forcedChars, ...restChars.slice(0, Math.max(0, maxCharacters - forcedChars.length))];

  const charItems: CodexItem[] = keepChars.map(({ raw, scored }) => ({
    id: raw.id,
    kind: "character" as CodexKind,
    title: (raw.name || "未命名角色").trim(),
    content: clip(
      [raw.currentStatus, raw.personality, raw.background].filter(Boolean).join(" "),
      contentLimit,
    ),
    score: scored.score,
    reason: scored.reason,
    forced: scored.forced,
  }));

  // ── 2. 伏笔打分 ──
  const scoredCommits: Array<{ raw: CommitmentLike; scored: Scored }> = [];
  for (const c of commitments) {
    if (excludedSet.has(c.id)) continue;
    const scored = scoreCommitment(c, text, knownNames, options.currentOrder);
    if (scored.score < 0) continue;
    scoredCommits.push({ raw: c, scored });
  }
  scoredCommits.sort((a, b) => b.scored.score - a.scored.score);
  const keepCommits = scoredCommits.slice(0, maxCommitments);

  const commitItems: CodexItem[] = keepCommits.map(({ raw, scored }) => ({
    id: raw.id,
    kind: "commitment" as CodexKind,
    title: clip(raw.description, 60) || "未命名伏笔",
    content: clip(raw.description, contentLimit),
    score: scored.score,
    reason: scored.reason,
    forced: false,
  }));

  // ── 3. 世界观 / lorebook（关键词召回由既有 recallContext 负责，这里只做兜底与统一编排）──
  const enabledLore = lore.filter((l) => l.enabled !== false && !excludedSet.has(l.id));
  const loreScored = enabledLore
    .map((l) => {
      const keys = asStringArray(l.keys);
      const hit = keys.some((k) => matchNameStrict(text, k, { knownNames }));
      const resident = typeof l.depth === "number" && l.depth <= 2;
      return {
        raw: l,
        // 常驻（depth≤2）永远高分；关键词命中次之；其余低分
        score: resident ? 500 : hit ? 80 : 1,
        reason: resident ? "常驻设定" : hit ? "关键词命中本章内容" : "本章未触发",
        forced: resident,
      };
    })
    .sort((a, b) => b.score - a.score);
  const loreForced = loreScored.filter((x) => x.forced);
  const loreRest = loreScored.filter((x) => !x.forced);
  const keepLore = [...loreForced, ...loreRest.slice(0, Math.max(0, maxLore - loreForced.length))];

  const loreItems: CodexItem[] = keepLore.map(({ raw, score, reason, forced }) => ({
    id: raw.id,
    kind: "lore" as CodexKind,
    title: (raw.title || "未命名设定").trim(),
    content: clip(raw.content, contentLimit),
    score,
    reason,
    forced,
  }));

  const items = [...charItems, ...loreItems, ...commitItems];

  const candidates = characters.length + commitments.length + lore.length;
  const stats: CodexStats = {
    candidates,
    selected: items.length,
    dropped: Math.max(0, candidates - items.length),
    byKind: {
      character: charItems.length,
      lore: loreItems.length,
      commitment: commitItems.length,
    },
  };

  return {
    items,
    stats,
    characters: keepChars.map((x) => x.raw as any),
    commitments: keepCommits.map((x) => x.raw as any),
  };
}

/**
 * 拼「注意力引导块」——只列清单、不重复正文内容。
 *
 * 设计取舍：角色/设定的详细内容已由 buildGenerationContext 与 recallBlock 注入，
 * 这里若再重复一遍内容就是白白翻倍 token。所以本块只做「本章请重点关注这些」的清单式
 * 引导，既省 token，又让 AI 明确本章重点；同时把「略过了多少项」透明告知用户。
 */
export function formatCodexAttentionBlock(selection: CodexSelection): string {
  const { items, stats } = selection;
  if (items.length === 0) return "";

  const lines: string[] = [];
  const byKind = (k: CodexKind) => items.filter((i) => i.kind === k);

  const chars = byKind("character");
  if (chars.length > 0) {
    lines.push(
      `- 出场角色：${chars.map((c) => `${c.title}（${c.reason}）`).join("、")}`,
    );
  }
  const lores = byKind("lore");
  if (lores.length > 0) {
    lines.push(`- 相关设定：${lores.map((l) => `${l.title}（${l.reason}）`).join("、")}`);
  }
  const commits = byKind("commitment");
  if (commits.length > 0) {
    lines.push(`- 待回收伏笔：${commits.map((c) => c.title).join("、")}`);
  }

  const head = "【本次重点设定——本章请优先遵循，勿与之冲突】";
  const tail =
    stats.dropped > 0
      ? `\n（另有 ${stats.dropped} 项设定与本章无关，已自动略过以节省上下文；如需强制注入，请在生成前勾选该角色/设定。）`
      : "";

  return `\n\n${head}\n${lines.join("\n")}${tail}`;
}
