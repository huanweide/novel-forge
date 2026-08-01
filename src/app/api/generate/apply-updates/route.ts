// @deprecated: 已被 /api/agent/apply-extraction 取代，前端无调用
/**
 * POST /api/generate/apply-updates
 *
 * 应用用户确认的卡面更新到数据库。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

// 故事线七要素 → 数据库字段映射
const ELEMENT_FIELDS: Record<string, string> = {
  desire: "desire",
  obstacle: "obstacle",
  action: "action",
  result: "result",
  twist: "twist",
  turn: "turn",
  ending: "ending",
};

interface CharChange { characterId: string; name: string; changes: Record<string, unknown>; isNew?: boolean }
interface NewChar { name: string; role?: string; personality?: unknown; abilities?: string[]; evidence?: string }
interface NewLore { title: string; category?: string; keys?: string[]; content?: string; evidence?: string }
interface NewForeshadowing { description: string; relatedCharacters?: string[]; suggestedPayoff?: string }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectId,
      chapterNumber = "",
      characterUpdates = [],
      newCharacters = [],
      newLoreEntries = [],
      styleShift,
      newForeshadowings = [],
      worldSettings,
      storyCore,
      globalTimeline = [],
      plotLines = [],
      subPlots = [],
      characterRelations = [],
    } = body;

    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const applied: { chars: number; newChars: number; lore: number; style: boolean; foreshadowings: number; worldSettings: boolean; storyCore: boolean; timelineEvents: number; plotLines: number; subPlots: number } = {
      chars: 0, newChars: 0, lore: 0, style: false, foreshadowings: 0, worldSettings: false, storyCore: false, timelineEvents: 0, plotLines: 0, subPlots: 0,
    };

    // ─── 更新已有角色 ─────────────────────────────────────
    for (const update of characterUpdates as CharChange[]) {
      if (!update.characterId) continue;

      const existing = await prisma.characterCard.findUnique({ where: { id: update.characterId } });
      if (!existing) continue;

      const changes = update.changes || {};
      const updateData: Record<string, unknown> = {};

      // 位置 + 情绪 → 追加到 background（标记章节来源）
      if (changes["位置"] || changes["情绪"]) {
        const locInfo = [
          chapterNumber ? `第${chapterNumber}章` : "本章",
          changes["位置"],
          changes["情绪"]
        ].filter(Boolean).join(" | ");
        updateData.background = existing.background
          ? existing.background + `\n[${locInfo}]`
          : `[${locInfo}]`;
      }

      // 新能力 → 去重合并（标记新增来源）
      if (Array.isArray(changes["新能力"]) && (changes["新能力"] as string[]).length > 0) {
        const newAbilities = [...new Set([...(existing.abilities || []), ...(changes["新能力"] as string[])])];
        updateData.abilities = newAbilities;
      }

      // 状态变化
      if (changes["状态变化"] && changes["状态变化"] !== existing.currentStatus) {
        updateData.currentStatus = String(changes["状态变化"]);
      }

      // 人物弧光推进 → 追加到 arcProgress
      if (changes["人物弧光推进"]) {
        const chapterLabel = chapterNumber ? `第${chapterNumber}章` : "本章";
        updateData.arcProgress = existing.arcProgress
          ? existing.arcProgress + `\n→ [${chapterLabel}] ${changes["人物弧光推进"]}`
          : `[${chapterLabel}] ${changes["人物弧光推进"]}`;
      }

      // 背景更新 → 如果有独立章节引用就追加
      if (changes["背景更新"]) {
        const bgLabel = chapterNumber ? `\n[第${chapterNumber}章揭示] ` : "\n[本章揭示] ";
        updateData.background = (updateData.background || existing.background || "") + bgLabel + String(changes["背景更新"]);
      }

      // 新关系 → 带 targetCharacterId 匹配
      if (Array.isArray(changes["新关系"]) && (changes["新关系"] as unknown[]).length > 0) {
        const existingRels = (existing.relationships || []) as unknown[];
        const newRels = await Promise.all(
          (changes["新关系"] as Record<string, unknown>[]).map(async (r) => {
            // 尝试匹配已有角色 ID
            let targetId = "";
            const targetName = String(r.targetName || "");
            if (targetName) {
              const matched = await prisma.characterCard.findFirst({
                where: { projectId, name: targetName },
              });
              if (matched) targetId = matched.id;
            }
            return {
              targetCharacterId: targetId,
              targetName: targetName,
              relation: String(r.relation || ""),
              dynamic: "",
              notes: chapterNumber
                ? `第${chapterNumber}章建立。依据: ${r.evidence || "正文"}`
                : `依据: ${r.evidence || "正文"}`,
            };
          })
        );
        updateData.relationships = [...existingRels, ...newRels];
      }

      // 性格/信念转变 → 追加到 personality（如果是结构化格式）
      if (changes["性格信念转变"]) {
        const existingPersonality = typeof existing.personality === "object" && existing.personality !== null
          ? existing.personality as Record<string, unknown>
          : {};
        if (Array.isArray(existingPersonality)) {
          // 旧格式：字符串数组，保持兼容
          updateData.personality = [...(existingPersonality as string[]), `[${chapterNumber || "本章"}] ${changes["性格信念转变"]}`];
        } else {
          // 新格式：结构化
          updateData.personality = {
            ...existingPersonality,
            arcNote: (existingPersonality.arcNote || "") + `\n[${chapterNumber || "本章"}] ${changes["性格信念转变"]}`,
          };
        }
      }

      // 对话风格更新 → 标记章节来源，后续章节可读取
      if (changes["对话风格"]) {
        const chapterLabel = chapterNumber ? `\n[第${chapterNumber}章] ` : "\n[本章] ";
        updateData.dialogueStyle = existing.dialogueStyle
          ? existing.dialogueStyle + chapterLabel + String(changes["对话风格"])
          : chapterLabel.trim() + String(changes["对话风格"]);
      }

      // 外貌描述更新 → 标记章节来源
      if (changes["外貌描述"]) {
        const chapterLabel = chapterNumber ? `\n[第${chapterNumber}章] ` : "\n[本章] ";
        updateData.appearance = existing.appearance
          ? existing.appearance + chapterLabel + String(changes["外貌描述"])
          : chapterLabel.trim() + String(changes["外貌描述"]);
      }

      // 获得重要物品/身份 → 追加到标签
      if (changes["获得重要物品或身份"]) {
        const newTag = String(changes["获得重要物品或身份"]);
        const existingTags = existing.tags || [];
        if (!existingTags.includes(newTag)) {
          updateData.tags = [...existingTags, newTag];
        }
      }

      // ── 汇总本章经历写入 timeline ──
      const timelineEvents: Record<string, unknown>[] = [];
      const existingTimeline = (Array.isArray(existing.timeline) ? existing.timeline : []) as Record<string, unknown>[];
      const chapLabel = chapterNumber || "本章";

      if (changes["人物弧光推进"]) {
        timelineEvents.push({ chapter: chapLabel, type: "弧光", event: changes["人物弧光推进"] });
      }
      if (changes["新能力"]) {
        const abs = Array.isArray(changes["新能力"]) ? (changes["新能力"] as string[]).join("、") : String(changes["新能力"]);
        timelineEvents.push({ chapter: chapLabel, type: "能力", event: `获得/展现新能力：${abs}` });
      }
      if (Array.isArray(changes["新关系"]) && (changes["新关系"] as any[]).length > 0) {
        for (const r of changes["新关系"] as any[]) {
          timelineEvents.push({ chapter: chapLabel, type: "关系", event: `与${r.targetName || "?"}建立${r.relation || "关系"}` });
        }
      }
      if (changes["状态变化"] && changes["状态变化"] !== existing.currentStatus) {
        timelineEvents.push({ chapter: chapLabel, type: "状态", event: `状态变化：${existing.currentStatus} → ${changes["状态变化"]}` });
      }
      if (changes["获得重要物品或身份"]) {
        timelineEvents.push({ chapter: chapLabel, type: "获得", event: `获得：${changes["获得重要物品或身份"]}` });
      }
      if (changes["位置"] || changes["情绪"]) {
        const loc = [changes["位置"], changes["情绪"]].filter(Boolean).join("，");
        timelineEvents.push({ chapter: chapLabel, type: "位置", event: loc });
      }
      if (changes["性格信念转变"]) {
        timelineEvents.push({ chapter: chapLabel, type: "信念", event: changes["性格信念转变"] });
      }
      // 背景更新也算经历
      if (changes["背景更新"] && !timelineEvents.some(e => e.event === changes["背景更新"])) {
        timelineEvents.push({ chapter: chapLabel, type: "背景", event: String(changes["背景更新"]).slice(0, 100) });
      }

      if (timelineEvents.length > 0) {
        updateData.timeline = [...existingTimeline, ...timelineEvents];
      }

      if (Object.keys(updateData).length > 0) {
        await prisma.characterCard.update({
          where: { id: update.characterId },
          data: updateData as any,
        });
        applied.chars++;
      }
    }

    // ─── 创建新角色 ───────────────────────────────────────
    for (const nc of newCharacters as NewChar[]) {
      if (!nc.name) continue;
      await prisma.characterCard.create({
        data: {
          projectId,
          name: String(nc.name),
          role: String(nc.role || "supporting"),
          personality: (nc.personality || {}) as any,
          abilities: Array.isArray(nc.abilities) ? nc.abilities.filter(Boolean) : [],
          background: String(nc.evidence || "").slice(0, 200),
          tags: ["🆕 章节自动发现"],
          currentStatus: "alive",
        } as any,
      });
      applied.newChars++;
    }

    // ─── 创建新世界书词条 ────────────────────────────────
    for (const nl of newLoreEntries as NewLore[]) {
      if (!nl.title) continue;
      // 检查是否已存同名/同内容词条，避免重复创建
      const existingLore = await prisma.lorebookEntry.findFirst({
        where: { projectId, title: nl.title },
      });
      if (existingLore) {
        // 更新已有词条，追加新内容
        await prisma.lorebookEntry.update({
          where: { id: existingLore.id },
          data: {
            content: existingLore.content
              ? existingLore.content + `\n\n[${chapterNumber || "后续章节"} 补充] ${nl.content || ""}`
              : nl.content || "",
            keys: [...new Set([...(existingLore.keys || []), ...(nl.keys || []), nl.title])],
            enabled: true,
          } as any,
        });
      } else {
        await prisma.lorebookEntry.create({
          data: {
            projectId,
            title: String(nl.title),
            category: String(nl.category || "custom"),
            keys: Array.isArray(nl.keys) && nl.keys.length > 0
              ? nl.keys.filter(Boolean)
              : [String(nl.title)],
            content: (nl.evidence
              ? `[依据: ${chapterNumber || "正文"}]\n${nl.content || ""}`
              : nl.content || ""),
            insertionOrder: 50,
            enabled: true,
          } as any,
        });
      }
      applied.lore++;
    }

    // ─── 写入伏笔到 PendingCommitment ─────────────────────
    for (const fs of (newForeshadowings as NewForeshadowing[])) {
      if (!fs.description) continue;
      // 查找关联角色 ID
      const relatedIds: string[] = [];
      if (Array.isArray(fs.relatedCharacters)) {
        for (const name of fs.relatedCharacters) {
          const matched = await prisma.characterCard.findFirst({
            where: { projectId, name },
            select: { id: true },
          });
          if (matched) relatedIds.push(matched.id);
        }
      }
      // 构建闭环条件
      const closureConditions: Array<{ type: string; value: string; required: boolean }> = [];
      if (fs.suggestedPayoff) {
        closureConditions.push({ type: "action", value: fs.suggestedPayoff, required: false });
      }
      await prisma.pendingCommitment.create({
        data: {
          projectId,
          source: "ai_inference",
          priority: "medium",
          description: fs.description,
          entityIds: relatedIds,
          closureConditions,
          status: "detected",
          detectedAt: new Date(),
          fulfillmentRatio: 0,
          statusHistory: [{
            from: "pending",
            to: "detected",
            trigger: "chapter_analysis",
            chapterId: "",
            timestamp: new Date().toISOString(),
            details: chapterNumber ? `第${chapterNumber}章 AI 分析自动发现` : "AI 分析自动发现",
          }],
        },
      });
      applied.foreshadowings++;
    }

    // ─── 世界观设定 → Project.description ─────────────────
    if (worldSettings && typeof worldSettings === "object") {
      const ws = worldSettings as Record<string, string>;
      const filled = Object.entries(ws).filter(([, v]) => v && String(v).trim());
      if (filled.length > 0) {
        const project = await prisma.project.findUnique({ where: { id: projectId }, select: { description: true } });
        const newLines = filled.map(([k, v]) => `【${k}】${String(v).trim()}`);
        const merged = project?.description
          ? project.description + "\n\n" + newLines.join("\n")
          : newLines.join("\n");
        await prisma.project.update({ where: { id: projectId }, data: { description: merged } });
        applied.worldSettings = true;
      }
    }

    // ─── 故事核心 → Project.synopsis ──────────────────────
    if (storyCore && typeof storyCore === "object") {
      const sc = storyCore as Record<string, string>;
      const filled = Object.entries(sc).filter(([, v]) => v && String(v).trim());
      if (filled.length > 0) {
        const project = await prisma.project.findUnique({ where: { id: projectId }, select: { synopsis: true } });
        const newLines = filled.map(([k, v]) => `【${k}】${String(v).trim()}`);
        const merged = project?.synopsis
          ? project.synopsis + "\n" + newLines.join("\n")
          : newLines.join("\n");
        await prisma.project.update({ where: { id: projectId }, data: { synopsis: merged } });
        applied.storyCore = true;
      }
    }

    // ─── 全局时间线 → StoryBeat ───────────────────────────
    for (const event of globalTimeline as Array<Record<string, unknown>>) {
      if (!event.title && !event.description) continue;
      await prisma.storyBeat.create({
        data: {
          projectId,
          nodeId: "",
          description: `[${event.eventType || "关键事件"}] ${event.title || ""}：${event.description || ""}${event.characters ? `（${Array.isArray(event.characters) ? event.characters.join("、") : event.characters}）` : ""}`,
          chapterNumber: chapterNumber ? parseInt(chapterNumber) || 0 : 0,
          impact: event.importance === "核心" ? "major" : "minor",
        },
      });
      applied.timelineEvents++;
    }

    // ─── 情节脉络/支线故事 → Storyline 表 ─────────────────
    interface StorylineInput { title?: string; type?: string; progress?: string; stage?: string; characters?: string[] }
    const allStorylines: Array<StorylineInput & { lineType: "main" | "side" }> = [
      ...(plotLines as StorylineInput[]).map((p) => ({ ...p, lineType: "main" as const })),
      ...(subPlots as StorylineInput[]).map((p) => ({ ...p, lineType: "side" as const })),
    ];
    for (const line of allStorylines) {
      if (!line.title || !line.progress) continue;
      const title = String(line.title).trim();
      const progress = String(line.progress);
      const stage = String(line.stage || "action"); // 默认行动阶段
      const isMain = line.lineType === "main";

      // 查找是否已有同名故事线
      const existing = await prisma.storyline.findFirst({
        where: { projectId, title },
      });

      if (existing) {
        // 更新对应阶段字段 + 追加 chapterBindings
        const updateData: Record<string, unknown> = {
          description: existing.description
            ? existing.description + `\n[${chapterNumber || "本章"}] ${progress}`
            : `[${chapterNumber || "本章"}] ${progress}`,
        };
        // 填充七要素中对应的阶段字段
        if (stage && stage in ELEMENT_FIELDS) {
          const field = ELEMENT_FIELDS[stage];
          const existingVal = (existing as Record<string, unknown>)[field] || "";
          updateData[field] = existingVal
            ? `${existingVal}\n[${chapterNumber || "本章"}] ${progress}`
            : `[${chapterNumber || "本章"}] ${progress}`;
        }
        // 追加 chapterBindings
        const existingBindings = (existing.chapterBindings || []) as Array<Record<string, unknown>>;
        updateData.chapterBindings = [...existingBindings, {
          element: stage,
          chapterId: "",
          note: progress,
        }];
        await prisma.storyline.update({ where: { id: existing.id }, data: updateData as any });
      } else {
        // 创建新故事线
        const createData: Record<string, unknown> = {
          projectId,
          type: isMain ? "main" : "side",
          title,
          description: `[${chapterNumber || "本章"}] ${progress}`,
          status: "active",
        };
        // 填充对应阶段字段
        if (stage && stage in ELEMENT_FIELDS) {
          createData[ELEMENT_FIELDS[stage]] = `[${chapterNumber || "本章"}] ${progress}`;
        }
        createData.chapterBindings = [{ element: stage, chapterId: "", note: progress }];
        await prisma.storyline.create({ data: createData as any });
      }
      if (isMain) applied.plotLines++; else applied.subPlots++;
    }

    // ─── 人物关系 → CharacterCard.relationships（多向总结）──
    interface CharRelation { sourceName?: string; targetName?: string; relation?: string; reason?: string }
    for (const rel of (characterRelations as CharRelation[])) {
      if (!rel.sourceName || !rel.targetName || !rel.relation) continue;
      const sourceChar = await prisma.characterCard.findFirst({
        where: { projectId, name: rel.sourceName },
      });
      if (!sourceChar) continue;
      // 查找 target 角色 ID
      let targetId = "";
      const targetChar = await prisma.characterCard.findFirst({
        where: { projectId, name: rel.targetName },
      });
      if (targetChar) targetId = targetChar.id;

      const existingRels = (sourceChar.relationships || []) as Array<Record<string, unknown>>;
      // 多向总结：检查是否已有同 target 的关系
      const dupIdx = existingRels.findIndex((r) => r.targetName === rel.targetName);
      const newRel = {
        targetCharacterId: targetId,
        targetName: rel.targetName,
        relation: rel.relation,
        dynamic: rel.reason || "",
        notes: chapterNumber ? `第${chapterNumber}章${dupIdx >= 0 ? "更新" : "建立"}。${rel.reason || ""}` : (rel.reason || ""),
      };
      if (dupIdx >= 0) {
        // 已存在→更新（保留历史原因，追加新原因）
        const oldRel = existingRels[dupIdx];
        existingRels[dupIdx] = {
          ...oldRel,
          relation: rel.relation, // 更新为最新关系类型
          dynamic: oldRel.dynamic ? `${oldRel.dynamic}；${rel.reason || ""}` : (rel.reason || ""),
          notes: oldRel.notes ? `${oldRel.notes} | ${newRel.notes}` : newRel.notes,
        };
        await prisma.characterCard.update({
          where: { id: sourceChar.id },
          data: { relationships: existingRels as any },
        });
      } else {
        // 不存在→新建
        await prisma.characterCard.update({
          where: { id: sourceChar.id },
          data: { relationships: [...existingRels, newRel] as any },
        });
      }
      applied.chars++;
    }

    // ─── 更新风格卡 ───────────────────────────────────────
    if (styleShift && (styleShift as Record<string, unknown>).detected) {
      const desc = (styleShift as Record<string, unknown>).description;
      if (desc) {
        const existing = await prisma.styleCard.findFirst({
          where: { projectId },
          orderBy: { updatedAt: "desc" },
        });
        if (existing) {
          await prisma.styleCard.update({
            where: { id: existing.id },
            data: {
              styleDescription: existing.styleDescription
                ? existing.styleDescription + ` | 更新: ${desc}`
                : String(desc),
            } as any,
          });
          applied.style = true;
        }
      }
    }

    return NextResponse.json({
      success: true,
      applied,
      message: `更新完成：${applied.chars}角色更新 +${applied.newChars}新角色 +${applied.lore}新词条${applied.foreshadowings > 0 ? ` +${applied.foreshadowings}伏笔` : ""}${applied.worldSettings ? " +世界观设定" : ""}${applied.storyCore ? " +故事核心" : ""}${applied.timelineEvents > 0 ? ` +${applied.timelineEvents}时间线事件` : ""}${applied.plotLines > 0 ? ` +${applied.plotLines}情节线` : ""}${applied.subPlots > 0 ? ` +${applied.subPlots}支线` : ""}${applied.style ? " +风格调整" : ""}`,
    });
  } catch (err) {
    console.error("应用更新失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "应用更新失败" },
      { status: 500 }
    );
  }
}
