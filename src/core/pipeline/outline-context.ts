/**
 * 章纲生成共享模块 —— chapter-outline 和 draw 路由共用
 *
 * 提取了两路由中重复的：数据加载 / 前文上下文 / 角色列表 / 作者指令 / 摘要格式化
 */

import { prisma } from "@/lib/prisma";
import { getActiveRules, injectRules } from "@/core/rules";

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
  project: any;
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
      where: { projectId, parentId: null, type: { not: "volume" } },
      orderBy: { order: "asc" },
    }),
    prisma.characterCard.findMany({ where: { projectId }, take: 50 }),
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
  return {
    project, node, allNodes: allNodes as any[], characters: characters as any[],
    summaries: summaries as any[], storylines: storylines as any[],
  };
}

// ─── 剧情线上下文（v0.46.57：章纲生成剧情感知——不再盲写） ────────

const SEVEN_ELEMENTS: Array<[key: string, label: string]> = [
  ["desire", "欲望"], ["obstacle", "阻碍"], ["action", "行动"],
  ["result", "结果"], ["twist", "意外"], ["turn", "转折"], ["ending", "结局"],
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

/** 活跃剧情线摘要：每条线的 title + description + 非空七要素；支线标注隶属主线（R2-006） */
export function formatStorylines(storylines: any[]): string {
  if (!storylines || storylines.length === 0) return "";
  // 主线 id -> title 映射，用于支线隶属解析（仅本批注入的 active 线，约束保持）
  const mainTitleById = new Map<string, string>();
  for (const s of storylines) {
    if (s.type === "main" && s.id) mainTitleById.set(s.id, s.title);
  }
  return storylines
    .map((s: any) => {
      const parts: string[] = [];
      // 支线标注从属主线：让 AI 感知「支线 X 隶属于主线 Y」（基于 parentId 解析）
      let prefix = `【剧情线：${s.title}】${s.type === "main" ? "（主线）" : "（支线）"}`;
      if (s.type !== "main" && s.parentId && mainTitleById.has(s.parentId)) {
        prefix += `（隶属主线 ${mainTitleById.get(s.parentId)}）`;
      }
      parts.push(prefix);
      if (s.description) parts.push(`说明：${s.description}`);
      const elems = SEVEN_ELEMENTS
        .map(([k, label]) => (s[k] ? `${label}:${s[k]}` : ""))
        .filter(Boolean);
      if (elems.length) parts.push(elems.join(" | "));
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
