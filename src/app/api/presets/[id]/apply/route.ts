import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export const maxDuration = 60;

// POST /api/presets/[id]/apply  { projectId }
// 把预设内容落到项目：
//   表格模板 → 建 LoreTable；文风 → 建/改 StyleCard；
//   世界观/剧情推进/世界书 → 建 LorebookEntry；角色卡 → 建 CharacterCard；
//   正则(regex) → 写入 Project.postProcessingRules；
//   API参数(api_config) → 合并到 Project.llmConfig；
// 并累加下载数。
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
      // U2：按 projectId+category+title 去重，重复套用则更新覆盖内容而非叠加重复词条
      const entries: any[] = content.entries || [];
      const cat = preset.type === "worldview" ? "worldview" : "story_progression";
      for (const e of entries) {
        const title = e.title || "未命名词条";
        const existing = await prisma.lorebookEntry.findFirst({ where: { projectId, category: cat, title } });
        if (existing) {
          const le = await prisma.lorebookEntry.update({
            where: { id: existing.id },
            data: { content: e.content || "", keys: e.keys || [], depth: e.depth ?? 3, enabled: true } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title, updated: true });
        } else {
          const le = await prisma.lorebookEntry.create({
            data: {
              projectId,
              title,
              category: cat,
              content: e.content || "",
              keys: e.keys || [],
              depth: e.depth ?? 3,
              enabled: true,
            } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title });
        }
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
    } else if (preset.type === "regex") {
      // 正则后处理预设：合并 rules 到项目级 postProcessingRules，按 name 去重
      const incoming: any[] = Array.isArray(content.rules) ? content.rules : [];
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const existing: any[] = Array.isArray((project as any)?.postProcessingRules)
        ? ((project as any).postProcessingRules as any[])
        : [];
      const existingNames = new Set(existing.map((r) => r.name));
      const merged = [...existing];
      for (const r of incoming) {
        if (!r.name || !r.pattern) continue;
        if (existingNames.has(r.name)) {
          // 同名更新
          const idx = merged.findIndex((x) => x.name === r.name);
          if (idx >= 0) merged[idx] = r;
        } else {
          merged.push(r);
          existingNames.add(r.name);
        }
      }
      await prisma.project.update({
        where: { id: projectId },
        data: { postProcessingRules: merged as any },
      });
      created.push({ kind: "regex", name: `正则规则×${incoming.filter((r) => r.name && r.pattern).length}` });
    } else if (preset.type === "lorebook") {
      // 世界书预设：与 worldview/story_progression 共用 LorebookEntry，category=lorebook
      // U2：按 projectId+category+title 去重，重复套用则更新覆盖内容而非叠加重复词条
      const entries: any[] = content.entries || [];
      for (const e of entries) {
        const title = e.title || "未命名词条";
        const existing = await prisma.lorebookEntry.findFirst({ where: { projectId, category: "lorebook", title } });
        if (existing) {
          const le = await prisma.lorebookEntry.update({
            where: { id: existing.id },
            data: { content: e.content || "", keys: e.keys || [], depth: e.depth ?? 3, enabled: true } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title, updated: true });
        } else {
          const le = await prisma.lorebookEntry.create({
            data: {
              projectId,
              title,
              category: "lorebook",
              content: e.content || "",
              keys: e.keys || [],
              depth: e.depth ?? 3,
              enabled: true,
            } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title });
        }
      }
    } else if (preset.type === "api_config") {
      // API 参数预设：合并到项目 llmConfig（覆盖温度/topP/模型模板等）
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const current = ((project as any)?.llmConfig || {}) as Record<string, unknown>;
      const merged = { ...current, ...content };
      await prisma.project.update({
        where: { id: projectId },
        data: { llmConfig: merged as any },
      });
      created.push({ kind: "api_config", name: `API参数:${(content.model || content.temperature) ?? "覆盖"}` });
    }

    // —— F5：记录已应用预设到 project.appliedPresets（配置中心追踪/移除用）——
    try {
      const projectRec = await prisma.project.findUnique({ where: { id: projectId } });
      const list: any[] = Array.isArray((projectRec as any)?.appliedPresets)
        ? ((projectRec as any).appliedPresets as any[])
        : [];
      const filtered = list.filter((p: any) => p.presetId !== id);
      const rec: any = {
        presetId: id,
        type: preset.type,
        title: preset.title,
        appliedAt: new Date().toISOString(),
      };
      if (preset.type === "regex") {
        rec.ruleNames = (Array.isArray(content.rules) ? content.rules : [])
          .filter((r: any) => r.name && r.pattern)
          .map((r: any) => r.name);
      }
      if (preset.type === "api_config") {
        rec.configKeys = Object.keys(content || {});
      }
      filtered.push(rec);
      await prisma.project.update({
        where: { id: projectId },
        data: { appliedPresets: filtered as any },
      });
    } catch (e) {
      console.error("[apply] 记录 appliedPresets 失败:", e instanceof Error ? e.message : String(e));
    }

    // 应用预设后刷新全局提示词，使文风/世界观/角色等立即对生成生效
    // （对齐工具栏切文风的行为；之前漏调导致创意工坊套用文风不生效）
    syncGlobalPrompt(projectId).catch((e) =>
      console.error("[apply] globalPrompt 刷新失败:", e instanceof Error ? e.message : String(e)),
    );

    await prisma.preset.update({ where: { id }, data: { downloads: { increment: 1 } } });
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "应用失败" }, { status: 500 });
  }
}
