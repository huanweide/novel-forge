/**
 * 实体自动创建器 —— 蒸馏发现的新实体自动入库
 *
 * 1.3 数据反哺：本地蒸馏检测到的新实体（置信度 ≥ 0.7）
 * 自动写入 CharacterCard（角色）或 LorebookEntry（物品/地点/功法/材料）。
 *
 * 查重：大小写不敏感对比已有角色名 + 世界书标题 + 角色别名（P1-1 别名归一）；
 * v0.46.63 增加相似度去重（繁简/错别字变体，如「青龙镇/青龍镇」）。
 * v0.46.74 收紧：长名仅当繁简归一后编辑距离 0 才并（P1-2，编辑距离 1 一律不并，避免误并漏建）。
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { DetectedEntity } from "./entity-detector";
import { isCompleteEntityName } from "./entity-detector";
import {
  classifyWorldCategory,
  type WorldCategory,
} from "@/lib/world-category-classifier";

// ─── 类型定义 ────────────────────────────────────────────────

export interface AutoCreateResult {
  created: Array<{
    type: "character" | "lorebook";
    id: string;
    name: string;
    // 世界书词条为 15 类 WorldCategory；角色卡分支记为 "character"（元桶，非 15 类之一）。
    category: string;
  }>;
  skipped: string[]; // 因重复跳过的实体名
}

// ─── 实体类型 → Lorebook category 映射 ──────────────────────

// 显式类型映射：优先把蒸馏出的实体类型直接路由到 15 类世界卡分类之一。
// 键入 WorldCategory，类型系统强制值域合法（不会映射出非法分类）。
// 前半段是 entity-detector 实际产出的类型（已映射）；后半段与 entity-sync 的
// TYPE_TO_CATEGORY 共享更完整词汇，便于未来扩展 / 防御未知 type（F5）。
const ENTITY_TYPE_TO_CATEGORY: Record<string, WorldCategory> = {
  // detector 实际产出的类型
  pill: "item",
  artifact: "item",
  technique: "technique",
  location: "geography",
  material: "item",
  // 与 entity-sync 共享的更完整类型词汇（防御未知 type，F5）
  organization: "faction",
  creature: "creature",
  fate: "fate_system",
  physics: "physics",
  public: "public_system",
  magic_system: "magic_system",
  culture: "culture",
  history: "history",
  law: "law",
  currency: "currency",
  other: "custom",
  // character 走 CharacterCard，不走 LorebookEntry
};

/**
 * 把蒸馏出的实体（类型 + 名称）解析为世界卡 15 分类之一（F5）。
 *
 * 解析顺序（与 entity-sync.ts:228-238 的兜底完全一致）：
 *  1. 先走显式 ENTITY_TYPE_TO_CATEGORY 映射；
 *  2. 未命中（落到 "custom" / 未映射 type）时，用确定性世界卡分类器对「名称」
 *     重新路由，避免 faction / creature / culture / history / law / currency /
 *     fate_system / physics / public_system 等实体经此路径静默误归 custom；
 *  3. 只接受世界卡分类；角色关系（交角色卡负责）/ 元桶保持 custom，不重路由。
 *
 * 抽成纯函数便于单测（无需 mock prisma），与 entity-sync 行为对齐、杜绝漂移。
 */
export function resolveEntityCategory(type: string, name: string): WorldCategory {
  let category: WorldCategory = ENTITY_TYPE_TO_CATEGORY[type] || "custom";
  if (category === "custom") {
    const cr = classifyWorldCategory(name);
    if (cr.category && cr.category !== "character_relationship") {
      category = cr.category;
    }
  }
  return category;
}

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

/** 常见繁↔简异体映射（繁体字符 → 简体），覆盖小说高频字 */
const TRAD_TO_SIMP: Record<string, string> = {
  蕭: "萧",
  動: "动",
  雲: "云",
  葉: "叶",
  國: "国",
  龍: "龙",
  風: "风",
  會: "会",
  體: "体",
  邊: "边",
  門: "门",
  馬: "马",
  長: "长",
  車: "车",
  鳥: "鸟",
  書: "书",
  時: "时",
  來: "来",
  個: "个",
};

/** 字符级繁简归一化：繁体字符映射为简体，其余字符原样保留 */
function normalizeTraditional(s: string): string {
  let out = "";
  for (const ch of s) {
    out += TRAD_TO_SIMP[ch] ?? ch;
  }
  return out;
}

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
 * 同人异称识别（v1.6.3）：尊称 / 描述性变体与正主指同一人，应并入别名而非拆成两张卡。
 * 例：韩先生 / 韩姓男子 / 韩某 / 老韩 与 韩立 视为同一人；韩立 与 韩雪 视为不同人。
 */
const HONORIFIC_TOKENS = [
  "先生", "女士", "女子", "男子", "姑娘", "公子", "少年", "少女",
  "姓", "某", "氏", "老板", "师傅", "师父", "大人", "阁下", "兄台", "小姐",
  "夫人", "殿下", "陛下", "兄", "姐", "君", "公", "翁", "婆", "徒弟",
  "管家", "仆", "婢", "少侠", "大侠", "壮士", "道友", "前辈", "掌门",
  "宗主", "将军", "王", "皇", "帝", "后", "妃", "书生", "侠女", "女侠", "朋友",
];
const PREFIX_HONORIFICS = ["老", "小", "阿", "大"];
const BEFORE_FILLERS = ["", "大", "小", "阿", "二", "三", "老", "少", "姓"];

/** 是否为「称呼/描述性变体」（如 韩先生 / 韩姓男子 / 韩某 / 老韩） */
export function isHonorificVariant(name: string): boolean {
  const n = normalizeTraditional(name.trim().toLowerCase());
  if (n.length < 2 || n.length > 5) return false;
  // 前缀尊称：老/小/阿 + 姓（≤3 字）
  if (PREFIX_HONORIFICS.includes(n[0]) && n.length <= 3) return true;
  const rest = n.slice(1); // 去掉姓
  for (const t of HONORIFIC_TOKENS) {
    const idx = rest.indexOf(t);
    if (idx === -1) continue;
    const before = rest.slice(0, idx);
    const after = rest.slice(idx + t.length);
    // token 后必须为空，token 前只能是空或单个修饰字（大/小/姓…），避免把真实姓名误判
    if (after.length === 0 && BEFORE_FILLERS.includes(before)) return true;
  }
  return false;
}

/** 提取「姓」：前缀尊称（老韩）取第二字，否则取首字 */
export function coreSurname(name: string): string {
  const n = normalizeTraditional(name.trim().toLowerCase());
  if (PREFIX_HONORIFICS.includes(n[0])) return n[1] || n[0];
  return n[0];
}

/** 两名称是否「同人异称」：共享姓，且其一为称呼变体、另一为普通姓名（仅成对判定，不含歧义闸门） */
export function samePersonByHonorific(a: string, b: string): boolean {
  const x = normalizeTraditional(a.trim().toLowerCase());
  const y = normalizeTraditional(b.trim().toLowerCase());
  if (!x || !y) return false;
  if (Math.abs(x.length - y.length) > 3) return false;
  if (coreSurname(x) !== coreSurname(y)) return false;
  const xHon = isHonorificVariant(x);
  const yHon = isHonorificVariant(y);
  return xHon !== yHon;
}

/**
 * 同人异称消歧：给定一组已有姓名，判断 honorificName（尊称/描述变体）能否无歧义并入某个同姓正主。
 * 能并入则返回该正主姓名，否则返回 null（同姓正主不唯一 → 拒绝，避免把「韩先生」错并进「韩雪」）。
 */
export function resolveHonorificTarget(allNames: string[], honorificName: string): string | null {
  if (!isHonorificVariant(honorificName)) return null;
  const surname = coreSurname(honorificName);
  const plainCands = allNames
    .filter((n) => n.trim().toLowerCase() !== honorificName.trim().toLowerCase())
    .filter((n) => !isHonorificVariant(n))
    .filter((n) => coreSurname(n) === surname);
  return plainCands.length === 1 ? plainCands[0] : null;
}

/**
 * 变体 → 主卡名解析（消歧闸门，合并 entity-auto-creator 与 character-dedupe 的重复判定分支）：
 *  - 标准尊称（X先生 / X女子）：交给 resolveHonorificTarget（同姓唯一正主才返回，歧义 null）；
 *  - 单字缩写 / 姓+描述词（樊 / 韩姓男子）：resolveHonorificTarget 不覆盖（它只认 isHonorificVariant），
 *    故补一刀——按 coreSurname 在同姓非变体正主中找唯一匹配，歧义（≥2）则 null。
 * 任一变体解析不到唯一主卡 → 返回 null（需用户/LLM 确认，避免错并）。
 * 本函数是「同人异称 → 主卡」的唯一判定入口，autoCreate 与角色去重共用，避免两处逻辑漂移。
 */
export function resolveVariantTarget(allNames: string[], variantName: string): string | null {
  const byHonorific = resolveHonorificTarget(allNames, variantName);
  if (byHonorific) return byHonorific;
  if (isSurnameAbbrevOrDescriptor(variantName)) {
    const surname = coreSurname(variantName);
    const cands = allNames
      .filter((n) => n.trim().toLowerCase() !== variantName.trim().toLowerCase())
      .filter((n) => !isHonorificVariant(n) && !isSurnameAbbrevOrDescriptor(n))
      .filter((n) => coreSurname(n) === surname);
    if (cands.length === 1) return cands[0];
  }
  return null;
}

/**
 * 昵称缩写 / 姓氏缩写 + 描述词（v2.0.4，#297/#299 配套）：
 *  - 单字姓名（如「樊」「叶」）= 对应正主的昵称缩写，应并入别名而非拆成两张卡；
 *  - 前缀尊称（老X / 小X / 阿X）；
 *  - 「X姓 + 描述词」（韩姓男子 / 叶姓女子 / 萧姓青年 …）。
 * 与 isHonorificVariant 互补：后者覆盖「X先生/女子」等标准尊称，本函数覆盖单字缩写与「姓+描述」结构。
 * 仅做「是否为变体」的判定；能否无歧义并入正主由 resolveHonorificTarget 把关。
 */
const DESCRIPTOR_AFTER = ["", "男子", "女子", "青年", "少年", "老者", "少女", "姑娘", "公子", "书生", "壮士", "大侠", "少侠", "女侠", "侠女", "前辈", "掌门", "宗主", "将军", "王爷"];
export function isSurnameAbbrevOrDescriptor(name: string): boolean {
  const n = normalizeTraditional(name.trim().toLowerCase());
  if (!n) return false;
  // 单字姓（昵称缩写）
  if (n.length === 1) return true;
  // 前缀尊称（老韩 / 小韩 / 阿韩）
  if (PREFIX_HONORIFICS.includes(n[0]) && n.length <= 3) return true;
  // X姓 + 描述词（韩姓男子）
  const rest = n.slice(1);
  const idx = rest.indexOf("姓");
  if (idx === 0) {
    const after = rest.slice(1);
    if (DESCRIPTOR_AFTER.includes(after)) return true;
  }
  return false;
}

/**
 * 判断两个名称是否「高度相似、疑似同一实体的变体」。
 * 规则：忽略大小写后
 *  - 完全相同 → 是
 *  - 同人异称（尊称/描述变体，如 韩先生/韩立）→ 是（v1.6.3 新增，并入别名）
 *  - 长度差 > 2 → 否（明显不同实体）
 *  - 短名（任一 ≤2 字）先繁简归一化，归一化后相同 → 是（灭「萧炎/蕭炎」重复建卡，
 *    青砚 P2）；归一化后仍不同 → 否（不并，安全优先，避免「白云/白衣」被误并）
 *  - 长名（≥3 字）编辑距离 = 0 → 是（灭繁简/错别字，如 青龙镇/青龍镇、李尘/李麈）
 */
export function isSimilarName(a: string, b: string): boolean {
  // P1-2：繁简归一在比对前统一完成（青龍镇→青龙镇），使后续仅依赖编辑距离判定，
  // 不改动匹配链路（matchNameStrict/matchKeyword/recall）。
  const x = normalizeTraditional(a.trim().toLowerCase());
  const y = normalizeTraditional(b.trim().toLowerCase());
  if (!x || !y) return false;
  if (x === y) return true;
  if (Math.abs(x.length - y.length) > 2) return false;
  // 短名（≤2 字）：归一化后仍不同即视为不同实体，不引入编辑距离，
  // 避免「白云/白衣」「叶凡/叶帆」被误并。
  if (x.length <= 2 || y.length <= 2) {
    return false;
  }
  // 长名（≥3 字）：仅当繁简/大小写归一后「完全一致（编辑距离 = 0）」才判同类合并；
  // 编辑距离 1（如「青云宗/青云山」「剑/刀」类语义不同的实体）一律不并，避免误并漏建。
  return levenshtein(x, y) === 0;
}

// ─── 主函数 ──────────────────────────────────────────────────

/**
 * 自动创建蒸馏发现的新实体。
 *
 * - 角色 → CharacterCard（role: "supporting"，pending 待审；昵称缩写/尊称变体自动并入正主别名，不再拆成脏卡）
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

  // ── 查重：一次性拉取所有已有角色名 + 世界书标题（+ 角色别名，P1-1 别名归一）──
  const [existingChars, existingLore] = await Promise.all([
    prisma.characterCard.findMany({
      where: { projectId },
      select: { id: true, name: true, aliases: true },
    }),
    prisma.lorebookEntry.findMany({
      where: { projectId },
      select: { title: true },
    }),
  ]);

  // 摊平已有角色别名（P1-1：别名维度去重）
  const existingCharAliases: string[] = [];
  for (const c of existingChars) {
    if (Array.isArray(c.aliases)) {
      for (const al of c.aliases as string[]) {
        if (typeof al === "string" && al.trim()) existingCharAliases.push(al);
      }
    }
  }

  const existingNames = new Set([
    ...existingChars.map((c) => c.name.toLowerCase()),
    ...existingCharAliases.map((a) => a.toLowerCase()),
    ...existingLore.map((l) => l.title.toLowerCase()),
  ]);
  // 相似度比对用的原始名单（保留原始大小写，仅用于变体判定；并入别名）
  const existingNameList = [
    ...existingChars.map((c) => c.name),
    ...existingCharAliases,
    ...existingLore.map((l) => l.title),
  ];

  const created: AutoCreateResult["created"] = [];
  const skipped: string[] = [];

  for (const entity of newEntities) {
    const name = entity.name.trim();
    if (!name || name.length < 2) continue;
    // Q1：兜底过滤句子碎片（含功能词/标点/超长/末字非名词性 CJK），
    // 即使上游蒸馏/提取返回片段，也不写入世界书污染数据。
    if (!isCompleteEntityName(name)) {
      skipped.push(name);
      continue;
    }

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
    // 同人异称：尊称 / 昵称缩写 / 姓+描述词 自动并入唯一同姓正主别名（歧义时拒绝，避免错并）。
    // 统一走 resolveVariantTarget（合并原两处重复分支，并修掉单字缩写此前因 resolveHonorificTarget
    // 只认 isHonorificVariant 而永远合并不进的 bug：现「樊」=樊斯瑞、「韩姓男子」=韩立 都能正确并入）。
    const targetName = resolveVariantTarget(existingChars.map((c) => c.name), name);
    if (targetName) {
      const matched = existingChars.find((c) => c.name.toLowerCase() === targetName.toLowerCase());
      if (matched) {
        const curAliases = Array.isArray(matched.aliases) ? (matched.aliases as string[]) : [];
        if (!curAliases.some((al) => al.toLowerCase() === name.toLowerCase())) {
          await prisma.characterCard.update({
            where: { id: matched.id },
            data: { aliases: Array.from(new Set([...curAliases, name])).slice(0, 50) },
          });
        }
      }
      skipped.push(name);
      continue;
    }
    // 标记为已存在，避免同一批次内的重复（主名 + 别名）
    existingNames.add(name.toLowerCase());
    existingNameList.push(name);
    if (Array.isArray(entity.aliases)) {
      for (const al of entity.aliases as string[]) {
        if (typeof al === "string" && al.trim()) {
          existingNames.add(al.toLowerCase());
          existingNameList.push(al);
        }
      }
    }

    // L3-004 二次查重（并发兜底）：写入前再查一次库，捕捉「调用开始时快照」之外的
    // 并发新建，避免同 project 两章并发生成时重复落库角色卡 / 世界书词条。
    const dupChar = await prisma.characterCard.findFirst({
      where: { projectId, name: { equals: name } },
      select: { id: true },
    });
    if (dupChar) {
      skipped.push(name);
      continue;
    }
    const dupLore = await prisma.lorebookEntry.findFirst({
      where: { projectId, title: { equals: name } },
      select: { id: true },
    });
    if (dupLore) {
      skipped.push(name);
      continue;
    }

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
            tags: [],
            currentStatus: "alive",
            reviewStatus: "pending",
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
        // F5：先显式映射，未命中再用确定性分类器重路由，确保 15 类全覆盖、无静默落 custom。
        const category = resolveEntityCategory(entity.type, name);
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
            reviewStatus: "pending",
          },
        });
        created.push({
          type: "lorebook",
          id: entry.id,
          name,
          category,
        });
      }
    } catch (e) {
      // 单个实体创建失败不阻塞整体流程。
      // L3-004：若后续为 (projectId,name)/(projectId,title) 加唯一约束，并发冲突
      // 触发 P2002 时转 skip（与二次查重共同构成并发兜底）。
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        skipped.push(name);
        continue;
      }
      skipped.push(name);
    }
  }

  // v2.0.15：自动发现新角色后触发后台去重合并（宽松标准：有正主自动合并，脏卡进 pending 待确认）
  if (created.some((c) => c.type === "character")) {
    void import("@/core/character-dedupe")
      .then((m) => m.dedupeCharacters(projectId))
      .catch(() => {});
  }
  return { created, skipped };
}
