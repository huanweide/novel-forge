/**
 * POST /api/agent/apply-extraction
 *
 * 接收用户在提取面板中的选择，批量写入各数据表：
 *   角色卡（新建/更新timeline）· 世界书（新建/更新条目）· 伏笔表 · 章节摘要 · 下章大纲
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// ── 内联类型（与 extract-chapter 返回一致） ──
interface EC { name: string; role: string; importance: number; mentionCount: number; hasDialogue: boolean; hasAction: boolean; isNew: boolean; existingCardId: string | null; experience: string; suggestion: string; aliases?: string[]; abilities?: string[]; }
interface EL { name: string; type: string; parent: string; description: string; isNew: boolean; existingEntryId: string | null; suggestion: string; }
interface EF { name: string; type: string; description: string; leader: string; territory: string; isNew: boolean; existingEntryId: string | null; suggestion: string; }
interface EI { name: string; type: string; rarity: string; owner: string; description: string; isNew: boolean; existingEntryId: string | null; suggestion: string; }
interface EFO { description: string; importance: string; scope: string; status: string; progressPercent: number; isNew: boolean; existingId: string | null; suggestion: string; }
interface CEX { characterName: string; experience: string; evidence: string; }
interface RC { charA: string; charB: string; relation: string; reason: string; evidence: string; }
interface CSE { openingConnection: string; keyEvents: string[]; chapterEndHook: string; closingSnapshot: string; }
interface NCC { aiOpening: string; originalOpening: string; }
interface WE { opening: string; keyDialogue: string; keyPoints: string; hook: string; }

interface ApplyRequest {
  projectId: string;
  nodeId: string;
  chapterTitle: string;
  /** 用户选择的条目（已编辑过的版本） */
  selected: {
    characters: EC[];
    locations: EL[];
    factions: EF[];
    items: EI[];
    foreshadowings: EFO[];
    characterExperiences: CEX[];
    relationshipChanges: RC[];
    summary?: CSE;
    nextChapter?: NCC;
    writingElements?: WE;
  };
}

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, chapterTitle, selected } = await request.json() as ApplyRequest;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const results: string[] = [];
    let charsCreated = 0, charsUpdated = 0;
    let loreCreated = 0, loreUpdated = 0;
    let foreshadowingsCreated = 0;
    let experiencesSaved = 0;
    let relationshipsSaved = 0;

    // ═══════════════════════════════════════
    // 1. 角色卡处理
    // ═══════════════════════════════════════

    for (const c of selected.characters || []) {
      if (c.suggestion === "ignore") continue;

      if (c.suggestion === "create" && c.isNew) {
        // 新建角色卡
        await prisma.characterCard.create({
          data: {
            projectId,
            name: c.name,
            aliases: c.aliases || [],
            role: c.role || "supporting",
            abilities: c.abilities || [],
            timeline: c.experience ? [{ chapter: chapterTitle, type: "出场", event: c.experience }] : [],
            currentStatus: "alive",
          },
        });
        charsCreated++;
        results.push(`新建角色「${c.name}」`);
      } else if (c.suggestion === "update" && c.existingCardId) {
        // 更新已有角色——追加 timeline + abilities
        const existing = await prisma.characterCard.findUnique({
          where: { id: c.existingCardId },
          select: { timeline: true, abilities: true },
        });
        if (existing) {
          const timeline = (existing.timeline || []) as any[];
          const abilities = (existing.abilities || []) as string[];

          if (c.experience) {
            timeline.push({ chapter: chapterTitle, type: "出场", event: c.experience });
          }
          const newAbilities = (c.abilities || []).filter((a: string) => !abilities.includes(a));

          await prisma.characterCard.update({
            where: { id: c.existingCardId! },
            data: {
              timeline: timeline as any,
              abilities: newAbilities.length > 0 ? [...abilities, ...newAbilities] : undefined,
            },
          });
          charsUpdated++;
          const changes: string[] = [];
          if (c.experience) changes.push("经历");
          if (newAbilities.length > 0) changes.push(`能力+${newAbilities.length}`);
          results.push(`更新角色「${c.name}」→ ${changes.join("、")}`);
        }
      }
    }

    // ═══════════════════════════════════════
    // 2. 世界书条目处理（地点/势力/道具/关系）
    // ═══════════════════════════════════════

    const loreGroups = [
      { items: selected.locations || [], category: "geography" as const, label: "地点" },
      { items: selected.factions || [], category: "faction" as const, label: "势力" },
      { items: selected.items || [], category: "item" as const, label: "道具" },
    ];

    for (const group of loreGroups) {
      for (const item of group.items) {
        if (item.suggestion === "ignore") continue;

        const content = buildLoreContent(item);
        const keys = [item.name];
        if ((item as any).type) keys.push((item as any).type);
        if ((item as any).parent) keys.push((item as any).parent);

        if (item.suggestion === "create" && item.isNew) {
          await prisma.lorebookEntry.create({
            data: {
              projectId,
              title: item.name,
              category: group.category,
              keys,
              content,
              enabled: true,
            },
          });
          loreCreated++;
          results.push(`新建${group.label}「${item.name}」→ 世界书`);
        } else if (item.suggestion === "update" && item.existingEntryId) {
          await prisma.lorebookEntry.update({
            where: { id: item.existingEntryId },
            data: { content, keys },
          });
          loreUpdated++;
          results.push(`更新${group.label}「${item.name}」`);
        }
      }
    }

    // ═══════════════════════════════════════
    // 3. 伏笔处理
    // ═══════════════════════════════════════

    for (const f of selected.foreshadowings || []) {
      if (f.suggestion === "ignore") continue;
      if (f.suggestion === "create" && f.isNew) {
        await prisma.pendingCommitment.create({
          data: {
            projectId,
            description: f.description,
            status: f.status === "埋设" ? "pending" : f.status === "已回收" ? "fulfilled" : "pending",
            priority: f.importance === "极高" ? "high" : f.importance === "高" ? "high" : "medium",
            fulfillmentRatio: (f.progressPercent || 0) / 100,
            source: "ai_inference",
            sourceNodeId: nodeId,
          },
        });
        foreshadowingsCreated++;
        results.push(`新建伏笔「${f.description.slice(0, 30)}…」`);
      } else if (f.suggestion === "update" && f.existingId) {
        await prisma.pendingCommitment.update({
          where: { id: f.existingId },
          data: {
            fulfillmentRatio: (f.progressPercent || 0) / 100,
            status: f.status === "已回收" ? "fulfilled" : undefined,
          },
        });
        results.push(`更新伏笔进度`);
      }
    }

    // ═══════════════════════════════════════
    // 4. 章节摘要
    // ═══════════════════════════════════════

    if (selected.summary) {
      const s = selected.summary;
      // 查找已有摘要
      const existingSummary = await prisma.chapterSummary.findFirst({
        where: { projectId, chapterId: nodeId },
      });
      if (existingSummary) {
        await prisma.chapterSummary.update({
          where: { id: existingSummary.id },
          data: {
            summary: s.keyEvents.join("\n"),
            keyEvents: s.keyEvents,
            characterStates: {
              closingSnapshot: s.closingSnapshot,
              openingConnection: s.openingConnection,
              chapterEndHook: s.chapterEndHook,
            } as any,
          },
        });
      } else {
        await prisma.chapterSummary.create({
          data: {
            projectId,
            chapterId: nodeId,
            chapterTitle,
            summary: s.keyEvents.join("\n"),
            keyEvents: s.keyEvents,
            characterStates: {
              closingSnapshot: s.closingSnapshot,
              openingConnection: s.openingConnection,
              chapterEndHook: s.chapterEndHook,
            } as any,
          },
        });
      }
      results.push("更新章节摘要");
    }

    // ═══════════════════════════════════════
    // 5. 下章衔接 → 写入下一章 outline
    // ═══════════════════════════════════════

    if (selected.nextChapter?.aiOpening && nodeId) {
      // 找下一章
      const currentNode = await prisma.storyNode.findUnique({
        where: { id: nodeId },
        select: { order: true, parentId: true, projectId: true },
      });
      if (currentNode) {
        const nextNode = await prisma.storyNode.findFirst({
          where: {
            projectId,
            order: { gt: currentNode.order },
            type: "chapter",
          },
          orderBy: { order: "asc" },
        });
        if (nextNode) {
          const newOutline = nextNode.outline
            ? `${nextNode.outline}\n\n【AI建议章首衔接】\n${selected.nextChapter.aiOpening}`
            : selected.nextChapter.aiOpening;
          await prisma.storyNode.update({
            where: { id: nextNode.id },
            data: { outline: newOutline.slice(0, 2000) },
          });
          results.push(`下章衔接 → 「${nextNode.title}」`);
        }

        // 写作要素写入当前章的 notes
        if (selected.writingElements) {
          const we = selected.writingElements;
          const notesContent = [
            we.opening ? `开头承接：${we.opening}` : "",
            we.keyDialogue ? `关键对话：${we.keyDialogue}` : "",
            we.keyPoints ? `写作要点：${we.keyPoints}` : "",
            we.hook ? `钩子设计：${we.hook}` : "",
          ].filter(Boolean).join("\n");

          await prisma.storyNode.update({
            where: { id: nodeId },
            data: { notes: notesContent.slice(0, 1000) },
          });
          results.push("保存写作要素");
        }
      }
    }

    // ═══════════════════════════════════════
    // 6. 关系变化 → 世界书 character_relationship 条目
    // ═══════════════════════════════════════

    for (const r of selected.relationshipChanges || []) {
      const title = `${r.charA} ↔ ${r.charB}：${r.relation}`;
      const keys = [r.charA, r.charB, r.relation];
      const content = `关系类型：${r.relation}\n变化原因：${r.reason}\n正文证据：${r.evidence}\n来源章节：${chapterTitle}`;

      // 查找已有关系条目
      const existing = await prisma.lorebookEntry.findFirst({
        where: {
          projectId,
          category: "character_relationship",
          keys: { hasSome: [r.charA, r.charB] },
        },
      });

      if (existing) {
        const merged = `${existing.content || ""}\n\n---\n更新于 ${chapterTitle}：\n${content}`;
        await prisma.lorebookEntry.update({
          where: { id: existing.id },
          data: { content: merged.slice(0, 5000), keys: [...new Set([...existing.keys, ...keys])] },
        });
        relationshipsSaved++;
      } else {
        await prisma.lorebookEntry.create({
          data: {
            projectId, title,
            category: "character_relationship",
            keys, content: content.slice(0, 5000),
            enabled: true,
          },
        });
        relationshipsSaved++;
      }
    }
    if (relationshipsSaved > 0) results.push(`保存 ${relationshipsSaved} 条关系变化 → 世界书`);

    // ═══════════════════════════════════════
    // 7. 角色经历 → characterCard.timeline
    // ═══════════════════════════════════════

    const nameToId = new Map(
      (await prisma.characterCard.findMany({
        where: { projectId },
        select: { id: true, name: true },
      })).map((c) => [c.name, c.id]),
    );

    for (const exp of selected.characterExperiences || []) {
      const charId = nameToId.get(exp.characterName);
      if (!charId) continue;

      const card = await prisma.characterCard.findUnique({
        where: { id: charId },
        select: { timeline: true },
      });
      if (!card) continue;

      const timeline = (card.timeline || []) as any[];
      timeline.push({
        chapter: chapterTitle,
        type: "出场",
        event: exp.experience,
        evidence: exp.evidence?.slice(0, 100),
      });

      await prisma.characterCard.update({
        where: { id: charId },
        data: { timeline: timeline as any },
      });
      experiencesSaved++;
    }
    if (experiencesSaved > 0) results.push(`保存 ${experiencesSaved} 条角色经历 → timeline`);

    return NextResponse.json({
      success: true,
      summary: results.join("；") || "无变更",
      stats: {
        charsCreated, charsUpdated,
        loreCreated, loreUpdated,
        foreshadowingsCreated,
        experiencesSaved,
        relationshipsSaved,
      },
      details: results,
    });
  } catch (err) {
    console.error("应用提取失败:", err);
    return jsonError(err);
  }
}

/** 构建世界书条目内容 */
function buildLoreContent(item: any): string {
  const parts: string[] = [];
  if (item.type) parts.push(`【类型】${item.type}`);
  if (item.parent) parts.push(`【所属】${item.parent}`);
  if (item.rarity) parts.push(`【稀有度】${item.rarity}`);
  if (item.owner) parts.push(`【持有者】${item.owner}`);
  if (item.leader) parts.push(`【首领】${item.leader}`);
  if (item.territory) parts.push(`【领地】${item.territory}`);
  if (item.description) parts.push(`【描述】${item.description}`);
  return parts.join("\n") || "（待补充）";
}
