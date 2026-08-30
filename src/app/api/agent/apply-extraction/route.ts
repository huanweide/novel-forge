/**
 * POST /api/agent/apply-extraction
 *
 * 接收用户在提取面板中的选择，批量写入各数据表：
 *   角色卡（新建/更新timeline）· 世界书（新建/更新条目）· 伏笔表 · 章节摘要 · 下章大纲
 */
import { asArray } from "@/lib/utils";
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { computePlotEventAdoptions } from "@/core/pipeline";
import { enrichForeshadow } from "@/core/foreshadowing";
import { isSimilarName } from "@/lib/entity-auto-creator";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

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
    /** 自动情节化：用户审阅后勾选、要归纳进故事线主线的关键事件文本 */
    plotEvents?: string[];
  };
}

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, chapterTitle, selected } = await request.json() as ApplyRequest;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    // ── G4+G5 查重支持数据 ──
    // G5 变体比对用：一次性拉取项目已有角色名 + 世界书标题（+ 角色别名，P1-1 别名归一）。
    // 繁简/错别字归一在 isSimilarName 内完成。
    interface DedupChar { id: string; name: string; aliases: string[]; }
    let existingChars: DedupChar[] = [];
    let existingLore: Array<{ id: string; title: string }> = [];
    let variantNames: string[] = [];
    // 别名(小写) → 角色卡 id 索引（P1-1：候选名命中别名即复用该角色卡，不新建）
    const aliasToCharId = new Map<string, string>();
    try {
      const [ec, el] = await Promise.all([
        prisma.characterCard.findMany({
          where: { projectId },
          select: { id: true, name: true, aliases: true },
        }),
        prisma.lorebookEntry.findMany({
          where: { projectId },
          select: { id: true, title: true },
        }),
      ]);
      existingChars = ec.map((c) => ({
        id: c.id,
        name: c.name,
        aliases: Array.isArray(c.aliases) ? (c.aliases as string[]) : [],
      }));
      existingLore = el;
      // 主名 + 别名 一并摊平进变体比对集（P1-1：别名维度）
      variantNames = [
        ...existingChars.flatMap((c) => [c.name, ...asArray<string>(c.aliases)]),
        ...existingLore.map((l) => l.title),
      ];
      // 建立 别名(小写) → 角色卡 id 索引
      for (const c of existingChars) {
        for (const al of c.aliases) {
          const low = al.trim().toLowerCase();
          if (low) aliasToCharId.set(low, c.id);
        }
      }
    } catch {
      existingChars = [];
      existingLore = [];
      variantNames = []; // 查重数据拉取失败：后续逐条放行建卡
    }

    /** G4 精确去重 + P1-1 别名归一去重：返回已存在实体的类型与 id（命中即复用，不新建）。
     *  保留 P0 主名精确查重（name/title equals insensitive）主线，仅叠加别名维度。 */
    async function findExactDuplicate(
      name: string,
    ): Promise<{ kind: "character" | "lore"; id: string } | null> {
      const low = name.trim().toLowerCase();
      if (!low) return null;
      try {
        // 1) 主名精确查重（P0 已落地，保留）
        const char = await prisma.characterCard.findFirst({
          where: { projectId, name: { equals: name } },
          select: { id: true },
        });
        if (char) return { kind: "character", id: char.id };
        const lore = await prisma.lorebookEntry.findFirst({
          where: { projectId, title: { equals: name } },
          select: { id: true },
        });
        if (lore) return { kind: "lore", id: lore.id };
        // 2) 别名归一（P1-1）：候选名命中所属角色卡别名 → 复用该角色卡而非新建
        const aliasedCharId = aliasToCharId.get(low);
        if (aliasedCharId) return { kind: "character", id: aliasedCharId };
        return null;
      } catch {
        return null; // 查重异常放行
      }
    }

    /** G5 变体去重：与已有主名/别名构成繁简/错别字变体（如「青龙镇」vs「青龍镇」） */
    function isVariantDuplicate(name: string): boolean {
      try {
        return variantNames.some((n) => isSimilarName(n, name));
      } catch {
        return false; // 查重异常放行
      }
    }

    const results: string[] = [];
    let charsCreated = 0, charsUpdated = 0;
    let loreCreated = 0, loreUpdated = 0;
    let foreshadowingsCreated = 0;
    let experiencesSaved = 0;
    let relationshipsSaved = 0;
    let plotEventsAdopted = 0;

    // ═══════════════════════════════════════
    // 1. 角色卡处理
    // ═══════════════════════════════════════

    for (const c of selected.characters || []) {
      if (c.suggestion === "ignore") continue;

      if (c.suggestion === "create" && c.isNew) {
        // ── G4+G5 去重：已存在同名（精确/变体）则跳过新建、复用已有记录 ──
        const exact = await findExactDuplicate(c.name);
        if (exact?.kind === "character") {
          // 复用已有角色卡，按需追加经历 timeline
          if (c.experience) {
            const existing = await prisma.characterCard.findUnique({
              where: { id: exact.id },
              select: { timeline: true },
            });
            const timeline = (existing?.timeline || []) as any[];
            timeline.push({ chapter: chapterTitle, type: "出场", event: c.experience });
            await prisma.characterCard.update({
              where: { id: exact.id },
              data: { timeline: timeline as any },
            });
          }
          results.push(`角色「${c.name}」已存在（复用，跳过重复建卡）`);
          continue;
        }
        if (exact?.kind === "lore") {
          // 该名称已作为世界书条目存在，避免重复建角色卡
          results.push(`角色「${c.name}」与世界书条目重名（跳过重复建卡）`);
          continue;
        }
        if (isVariantDuplicate(c.name)) {
          results.push(`角色「${c.name}」似已存在繁简/变体（跳过重复建卡）`);
          continue;
        }
        // 新建角色卡
        const newCard = await prisma.characterCard.create({
          data: {
            projectId,
            name: c.name,
            aliases: c.aliases || [],
            role: c.role || "supporting",
            abilities: c.abilities || [],
            timeline: c.experience ? [{ chapter: chapterTitle, type: "出场", event: c.experience }] : [],
            currentStatus: "alive",
            reviewStatus: "pending",
          },
        });
        // 批次内去重：主名 + 别名 摊平进比对集与别名索引
        variantNames.push(c.name, ...asArray<string>(c.aliases));
        for (const al of asArray<string>(c.aliases)) {
          const low = al.trim().toLowerCase();
          if (low) aliasToCharId.set(low, newCard.id);
        }
        charsCreated++;
        results.push(`新建角色「${c.name}」`);
      } else if (c.suggestion === "update" && c.existingCardId) {
        // 更新已有角色——追加 timeline + abilities
        const existing = await prisma.characterCard.findUnique({
          where: { id: c.existingCardId },
          select: { timeline: true, abilities: true },
        });
        if (existing) {
          const timeline = asArray<any>(existing.timeline) as any[];
          const abilities = asArray<string>(existing.abilities) as string[];

          if (c.experience) {
            timeline.push({ chapter: chapterTitle, type: "出场", event: c.experience });
          }
          const newAbilities = asArray<string>(c.abilities).filter((a: string) => !abilities.includes(a));

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
          // ── G4+G5 去重：已存在同名（精确/变体）则跳过新建、复用已有记录 ──
          const exact = await findExactDuplicate(item.name);
          if (exact) {
            results.push(`新建${group.label}「${item.name}」已存在同名（跳过重复建卡）`);
            continue;
          }
          if (isVariantDuplicate(item.name)) {
            results.push(`新建${group.label}「${item.name}」似已存在繁简/变体（跳过重复建卡）`);
            continue;
          }
          await prisma.lorebookEntry.create({
            data: {
              projectId,
              title: item.name,
              category: group.category,
              keys,
              reviewStatus: "pending",
              content,
              enabled: true,
            },
          });
          variantNames.push(item.name); // 批次内去重
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
        const created = await prisma.pendingCommitment.create({
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
        // 异步生成伏笔后续发展思路（不阻塞抽取，失败静默）
        enrichForeshadow(projectId, created.id).catch(() => {});
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
        where: { id: nodeId, deletedAt: null },
        select: { order: true, parentId: true, projectId: true },
      });
      if (currentNode) {
        const nextNode = await prisma.storyNode.findFirst({
          where: {
            projectId,
            deletedAt: null,
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

      // 查找已有关系条目（SQLite 不支持标量数组的 hasSome，改为读取后 JS 过滤）
      const candidates = await prisma.lorebookEntry.findMany({
        where: { projectId, category: "character_relationship" },
      });
      const existing = candidates.find(
        (e) => Array.isArray(e.keys) && (e.keys.includes(r.charA) || e.keys.includes(r.charB)),
      );

      if (existing) {
        const merged = `${existing.content || ""}\n\n---\n更新于 ${chapterTitle}：\n${content}`;
        await prisma.lorebookEntry.update({
          where: { id: existing.id },
          data: { content: merged.slice(0, 5000), keys: [...new Set([...asArray<string>(existing.keys), ...keys])] },
        });
        relationshipsSaved++;
      } else {
        await prisma.lorebookEntry.create({
          data: {
            projectId, title,
            category: "character_relationship",
            keys, content: content.slice(0, 5000),
            enabled: true,
            reviewStatus: "pending",
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

      const timeline = asArray<any>(card.timeline) as any[];
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

    // ═══════════════════════════════════════
    // 8. 情节事件 → StorylineEvent（自动情节化：抽取关键事件归纳到故事线）
    //    挂活跃主线（无则建默认主线），position 末尾；纯函数算清单 + 落库；去重防重复采纳。
    // ═══════════════════════════════════════

    if (selected.plotEvents && selected.plotEvents.length > 0) {
      // 找活跃主线；若无（极少数无主线项目），建一条默认「主线」作为归纳目标
      let mainLine = await prisma.storyline.findFirst({
        where: { projectId, type: "main", status: "active" },
        orderBy: { order: "asc" },
      });
      if (!mainLine) {
        mainLine = await prisma.storyline.create({
          data: { projectId, type: "main", status: "active", title: "主线", order: 0, description: "" },
        });
      }

      // 现有事件（去重用）+ 当前最大 position
      const existingEvents = await prisma.storylineEvent.findMany({
        where: { storylineId: mainLine.id },
        select: { title: true, sourceRefs: true },
      });
      const maxPosEvt = await prisma.storylineEvent.findFirst({
        where: { storylineId: mainLine.id },
        orderBy: { position: "desc" },
        select: { position: true },
      });

      const { toCreate } = computePlotEventAdoptions({
        plotEvents: selected.plotEvents,
        existingEvents: existingEvents as any,
        nodeId,
        startPosition: maxPosEvt?.position ?? 0,
      });

      for (const ev of toCreate) {
        await prisma.storylineEvent.create({
          data: {
            storylineId: mainLine.id,
            kind: "EVENT",
            title: ev.title,
            content: ev.content,
            position: ev.position,
            role: null,
            sourceRefs: ev.sourceRefs as any,
          },
        });
      }
      plotEventsAdopted = toCreate.length;
      if (plotEventsAdopted > 0) results.push(`采纳 ${plotEventsAdopted} 个情节事件 → 故事线主线`);
    }

    // v1.6.26 实时性：apply-extraction 更新既有 approved 角色卡 timeline/abilities（sync-global-prompt 渲染这两段），
    // 抽取后刷新 globalPrompt，确保下一章生成看到最新角色出场记录（与 characters/[id] 改卡即同步范式一致）。
    syncGlobalPrompt(projectId).catch(() => {});

    return NextResponse.json({
      success: true,
      summary: results.join("；") || "无变更",
      stats: {
        charsCreated, charsUpdated,
        loreCreated, loreUpdated,
        foreshadowingsCreated,
        experiencesSaved,
        relationshipsSaved,
        plotEventsAdopted,
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
