/**
 * GET /api/entities/highlight?projectId=X
 *
 * 返回项目中所有可高亮实体（角色+世界书词条）的 名→颜色 映射。
 * MarkdownViewer 客户端通过此 API 获取实体数据。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api-error";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const [characters, loreEntries] = await Promise.all([
      prisma.characterCard.findMany({
        where: { projectId },
        select: { id: true, name: true, aliases: true, role: true },
      }),
      prisma.lorebookEntry.findMany({
        where: { projectId, enabled: true },
        select: { id: true, title: true, category: true, keys: true },
      }),
    ]);

    const entities: Array<{
      id: string;
      name: string;
      type: "character" | "lorebook";
      color: string;
      category?: string;
    }> = [];

    const CHARACTER_COLOR = "#5B9BD5";
    const LORE_COLORS: Record<string, string> = {
      faction: "#70AD47", item: "#D4A017", geography: "#C55A11",
      magic_system: "#9B59B6", technique: "#D64545", creature: "#C77D9F",
      culture: "#5DA89B", history: "#7B8CC4", law: "#D4952A",
      currency: "#8CAD45", custom: "#8B8B8B",
    };

    // 角色（含别名，指向同一 id，便于章节内实体徽章跳转详情）
    for (const c of characters) {
      entities.push({ id: c.id, name: c.name, type: "character", color: CHARACTER_COLOR });
      for (const alias of c.aliases || []) {
        if (alias) entities.push({ id: c.id, name: alias, type: "character", color: CHARACTER_COLOR });
      }
    }

    // 世界书词条（title 优先，覆盖同名角色）
    const seenLore = new Set<string>();
    for (const e of loreEntries) {
      const color = LORE_COLORS[e.category] || "#6b7280";
      if (!seenLore.has(e.title)) {
        seenLore.add(e.title);
        entities.push({ id: e.id, name: e.title, type: "lorebook", color, category: e.category });
      }
      for (const key of e.keys || []) {
        if (key && !seenLore.has(key)) {
          seenLore.add(key);
          entities.push({ id: e.id, name: key, type: "lorebook", color, category: e.category });
        }
      }
    }

    return NextResponse.json({ entities });
  } catch (err) {
    console.error("实体高亮数据加载失败:", err);
    return jsonError(err);
  }
}
