import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 60;

// POST /api/presets/[id]/apply  { projectId }
// 把预设内容落到项目：表格模板→建 LoreTable；文风→建/改 StyleCard；
// 世界观/剧情推进→建 LorebookEntry；角色卡→建 CharacterCard。并累加下载数。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { projectId } = (await request.json()) as any;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });

    const content: any = preset.content || {};
    const created: any[] = [];

    if (preset.type === "table_template") {
      const tables: any[] = content.tables || [];
      for (const t of tables) {
        const exists = await prisma.loreTable.findFirst({ where: { projectId, key: t.key } });
        if (exists) continue;
        const lt = await prisma.loreTable.create({
          data: {
            projectId,
            name: t.name,
            key: t.key,
            note: t.note || "",
            category: t.category || "custom",
            columns: t.columns || [],
            rows: t.rows || [],
            marker: `[ACU-${projectId}]`,
          } as any,
        });
        created.push({ kind: "table", id: lt.id, name: lt.name });
      }
    } else if (preset.type === "style") {
      const existing = await prisma.styleCard.findFirst({ where: { projectId } });
      const data = {
        projectId,
        styleDescription: content.styleDescription || "",
        povType: content.povType || "third_person_limited",
        avgSentenceLength: content.avgSentenceLength ?? 25,
        shortSentenceRatio: content.shortSentenceRatio ?? 0.3,
        longSentenceRatio: content.longSentenceRatio ?? 0.15,
        dialogueRatio: content.dialogueRatio ?? 0.35,
        descriptionRatio: content.descriptionRatio ?? 0.25,
        actionRatio: content.actionRatio ?? 0.25,
        innerThoughtRatio: content.innerThoughtRatio ?? 0.15,
        tonalMarkers: content.tonalMarkers || {},
        lexicalFeatures: content.lexicalFeatures || {},
        sampleText: content.sampleText || null,
      } as any;
      if (existing) {
        await prisma.styleCard.update({ where: { id: existing.id }, data });
        created.push({ kind: "style", id: existing.id, name: "文风卡" });
      } else {
        const sc = await prisma.styleCard.create({ data });
        created.push({ kind: "style", id: sc.id, name: "文风卡" });
      }
    } else if (preset.type === "worldview" || preset.type === "story_progression") {
      const entries: any[] = content.entries || [];
      const cat = preset.type === "worldview" ? "worldview" : "story_progression";
      for (const e of entries) {
        const le = await prisma.lorebookEntry.create({
          data: {
            projectId,
            title: e.title,
            category: cat,
            content: e.content || "",
            keys: e.keys || [],
            enabled: true,
          } as any,
        });
        created.push({ kind: "lorebook", id: le.id, name: e.title });
      }
    } else if (preset.type === "character") {
      const c = content;
      const cc = await prisma.characterCard.create({
        data: {
          projectId,
          name: c.name || "未命名角色",
          role: c.role || "supporting",
          background: c.background || "",
          personality: c.personality || {},
          appearance: c.appearance || {},
          tags: c.tags || [],
        } as any,
      });
      created.push({ kind: "character", id: cc.id, name: cc.name });
    }

    await prisma.preset.update({ where: { id }, data: { downloads: { increment: 1 } } });
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "应用失败" }, { status: 500 });
  }
}
