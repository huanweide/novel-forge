// 按计划执行预设注入，并产出「可撤销凭证」。
// 凭证分两类：created = 本次新建的实体（撤销时删除）；updatedBefore = 被覆盖的旧值（撤销时还原）。
// 这样六类预设（table/style/lorebook/worldview/story_progression/character）全部可真撤销，
// 而不只是抹掉追踪记录。

import type { PlanItem, PlanKind } from "./plan";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface PrismaApplyWriter {
  loreTable: { create(args: any): Promise<any> };
  styleCard: {
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  lorebookEntry: {
    create(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
  characterCard: { create(args: any): Promise<any> };
  project: {
    findUnique(args: any): Promise<any>;
    update(args: any): Promise<any>;
  };
}

export interface AppliedCreated {
  kind: PlanKind;
  id: string;
  name: string;
}
export interface AppliedUpdated {
  kind: PlanKind;
  id: string;
  name: string;
  before: unknown;
}

export interface AppliedRecord {
  presetId: string;
  type: string;
  title: string;
  appliedAt: string;
  created: AppliedCreated[];
  updatedBefore: AppliedUpdated[];
  /** 兼容旧版撤销端点（老记录只认这两个字段） */
  ruleNames?: string[];
  configKeys?: string[];
}

export async function executeApplyPlan(
  db: PrismaApplyWriter,
  projectId: string,
  preset: { id: string; type: string; title: string },
  plan: PlanItem[],
): Promise<AppliedRecord> {
  const created: AppliedCreated[] = [];
  const updatedBefore: AppliedUpdated[] = [];

  // ── 逐条实体：建表 / 建改文风卡 / 建改词条 / 建角色卡 ──
  for (const item of plan) {
    if (item.action === "skip") continue;

    if (item.kind === "table" && item.action === "create") {
      const rec = await db.loreTable.create({ data: item.payload });
      created.push({ kind: "table", id: rec.id, name: item.name });
    } else if (item.kind === "style") {
      if (item.action === "create") {
        const rec = await db.styleCard.create({ data: item.payload });
        created.push({ kind: "style", id: rec.id, name: item.name });
      } else if (item.action === "update" && item.id) {
        await db.styleCard.update({ where: { id: item.id }, data: item.payload });
        updatedBefore.push({ kind: "style", id: item.id, name: item.name, before: item.before });
      }
    } else if (item.kind === "lorebook") {
      if (item.action === "create") {
        const rec = await db.lorebookEntry.create({ data: item.payload });
        created.push({ kind: "lorebook", id: rec.id, name: item.name });
      } else if (item.action === "update" && item.id) {
        await db.lorebookEntry.update({ where: { id: item.id }, data: item.payload });
        updatedBefore.push({ kind: "lorebook", id: item.id, name: item.name, before: item.before });
      }
    } else if (item.kind === "character" && item.action === "create") {
      const rec = await db.characterCard.create({ data: item.payload });
      created.push({ kind: "character", id: rec.id, name: item.name });
    }
    // regex / api_config 是项目级字段，统一在下面批量写，避免逐条重复 update project
  }

  // ── regex：读现有规则 → 按计划合并 → 一次性写回 ──
  const regexItems = plan.filter((i) => i.kind === "regex" && i.action !== "skip");
  if (regexItems.length) {
    const project = await db.project.findUnique({ where: { id: projectId } });
    const current = (Array.isArray(project?.postProcessingRules)
      ? [...(project!.postProcessingRules as Record<string, unknown>[])]
      : []);
    for (const item of regexItems) {
      const rule = item.payload as Record<string, unknown>;
      const name = String(rule?.name ?? "");
      if (!name) continue;
      const idx = current.findIndex((r) => r && r.name === name);
      if (idx >= 0) {
        current[idx] = rule;
        updatedBefore.push({ kind: "regex", id: name, name, before: item.before ?? null });
      } else {
        current.push(rule);
        created.push({ kind: "regex", id: name, name });
      }
    }
    await db.project.update({ where: { id: projectId }, data: { postProcessingRules: current } });
  }

  // ── api_config：整份 merged 配置写回 ──
  const apiItem = plan.find((i) => i.kind === "api_config" && i.action !== "skip");
  if (apiItem) {
    await db.project.update({ where: { id: projectId }, data: { llmConfig: apiItem.payload } });
    updatedBefore.push({
      kind: "api_config",
      id: "llmConfig",
      name: apiItem.name,
      before: apiItem.before,
    });
  }

  const record: AppliedRecord = {
    presetId: preset.id,
    type: preset.type,
    title: preset.title,
    appliedAt: new Date().toISOString(),
    created,
    updatedBefore,
  };

  // 兼容旧版撤销端点：老逻辑只认 ruleNames / configKeys
  const ruleNames = created.filter((c) => c.kind === "regex").map((c) => c.name);
  if (ruleNames.length) record.ruleNames = ruleNames;
  if (apiItem) {
    const before = (apiItem.before || {}) as { values?: Record<string, unknown>; addedKeys?: string[] };
    record.configKeys = [
      ...Object.keys(before.values || {}),
      ...(before.addedKeys || []),
    ];
  }

  return record;
}
