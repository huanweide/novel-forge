/**
 * 实体颜色高亮引擎（客户端安全——不导入 prisma）
 *
 * 通过 API 获取项目实体数据，构建 实体名 → {类型, 颜色} 映射表。
 *
 * 颜色为「按分类固定色」，单一来源在此文件：
 *   - CHARACTER_COLOR    角色卡固定色（醒目橙）
 *   - LORE_COLORS        世界书各分类固定色（高对比、暗背景醒目）
 * API route、正文高亮 span、表头图例三者共用，避免配色漂移。
 */

// ═══════════════════════════════════════════
// 颜色表（固定色 · 单一来源）
// ═══════════════════════════════════════════

export const CHARACTER_COLOR = "#F97316"; // 🟠 鲜橙 — 角色卡固定标注色，醒目且暗背景对比达标

/** 词条分类 → 颜色（高对比、暗色背景醒目，彼此区分度高） */
export const LORE_COLORS: Record<string, string> = {
  faction:      "#22C55E", // 🟢 鲜绿 — 势力
  item:         "#FACC15", // 🟡 亮金 — 物品
  geography:    "#38BDF8", // 🔵 天蓝 — 地点
  magic_system: "#A855F7", // 🟣 紫   — 法术体系
  technique:    "#EF4444", // 🔴 红   — 功法
  creature:     "#EC4899", // 🩷 粉   — 生灵
  culture:      "#14B8A6", // 🩵 青   — 文化
  history:      "#818CF8", // 🔷 靛   — 历史
  law:          "#F59E0B", // 🟠 琥珀 — 法则
  currency:     "#BEF264", // 🟢 柠檬绿 — 货币
  custom:       "#9CA3AF", // ⚫ 灰   — 自定义
};

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface EntityHighlight {
  name: string;
  color: string;
  type: "character" | "lorebook";
  category?: string;
  /** 实体 id（来自 API，用于正文点击跳转设定界面） */
  id?: string;
}

/** API 返回的实体原始数据 */
interface EntityRaw {
  name: string;
  type: "character" | "lorebook";
  color: string;
  category?: string;
  /** 实体 id（用于点击跳转） */
  id?: string;
  /** 别名列表（Q3：一并入 map，使别名也能高亮） */
  aliases?: string[];
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

  // 第一遍：角色（含别名）
  for (const e of data) {
    if (e.type === "character") {
      map.set(e.name, { name: e.name, color: e.color, type: "character", id: e.id });
      for (const al of e.aliases || []) {
        if (al && !map.has(al)) {
          map.set(al, { name: al, color: e.color, type: "character", id: e.id });
        }
      }
    }
  }

  // 第二遍：词条 title（覆盖同名角色；含别名）
  for (const e of data) {
    if (e.type === "lorebook") {
      map.set(e.name, { name: e.name, color: e.color, type: "lorebook", category: e.category, id: e.id });
      for (const al of e.aliases || []) {
        if (al && !map.has(al)) {
          map.set(al, { name: al, color: e.color, type: "lorebook", category: e.category, id: e.id });
        }
      }
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
  /** 实体 id（用于正文点击跳转） */
  id?: string;
  start: number;
  end: number;
}

// v0.46.58：常见泛化词停用表——这些词即使被注册成实体名也绝不参与高亮
// （防止「她/什么/现在」这类高频词把正文染得满屏色块，产生莫名其妙的误判）。
// 注意：完整词条名如「世界卡」「角色卡」不在表内，正常高亮。
const COMMON_STOP_WORDS = new Set([
  // 单字：代词/助词/介词/高频虚词
  "我", "你", "他", "她", "它", "们", "这", "那", "哪", "谁", "的", "了", "是",
  "在", "有", "和", "就", "都", "而", "及", "与", "或", "把", "被", "让", "从",
  "到", "去", "来", "说", "想", "看", "走", "回", "着", "过", "吧", "吗", "呢",
  "啊", "呀", "哦", "嗯", "哎", "不", "没", "也", "又", "再", "很", "太", "真",
  // 双字极泛化（作为实体 key 时几乎必误判）
  "什么", "怎么", "没有", "不是", "但是", "因为", "所以", "如果", "然后", "现在",
  "今天", "明天", "昨天", "时候", "地方", "东西", "这个", "那个", "一个", "他们",
  "她们", "我们", "你们", "自己", "已经", "还是", "只是", "就是", "可以", "知道",
  "觉得", "感觉", "忽然", "突然", "最后", "开始", "结束", "事情", "时候", "面前",
  "背后", "旁边", "里面", "外面", "上面", "下面", "身上", "手里", "眼前",
]);

/**
 * 在文本中查找所有实体匹配。
 * 最长名优先，已占用的字符区间不重复匹配。
 * 仅匹配词边界（前后是标点/空格/开头/结尾），3字以上名放宽边界。
 * v0.46.58：停用词表中的名字不参与匹配；2字名必须是完整词边界（严格模式）。
 */
export function findEntitiesInText(
  text: string,
  entityMap: Map<string, EntityHighlight>,
): EntityMatch[] {
  const names = Array.from(entityMap.entries())
    .filter(([name]) => name.length >= 2 && !COMMON_STOP_WORDS.has(name))
    .sort((a, b) => b[0].length - a[0].length)
    .map(([name]) => name);

  if (names.length === 0) return [];

  // 单遍正则扫描：收集所有候选（含重叠），复杂度 O(L + 命中数)，
  // 取代原先「逐实体名 × 逐处 indexOf + 占用切片」的 O(N·L)（清览 P1）。
  const escaped = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // 长名排在前 → 同一位置正则优先匹配更长的名；为捕获被更长名覆盖的较短名，
  // 收集候选时每次仅前进一步（lastIndex = idx+1），确保重叠候选全部入围（清览 P0-1 修复）。
  const regex = new RegExp("(" + escaped.join("|") + ")", "g");
  const byName = new Map(names.map((n) => [n, entityMap.get(n)!]));

  // 1) 收集所有候选（含重叠）：每个匹配位置仅前进一步，捕获「李星云剑法」中夹着的「星云剑法」。
  const candidates: { name: string; idx: number; end: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    const name = m[0];
    const idx = m.index;
    candidates.push({ name, idx, end: idx + name.length });
    regex.lastIndex = idx + 1;
  }

  // 2) 最长名优先 + 左优先：降序排长度，等长按 idx 升序。
  candidates.sort((a, b) => b.name.length - a.name.length || a.idx - b.idx);

  // 3) 贪心占用：长名先占区间，短名若落在已占区间则跳过（最长名优先，清览 P0-1）。
  const occupied = new Array(text.length).fill(false);
  const matches: EntityMatch[] = [];
  for (const c of candidates) {
    if (occupied.slice(c.idx, c.end).some(Boolean)) continue;
    const prevChar = text[c.idx - 1];
    // 头边界字符集：空白/标点/省略号/间隔号 + 连词 + 常见介词（在/于/为/从/到/让/使/叫…），
    // 补全介词后「在萧炎」「于萧炎」等前置场景也能高亮 2字名（Round6 P1）。
    const isHeadBoundary = !prevChar || /[\s，。！？、；：""''「」『』（）【】《》\-\—……·与和跟同及等把被给向对由的在於为从到让使叫,.!?]/.test(prevChar);
    // 头边界必查（防片段误当实体）；3 字及以上不查边界（清览 P1）。
    // 2 字名（如「王林」）：除头边界外，额外校验尾边界——尾处字符为边界或非 CJK 汉字才匹配，
    // 否则「王林」会在「王林海」中被误亮（Q3 青览 B3）。
    let passesBoundary: boolean;
    if (c.name.length >= 3) {
      passesBoundary = true;
    } else {
      const tailChar = text[c.end];
      const tailOk = !tailChar || !/[一-鿿]/.test(tailChar); // 尾处为边界（文末/非CJK）才放行
      passesBoundary = isHeadBoundary && tailOk;
    }
    if (!passesBoundary) continue;
    const entity = byName.get(c.name)!;
    matches.push({ name: c.name, color: entity.color, type: entity.type, category: entity.category, id: entity.id, start: c.idx, end: c.end });
    for (let i = c.idx; i < c.end; i++) occupied[i] = true;
  }

  // 按出现顺序输出（前端高亮依赖 start 升序）
  matches.sort((a, b) => a.start - b.start);
  return matches;
}

// ═══════════════════════════════════════════
// 固定色图例（表头颜色说明：角色 + 世界书各分类）
// 单一来源——API、正文高亮、图例三处共用上面的常量
// ═══════════════════════════════════════════

/** 表头图例条目：{ 语义键, 中文标签, 固定色 } */
export const ENTITY_LEGEND: Array<{ key: string; label: string; color: string }> = [
  { key: "character", label: "角色", color: CHARACTER_COLOR },
  { key: "faction", label: "势力", color: LORE_COLORS.faction },
  { key: "item", label: "物品", color: LORE_COLORS.item },
  { key: "geography", label: "地点", color: LORE_COLORS.geography },
  { key: "magic_system", label: "法术", color: LORE_COLORS.magic_system },
  { key: "technique", label: "功法", color: LORE_COLORS.technique },
  { key: "creature", label: "生灵", color: LORE_COLORS.creature },
  { key: "culture", label: "文化", color: LORE_COLORS.culture },
  { key: "history", label: "历史", color: LORE_COLORS.history },
  { key: "law", label: "法则", color: LORE_COLORS.law },
  { key: "currency", label: "货币", color: LORE_COLORS.currency },
  { key: "custom", label: "自定义", color: LORE_COLORS.custom },
];
