/**
 * 实体颜色高亮引擎（客户端安全——不导入 prisma）
 *
 * 通过 API 获取项目实体数据，构建 实体名 → {类型, 颜色} 映射表。
 */

// ═══════════════════════════════════════════
// 颜色表
// ═══════════════════════════════════════════

export const CHARACTER_COLOR = "#5B9BD5"; // 🔵 柔蓝 — 水墨远山，不刺眼

/** 词条分类 → 颜色（低饱和度，暗色背景适配） */
export const LORE_COLORS: Record<string, string> = {
  faction:      "#70AD47", // 🟢 苔绿 — 沉稳不跳脱
  item:         "#D4A017", // 🟡 暗金 — 低调显贵重
  geography:    "#C55A11", // 🟠 赭石 — 大地感
  magic_system: "#9B59B6", // 🟣 淡紫 — 神秘不过分
  technique:    "#D64545", // 🔴 暗红 — 功法标识
  creature:     "#C77D9F", // 🩷 灰粉 — 柔和生物感
  culture:      "#5DA89B", // 🩵 灰青 — 文化底蕴
  history:      "#7B8CC4", // 🔷 灰蓝 — 历史沉淀
  law:          "#D4952A", // 🟠 古铜 — 法则庄重
  currency:     "#8CAD45", // 🟢 灰绿 — 货币雅致
  custom:       "#8B8B8B", // ⚫ 中灰 — 自定义低调
};

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface EntityHighlight {
  name: string;
  color: string;
  type: "character" | "lorebook";
  category?: string;
}

/** API 返回的实体原始数据 */
interface EntityRaw {
  name: string;
  type: "character" | "lorebook";
  color: string;
  category?: string;
}

// ═══════════════════════════════════════════
// 构建映射
// ═══════════════════════════════════════════

/**
 * 从 API 原始数据构建实体映射 Map。
 * 词条 title 覆盖同名字符，触发词不覆盖已有实体。
 */
export function buildEntityMapFromData(data: EntityRaw[]): Map<string, EntityHighlight> {
  const map = new Map<string, EntityHighlight>();

  // 第一遍：角色
  for (const e of data) {
    if (e.type === "character") {
      map.set(e.name, { name: e.name, color: e.color, type: "character" });
    }
  }

  // 第二遍：词条 title（覆盖同名角色）
  for (const e of data) {
    if (e.type === "lorebook") {
      map.set(e.name, { name: e.name, color: e.color, type: "lorebook", category: e.category });
    }
  }

  return map;
}

// ═══════════════════════════════════════════
// 获取（带内存缓存）
// ═══════════════════════════════════════════

const cache = new Map<string, { map: Map<string, EntityHighlight>; ts: number }>();
const CACHE_TTL = 60_000; // 1 分钟

/**
 * 通过 API 获取项目的实体高亮映射表。
 * 浏览器端调用，1 分钟内存缓存。
 */
export async function getEntityMap(projectId: string): Promise<Map<string, EntityHighlight>> {
  const cached = cache.get(projectId);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    return cached.map;
  }

  const res = await fetch(`/api/entities/highlight?projectId=${encodeURIComponent(projectId)}`);
  if (!res.ok) {
    console.error("实体高亮 API 失败:", res.status);
    return new Map();
  }

  const json = await res.json();
  const map = buildEntityMapFromData(json.entities || []);
  cache.set(projectId, { map, ts: Date.now() });
  return map;
}

export function invalidateEntityCache(projectId: string) {
  cache.delete(projectId);
}

/**
 * 获取分类对应的颜色
 */
export function getCategoryColor(category: string): string {
  return LORE_COLORS[category] || "#6b7280";
}

// ═══════════════════════════════════════════
// 文本扫描——共享给 rehype 插件和实体面板
// ═══════════════════════════════════════════

export interface EntityMatch {
  name: string;
  color: string;
  type: "character" | "lorebook";
  category?: string;
  start: number;
  end: number;
}

/**
 * 在文本中查找所有实体匹配。
 * 最长名优先，已占用的字符区间不重复匹配。
 * 仅匹配词边界（前后是标点/空格/开头/结尾），3字以上名放宽边界。
 */
export function findEntitiesInText(
  text: string,
  entityMap: Map<string, EntityHighlight>,
): EntityMatch[] {
  const sorted = Array.from(entityMap.entries())
    .filter(([name]) => name.length >= 2)
    .sort((a, b) => b[0].length - a[0].length);

  const occupied = new Array(text.length).fill(false);
  const matches: EntityMatch[] = [];

  for (const [name, entity] of sorted) {
    let pos = 0;
    while (pos < text.length) {
      const idx = text.indexOf(name, pos);
      if (idx === -1) break;

      const end = idx + name.length;
      const isOccupied = occupied.slice(idx, end).some(Boolean);

      if (!isOccupied) {
        const nextChar = text[end];
        const prevChar = text[idx - 1];
        const isWordBoundary =
          (!prevChar || /[\s，。！？、；：""''（）【】《》\-\—]/.test(prevChar)) &&
          (!nextChar || /[\s，。！？、；：""''（）【】《》\-\—]/.test(nextChar));

        if (isWordBoundary || name.length >= 3) {
          matches.push({ name, color: entity.color, type: entity.type, category: entity.category, start: idx, end });
          for (let i = idx; i < end; i++) occupied[i] = true;
        }
      }

      pos = idx + 1;
    }
  }

  return matches;
}
