/**
 * POST /api/generate/apply-updates
 *
 * 应用用户确认的卡面更新到数据库。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

interface CharChange { characterId: string; name: string; changes: Record<string, unknown>; isNew?: boolean }
interface NewChar { name: string; role?: string; personality?: unknown; abilities?: string[]; evidence?: string }
interface NewLore { title: string; category?: string; keys?: string[]; content?: string }

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      projectId,
      characterUpdates = [],
      newCharacters = [],
      newLoreEntries = [],
      styleShift,
      newForeshadowings = [],
    } = body;

    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const applied: { chars: number; newChars: number; lore: number; style: boolean; foreshadowings: number } = {
      chars: 0, newChars: 0, lore: 0, style: false, foreshadowings: 0,
    };

    // ─── 更新已有角色 ─────────────────────────────────────
    for (const update of characterUpdates as CharChange[]) {
      if (!update.characterId) continue;

      const existing = await prisma.characterCard.findUnique({ where: { id: update.characterId } });
      if (!existing) continue;

      const changes = update.changes || {};
      const updateData: Record<string, unknown> = {};

      // 位置更新 → 拼接进 background
      if (changes["位置"] || changes["情绪"]) {
        const locInfo = [changes["位置"], changes["情绪"]].filter(Boolean).join(" | ");
        updateData.background = existing.background
          ? existing.background + `\n[本章] ${locInfo}`
          : locInfo;
      }

      // 新能力
      if (Array.isArray(changes["新能力"]) && (changes["新能力"] as string[]).length > 0) {
        const newAbilities = [...new Set([...(existing.abilities || []), ...(changes["新能力"] as string[])])];
        updateData.abilities = newAbilities;
      }

      // 状态变化
      if (changes["状态变化"] && changes["状态变化"] !== existing.currentStatus) {
        updateData.currentStatus = String(changes["状态变化"]);
      }

      // 人物弧光推进
      if (changes["人物弧光推进"]) {
        updateData.arcProgress = existing.arcProgress
          ? existing.arcProgress + `\n→ ${changes["人物弧光推进"]}`
          : String(changes["人物弧光推进"]);
      }

      // 新关系
      if (Array.isArray(changes["新关系"]) && (changes["新关系"] as unknown[]).length > 0) {
        const existingRels = (existing.relationships || []) as unknown[];
        const newRels = (changes["新关系"] as Record<string, unknown>[]).map((r) => ({
          targetCharacterId: "", // 后续解析
          targetName: r.targetName || "",
          relation: r.relation || "",
          dynamic: "",
          notes: `文本依据: ${r.evidence || "本章内容"}`,
        }));
        updateData.relationships = [...existingRels, ...newRels];
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
      await prisma.lorebookEntry.create({
        data: {
          projectId,
          title: String(nl.title),
          category: String(nl.category || "custom"),
          keys: Array.isArray(nl.keys) ? nl.keys.filter(Boolean) : [String(nl.title)],
          content: String(nl.content || ""),
          insertionOrder: 50,
          enabled: true,
        } as any,
      });
      applied.lore++;
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
      message: `更新完成：${applied.chars}角色更新 +${applied.newChars}新角色 +${applied.lore}新词条${applied.style ? " +风格调整" : ""}${applied.foreshadowings > 0 ? ` +${applied.foreshadowings}伏笔` : ""}`,
    });
  } catch (err) {
    console.error("应用更新失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "应用更新失败" },
      { status: 500 }
    );
  }
}
