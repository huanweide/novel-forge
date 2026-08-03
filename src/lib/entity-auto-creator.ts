/**
 * 实体自动创建器 —— 蒸馏发现的新实体自动入库
 *
 * 1.3 数据反哺：本地蒸馏检测到的新实体（置信度 ≥ 0.7）
 * 自动写入 CharacterCard（角色）或 LorebookEntry（物品/地点/功法/材料）。
 *
 * 查重：大小写不敏感对比已有角色名 + 世界书标题；v0.46.63 增加相似度去重
 * （编辑距离 ≤ 1 + 长度相近，灭掉「青龙镇/青龍镇」这类繁简/错别字变体重复入库）。
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

// ─── 相似度去重 ──────────────────────────────────────────────

/** 编辑距离（Levenshtein），用于识别繁简/错别字变体 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/**
 * 判断两个名称是否「高度相似、疑似同一实体的变体」。
 * 规则：忽略大小写后
 *  - 完全相同 → 是
 *  - 长度差 > 2 → 否（明显不同实体）
 *  - 短名（任一 ≤2 字）要求完全一致——避免「白云/白衣」这类完全不同词被误并；
 *  - 长名（≥3 字）编辑距离 ≤ 1 → 是（灭繁简/错别字，如 青龙镇/青龍镇、李尘/李麈）
 */
export function isSimilarName(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 2) return false;
  // 短名过宽：仅允许精确匹配（宁可漏判「李尘/李麈」这类 2 字变体，也不误并「白云/白衣」）
  if (x.length <= 2 || y.length <= 2) return false;
  return levenshtein(x, y) <= 1;
}

// ─── 主函数 ──────────────────────────────────────────────────

/**
 * 自动创建蒸馏发现的新实体。
 *
 * - 角色 → CharacterCard（role: "supporting"，标记 🆕自动发现）
 * - 地点/丹药/法宝/功法/材料 → LorebookEntry（对应 category + entityType 记录在 keys 中）
 *
 * 查重策略：大小写不敏感精确匹配 + 相似度去重（灭繁简/错别字变体）。
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
  // 相似度比对用的原始名单（保留原始大小写，仅用于变体判定）
  const existingNameList = [
    ...existingChars.map((c) => c.name),
    ...existingLore.map((l) => l.title),
  ];

  const created: AutoCreateResult["created"] = [];
  const skipped: string[] = [];

  for (const entity of newEntities) {
    const name = entity.name.trim();
    if (!name || name.length < 2) continue;

    // 去重：精确（大小写不敏感）
    if (existingNames.has(name.toLowerCase())) {
      skipped.push(name);
      continue;
    }
    // 去重：相似度（繁简/错别字变体）
    const similar = existingNameList.find((en) => isSimilarName(en, name));
    if (similar) {
      skipped.push(name);
      continue;
    }
    // 标记为已存在，避免同一批次内的重复
    existingNames.add(name.toLowerCase());
    existingNameList.push(name);

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
