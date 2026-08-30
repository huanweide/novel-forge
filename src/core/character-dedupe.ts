/**
 * 角色自动去重合并（v2.0.5 重构：快照回滚 + 置信度分级）
 *
 * 用户痛点（#297 + round-2 董事会）：
 *  - 旧版规则无法识别「昵称缩写 / 同人异称」（樊斯瑞/樊、叶凌云/叶、韩先生/韩立），去重形同虚设；
 *  - 旧版为统计龙套，`findMany` 加载全部章节正文进内存，量大且没必要；
 *  - round-2 共识：去重是「AI 判断 + 写库」的不可逆操作，此前「静默直接合并」既不可观测、也无回滚。
 *
 * 新版方案：
 *  - 合并判定交给 LLM（llmDetectSamePersonGroups），失败回退「尊称/缩写」规则分组；
 *  - 龙套标记改用 DB 侧 `count({ content: { contains } })`（DB 扫、不回传正文）；
 *  - 置信度分级（computeConfidence）：
 *      · high = 规则分组，或 LLM 分组且每个被并成员都能无歧义解析到主卡（尊称/缩写变体）→ 直接合并；
 *      · low  = LLM 分组但仅靠语义相似（无明确变体证据）→ 只存快照写 pending，不合并，等用户确认。
 *  - 每次合并前把主卡 + 被并卡完整字段快照存 CharacterCardRevision，
 *    状态 applied（已合并）/ pending（待确认）/ rolled_back（已回滚）/ ignored（已忽略）；
 *    高置信度自动合并也留快照，可一键回滚（rollbackMerge）。
 */

import { prisma } from "@/lib/prisma";
import { completeText } from "@/core/llm/client";
import { isHonorificVariant, resolveVariantTarget, isSurnameAbbrevOrDescriptor, coreSurname } from "@/lib/entity-auto-creator";
import {  safeJoin, asArray } from "@/lib/utils";

export interface DedupeMergeItem {
  mainId: string;
  mainName: string;
  merged: Array<{ id: string; name: string }>;
  confidence: "high" | "low";
}
export interface DedupeResult {
  mergedGroups: DedupeMergeItem[];
  pendingGroups: DedupeMergeItem[];
  markedRockets: string[];
  total: number;
}

export interface CharLite {
  id: string;
  name: string;
  aliases: string[];
  background: string;
  storyLine: string;
  relationships: unknown;
  tags: string[];
}

/**
 * #314 增量 / 语义缓存基础设施。
 *
 *  - charFingerprint：角色关键字段（名称/别名/背景/剧情线/标签）的稳定指纹。
 *    仅当指纹变化才需要重新跑 LLM 判定，否则可复用上次结果。
 *  - dedupeGroupCache：项目级语义缓存（进程内）。角色集内容指纹未变时，
 *    直接复用上次 LLM/规则分组结果，跳过全部 LLM 调用（零成本去重）。
 *    进程重启会清空，但同进程内多次 batch-write 去重可显著减少 LLM 开销。
 */
function charFingerprint(c: CharLite): string {
  let h = 0;
  const s = `${c.name}|${safeJoin(c.aliases, ",")}|${c.background}|${c.storyLine}|${safeJoin(c.tags, ",")}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const dedupeGroupCache = new Map<string, { fp: string; high: string[][]; pending: string[][] }>();

/** 从可能包裹了说明文字的模型输出里抠出第一个 JSON 对象 */
function extractJson(raw: string): any {
  if (!raw) return null;
  const s = raw.trim();
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) return null;
  try {
    return JSON.parse(s.slice(first, last + 1));
  } catch {
    return null;
  }
}

/**
 * LLM 判定「同一真实人物」分组。
 * 返回 id 数组的数组（每组长度 ≥ 2），仅含确实存在且集合内去重的 id。
 * 任何异常（无 Key / 超时 / 解析失败）一律返回空数组——宁可少合并也不错并。
 */
/**
 * 项目大纲/后文上下文（round-22，F 修正）：
 * 读取 Project.globalPrompt + synopsis + 已批准 StoryNode.outline，截断到硬预算（4k 字）用于注入 LLM，
 * 同时哈希成指纹拼入 dedupe 缓存 key，确保大纲/后文变化能触发重新判断（否则「后文揭露身份」永不重跑）。
 */
async function getOutlineContextSummary(projectId: string): Promise<string> {
  try {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { globalPrompt: true, synopsis: true },
    });
    const nodes = await prisma.storyNode.findMany({
      where: { projectId, status: { in: ["completed", "confirmed", "draft"] } },
      select: { outline: true },
      take: 50,
    });
    const text = [
      project?.globalPrompt || "",
      project?.synopsis || "",
      ...nodes.map((n) => n.outline || "").filter(Boolean),
    ].join("\n").replace(/\s+/g, " ").slice(0, 4000);
    return text;
  } catch {
    return "";
  }
}

async function llmDetectSamePersonGroups(chars: CharLite[], context: string): Promise<string[][]> {
  if (chars.length < 2) return [];
  const listing = chars
    .map((c, i) => {
      const al = safeJoin(c.aliases, "、");
      const bg = (c.background || "").replace(/\s+/g, " ").slice(0, 60);
      return `${i + 1}. id=${c.id} 名称=${c.name}${al ? ` 别名=${al}` : ""}${bg ? ` 简介=${bg}` : ""}`;
    })
    .join("\n");

  const system = `你是小说角色去重专家。下面是一组角色卡（可能包含同一真实人物的不同称呼：昵称缩写如「樊」=「樊斯瑞」、尊称如「韩先生」=「韩立」、错别字/翻译/繁简变体）。请把确实指向同一真实人物的卡片归为一组。
规则：
- 仅当高度确信是同一人时才归组；
- 同姓但不同人（如韩立与韩雪）不要归组；
- 若项目背景（大纲/后文）明确写明「X 即 Y」「X 化名 Y」「X 实为 Y」，则 X 与 Y 应归为同一人组；
- 含「·」的名字（如「迭戈·美第奇」）通常是隐藏身份/马甲，除非背景明确证明其与某卡为同一人，否则不要归组；
- 龙套 / 一次性称呼若无明确同一人证据不要归组；
- 每组是同一真实人物的 id 数组（长度 ≥ 2）。
只输出 JSON：{"groups":[["id1","id2"],...]}，不要任何额外文字。`;

  const prompt = context
    ? `项目背景（大纲/后文，可能含身份揭露）：\n${context}\n\n角色卡清单：\n${listing}\n\n请输出归组 JSON。`
    : `角色卡清单：\n${listing}\n\n请输出归组 JSON。`;

  try {
    const raw = await completeText(system, prompt, { temperature: 0.2, maxTokens: 1500, role: "dedupe", json: true });
    const json = extractJson(raw);
    const groups = Array.isArray(json?.groups) ? json.groups : [];
    const ids = new Set(chars.map((c) => c.id));
    const valid: string[][] = [];
    for (const g of groups) {
      if (!Array.isArray(g)) continue;
      const clean = g.filter((x: unknown) => typeof x === "string" && ids.has(x));
      if (clean.length >= 2) valid.push(Array.from(new Set(clean)));
    }
    return valid;
  } catch {
    return [];
  }
}

/**
 * 规则兜底分组（LLM 不可用时的降级）：仅处理「尊称 / 昵称缩写 / 姓氏缩写 + 描述词」这类
 * 能无歧义并入唯一同姓正主的情况。不覆盖 LLM 才能识别的昵称缩写语义，但至少不漏掉旧版能处理的尊称。
 * 变体→主卡解析统一走 resolveVariantTarget（与 entity-auto-creator 共用，覆盖单字缩写分支）。
 */
function ruleBasedGroups(chars: CharLite[]): string[][] {
  const names = chars.map((c) => c.name);
  const consumed = new Set<string>();
  const groups: string[][] = [];
  for (let i = 0; i < chars.length; i++) {
    const a = chars[i];
    if (consumed.has(a.id)) continue;
    const g: string[] = [a.id];
    for (let j = i + 1; j < chars.length; j++) {
      const b = chars[j];
      if (consumed.has(b.id)) continue;
      const aVar = isHonorificVariant(a.name) || isSurnameAbbrevOrDescriptor(a.name);
      const bVar = isHonorificVariant(b.name) || isSurnameAbbrevOrDescriptor(b.name);
      if (!aVar && !bVar) continue;
      // 仅当其一为变体、另一为普通姓名，且变体能无歧义解析到另一同姓正主时才合并
      if (aVar && !bVar && resolveVariantTarget(names, a.name)?.toLowerCase() === b.name.toLowerCase()) {
        g.push(b.id);
        consumed.add(b.id);
      } else if (bVar && !aVar && resolveVariantTarget(names, b.name)?.toLowerCase() === a.name.toLowerCase()) {
        g.push(b.id);
        consumed.add(b.id);
      }
    }
    if (g.length > 1) {
      g.forEach((id) => consumed.add(id));
      groups.push(g);
    }
  }
  return groups;
}

/**
 * v2.0.15 核心名 token 宽松分组（修复「韩先生/韩姓男子」「迭戈/迭戈先生/迭戈·美第奇」漏检）。
 * coreTokenOf：去前缀尊称（老/小/阿）、去后缀（·美第奇）、去尊称 token（先生/女子）、去「姓+描述词」（韩姓男子），
 * 得到稳定核心名。两个卡核心名相同即视为同一真实人物的候选（含脏描述卡互相、全名+后缀变体）。
 */
function coreTokenOf(name: string): string {
  const n = name.trim().toLowerCase();
  if (!n) return "";
  let t = n;
  if (["老", "小", "阿"].includes(t[0]) && t.length <= 3) t = t.slice(1);
  t = t.split(/[·•・\-－]/)[0].trim();
  const honorifics = ["先生", "女士", "小姐", "女子", "公子", "姑娘", "少爷", "夫人", "阁下", "大人", "老板", "师傅", "老师", "兄弟", "大侠", "少侠"];
  for (const h of honorifics) {
    const idx = t.indexOf(h);
    if (idx !== -1 && t.slice(idx + h.length).length === 0) {
      const before = t.slice(0, idx);
      // 修复：任意长度核心名后的拖尾尊称都剥离（之前 only 剥 1 字姓，导致「迭戈先生」→「迭戈先生」未归并，漏检 Diego 三兄弟）
      if (before.length >= 1) { t = before; break; }
    }
  }
  if (t.length > 1 && t[1] === "姓") {
    const after = t.slice(2);
    const descs = ["", "男子", "女子", "青年", "少年", "老者", "少女", "姑娘", "公子", "书生", "壮士", "大侠", "少侠", "女侠", "侠女", "前辈", "掌门", "宗主", "将军", "王爷", "少爷", "殿下"];
    if (descs.includes(after)) t = t[0];
  }
  return t;
}

/** 宽松分组：核心名相同的卡归为一组（覆盖脏描述卡互相、全名+后缀变体） */
function looseTokenGroups(chars: CharLite[]): string[][] {
  const byToken = new Map<string, string[]>();
  for (const c of chars) {
    const tok = coreTokenOf(c.name);
    if (!tok) continue;
    if (!byToken.has(tok)) byToken.set(tok, []);
    byToken.get(tok)!.push(c.id);
  }
  const groups: string[][] = [];
  for (const ids of byToken.values()) if (ids.length >= 2) groups.push(ids);
  return groups;
}

/** 合并多组来源（LLM / 规则 / 宽松）中共享 id 的组，输出去重后的最终分组 */
function mergeOverlappingGroups(groups: string[][]): string[][] {
  const parent = new Map<string, string>();
  const find = (x: string): string => {
    let cur = x;
    while (parent.get(cur) !== cur) cur = parent.get(cur)!;
    return cur;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };
  for (const g of groups) for (const id of g) if (!parent.has(id)) parent.set(id, id);
  for (const g of groups) for (let i = 1; i < g.length; i++) union(g[0], g[i]);
  const m = new Map<string, Set<string>>();
  for (const id of parent.keys()) {
    const r = find(id);
    if (!m.has(r)) m.set(r, new Set());
    m.get(r)!.add(id);
  }
  return [...m.values()].filter((s) => s.size >= 2).map((s) => [...s]);
}

/** 单成员是否可无歧义并入主卡：变体走 resolveVariantTarget；全名+后缀/衍生称呼走核心名相同 */
function canMergeIntoMain(m: CharLite, main: CharLite, allNames: string[]): boolean {
  const isVariant = isHonorificVariant(m.name) || isSurnameAbbrevOrDescriptor(m.name);
  if (isVariant) {
    const target = resolveVariantTarget(allNames, m.name);
    return target != null && target.toLowerCase() === main.name.toLowerCase();
  }
  const mt = coreTokenOf(m.name);
  const pt = coreTokenOf(main.name);
  return mt.length > 0 && mt === pt && m.name.trim().toLowerCase() !== main.name.trim().toLowerCase();
}

/**
 * 主卡选择：干净 canonical 名绝对优先存活为主卡；
 * 没有干净名时才在变体里挑内容更丰富者。合并后保留的是可读真名而非「迭戈先生」「韩姓男子」这类称呼卡。
 * canonical 卡内容为空也安全——applyMerge 会取被并卡中最长背景、并把所有名字并入主卡别名。
 */
const HONORIFIC_SUFFIXES = [
  "先生", "女士", "小姐", "公子", "夫人", "阁下", "大人", "殿下", "陛下", "兄台",
  "师傅", "师父", "老板", "少侠", "大侠", "壮士", "道友", "前辈", "掌门", "宗主",
  "将军", "书生", "侠女", "女侠", "兄", "姐", "君", "公", "翁", "婆", "徒弟",
  "管家", "仆", "婢", "朋友", "姑娘", "少年", "少女", "女子", "男子", "姓", "某", "氏",
];
function pickMain(members: CharLite[]): CharLite {
  const richness = (x: CharLite) => (x.background || "").length + (x.storyLine || "").length;
  // 干净名：不含「·」马甲、非尊称/姓+描述变体、且不以尊称 token 结尾（覆盖「迭戈先生」这类多字姓+先生漏检）。
  // 注：刻意排除「王/皇/帝/后/妃」以免误伤「武帝」「王后」等真实人名。
  const isClean = (x: CharLite) => {
    const name = x.name.trim().toLowerCase();
    if (/[·•・]/.test(name)) return false;
    if (isHonorificVariant(name) || isSurnameAbbrevOrDescriptor(name)) return false;
    if (HONORIFIC_SUFFIXES.some((t) => name.endsWith(t))) return false;
    return true;
  };
  const clean = members.filter(isClean);
  const pool = clean.length > 0 ? clean : members;
  return pool.reduce((best, x) => (richness(x) > richness(best) ? x : best));
}

/**
 * 计算合并置信度：
 *  - 规则分组强制 high（都是无歧义尊称/缩写映射）；
 *  - LLM 分组：若每个被并成员都是变体且能无歧义解析到主卡名 → high；
 *    否则（纯语义相似的普通姓名） → low（需用户确认）。
 */
/**
 * 变体 → 主卡名解析（高置信度判定的消歧闸门）统一走 entity-auto-creator 的
 * resolveVariantTarget（已提升为规范函数，覆盖尊称 + 单字缩写两分支），本文件不再重复定义。
 */
export function computeConfidence(members: CharLite[], allNames: string[]): "high" | "low" {
  const main = pickMain(members);
  const merged = members.filter((x) => x.id !== main.id);
  if (merged.length === 0) return "high";
  // v2.17（round-22 契约更新）：同核心名（coreTokenOf 坍缩尊称 / 姓+描述 / ·后缀后一致）即视为同一真实人物候选，
  // 直接 high 自动合并；覆盖此前漏判的两类：变体+变体（韩先生/韩姓男子 同核「韩」）、
  // 全名 + 单「·」后缀变体（迭戈 / 迭戈·美第奇）。
  // 安全闸门：同一核心名下若有多于一个「·」马甲（如 迭戈·美第奇 / 迭戈·桑切斯），可能指向不同真实人物，
  // 不自动合并，降 low 交用户确认。
  const core = coreTokenOf(main.name);
  const allSameCore = core.length > 0 && members.every((m) => coreTokenOf(m.name) === core);
  if (allSameCore) {
    const pseudoCount = members.filter((m) => /[·•・]/.test(m.name)).length;
    if (pseudoCount <= 1) return "high";
  }
  // 主卡本身是脏卡/变体/单字/带后缀，或组内任一含「·」（隐藏身份/马甲）且同核马甲多于一个 → 整组降 low
  const mainIsPlain = !isHonorificVariant(main.name) && !isSurnameAbbrevOrDescriptor(main.name) && !main.name.includes("·") && main.name.trim().length > 1;
  const hasPseudo = members.some((m) => m.name.includes("·") || m.name.includes("•") || m.name.includes("・"));
  if (!mainIsPlain || hasPseudo) return "low";
  const allResolved = merged.every((m) => canMergeIntoMain(m, main, allNames));
  return allResolved ? "high" : "low";
}

/** 从 CharacterCard 行构造 CharLite（confirm 复用：pending 时 DB 当前值即合并前值） */
export function toCharLite(row: {
  id: string;
  name: string;
  aliases: unknown;
  background: string | null;
  storyLine: string | null;
  relationships: unknown;
  tags: unknown;
}): CharLite {
  return {
    id: row.id,
    name: row.name,
    aliases: Array.isArray(row.aliases) ? (row.aliases as string[]) : [],
    background: row.background || "",
    storyLine: row.storyLine || "",
    relationships: row.relationships,
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
  };
}

/** 执行合并：别名并入主卡、内容取更长、关系合并；被并卡软删标记「🗂 已合并」。返回主卡实际写入字段（审计）。 */
export async function applyMerge(main: CharLite, merged: CharLite[]): Promise<Record<string, unknown>> {
  const extraAliases = merged.flatMap((x) => [x.name, ...asArray<string>(x.aliases)]);
  const newAliases = Array.from(new Set([...asArray<string>(main.aliases), ...extraAliases])).slice(0, 50);
  const bestBg = merged.reduce((m, x) => ((x.background || "").length > (m || "").length ? x.background : m), main.background);
  const bestSl = merged.reduce((m, x) => ((x.storyLine || "").length > (m || "").length ? x.storyLine : m), main.storyLine);
  const newRels = mergeRelationships(main.relationships, merged.map((x) => x.relationships));
  await prisma.characterCard.update({
    where: { id: main.id },
    data: {
      aliases: newAliases,
      background: bestBg || main.background,
      storyLine: bestSl || main.storyLine,
      relationships: newRels,
      // 合并时顺手清掉主卡残留的「🆕 自动发现」脏标记（旧版本自动发现遗留），保持主卡标签干净
      tags: Array.from(new Set(asArray<string>(main.tags).filter((t: string) => t !== "🆕 自动发现"))),
    } as any,
  });
  for (const x of merged) {
    await prisma.characterCard.update({
      where: { id: x.id },
      data: { tags: Array.from(new Set([...asArray<string>(x.tags), "🗂 已合并"])) },
    });
  }
  return { aliases: newAliases, background: bestBg || main.background, storyLine: bestSl || main.storyLine, relationships: newRels };
}

/** 回滚已应用的合并：主卡恢复快照旧值，被并卡去除「🗂 已合并」标记。 */
export async function rollbackMerge(rev: { mainCardId: string; mainBefore: any; mergedBefore: any }): Promise<void> {
  const mb = rev.mainBefore || {};
  await prisma.characterCard.update({
    where: { id: rev.mainCardId },
    data: {
      aliases: (mb.aliases ?? []) as any,
      background: (mb.background ?? "") as any,
      storyLine: (mb.storyLine ?? "") as any,
      relationships: (mb.relationships ?? []) as any,
      tags: Array.from(new Set((mb.tags ?? []).filter((t: string) => t !== "🗂 已合并"))) as any,
    } as any,
  });
  for (const m of (rev.mergedBefore || []) as any[]) {
    await prisma.characterCard.update({
      where: { id: m.id },
      data: { tags: Array.from(new Set((m.tags ?? []).filter((t: string) => t !== "🗂 已合并"))) } as any,
    });
  }
}

export async function dedupeCharacters(
  projectId: string,
  opts?: { detectOnly?: boolean }
): Promise<DedupeResult> {
  const chars = await prisma.characterCard.findMany({
    where: { projectId },
    select: {
      id: true,
      name: true,
      aliases: true,
      background: true,
      storyLine: true,
      relationships: true,
      tags: true,
    },
  });

  const lite: CharLite[] = chars
    // v2.17：已被合并（软删）的卡片不再参与去重候选，避免每次加载都把它们重新合并、反复生成重复 revision
    .filter((c) => !(Array.isArray(c.tags) ? (c.tags as string[]) : []).includes("🗂 已合并"))
    .map((c) => ({
      id: c.id,
      name: c.name,
      aliases: Array.isArray(c.aliases) ? (c.aliases as string[]) : [],
      background: c.background || "",
      storyLine: c.storyLine || "",
      relationships: c.relationships,
      tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
    }));

  // v2.17 分组策略（修复 LLM 误判拖累自动清除）：
  //  - 确定性组（规则 + 核心名宽松）= 高置信自动合并候选，基于确定性匹配，绝不误并不同人；
  //  - LLM 组拆分：成员全部共享同一核心名 → 并入高置信自动合并；跨核心名（如把「顾望舒」误并入「迭戈」组）
  //    则作为独立低置信待确认提案，且不并入确定性组，避免误判拖垮真实重复卡的自动清除。
  const outlineFp = await getOutlineContextSummary(projectId);
  const allFp = "LOOSE_V3|" + lite.map(charFingerprint).sort().join("|") + "|" + outlineFp;
  const cached = dedupeGroupCache.get(projectId);
  let highGroups: string[][];
  let pendingGroupsRaw: string[][];
  let source: "llm" | "rule" | "loose" | "cache";
  if (cached && cached.fp === allFp) {
    // 语义缓存命中：角色集内容未变，完全跳过 LLM 分组调用（增量 + 缓存收益）
    highGroups = cached.high;
    pendingGroupsRaw = cached.pending;
    source = "cache";
  } else {
    const outlineContext = outlineFp; // 复用缓存 key 阶段已取过的同一份上下文，避免重复查库
    const llmGroups = await llmDetectSamePersonGroups(lite, outlineContext);
    const ruleGroups = ruleBasedGroups(lite);
    const looseGroups = looseTokenGroups(lite);
    const deterministic = mergeOverlappingGroups([...ruleGroups, ...looseGroups]);
    const llmSameCore: string[][] = [];
    const llmCrossCore: string[][] = [];
    for (const g of llmGroups) {
      const cores = new Set(
        g.map((id) => coreTokenOf(lite.find((c) => c.id === id)?.name ?? "")).filter(Boolean),
      );
      if (cores.size <= 1) llmSameCore.push(g);
      else llmCrossCore.push(g);
    }
    highGroups = mergeOverlappingGroups([...deterministic, ...llmSameCore]);
    pendingGroupsRaw = llmCrossCore;
    source = llmGroups.length > 0 ? "llm" : ruleGroups.length > 0 ? "rule" : "loose";
    dedupeGroupCache.set(projectId, { fp: allFp, high: highGroups, pending: pendingGroupsRaw });
  }

  const consumed = new Set<string>();
  const mergedGroups: DedupeResult["mergedGroups"] = [];
  const pendingGroups: DedupeResult["pendingGroups"] = [];

  // 组内快照构造（合并前完整字段，供回滚）
  const buildGroup = (members: CharLite[]) => {
    const main = pickMain(members);
    const merged = members.filter((x) => x.id !== main.id);
    const mainBefore = {
      aliases: main.aliases,
      background: main.background,
      storyLine: main.storyLine,
      relationships: main.relationships,
      tags: main.tags,
    };
    const mergedBefore = merged.map((x) => ({
      id: x.id,
      name: x.name,
      aliases: x.aliases,
      background: x.background,
      storyLine: x.storyLine,
      relationships: x.relationships,
      tags: x.tags,
    }));
    const summary = `${main.name} ← ${merged.map((x) => x.name).join(" / ")}`;
    return { main, merged, mainBefore, mergedBefore, summary };
  };

  // 高置信组：直接自动合并（detectOnly 阶段也执行——高置信合并是安全且已认可的快速路径；仅低置信进 pending）
  for (const g of highGroups) {
    const members = g
      .map((id) => lite.find((c) => c.id === id))
      .filter((x): x is CharLite => Boolean(x) && !consumed.has(x!.id));
    if (members.length < 2) continue;
    const { main, merged, mainBefore, mergedBefore, summary } = buildGroup(members);
    consumed.add(main.id);
    merged.forEach((x) => consumed.add(x.id));
    mergedGroups.push({
      mainId: main.id,
      mainName: main.name,
      merged: merged.map((x) => ({ id: x.id, name: x.name })),
      confidence: "high",
    });
    const mainAfter = await applyMerge(main, merged);
    await prisma.characterCardRevision.create({
      data: {
        projectId,
        mainCardId: main.id,
        mergedIds: merged.map((x) => x.id),
        mainBefore: mainBefore as any,
        mergedBefore: mergedBefore as any,
        mainAfter: mainAfter as any,
        confidence: "high",
        source,
        status: "applied",
        summary,
      },
    });
  }

  // 低置信提案（仅 LLM 跨核心建议）：只写 pending 不合并，并剔除已被高置信消耗的成员
  for (const g of pendingGroupsRaw) {
    const members = g
      .map((id) => lite.find((c) => c.id === id))
      .filter((x): x is CharLite => Boolean(x) && !consumed.has(x!.id));
    if (members.length < 2) continue;
    const { main, merged, mainBefore, mergedBefore, summary } = buildGroup(members);
    consumed.add(main.id);
    merged.forEach((x) => consumed.add(x.id));
    pendingGroups.push({
      mainId: main.id,
      mainName: main.name,
      merged: merged.map((x) => ({ id: x.id, name: x.name })),
      confidence: "low",
    });
    if (!opts?.detectOnly) {
      await prisma.characterCardRevision.create({
        data: {
          projectId,
          mainCardId: main.id,
          mergedIds: merged.map((x) => x.id),
          mainBefore: mainBefore as any,
          mergedBefore: mergedBefore as any,
          confidence: "low",
          source,
          status: "pending",
          summary,
        },
      });
    }
  }

  // round-22（D 修正）：移除自动龙套分类标记——不做任何自动分类，符合用户「不要自动分类」诉求。
  // markedRockets 保留字段（恒空）以兼容前端接口。
  const markedRockets: string[] = [];

  return { mergedGroups, pendingGroups, markedRockets, total: chars.length };
}

function mergeRelationships(mainRels: unknown, otherRels: unknown[]): unknown[] {
  const out: any[] = Array.isArray(mainRels) ? (mainRels as any[]).slice() : [];
  const seen = new Set(out.map((r) => `${r?.targetName}|${r?.relation}`));
  for (const rels of otherRels) {
    if (!Array.isArray(rels)) continue;
    for (const r of rels as any[]) {
      if (!r || !r.targetName) continue;
      const k = `${r.targetName}|${r.relation}`;
      if (!seen.has(k)) {
        out.push(r);
        seen.add(k);
      }
    }
  }
  return out.slice(0, 100);
}
