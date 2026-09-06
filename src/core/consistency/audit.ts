/**
 * 长篇一致性巡检（防崩坏雷达）
 *
 * 来源：2026-09-04 董事会路线图 M3（张雪峰② / PG②）。
 *
 * ── 它解决什么真实问题 ──
 * 长篇作者头号噩梦不是写不出来，是**写到后面设定崩了**：
 * 前文主角是黑发、后文变成银发；前文角色已经牺牲、后文又站起来说话；
 * 第 3 章埋的伏笔到第 40 章还没影。这类硬伤读者一眼看出，编辑直接拒签，
 * 而人脑在几十万字里根本盯不住——这活儿该机器干。
 *
 * ── 抓哪四类 ──
 *   1. 性别代词前后不一致（同一角色前几章用「他」、后面用「她」）
 *   2. 外貌属性冲突（同一角色出现两种发色 / 眸色）
 *   3. 已故角色仍出场活动（角色卡标记死亡，正文里却又说话走路）
 *   4. 伏笔久未回收（埋了十几章还没动静）
 *
 * ── 三条铁律 ──
 *   1. 纯本地：正则 + 统计，不联网、不调 LLM、不传稿。
 *   2. 给证据：每条问题带原句与章节，作者一点就能定位。
 *   3. 宁可少报：全部是「提示」而非「判决」。回忆闪回、他人转述都会造成看似矛盾，
 *      所以已故角色检测会主动排除回忆语境，避免拿正常写法当 bug 报。
 */

export type IssueKind = "pronoun" | "appearance" | "dead-active" | "stale-foreshadow";

export interface ConsistencyIssue {
  kind: IssueKind;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  /** 涉及章节序号（0-based，与 StoryNode.order 一致） */
  chapterOrder?: number;
  chapterTitle?: string;
  /** 命中的原句（证据，已截断） */
  excerpt?: string;
  suggestion: string;
}

export interface ConsistencyReport {
  issues: ConsistencyIssue[];
  stats: {
    chapters: number;
    characters: number;
    chars: number;
    byKind: Record<IssueKind, number>;
  };
  disclaimer: string;
}

export interface AuditNode {
  id: string;
  order: number;
  title?: string | null;
  content?: string | null;
  outline?: string | null;
}

export interface AuditCharacter {
  id: string;
  name?: string | null;
  /** JSON 字符串数组（Prisma String 字段） */
  aliases?: unknown;
  currentStatus?: string | null;
}

export interface AuditCommitment {
  id: string;
  description?: string | null;
  status?: string | null;
  /** 埋设章节（StoryNode.id 或章节 id） */
  createdChapterId?: string | null;
  sourceNodeId?: string | null;
}

export interface AuditOptions {
  /** 伏笔埋设超过多少章仍未回收才提示，默认 10 */
  staleChapterThreshold?: number;
}

const DISCLAIMER =
  "本巡检基于本地文本规则，只能标出「看起来前后对不上」的地方供你核对，不能替代你自己判断：回忆闪回、他人转述、刻意误导都会造成看似矛盾的正常写法。命中不等于一定写错了，请逐条看证据再改。";

// ─── 词表 ───

/** 已完结的伏笔状态 */
const DONE_STATUS_RE = /fulfilled|closed|resolved|completed|done|abandoned|cancel|完成|已收|已兑现|已回收|废弃|作废/i;

/** 角色已死亡的标记（来自角色卡 currentStatus） */
const DEAD_RE = /死|亡|牺牲|殒|逝|已故|殉|殁/i;

/** 回忆 / 闪回语境标记——出现这些词时不判「已故角色仍活动」，避免误伤正常写法 */
const FLASHBACK_RE = /想起|回忆|回想起|梦见|梦回|当年|曾经|从前|过去|记忆|往昔|那年|遗容|遗物|坟|墓/i;

/** 活动动作（紧跟角色名出现，说明该角色「在场上行动」） */
const ACTION_RE = /说|道|笑|走|站|看|抬|转身|点头|摇头|挥|握|坐下|跑|冲|望|答|问|喊|叫|伸手|睁开/;

const HAIR_WORDS = ["黑发", "白发", "银发", "金发", "红发", "棕发", "紫发", "蓝发", "绿发"];
const EYE_WORDS = ["黑眸", "蓝眸", "金眸", "碧眸", "绿眸", "紫眸", "红眸", "灰眸", "黑眼", "蓝眼", "金眼"];

// ─── 小工具 ───

function asStringArray(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string" && !!x.trim());
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return [];
    if (s.startsWith("[")) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) return parsed.filter((x): x is string => typeof x === "string" && !!x.trim());
      } catch {
        /* 解析失败走分隔兜底 */
      }
    }
    return s.split(/[,，、;；]/).map((x) => x.trim()).filter(Boolean);
  }
  return [];
}

/** 按句末标点切句（保留句子，便于定位） */
function splitToSentences(text: string): string[] {
  return (text || "")
    .split(/(?<=[。！？!?…；;\n])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
}

function clip(s: string, limit = 60): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > limit ? `${t.slice(0, limit)}…` : t;
}

/** 句中是否出现该角色的任一称呼（名字或别名） */
function findNameIn(sentence: string, names: string[]): string | null {
  for (const n of names) {
    if (n && sentence.includes(n)) return n;
  }
  return null;
}

// ─── 四类检测 ───

interface SentenceHit {
  text: string;
  node: AuditNode;
}

/** 1 + 2：性别代词与外貌属性冲突（逐句扫描，按角色累计） */
function detectCharacterConflicts(
  nodes: AuditNode[],
  characters: AuditCharacter[],
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];

  // 先把所有句子带上章节信息摊平，避免对每个角色重复分句（长篇性能）
  const sentences: SentenceHit[] = [];
  for (const node of nodes) {
    const body = node.content || "";
    if (!body.trim()) continue;
    for (const s of splitToSentences(body)) {
      sentences.push({ text: s, node });
    }
  }
  if (sentences.length === 0) return issues;

  for (const ch of characters) {
    const name = (ch.name || "").trim();
    if (!name) continue;
    const names = [name, ...asStringArray(ch.aliases)].filter(Boolean);

    let he = 0;
    let she = 0;
    let heSample = "";
    let sheSample = "";
    const hairSet = new Set<string>();
    const hairSamples = new Map<string, string>();
    const eyeSet = new Set<string>();
    const eyeSamples = new Map<string, string>();

    for (const { text: s, node } of sentences) {
      if (!findNameIn(s, names)) continue;

      // 代词：同一句里同时出现角色名与「他/她」，视为一次指代
      const hes = (s.match(/他/g) ?? []).length;
      const shes = (s.match(/她/g) ?? []).length;
      if (hes > 0 && shes === 0) {
        he += 1;
        if (!heSample) heSample = `第${node.order + 1}章：${clip(s)}`;
      } else if (shes > 0 && hes === 0) {
        she += 1;
        if (!sheSample) sheSample = `第${node.order + 1}章：${clip(s)}`;
      }

      // 外貌
      for (const w of HAIR_WORDS) {
        if (s.includes(w)) {
          hairSet.add(w);
          if (!hairSamples.has(w)) hairSamples.set(w, `第${node.order + 1}章：${clip(s)}`);
        }
      }
      for (const w of EYE_WORDS) {
        if (s.includes(w)) {
          eyeSet.add(w);
          if (!eyeSamples.has(w)) eyeSamples.set(w, `第${node.order + 1}章：${clip(s)}`);
        }
      }
    }

    // 性别代词：两边都有样本才算冲突（单侧一次可能是笔误或旁白，不报）
    if (he > 0 && she > 0) {
      const total = he + she;
      // 占少数的一侧若比例极低（<10%），更像偶发笔误，降为 low
      const minor = Math.min(he, she);
      const severity: ConsistencyIssue["severity"] = minor / total < 0.1 ? "low" : "high";
      issues.push({
        kind: "pronoun",
        severity,
        title: `「${name}」的性别指代前后不一致`,
        detail: `全文用「他」${he} 次、「她」${she} 次，同一角色出现了两种性别指代。`,
        excerpt: `他：${heSample}\n她：${sheSample}`,
        suggestion: "统一成一个代词。若这是刻意的（如易容、性别未知），可忽略本条。",
      });
    }

    if (hairSet.size >= 2) {
      const list = Array.from(hairSet).join(" / ");
      const samples = Array.from(hairSamples.values()).slice(0, 2).join("\n");
      issues.push({
        kind: "appearance",
        severity: "medium",
        title: `「${name}」的发色前后不一致（${list}）`,
        detail: `同一角色出现了 ${hairSet.size} 种不同发色描述。`,
        excerpt: samples,
        suggestion: "确认是否为染发/易容/年龄变化等设定；若不是，统一发色描述。",
      });
    }

    if (eyeSet.size >= 2) {
      const list = Array.from(eyeSet).join(" / ");
      const samples = Array.from(eyeSamples.values()).slice(0, 2).join("\n");
      issues.push({
        kind: "appearance",
        severity: "medium",
        title: `「${name}」的眸色前后不一致（${list}）`,
        detail: `同一角色出现了 ${eyeSet.size} 种不同眸色描述。`,
        excerpt: samples,
        suggestion: "确认是否为特殊设定（如功法影响瞳色）；若不是，统一眸色描述。",
      });
    }
  }

  return issues;
}

/** 3：已故角色仍出场活动 */
function detectDeadCharactersActive(
  nodes: AuditNode[],
  characters: AuditCharacter[],
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  const deadChars = characters.filter((c) => {
    const st = (c.currentStatus || "").trim();
    return st && DEAD_RE.test(st);
  });
  if (deadChars.length === 0) return issues;

  for (const ch of deadChars) {
    const name = (ch.name || "").trim();
    if (!name) continue;
    const names = [name, ...asStringArray(ch.aliases)].filter(Boolean);

    for (const node of nodes) {
      const body = node.content || "";
      if (!body.trim()) continue;
      for (const s of splitToSentences(body)) {
        const hit = findNameIn(s, names);
        if (!hit) continue;
        // 回忆 / 墓地 / 遗物语境 → 正常写法，跳过
        if (FLASHBACK_RE.test(s)) continue;
        // 角色名之后出现动作动词 → 疑似仍在活动
        const afterName = s.slice(s.indexOf(hit) + hit.length);
        const action = afterName.slice(0, 20).match(ACTION_RE);
        if (!action) continue;

        issues.push({
          kind: "dead-active",
          severity: "high",
          title: `「${name}」已标记为死亡，第${node.order + 1}章却仍在活动`,
          detail: `角色卡状态写着「${clip(ch.currentStatus || "", 30)}」，但正文里该角色仍有动作描写。`,
          chapterOrder: node.order,
          chapterTitle: node.title || undefined,
          excerpt: clip(s),
          suggestion: "确认是否该删除这段出场，或把场景改成回忆/他人转述，或修正角色卡状态。",
        });
        break; // 每个角色每章最多报一次，避免刷屏
      }
    }
  }

  return issues;
}

/** 4：伏笔久未回收 */
function detectStaleForeshadowing(
  nodes: AuditNode[],
  commitments: AuditCommitment[],
  threshold: number,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = [];
  if (nodes.length === 0 || commitments.length === 0) return issues;

  const latestOrder = Math.max(...nodes.map((n) => n.order));
  const orderById = new Map<string, number>();
  for (const n of nodes) orderById.set(n.id, n.order);

  for (const c of commitments) {
    if (c.status && DONE_STATUS_RE.test(c.status)) continue;
    const buriedNodeId = c.createdChapterId || c.sourceNodeId;
    if (!buriedNodeId) continue;
    const buriedOrder = orderById.get(buriedNodeId);
    if (typeof buriedOrder !== "number") continue;

    const gap = latestOrder - buriedOrder;
    if (gap < threshold) continue;

    issues.push({
      kind: "stale-foreshadow",
      severity: gap >= threshold * 2 ? "medium" : "low",
      title: `伏笔埋了 ${gap} 章仍未回收`,
      detail: `第${buriedOrder + 1}章埋下的线索，到最新的第${latestOrder + 1}章还没有着落。`,
      chapterOrder: buriedOrder,
      excerpt: clip(c.description || "", 80),
      suggestion: "要么在近期章节给个呼应/回收，要么在设定里明确废弃它，别让读者一直等。",
    });
  }

  return issues;
}

// ─── 主入口 ───

/**
 * 扫描全书，输出一致性问题清单。
 *
 * 纯函数、零 IO、不联网，可直接单测。
 */
export function auditConsistency(
  input: {
    nodes?: AuditNode[];
    characters?: AuditCharacter[];
    commitments?: AuditCommitment[];
  },
  options: AuditOptions = {},
): ConsistencyReport {
  const nodes = input.nodes || [];
  const characters = input.characters || [];
  const commitments = input.commitments || [];
  const threshold = options.staleChapterThreshold ?? 10;

  const issues: ConsistencyIssue[] = [
    ...detectCharacterConflicts(nodes, characters),
    ...detectDeadCharactersActive(nodes, characters),
    ...detectStaleForeshadowing(nodes, commitments, threshold),
  ];

  // 高严重度优先，同类按章节顺序（有章节的排在前面）
  const sevRank = { high: 0, medium: 1, low: 2 } as const;
  issues.sort((a, b) => {
    const s = sevRank[a.severity] - sevRank[b.severity];
    if (s !== 0) return s;
    return (a.chapterOrder ?? 0) - (b.chapterOrder ?? 0);
  });

  const byKind: Record<IssueKind, number> = {
    pronoun: 0,
    appearance: 0,
    "dead-active": 0,
    "stale-foreshadow": 0,
  };
  for (const i of issues) byKind[i.kind] += 1;

  const chars = nodes.reduce((sum, n) => sum + (n.content || "").length, 0);

  return {
    issues,
    stats: {
      chapters: nodes.length,
      characters: characters.length,
      chars,
      byKind,
    },
    disclaimer: DISCLAIMER,
  };
}
