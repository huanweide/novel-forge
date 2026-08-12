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
import { isHonorificVariant, resolveHonorificTarget, isSurnameAbbrevOrDescriptor, coreSurname } from "@/lib/entity-auto-creator";

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

interface CharLite {
  id: string;
  name: string;
  aliases: string[];
  background: string;
  storyLine: string;
  relationships: unknown;
  tags: string[];
}

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
async function llmDetectSamePersonGroups(chars: CharLite[]): Promise<string[][]> {
  if (chars.length < 2) return [];
  const listing = chars
    .map((c, i) => {
      const al = (c.aliases || []).join("、");
      const bg = (c.background || "").replace(/\s+/g, " ").slice(0, 60);
      return `${i + 1}. id=${c.id} 名称=${c.name}${al ? ` 别名=${al}` : ""}${bg ? ` 简介=${bg}` : ""}`;
    })
    .join("\n");

  const system = `你是小说角色去重专家。下面是一组角色卡（可能包含同一真实人物的不同称呼：昵称缩写如「樊」=「樊斯瑞」、尊称如「韩先生」=「韩立」、错别字/翻译/繁简变体）。请把确实指向同一真实人物的卡片归为一组。
规则：
- 仅当高度确信是同一人时才归组；
- 同姓但不同人（如韩立与韩雪）不要归组；
- 龙套 / 一次性称呼若无明确同一人证据不要归组；
- 每组是同一真实人物的 id 数组（长度 ≥ 2）。
只输出 JSON：{"groups":[["id1","id2"],...]}，不要任何额外文字。`;

  const prompt = `角色卡清单：\n${listing}\n\n请输出归组 JSON。`;

  try {
    const raw = await completeText(system, prompt, { temperature: 0.2, maxTokens: 1500, role: "dedupe" });
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
      if (aVar && !bVar && resolveHonorificTarget(names, a.name)?.toLowerCase() === b.name.toLowerCase()) {
        g.push(b.id);
        consumed.add(b.id);
      } else if (bVar && !aVar && resolveHonorificTarget(names, b.name)?.toLowerCase() === a.name.toLowerCase()) {
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

/** 主卡选择：普通姓名优先，其次内容更丰富者 */
function pickMain(members: CharLite[]): CharLite {
  const richness = (x: CharLite) => (x.background || "").length + (x.storyLine || "").length;
  const plain = members.filter((x) => !isHonorificVariant(x.name) && !isSurnameAbbrevOrDescriptor(x.name));
  return (plain.length > 0 ? plain : members).reduce((m, x) => (richness(x) > richness(m) ? x : m));
}

/**
 * 计算合并置信度：
 *  - 规则分组强制 high（都是无歧义尊称/缩写映射）；
 *  - LLM 分组：若每个被并成员都是变体且能无歧义解析到主卡名 → high；
 *    否则（纯语义相似的普通姓名） → low（需用户确认）。
 */
/**
 * 变体 → 主卡名解析（高置信度判定的消歧闸门）：
 *  - 标准尊称（X先生 / X女子）：交给 resolveHonorificTarget（同姓唯一正主才返回，歧义则 null）；
 *  - 单字缩写 / 姓+描述词（樊 / 韩姓男子）：resolveHonorificTarget 不覆盖（它只认 isHonorificVariant），
 *    故此处补一刀——按 coreSurname 在同姓非变体正主中找唯一匹配，歧义（≥2）则 null。
 * 任一变体若解析不到唯一主卡 → 该组降为 low（需用户确认），避免错并。
 */
function resolveVariantTarget(allNames: string[], variantName: string): string | null {
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

export function computeConfidence(members: CharLite[], allNames: string[]): "high" | "low" {
  const main = pickMain(members);
  const merged = members.filter((x) => x.id !== main.id);
  if (merged.length === 0) return "high";
  const allResolved = merged.every((m) => {
    const isVariant = isHonorificVariant(m.name) || isSurnameAbbrevOrDescriptor(m.name);
    if (!isVariant) return false;
    const target = resolveVariantTarget(allNames, m.name);
    return target != null && target.toLowerCase() === main.name.toLowerCase();
  });
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
  const extraAliases = merged.flatMap((x) => [x.name, ...x.aliases]);
  const newAliases = Array.from(new Set([...main.aliases, ...extraAliases])).slice(0, 50);
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
    } as any,
  });
  for (const x of merged) {
    await prisma.characterCard.update({
      where: { id: x.id },
      data: { tags: Array.from(new Set([...x.tags, "🗂 已合并"])) },
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

export async function dedupeCharacters(projectId: string): Promise<DedupeResult> {
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

  const lite: CharLite[] = chars.map((c) => ({
    id: c.id,
    name: c.name,
    aliases: Array.isArray(c.aliases) ? (c.aliases as string[]) : [],
    background: c.background || "",
    storyLine: c.storyLine || "",
    relationships: c.relationships,
    tags: Array.isArray(c.tags) ? (c.tags as string[]) : [],
  }));

  // 优先 LLM 分组，失败回退规则分组
  const groups = await llmDetectSamePersonGroups(lite);
  const source = groups.length > 0 ? "llm" : "rule";
  const finalGroups = groups.length > 0 ? groups : ruleBasedGroups(lite);
  const allNames = lite.map((c) => c.name);

  const consumed = new Set<string>();
  const mergedGroups: DedupeResult["mergedGroups"] = [];
  const pendingGroups: DedupeResult["pendingGroups"] = [];

  for (const g of finalGroups) {
    const members = g
      .map((id) => lite.find((c) => c.id === id))
      .filter((x): x is CharLite => Boolean(x) && !consumed.has(x!.id));
    if (members.length < 2) continue;

    const main = pickMain(members);
    const merged = members.filter((x) => x.id !== main.id);
    const confidence = computeConfidence(members, allNames);

    // 合并前完整字段快照（回滚用）
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

    consumed.add(main.id);
    merged.forEach((x) => consumed.add(x.id));

    if (confidence === "high") {
      // 高置信度：直接合并，并留快照可回滚
      const mainAfter = await applyMerge(main, merged);
      await prisma.characterCardRevision.create({
        data: {
          projectId,
          mainCardId: main.id,
          mergedIds: merged.map((x) => x.id),
          mainBefore: mainBefore as any,
          mergedBefore: mergedBefore as any,
          mainAfter: mainAfter as any,
          confidence,
          source,
          status: "applied",
          summary,
        },
      });
      mergedGroups.push({
        mainId: main.id,
        mainName: main.name,
        merged: merged.map((x) => ({ id: x.id, name: x.name })),
        confidence,
      });
    } else {
      // 低置信度：只存快照写 pending，不合并，等用户确认
      await prisma.characterCardRevision.create({
        data: {
          projectId,
          mainCardId: main.id,
          mergedIds: merged.map((x) => x.id),
          mainBefore: mainBefore as any,
          mergedBefore: mergedBefore as any,
          confidence,
          source,
          status: "pending",
          summary,
        },
      });
      pendingGroups.push({
        mainId: main.id,
        mainName: main.name,
        merged: merged.map((x) => ({ id: x.id, name: x.name })),
        confidence,
      });
    }
  }

  // 龙套标记：仅对未被合并、且背景薄弱 / 无剧情的卡，用 DB 侧 count 统计出场次数（不加载全文）
  const rocketCandidates = lite.filter(
    (c) => !consumed.has(c.id) && (c.background || "").trim().length < 20 && !(c.storyLine || "").trim(),
  );
  const markedRockets: string[] = [];
  await Promise.all(
    rocketCandidates.map(async (c) => {
      const key = c.name.trim();
      if (!key) return;
      const cnt = await prisma.storyNode.count({
        where: { projectId, content: { contains: key, mode: "insensitive" } },
      });
      if (cnt < 3 && !c.tags.includes("🎭 龙套")) {
        await prisma.characterCard.update({
          where: { id: c.id },
          data: { tags: Array.from(new Set([...c.tags, "🎭 龙套"])) },
        });
        markedRockets.push(c.name);
      }
    }),
  );

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
