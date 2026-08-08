/**
 * GET /api/generate/pre-write-cards?projectId=X&nodeId=Y
 *
 * 生成前角色确认——返回智能调度器选出的角色卡及出场理由。
 * 前端展示后用户确认→带着确认的卡列表调用 write API。
 */
export const maxDuration = 30;
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { NextResponse } from "next/server";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";
import { WORLD_MODULES } from "@/components/workspace/worldPanelData";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const nodeId = searchParams.get("nodeId"); // 可选——大纲生成时无节点

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    let currentNode: any = null;
    let allNodes: any[] = [];
    let chapterOrder = 0;
    let chapterTitle = "";
    let outlineText = "";
    let totalChapters = 1;

    if (nodeId) {
      currentNode = await prisma.storyNode.findUnique({ where: { id: nodeId, deletedAt: null } });
      if (!currentNode) return NextResponse.json({ error: "节点不存在" }, { status: 404 });
      allNodes = await prisma.storyNode.findMany({
        where: { projectId, content: { not: null }, deletedAt: null },
        orderBy: { order: "asc" },
      });
      chapterOrder = currentNode.order;
      chapterTitle = currentNode.title || "";
      outlineText = (currentNode.outline || "") + " " + chapterTitle;
      totalChapters = allNodes.length + 1;
    } else {
      // 无节点模式——用于大纲生成，用作品总纲代替章节大纲
      allNodes = await prisma.storyNode.findMany({
        where: { projectId, content: { not: null }, deletedAt: null },
        orderBy: { order: "asc" },
      });
      totalChapters = allNodes.length + 1;
      chapterOrder = totalChapters; // 视为"故事全局"
      chapterTitle = project.name;
      outlineText = (project.synopsis || "") + " " + (project.genre || []).join(" ") + " " + (project.toneKeywords || []).join(" ");
      // 大纲生成没有单个节点——用项目概要覆盖
    }

    const characters = await getApprovedCharacters(prisma, projectId);

    // ── 复用智能调度器逻辑 ──

    // 故事阶段
    let storyPhase = "";
    if (chapterOrder <= 3) storyPhase = "初期·角色引入";
    else if (chapterOrder <= totalChapters * 0.3) storyPhase = "前期·冲突浮现";
    else if (chapterOrder <= totalChapters * 0.6) storyPhase = "中期·外部势力介入";
    else if (chapterOrder <= totalChapters * 0.85) storyPhase = "后期·高潮临近";
    else storyPhase = "末期·终局对决";

    // 场景类型
    const sceneHints: string[] = [];
    if (chapterTitle.includes("比赛") || chapterTitle.includes("战") || chapterTitle.includes("对决")) sceneHints.push("比赛");
    if (chapterTitle.includes("训练") || chapterTitle.includes("练习")) sceneHints.push("训练");
    if (chapterTitle.includes("日常") || chapterTitle.includes("休息")) sceneHints.push("日常");
    if (chapterTitle.includes("选拔") || chapterTitle.includes("测试")) sceneHints.push("选拔");

    // 已出场角色
    const appearedNames = new Set<string>();
    for (const n of allNodes) {
      const content = (n.content || "").toLowerCase();
      for (const c of characters) {
        if (content.includes(c.name.toLowerCase())) appearedNames.add(c.name);
      }
    }

    // 大纲点名角色
    const outlineChars = new Set<string>();
    for (const c of characters) {
      if (outlineText.includes(c.name)) outlineChars.add(c.name);
    }

    // 7维打分
    interface CardResult {
      id: string;
      name: string;
      role: string;
      score: number;
      reasons: string[];
      affiliation: string;
      motivation: string;
      appeared: boolean;
      background: string;
      isNew: boolean;
    }

    const results: CardResult[] = [];
    for (const c of characters) {
      const cAny = c as any;
      if (cAny.currentStatus === "dead") continue;
      let score = 0;
      const reasons: string[] = [];

      if (outlineChars.has(c.name)) { score += 100; reasons.push("大纲点名"); }
      if (c.role === "protagonist") { score += 50; reasons.push("主角"); }
      if (c.role === "antagonist") { score += 50; reasons.push("反派"); }

      if (appearedNames.has(c.name)) {
        score += 15;
        const tl = (Array.isArray(cAny.timeline) ? cAny.timeline : []) as any[];
        const recentEvents = tl.filter((e: any) => {
          const echap = String(e.chapter || "");
          return echap.includes(String(chapterOrder)) || echap.includes(String(chapterOrder + 1));
        });
        if (recentEvents.length > 0) { score += 15; reasons.push("近期活跃"); }
      }

      if (outlineChars.size > 0) {
        const rels = (Array.isArray(cAny.relationships) ? cAny.relationships : []) as any[];
        const connectedToOutline = rels.some((r: any) => outlineChars.has(r.targetName || ""));
        if (connectedToOutline) { score += 25; reasons.push("关系网关联"); }
      }

      if ((c.role === "mentor" || c.role === "catalyst") && chapterOrder <= totalChapters * 0.6) {
        score += 20; reasons.push("剧情推进者");
      }

      const bg = (cAny.background || "").toLowerCase();
      if (sceneHints.some(h => h === "比赛") && (bg.includes("球员") || bg.includes("队"))) { score += 10; reasons.push("比赛场景"); }
      if (sceneHints.some(h => h === "训练") && (bg.includes("蓝锁") || bg.includes("教练"))) { score += 10; reasons.push("训练场景"); }

      if (cAny.arcProgress && !cAny.arcProgress.includes("完成")) { score += 5; reasons.push("弧光未完成"); }

      // 提取立场
      const affTags: string[] = [];
      if (bg.includes("蓝锁")) affTags.push("蓝锁");
      if (bg.includes("u-20") || bg.includes("u20") || bg.includes("日本代表")) affTags.push("U20");
      if (bg.includes("世界") || bg.includes("国际") || bg.includes("海外")) affTags.push("国际");
      if (bg.includes("教练") || bg.includes("指导")) affTags.push("教练组");
      if (c.role === "antagonist") affTags.push("对手");

      // 提取动机
      const motTags: string[] = [];
      if (bg.includes("竞争") || bg.includes("打败")) motTags.push("竞争");
      if (bg.includes("观察") || bg.includes("考察")) motTags.push("观察");
      if (bg.includes("邀请") || bg.includes("雇佣")) motTags.push("受邀");
      if (bg.includes("复仇") || bg.includes("恩怨")) motTags.push("恩怨");
      if (Array.isArray(cAny.relationships) && cAny.relationships.length > 0) motTags.push("人际");

      results.push({
        id: c.id,
        name: c.name,
        role: c.role,
        score,
        reasons,
        affiliation: affTags.length > 0 ? affTags.join("/") : "未知",
        motivation: motTags.length > 0 ? motTags.join("/") : "剧情推进",
        appeared: appearedNames.has(c.name),
        background: (cAny.background || "").slice(0, 60),
        isNew: !appearedNames.has(c.name),
      });
    }

    // 排序
    results.sort((a, b) => b.score - a.score);

    // 主角必在，无上限——用户自己勾选
    const scheduled = results.filter(r => {
      if (r.role === "protagonist") return true;
      return r.score >= 30; // 门槛分
    });

    // 大纲中可能提到但花名册里没有的角色类型
    const outlineLower = outlineText.toLowerCase();
    const roleKeywords = [
      { kw: "门将", label: "门将" },
      { kw: "守门员", label: "门将" },
      { kw: "后卫", label: "后卫" },
      { kw: "前锋", label: "前锋" },
      { kw: "中场", label: "中场" },
      { kw: "教练", label: "教练" },
      { kw: "裁判", label: "裁判" },
      { kw: "解说", label: "解说员" },
    ];
    const missingRoles: string[] = [];
    for (const { kw, label } of roleKeywords) {
      if (outlineLower.includes(kw)) {
        const hasMatch = characters.some(c =>
          (c.role === label) ||
          ((c as any).background || "").toLowerCase().includes(kw) ||
          ((c as any).abilities || []).some((a: string) => a.toLowerCase().includes(kw))
        );
        if (!hasMatch && !missingRoles.includes(label)) {
          missingRoles.push(label);
        }
      }
    }

    // ── 世界卡完整性检查 ──
    // R2-015：15 类收敛为单一来源——直接由 ALL_WORLD_CATEGORIES 派生，排除
    // character_relationship（走角色卡）与 custom（非具体世界观分类）。
    const LORE_LABELS: Record<string, string> = Object.fromEntries(
      WORLD_MODULES.map((m) => [m.key, m.label]),
    );
    const LORE_CHECK_CATEGORIES = ALL_WORLD_CATEGORIES.filter(
      (c) => c !== "character_relationship" && c !== "custom",
    );

    const lorebookEntries = await getApprovedLore(prisma, projectId);
    const categories: Record<string, boolean> = {};
    const missingLoreCategories: string[] = [];
    for (const c of LORE_CHECK_CATEGORIES) {
      const has = lorebookEntries.some((l) => l.category === c);
      categories[c] = has;
      if (!has) missingLoreCategories.push(c);
    }
    const loreWarning = lorebookEntries.length === 0
      ? "⚠️ 世界卡完全为空——强烈建议至少创建1条世界设定，防止AI凭空编造"
      : missingLoreCategories.length > 0
        ? `💡 建议补充世界卡类型：${missingLoreCategories.map((c) => LORE_LABELS[c] || c).join("、")}`
        : "";

    return NextResponse.json({
      scheduledCards: scheduled.map(c => ({
        id: c.id,
        name: c.name,
        role: c.role,
        score: c.score,
        reasons: c.reasons,
        affiliation: c.affiliation,
        motivation: c.motivation,
        appeared: c.appeared,
        background: c.background,
        isNew: c.isNew,
      })),
      storyPhase,
      sceneContext: sceneHints.join("、") || "未确定",
      totalCharacters: characters.length,
      scheduledCount: scheduled.length,
      missingRoleSuggestions: missingRoles,
      chapterTitle,
      chapterOutline: nodeId ? (currentNode?.outline || "") : (project.synopsis || "").slice(0, 200),
      // ── 世界卡完整性 ──
      lorebookStats: {
        totalEntries: lorebookEntries.length,
        categories,
        missingCategories: missingLoreCategories,
        warning: loreWarning,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}
