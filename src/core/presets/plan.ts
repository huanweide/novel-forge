// 预设注入「计划」——只读计算，不写库。
// 关键设计：应用（真实执行）与预览（dryRun）共用同一份计划，
// 保证「预览说会注入 3 条，实际绝不会注入 5 条」，且计划自带更新前快照供撤销还原。

import { isLikelyUnsafeRegex } from "@/core/post-process/regex";
import {
  LLM_CONFIG_KEYS,
  deepMergeLLMConfig,
  isPlainObject,
  snapshotLLMConfigBefore,
} from "./llm-config";

export const PRESET_TYPES = [
  "table_template",
  "style",
  "worldview",
  "story_progression",
  "character",
  "regex",
  "lorebook",
  "api_config",
] as const;
export type PresetType = (typeof PRESET_TYPES)[number];

export type PlanKind = "table" | "style" | "lorebook" | "character" | "regex" | "api_config";
export type PlanAction = "create" | "update" | "skip";

export interface PlanItem {
  kind: PlanKind;
  action: PlanAction;
  /** 展示名（表名 / 词条名 / 角色名 / 规则名） */
  name: string;
  /** 一句话说明，给确认弹窗用 */
  detail?: string;
  /** update/skip 时已存在实体的 id */
  id?: string;
  /** update 时的「更新前快照」，撤销时按 kind 解释并还原 */
  before?: unknown;
  /** create/update 要写入的数据 */
  payload?: unknown;
}

/** 只读查询所需的最小接口——单元测试可传内存 mock，不必连真实数据库 */
export interface PrismaPlanReader {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  loreTable: { findFirst(args: any): Promise<any> };
  styleCard: { findFirst(args: any): Promise<any> };
  lorebookEntry: { findFirst(args: any): Promise<any> };
  characterCard: { findFirst(args: any): Promise<any> };
  project: { findUnique(args: any): Promise<any> };
}

export class PresetPlanError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PresetPlanError";
    this.status = status;
  }
}

// ── 快照工具：撤销时按这些字段写回 ──────────────────────

const STYLE_FIELDS = [
  "styleDescription", "povType", "avgSentenceLength", "shortSentenceRatio",
  "longSentenceRatio", "dialogueRatio", "descriptionRatio", "actionRatio",
  "innerThoughtRatio", "tonalMarkers", "lexicalFeatures", "sampleText",
] as const;

export function pickStyleSnapshot(card: unknown): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  const c = (card || {}) as Record<string, unknown>;
  for (const f of STYLE_FIELDS) snap[f] = c[f] ?? null;
  return snap;
}

const LOREBOOK_FIELDS = ["content", "keys", "depth", "enabled"] as const;

export function pickLorebookSnapshot(entry: unknown): Record<string, unknown> {
  const snap: Record<string, unknown> = {};
  const e = (entry || {}) as Record<string, unknown>;
  for (const f of LOREBOOK_FIELDS) snap[f] = e[f] ?? null;
  return snap;
}

export function buildStylePayload(projectId: string, content: Record<string, unknown>) {
  return {
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
  };
}

/**
 * 计算把某个预设套用到某项目时「将要做什么」。
 * 只读，不产生任何副作用；抛 PresetPlanError 表示不可套用（未知类型 400 / 危险正则 422）。
 */
export async function computeApplyPlan(
  db: PrismaPlanReader,
  projectId: string,
  preset: { type: string; content: unknown },
): Promise<PlanItem[]> {
  const content = (preset.content || {}) as Record<string, unknown>;
  const plan: PlanItem[] = [];

  switch (preset.type) {
    case "table_template": {
      const tables = (Array.isArray(content.tables) ? content.tables : []) as Record<string, unknown>[];
      for (const t of tables) {
        const exists = (await db.loreTable.findFirst({
          where: { projectId, key: t.key },
        })) as { id: string } | null;
        if (exists) {
          plan.push({
            kind: "table", action: "skip",
            name: String(t.name || t.key || "未命名表"),
            id: exists.id,
            detail: `已存在同 key 表（${String(t.key)}），跳过`,
          });
          continue;
        }
        plan.push({
          kind: "table", action: "create",
          name: String(t.name || t.key || "未命名表"),
          detail: `${((t.columns as unknown[]) || []).length} 列 / ${((t.rows as unknown[]) || []).length} 行`,
          payload: {
            projectId,
            name: t.name,
            key: t.key,
            note: t.note || "",
            category: t.category || "custom",
            columns: t.columns || [],
            rows: t.rows || [],
            marker: `[ACU-${projectId}]`,
          },
        });
      }
      break;
    }

    case "style": {
      const existing = (await db.styleCard.findFirst({ where: { projectId } })) as { id: string } | null;
      const payload = buildStylePayload(projectId, content);
      if (existing) {
        plan.push({
          kind: "style", action: "update", name: "项目文风卡",
          id: existing.id,
          detail: "项目已有文风卡，将被覆盖（撤销可还原原值）",
          before: pickStyleSnapshot(existing),
          payload,
        });
      } else {
        plan.push({ kind: "style", action: "create", name: "项目文风卡", detail: "新建文风卡", payload });
      }
      break;
    }

    case "worldview":
    case "story_progression": {
      const cat = preset.type === "worldview" ? "worldview" : "story_progression";
      const entries = (Array.isArray(content.entries) ? content.entries : []) as Record<string, unknown>[];
      for (const e of entries) {
        const title = String(e.title || "未命名词条");
        const existing = (await db.lorebookEntry.findFirst({
          where: { projectId, category: cat, title },
        })) as { id: string } | null;
        const fields = {
          content: e.content || "",
          keys: e.keys || [],
          depth: e.depth ?? 3,
          enabled: true,
        };
        if (existing) {
          plan.push({
            kind: "lorebook", action: "update", name: title,
            id: existing.id,
            detail: "词条已存在，内容将被覆盖（撤销可还原原值）",
            before: pickLorebookSnapshot(existing),
            payload: fields,
          });
        } else {
          plan.push({
            kind: "lorebook", action: "create", name: title,
            detail: "新建词条",
            payload: { projectId, title, category: cat, ...fields },
          });
        }
      }
      break;
    }

    case "lorebook": {
      const entries = (Array.isArray(content.entries) ? content.entries : []) as Record<string, unknown>[];
      for (const e of entries) {
        const title = String(e.title || "未命名词条");
        const existing = (await db.lorebookEntry.findFirst({
          where: { projectId, category: "lorebook", title },
        })) as { id: string } | null;
        const fields = {
          content: e.content || "",
          keys: e.keys || [],
          depth: e.depth ?? 3,
          enabled: true,
        };
        if (existing) {
          plan.push({
            kind: "lorebook", action: "update", name: title,
            id: existing.id,
            detail: "词条已存在，内容将被覆盖（撤销可还原原值）",
            before: pickLorebookSnapshot(existing),
            payload: fields,
          });
        } else {
          plan.push({
            kind: "lorebook", action: "create", name: title,
            detail: "新建词条",
            payload: { projectId, title, category: "lorebook", ...fields },
          });
        }
      }
      break;
    }

    case "character": {
      const charName = String(content.name || "未命名角色");
      // P2-③：按 projectId+name 去重，重复套用不叠加同名卡
      const existing = (await db.characterCard.findFirst({
        where: { projectId, name: { equals: charName } },
      })) as { id: string } | null;
      if (existing) {
        plan.push({
          kind: "character", action: "skip", name: charName,
          id: existing.id,
          detail: "同名角色卡已存在，跳过（不会覆盖你的既有设定）",
        });
      } else {
        plan.push({
          kind: "character", action: "create", name: charName,
          detail: String(content.role || "supporting"),
          payload: {
            projectId,
            name: charName,
            role: content.role || "supporting",
            background: content.background || "",
            personality: content.personality || {},
            appearance: content.appearance || {},
            tags: content.tags || [],
          },
        });
      }
      break;
    }

    case "regex": {
      const incoming = (Array.isArray(content.rules) ? content.rules : []) as Record<string, unknown>[];
      // P2-② 前移校验：预设 regex 属外部/用户可控来源，落库前先做 ReDoS 预判，命中即拦截
      for (const r of incoming) {
        if (!r.pattern || typeof r.pattern !== "string") continue;
        const unsafe = isLikelyUnsafeRegex(String(r.pattern), String(r.flags || "g"));
        if (unsafe) {
          throw new PresetPlanError(
            `预设正则规则「${String(r.name || "(未命名规则)")}」存在灾难性回溯风险，已拒绝（${unsafe}），套用已中止`,
            422,
          );
        }
      }
      const project = (await db.project.findUnique({ where: { id: projectId } })) as {
        postProcessingRules?: unknown;
      } | null;
      const existingRules = (Array.isArray(project?.postProcessingRules)
        ? (project!.postProcessingRules as Record<string, unknown>[])
        : []);
      const byName = new Map<string, Record<string, unknown>>();
      for (const r of existingRules) {
        if (r && typeof r.name === "string") byName.set(r.name, r);
      }
      for (const r of incoming) {
        if (!r.name || !r.pattern) continue;
        const old = byName.get(String(r.name)) || null;
        plan.push({
          kind: "regex",
          action: old ? "update" : "create",
          name: String(r.name),
          detail: old ? "覆盖同名规则（撤销可还原原规则）" : "新增规则",
          before: old, // null = 原本没有，撤销时直接删
          payload: r,
        });
      }
      break;
    }

    case "api_config": {
      const project = (await db.project.findUnique({ where: { id: projectId } })) as {
        llmConfig?: unknown;
      } | null;
      const current = ((project?.llmConfig || {}) as Record<string, unknown>);
      const incoming = isPlainObject(content) ? content : {};
      const merged = deepMergeLLMConfig(current, incoming);
      const before = snapshotLLMConfigBefore(current, incoming);
      const validKeys = Object.keys(incoming).filter((k) => LLM_CONFIG_KEYS.has(k));
      plan.push({
        kind: "api_config",
        action: "update",
        name: "API 生成参数",
        detail: validKeys.length
          ? `${validKeys.length} 个配置项（${validKeys.join("、")}）`
          : "无白名单内的有效键，套用后配置不变",
        before,
        payload: merged,
      });
      break;
    }

    default:
      // N6：未知/新版本 type 穿透所有分支，杜绝静默 no-op
      throw new PresetPlanError(`未知预设类型: ${String(preset.type)}`, 400);
  }

  return plan;
}

/** 给确认弹窗用的汇总：各类条数 + 新建/覆盖/跳过计数 */
export function summarizePlan(plan: PlanItem[]) {
  const byKind: Record<string, number> = {};
  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of plan) {
    byKind[item.kind] = (byKind[item.kind] || 0) + 1;
    if (item.action === "create") created += 1;
    else if (item.action === "update") updated += 1;
    else skipped += 1;
  }
  return { total: plan.length, byKind, created, updated, skipped };
}
