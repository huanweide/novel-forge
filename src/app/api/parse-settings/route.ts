import { jsonError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import {
  parseSettings,
  parseLorebookOnly,
  parseStyleOnly,
  toCharacterCreateParams,
  toLorebookCreateParams,
  toStyleCardCreateParams,
} from "@/core/settings";

/**
 * POST /api/parse-settings
 *
 * AI 批量解析设定文本。支持三种模式：
 *
 * mode: "all" (默认) — 三卡全提：角色卡 + 世界书 + 风格卡
 * mode: "lorebook"   — 仅世界卡：复述蒸馏，提取全部世界观设定
 * mode: "style"      — 仅风格卡：复述蒸馏，分析全部风格维度 + 写作规则
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;
 *   mode: "all" | "lorebook" | "style";  // 默认 "all"
 *   autoCreate: boolean;                  // 默认 true
 * }
 */
export async function POST(request: Request) {
  try {
    const { projectId, rawText, mode = "all", autoCreate = true } = await request.json();

    if (!projectId || !rawText) {
      return NextResponse.json(
        { error: "缺少 projectId 或 rawText" },
        { status: 400 }
      );
    }

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    const created = { characters: 0, loreEntries: 0, styleCard: false };

    if (mode === "lorebook") {
      // ─── 仅世界卡模式 ─────────────────────────
      const entries = await parseLorebookOnly(rawText);

      if (autoCreate && entries.length > 0) {
        const existingLore = await prisma.lorebookEntry.findMany({
          where: { projectId },
          select: { id: true, title: true, content: true, keys: true },
        });
        const existingMap = new Map(existingLore.map(e => [e.title.toLowerCase().trim(), e]));

        let newCount = 0, mergeCount = 0;
        for (const l of entries) {
          const key = l.title.toLowerCase().trim();
          const existing = existingMap.get(key);
          if (existing) {
            // 求同存异：合并 content，去重 keys
            const mergedContent = [existing.content, l.content]
              .filter(c => c?.trim()).join("\n\n---\n");
            const mergedKeys = [...new Set([...existing.keys, ...l.keys])];
            await prisma.lorebookEntry.update({
              where: { id: existing.id },
              data: { content: mergedContent, keys: mergedKeys },
            });
            mergeCount++;
          } else {
            await prisma.lorebookEntry.create({
              data: toLorebookCreateParams(l, projectId),
            });
            newCount++;
          }
        }
        created.loreEntries = newCount + mergeCount;
      }

      return NextResponse.json({
        parsed: { loreEntries: entries },
        created: { ...created, newEntries: created.loreEntries },
        mode: "lorebook",
      });
    }

    if (mode === "style") {
      // ─── 仅风格卡模式 ─────────────────────────
      const styleResult = await parseStyleOnly(rawText);

      if (autoCreate && styleResult) {
        await prisma.styleCard.deleteMany({ where: { projectId } });
        await prisma.styleCard.create({
          data: toStyleCardCreateParams(styleResult, projectId, 0),
        });
        created.styleCard = true;
      }

      return NextResponse.json({
        parsed: {
          styleProfile: styleResult,
          writingRules: styleResult.writingRules || [],
        },
        created,
        mode: "style",
      });
    }

    // ─── 默认：全部三卡模式 ───────────────────
    const parsed = await parseSettings(rawText);

    const writeOps: Promise<unknown>[] = [];

    // ── 角色卡：求同存异 —— 同名则合并，不同则新建 ──
    if (autoCreate && parsed.characters.length > 0) {
      const existingChars = await prisma.characterCard.findMany({
        where: { projectId },
        select: { id: true, name: true, background: true },
      });
      const existingCharMap = new Map(existingChars.map(c => [c.name.toLowerCase().trim(), c]));

      let newCount = 0, mergeCount = 0;
      for (const c of parsed.characters) {
        const key = c.name.toLowerCase().trim();
        const existing = existingCharMap.get(key);
        if (existing) {
          // 求同存异——合并 background
          const mergedBg = [existing.background, c.background]
            .filter(bg => bg?.trim()).join("\n\n---\n---\n\n");
          writeOps.push(
            prisma.characterCard.update({
              where: { id: existing.id },
              data: {
                background: mergedBg,
              },
            })
          );
          mergeCount++;
        } else {
          writeOps.push(
            prisma.characterCard.create({
              data: toCharacterCreateParams(c, projectId),
            })
          );
          newCount++;
        }
      }
      created.characters = newCount + mergeCount;
    }

    // ── 世界书：求同存异 —— 同名合并 content + keys ──
    if (autoCreate && parsed.loreEntries.length > 0) {
      const existingLore = await prisma.lorebookEntry.findMany({
        where: { projectId },
        select: { id: true, title: true, content: true, keys: true },
      });
      const existingLoreMap = new Map(existingLore.map(e => [e.title.toLowerCase().trim(), e]));

      for (const l of parsed.loreEntries) {
        const key = l.title.toLowerCase().trim();
        const existing = existingLoreMap.get(key);
        if (existing) {
          const mergedContent = [existing.content, l.content]
            .filter(c => c?.trim()).join("\n\n---\n");
          const mergedKeys = [...new Set([...existing.keys, ...l.keys])];
          writeOps.push(
            prisma.lorebookEntry.update({
              where: { id: existing.id },
              data: { content: mergedContent, keys: mergedKeys },
            })
          );
          created.loreEntries++;
        } else {
          writeOps.push(
            prisma.lorebookEntry.create({
              data: toLorebookCreateParams(l, projectId),
            })
          );
          created.loreEntries++;
        }
      }
    }

    if (autoCreate && parsed.styleProfile) {
      writeOps.push(
        (async () => {
          await prisma.styleCard.deleteMany({ where: { projectId } });
          await prisma.styleCard.create({
            data: toStyleCardCreateParams(parsed.styleProfile!, projectId, 0),
          });
          created.styleCard = true;
        })()
      );
    }

    await Promise.all(writeOps);

    if (parsed.synopsis || parsed.toneKeywords.length > 0) {
      const updateData: Record<string, unknown> = {};
      if (parsed.synopsis) updateData.synopsis = parsed.synopsis;
      if (parsed.toneKeywords.length > 0) updateData.toneKeywords = parsed.toneKeywords;
      await prisma.project.update({
        where: { id: projectId },
        data: updateData,
      });
    }

    syncGlobalPrompt(projectId).catch(() => {});

    return NextResponse.json({
      parsed,
      created,
      mode: "all",
    });
  } catch (err) {
    console.error("设定解析失败:", err);
    return jsonError(err);
  }
}
