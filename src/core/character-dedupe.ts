/**
 * 角色自动去重合并（v2.0.4 重构）
 *
 * 用户痛点（#297）：
 *  - 旧版规则（isSimilarName / isHonorificVariant）无法识别「昵称缩写 / 同人异称」，
 *    如「樊斯瑞 / 樊」「叶凌云 / 叶」「韩先生 / 韩立」完全检测不出，去重形同虚设；
 *  - 旧版为统计龙套出场次数，`findMany` 加载全部章节正文进内存，量大且没必要。
 *
 * 新版方案：
 *  - 合并判定交给 LLM——把角色卡（id / 名称 / 别名 / 简介）列给模型，
 *    由它判断「确为同一真实人物」的组（昵称缩写、尊称、错别字/翻译变体），
 *    返回 id 分组（`llmDetectSamePersonGroups`）；LLM 不可用时回退到「尊称/缩写」规则分组。
 *  - 龙套标记改用数据库侧 `count({ content: { contains } })`（DB 扫、不回传正文），
 *    不再把全量正文拉进应用内存。
 *  - 合并执行：别名并入主卡、内容取更丰富者、关系合并、被并卡软删标记「🗂 已合并」（保留审计）。
 */

import { prisma } from "@/lib/prisma";
import { completeText } from "@/core/llm/client";
import { isHonorificVariant, resolveHonorificTarget, isSurnameAbbrevOrDescriptor } from "@/lib/entity-auto-creator";

export interface DedupeResult {
  mergedGroups: Array<{
    mainId: string;
    mainName: string;
    merged: Array<{ id: string; name: string }>;
  }>;
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
  const finalGroups = groups.length > 0 ? groups : ruleBasedGroups(lite);

  const consumed = new Set<string>();
  const mergedGroups: DedupeResult["mergedGroups"] = [];

  for (const g of finalGroups) {
    const members = g
      .map((id) => lite.find((c) => c.id === id))
      .filter((x): x is CharLite => Boolean(x) && !consumed.has(x!.id));
    if (members.length < 2) continue;

    // 主卡 = 普通姓名优先（避免把「韩先生」这类称呼变体当主卡），其次取内容更丰富者
    const richness = (x: CharLite) => (x.background || "").length + (x.storyLine || "").length;
    const plain = members.filter((x) => !isHonorificVariant(x.name) && !isSurnameAbbrevOrDescriptor(x.name));
    const main = (plain.length > 0 ? plain : members).reduce((m, x) => (richness(x) > richness(m) ? x : m));
    const merged = members.filter((x) => x.id !== main.id);

    mergedGroups.push({
      mainId: main.id,
      mainName: main.name,
      merged: merged.map((x) => ({ id: x.id, name: x.name })),
    });

    consumed.add(main.id);
    merged.forEach((x) => consumed.add(x.id));

    // 合并执行：别名并入、内容取更长、关系合并
    const extraAliases = merged.flatMap((x) => [x.name, ...x.aliases]);
    const newAliases = Array.from(new Set([...main.aliases, ...extraAliases])).slice(0, 50);
    const bestBg = merged.reduce((m, x) => ((x.background || "").length > (m || "").length ? x.background : m), main.background);
    const bestSl = merged.reduce((m, x) => ((x.storyLine || "").length > (m || "").length ? x.storyLine : m), main.storyLine);

    await prisma.characterCard.update({
      where: { id: main.id },
      data: {
        aliases: newAliases,
        background: bestBg || main.background,
        storyLine: bestSl || main.storyLine,
        relationships: mergeRelationships(main.relationships, merged.map((x) => x.relationships)),
      } as any,
    });

    // 被并卡软删标记（保留审计，前端可按标签隐藏）
    for (const x of merged) {
      await prisma.characterCard.update({
        where: { id: x.id },
        data: {
          tags: Array.from(new Set([...x.tags, "🗂 已合并"])),
        },
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

  return { mergedGroups, markedRockets, total: chars.length };
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
