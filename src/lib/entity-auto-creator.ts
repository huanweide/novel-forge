/**
 * 实体自动创建器 —— 蒸馏发现的新实体自动入库
 *
 * 1.3 数据反哺：本地蒸馏检测到的新实体（置信度 ≥ 0.7）
 * 自动写入 CharacterCard（角色）或 LorebookEntry（物品/地点/功法/材料）。
 *
 * 查重：大小写不敏感对比已有角色名 + 世界书标题。
 */

import { prisma } from "@/lib/prisma";
import type { DetectedEntity } from "./entity-detector";

// ─── 类型定义 ────────────────────────────────────────────────

export interface AutoCreateResult {
  created: Array<{
    type: "character" | "lorebook";
    id: string;
    name: string;
    category: string;
  }>;
  skipped: string[]; // 因重复跳过的实体名
}

// ─── 实体类型 → Lorebook category 映射 ──────────────────────

const ENTITY_TYPE_TO_CATEGORY: Record<string, string> = {
  pill: "item",
  artifact: "item",
  technique: "technique",
  location: "geography",
  material: "item",
  // character 走 CharacterCard，不走 LorebookEntry
};

// ─── 实体类型中文标签 ──────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  pill: "丹药",
  artifact: "法宝",
  technique: "功法",
  location: "地点",
  material: "材料",
  character: "角色",
};

// ─── 主函数 ──────────────────────────────────────────────────

/**
 * 自动创建蒸馏发现的新实体。
 *
 * - 角色 → CharacterCard（role: "supporting"，标记 🆕自动发现）
 * - 地点/丹药/法宝/功法/材料 → LorebookEntry（对应 category + entityType 记录在 keys 中）
 *
 * 查重策略：大小写不敏感，同时对比 CharacterCard.name 和 LorebookEntry.title。
 *
 * @returns 创建结果——包含成功创建的实体列表和因重复跳过的名称列表
 */
export async function autoCreateEntities(
  newEntities: DetectedEntity[],
  projectId: string,
  sourceNodeId: string,
): Promise<AutoCreateResult> {
  if (newEntities.length === 0) return { created: [], skipped: [] };

  // ── 查重：一次性拉取所有已有角色名 + 世界书标题 ──
  const [existingChars, existingLore] = await Promise.all([
    prisma.characterCard.findMany({
      where: { projectId },
      select: { name: true },
    }),
    prisma.lorebookEntry.findMany({
      where: { projectId },
      select: { title: true },
    }),
  ]);

  const existingNames = new Set([
    ...existingChars.map((c) => c.name.toLowerCase()),
    ...existingLore.map((l) => l.title.toLowerCase()),
  ]);

  const created: AutoCreateResult["created"] = [];
  const skipped: string[] = [];

  for (const entity of newEntities) {
    const name = entity.name.trim();
    if (!name || name.length < 2) continue;

    // 去重
    if (existingNames.has(name.toLowerCase())) {
      skipped.push(name);
      continue;
    }
    // 标记为已存在，避免同一批次内的重复
    existingNames.add(name.toLowerCase());

    try {
      if (entity.type === "character") {
        // ── 创建角色卡 ──
        const card = await prisma.characterCard.create({
          data: {
            projectId,
            name,
            role: "supporting",
            personality: { dominant: "自动发现，待丰富" } as any,
            background: `[第${sourceNodeId}章自动发现]`,
            abilities: [],
            tags: ["🆕 自动发现"],
            currentStatus: "alive",
          } as any,
        });
        created.push({
          type: "character",
          id: card.id,
          name,
          category: "character",
        });
      } else {
        // ── 创建世界书词条 ──
        const category = ENTITY_TYPE_TO_CATEGORY[entity.type] || "custom";
        const label = TYPE_LABELS[entity.type] || entity.type;

        const entry = await prisma.lorebookEntry.create({
          data: {
            projectId,
            title: name,
            category,
            keys: [name, label, entity.type],
            content: `[自动发现] ${label}「${name}」，待补充设定。`,
            insertionOrder: 50,
            enabled: true,
            relatedEntryIds: [],
          },
        });
        created.push({
          type: "lorebook",
          id: entry.id,
          name,
          category,
        });
      }
    } catch {
      // 单个实体创建失败不阻塞整体流程
      skipped.push(name);
    }
  }

  return { created, skipped };
}
