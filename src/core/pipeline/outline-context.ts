/**
 * 章纲生成共享模块 —— chapter-outline 和 draw 路由共用
 *
 * 提取了两路由中重复的：数据加载 / 前文上下文 / 角色列表 / 作者指令 / 摘要格式化
 */

import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { getActiveRules, injectRules } from "@/core/rules";
import type { Project } from "@/core/types";

// ─── 角色标签映射 ──────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  protagonist: "★主角",
  antagonist: "◆反派",
  supporting: "配角",
  love_interest: "恋爱对象",
  mentor: "导师",
  ally: "盟友",
  neutral: "中立",
  villain: "反派",
};

// ─── 数据加载 ──────────────────────────────────────────────────

export interface OutlineContextData {
  project: Project;
  node: any;
  allNodes: any[];
  characters: any[];
  summaries: any[];
  storylines: any[];
}

export async function loadOutlineData(
  projectId: string,
  nodeId: string,
  summaryTake = 3,
): Promise<OutlineContextData> {
  const [project, node, allNodes, characters, summaries, storylines] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId } }),
    prisma.storyNode.findUnique({ where: { id: nodeId } }),
    prisma.storyNode.findMany({
      where: { projectId, parentId: null, type: { not: "volume" }, deletedAt: null },
      orderBy: { order: "asc" },
    }),
    getApprovedCharacters(prisma, projectId, { take: 50 }),
    prisma.chapterSummary.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: summaryTake,
    }),
    prisma.storyline.findMany({
      where: { projectId, OR: [{ type: "main" }, { status: "active" }] },
      orderBy: { order: "asc" },
    }),
  ]);
  // N10：单独取各线的事件(CLUE/MILESTONE)再挂回，供 formatStorylines 注入写作上下文。
  // 不直接在 storyline.findMany 用 include —— Prisma 生成 client 在 include 类型推断上
  // 会把 storyline 误判为 StoryNode，导致 events 报错；批量查后合并更稳。
  const storylineIds = (storylines as any[]).map((s) => s.id);
  const storylineEvents = storylineIds.length
    ? await prisma.storylineEvent.findMany({
        where: { storylineId: { in: storylineIds } },
        orderBy: { position: "asc" },
      })
    : [];
  const eventsByLine = new Map<string, any[]>();
  for (const e of storylineEvents) {
    const arr = eventsByLine.get(e.storylineId) ?? [];
    arr.push(e);
    eventsByLine.set(e.storylineId, arr);
  }
  const storylinesWithEvents = (storylines as any[]).map((s) => ({
    ...s,
    events: eventsByLine.get(s.id) ?? [],
  }));
  return {
    project: project as unknown as Project, node, allNodes: allNodes as any[], characters: characters as any[],
    summaries: summaries as any[], storylines: storylinesWithEvents as any[],
  };
}

// ─── 剧情线上下文（v0.46.57：章纲生成剧情感知——不再盲写） ────────

const SEVEN_ELEMENTS: Array<[key: string, label: string]> = [
  ["desire", "欲望"], ["obstacle", "阻碍"], ["action", "行动"],
  ["result", "结果"], ["twist", "意外"], ["turn", "转折"], ["ending", "结局"],
];

// 主线三要素（#200）：主线线索密、事件多，七要素写不下，改用起因 / 经过 / 结果提纲挈领。
// 续写 / 抽卡注入时按线的 type 选择对应要素集合，避免主线要素被静默丢失（此前只注入七要素）。
const THREE_ELEMENTS: Array<[key: string, label: string]> = [
  ["origin", "起因"], ["process", "经过"], ["result", "结果"],
];

/**
 * 过滤出应注入写作上下文的「活跃」剧情线（N1 修复）。
 *
 * 旧实现用不存在的 `s.completed` 布尔字段做过滤（`!s?.completed` 永远为 true，系死过滤）。
 * 这里改用真实存在的 `status` 字段：排除 `completed`（已完结）与 `abandoned`（已废弃），
 * 保留 `active`（活跃）及任何其他非终态线。与全仓 status 语义保持一致。
 */
export function filterActiveStorylines(storylines: any[]): any[] {
  if (!Array.isArray(storylines)) return [];
  return storylines.filter(
    (s: any) => s?.status !== "completed" && s?.status !== "abandoned",
  );
}

/**
 * N4 修复：返回「已完结旧主线」的 id 列表，供 newMain 流把仍指向它们的旧支线重挂到新主线。
 * 仅当主线 type==="main" 且 status==="completed" 时计入。
 */
export function getCompletedMainIds(storylines: any[]): string[] {
  if (!Array.isArray(storylines)) return [];
  return storylines
    .filter((s: any) => s?.type === "main" && s?.status === "completed")
    .map((s: any) => s.id);
}

/**
 * N8 回归加固：判断 `mainId` 是否为可安全接收「旧支线重挂」的【活跃主线】。
 *
 * 用于 newMain 等场景（N4 重挂）：把仍指向「已完结旧主线」的支线重挂到 mainId。
 * 仅当 mainId 指向一条 status === "active" 的主线时才允许重挂——确保重挂后
 * `formatStorylines` 的 `mainTitleById` 能解析该主线（loadOutlineData 已按 status 过滤
 * 排除非活跃主线），从而保留 R2-006「（隶属主线 …）」前缀；若重挂目标为
 * completed 或 abandoned 等任何非 active 终态主线，该前缀会因目标主线不在注入集合中而
 * 静默丢失（即 N8 回归，R4-NEW-1 已确认 abandoned 与 completed 同构漏网）。
 *
 * 判定规则：
 * - mainId 为 null → 不允许（无目标主线）；
 * - mainId 不在 existingStorylines 快照中（即本轮「新建」的主线，DB 默认 status="active"）→ 视为活跃，允许；
 * - mainId 命中 existing 中的一条主线 → 必须 type==="main" 且 status === "active" 才允许，否则拒绝
 *   （排除 completed 与 abandoned 等所有非 active 终态，与 DELETE 侧 pickReassignMainId 口径一致）。
 */
export function isRehangTargetActiveMain(
  mainId: string | null,
  existingStorylines: any[],
): boolean {
  if (!mainId) return false;
  if (!Array.isArray(existingStorylines)) return true; // 新创建主线，默认 active
  const main = existingStorylines.find((s: any) => s.id === mainId);
  if (!main) return true; // 新建主线（不在 existing 快照中），默认 active
  return main.type === "main" && main.status === "active";
}

/**
 * N8 回归修复：删除主线时，选择接管其子线的兄弟主线。
 *
 * 仅返回【活跃】兄弟主线；若同项目已无其他 active 主线（只剩 completed/abandoned 兄弟），
 * 返回 null。绝不把被删主线的子线重挂到 completed 主线——否则 `formatStorylines` 因
 * loadOutlineData 排除 completed 主线，会让这些子线在写作 prompt 中静默丢失「隶属主线」前缀
 * （N8 回归，与 R2-006 冲突）。返回 null 时由 N2 的 `resolveParent` 回退到活跃主线（若后续出现），
 * 不再制造指向已完成主线的虚假隶属。
 *
 * 该函数不移除 N3 的级联处理：删除主线前仍会对子线执行 updateMany（置 null 或重挂活跃主线），
 * 仅收紧重挂目标为「活跃主线」，避免把子线误嫁接到已完结主线。
 */
export function pickReassignMainId(siblings: any[]): string | null {
  if (!Array.isArray(siblings)) return null;
  const activeMains = siblings.filter((m: any) => m?.status === "active");
  // NEW-5 修复：仅在「恰有一条活跃兄弟主线」时才自动重挂，避免多独立主线并存时把被删
  // 主线的子线盲目嫁接第一条 active 主线造成跨线误归属。0 条或 ≥2 条活跃兄弟 → 返回 null，
  // 交由 delete 路由把子线 parentId 置空、由 resolveParent 回退，不再制造虚假隶属。
  if (activeMains.length === 1) return activeMains[0]?.id ?? null;
  return null;
}

export interface FormatStorylinesOptions {
  /** 指定本条线为「核心推进线」，会在 prefix 中强调并附加针对性续写策略 */
  targetStorylineId?: string;
  /**  true = 强制按「已完结→扩散」模式提示（用于用户取消完结后继续续写） */
  diffuseCompleted?: boolean;
}

/** 加载项目剧情线（默认排除 abandoned，可包含已完结线），并挂载 events */
export async function loadStorylinesWithEvents(
  projectId: string,
  opts: { includeCompleted?: boolean } = {},
): Promise<any[]> {
  const where: any = { projectId, status: { not: "abandoned" } };
  if (!opts.includeCompleted) {
    // 默认只加载 active + completed（用于续写扩散），废弃线永远排除
    where.status = { in: ["active", "completed"] };
  }
  const storylines = await prisma.storyline.findMany({
    where,
    orderBy: { type: "asc" },
  });
  const ids = storylines.map((s) => s.id);
  const events = ids.length
    ? await prisma.storylineEvent.findMany({
        where: { storylineId: { in: ids } },
        orderBy: { position: "asc" },
      })
    : [];
  const byLine = new Map<string, any[]>();
  for (const e of events) {
    const arr = byLine.get(e.storylineId) ?? [];
    arr.push(e);
    byLine.set(e.storylineId, arr);
  }
  return storylines.map((s) => ({ ...s, events: byLine.get(s.id) ?? [] }));
}

/** 活跃剧情线摘要：每条线的 title + description + 非空七要素；支线标注隶属主线（R2-006） */
export function formatStorylines(storylines: any[], options: FormatStorylinesOptions = {}): string {
  const { targetStorylineId, diffuseCompleted } = options;
  if (!storylines || storylines.length === 0) return "";
  // 主线 id -> title 映射，用于支线隶属解析（仅本批注入的 active 线，约束保持）
  const mainTitleById = new Map<string, string>();
  for (const s of storylines) {
    if (s.type === "main" && s.id) mainTitleById.set(s.id, s.title);
  }
  return storylines
    .map((s: any) => {
      const parts: string[] = [];
      const isTarget = !!(targetStorylineId && s.id === targetStorylineId);
      const isCompleted = s.status === "completed";
      // 支线标注从属主线：让 AI 感知「支线 X 隶属于主线 Y」（基于 parentId 解析）
      let prefix = `【剧情线：${s.title}】${s.type === "main" ? "（主线）" : "（支线）"}`;
      if (s.type !== "main" && s.parentId && mainTitleById.has(s.parentId)) {
        prefix += `（隶属主线 ${mainTitleById.get(s.parentId)}）`;
      }
      if (isTarget) prefix += "【核心推进线】";
      // #200：主线续写优先推进时间轴上已规划但尚未充分展开的事件，不得另起孤立剧情
      if (s.type === "main") {
        if (isTarget && (isCompleted || diffuseCompleted)) {
          prefix +=
            "（续写提示：该主线已标记完结，现有结局仅作为阶段性终点。请基于结局继续向外扩散——可连接到其他故事线、打开更大可能性、或揭示结局背后的新危机；禁止简单重复已有结局）";
        } else if (isTarget) {
          prefix +=
            "（续写提示：优先推进时间轴上已规划但尚未充分展开的事件节点，保持因果连续；确需发展新内容时再扩展，严禁另起孤立剧情）";
        } else {
          prefix += "（参考线：保持与核心推进线的因果关联，不要喧宾夺主）";
        }
      } else if (isTarget && (isCompleted || diffuseCompleted)) {
        prefix +=
          "（续写提示：该支线已完结。请基于现有结局向外扩散，连接到主线或其他支线，或揭示结局引出的新伏笔；禁止重复已有结局）";
      } else if (isTarget) {
        prefix += "（续写提示：按当前进展与线索自然推进，最终与主线收束呼应）";
      }
      parts.push(prefix);
      if (s.description) parts.push(`说明：${s.description}`);
      // N10 修复（P0）：七要素实际嵌套在 s.sevenElements（Json 字段），原代码读顶层 s[k]
      // 永远为 undefined，导致抽卡 + 主写作两条路径 100% 静默丢失七要素与「顺线推进」语义。
      // #200：主线改用三要素（origin/process/result），按 type 选择对应要素集合注入，
      // 避免主线要素被静默丢弃（此前只注入七要素），续写 / 抽卡才能感知主线总纲。
      const se = (s.sevenElements && typeof s.sevenElements === "object") ? s.sevenElements : {};
      const elemDefs = s.type === "main" ? THREE_ELEMENTS : SEVEN_ELEMENTS;
      const elems = elemDefs
        .map(([k, label]) => (se[k] ? `${label}:${se[k]}` : ""))
        .filter(Boolean);
      if (elems.length) parts.push((s.type === "main" ? "三要素：" : "七要素：") + elems.join(" | "));
      // N10 修复（P0）+ #200：把线索集(CLUE)与全部已规划 / 已发生事件(EVENT+MILESTONE)注入写作上下文，
      // 否则作者辛苦维护的伏笔 / 进展 AI 一个字也看不到；主线续写据此才能「非孤立」地推进。
      const evs = Array.isArray(s.events) ? s.events : [];
      const clues = evs
        .filter((e: any) => e.kind === "CLUE")
        .slice(0, 8)
        .map((e: any) => `线索[${e.tag || "未分类"}] ${e.title || e.content?.slice(0, 30) || ""}`);
      if (clues.length) parts.push("线索集：" + clues.join("；"));
      const timeline = evs
        .filter((e: any) => e.kind !== "CLUE")
        .slice()
        .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
        .slice(-15)
        .map((e: any) => `${e.kind === "MILESTONE" ? "里程碑·" : "事件·"}${e.title || e.content?.slice(0, 40) || e.tag || "未命名"}`);
      if (timeline.length) parts.push("时间轴（已规划/已发生）：" + timeline.join(" → "));
      return parts.join("\n");
    })
    .join("\n\n");
}

/** 上一章结尾钩子：优先取 outline 里的【悬念/钩子】小节，否则取结尾 300 字 */
export function extractLastChapterHook(allNodes: any[], nodeId: string): string {
  const chapters = allNodes.filter((n: any) => n.type === "chapter" || n.type === "section");
  const nodeIndex = chapters.findIndex((n: any) => n.id === nodeId);
  if (nodeIndex <= 0) return "";
  const prev = chapters[nodeIndex - 1];
  if (!prev) return "";
  // 找 outline 里的钩子小节
  const hookMatch = (prev.outline || "").match(/【悬念\/钩子】\s*([^\n]*)/);
  if (hookMatch && hookMatch[1]?.trim()) return hookMatch[1].trim();
  const tail = (prev.content || "").slice(-300);
  return tail ? `（上一章结尾）${tail}` : "";
}

// ─── 前文/后文上下文 ────────────────────────────────────────────

export function extractPrevContext(
  allNodes: any[],
  nodeId: string,
  prevCount = 5,
): string {
  const chapters = allNodes.filter((n: any) => n.type === "chapter" || n.type === "section");
  const nodeIndex = chapters.findIndex((n: any) => n.id === nodeId);
  if (nodeIndex <= 0) return "";
  const prevNodes = chapters.slice(Math.max(0, nodeIndex - prevCount), nodeIndex);
  return prevNodes
    .map((n: any) => {
      const outline = n.outline ? n.outline.slice(0, 500) : "";
      const contentEnd = n.content ? n.content.slice(-800) : "";
      return `第${n.order}章 ${n.title}\n大纲：${outline || "无"}\n结尾：${contentEnd || "无"}`;
    })
    .join("\n\n");
}

export function extractNextContext(
  allNodes: any[],
  nodeId: string,
  nextCount = 3,
): string {
  const chapters = allNodes.filter((n: any) => n.type === "chapter" || n.type === "section");
  const nodeIndex = chapters.findIndex((n: any) => n.id === nodeId);
  if (nodeIndex < 0) return "";
  const nextNodes = chapters.slice(nodeIndex + 1, nodeIndex + 1 + nextCount);
  return nextNodes
    .map((n: any) => {
      const outline = n.outline ? n.outline.slice(0, 300) : "";
      return `后续第${n.order}章 ${n.title}：${outline || "暂未规划"}`;
    })
    .join("\n");
}

// ─── 角色列表 ──────────────────────────────────────────────────

export function buildCharacterList(
  characters: any[],
  includePersonalityTraits = false,
): string {
  return characters
    .map((c: any) => {
      const roleStr = ROLE_LABELS[c.role] || c.role;
      let line = `- ${c.name} [${roleStr}] | ${c.currentStatus || "存活"}`;
      if (includePersonalityTraits && c.personality) {
        const p = typeof c.personality === "object" ? c.personality : {};
        const traits = [p.dominant, p.drive, p.contradiction].filter(Boolean).join("·");
        if (traits) line += ` | 性格：${traits}`;
      }
      const bg = c.background?.slice(0, 80) || "";
      if (bg) line += ` | ${bg}`;
      return line;
    })
    .join("\n");
}

// ─── 作者指令 ──────────────────────────────────────────────────

export async function prepareOutlineDirective(
  projectId: string,
  authorNote?: string,
): Promise<string> {
  const outlineRules = await getActiveRules(projectId, "outline_only");
  const effectiveNote = authorNote?.trim() || "按照黄金三章标准，写出有抓眼球开篇的章纲。";
  const withRules = injectRules(effectiveNote, outlineRules);
  return withRules;
}

// ─── 摘要格式化 ────────────────────────────────────────────────

export function formatSummaries(summaries: any[]): string {
  return summaries
    .map((s: any) => `[${s.chapterTitle}] ${s.summary?.slice(0, 200) || ""}`)
    .filter((s: string) => s.length > 10)
    .join("\n");
}
