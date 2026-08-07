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
      where: { projectId, status: { in: ["active", "main"] } },
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
