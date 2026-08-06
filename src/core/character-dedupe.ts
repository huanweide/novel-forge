/**
 * 角色自动去重合并（v1.4.0）
 *
 * 用户需求：角色卡界面「自动分类」旁加「自动去重合并」——扫描所有卡，
 *  - 出现次数 < 3 且背景薄弱 → 标记「🎭 龙套」（不删除，前端可筛选）；
 *  - 相似名称（小名/繁简/错别字变体，isSimilarName）→ 合并：别名并入主卡、
 *    关系改指主卡、内容取更丰富者，被并卡软删标记「🗂 已合并」（保留审计）。
 *
 * 速度：出现次数统计用「每章封顶 1 次」的粗计数（O(章节×角色)），角色量 cap 500。
 */

import { prisma } from "@/lib/prisma";
import { isSimilarName } from "@/lib/entity-auto-creator";

export interface DedupeResult {
  mergedGroups: Array<{
    mainId: string;
    mainName: string;
    merged: Array<{ id: string; name: string }>;
  }>;
  markedRockets: string[];
  total: number;
}

export async function dedupeCharacters(projectId: string): Promise<DedupeResult> {
  const [chars, nodes] = await Promise.all([
    prisma.characterCard.findMany({
      where: { projectId },
      select: {
        id: true, name: true, aliases: true, background: true, storyLine: true,
        relationships: true, tags: true, personality: true, appearance: true,
      },
    }),
    prisma.storyNode.findMany({
      where: { projectId, content: { not: null } },
      select: { content: true },
    }),
  ]);

  const corpus = nodes.map((n) => (n.content || "").toLowerCase());

  // 出现次数统计：每章封顶 1 次（防单章刷屏），粗计数
  const countOf = (name: string): number => {
    const key = name.trim().toLowerCase();
    if (!key) return 0;
    let c = 0;
    for (const ch of corpus) if (ch.includes(key)) c++;
    return c;
  };

  const rocketNames = new Set<string>();
  const markedRockets: string[] = [];
  for (const ch of chars) {
    const bgLen = (ch.background || "").trim().length;
    const hasStory = (ch.storyLine || "").trim().length > 0;
    if (countOf(ch.name) < 3 && bgLen < 20 && !hasStory) {
      if (!rocketNames.has(ch.name)) {
        rocketNames.add(ch.name);
        markedRockets.push(ch.name);
      }
    }
  }

  const capChars = chars.slice(0, 500);
  const consumed = new Set<string>();
  const mergedGroups: DedupeResult["mergedGroups"] = [];

  for (let i = 0; i < capChars.length; i++) {
    const a = capChars[i];
    if (consumed.has(a.id)) continue;
    const group = [a];
    for (let j = i + 1; j < capChars.length; j++) {
      const b = capChars[j];
      if (consumed.has(b.id)) continue;
      // 龙套不与主卡合并（龙套单独标记），避免把主角团外的杂鱼并进主卡
      if (rocketNames.has(b.name)) continue;
      if (isSimilarName(a.name, b.name)) {
        group.push(b);
        consumed.add(b.id);
      }
    }
    if (group.length <= 1) continue;
    consumed.add(a.id);

    // 主卡 = 内容更丰富者（background+storyLine 更长）
    const richness = (x: typeof a) => (x.background || "").length + (x.storyLine || "").length;
    const main = group.reduce((m, x) => (richness(x) > richness(m) ? x : m));
    const merged = group.filter((x) => x.id !== main.id);

    mergedGroups.push({
      mainId: main.id,
      mainName: main.name,
      merged: merged.map((x) => ({ id: x.id, name: x.name })),
    });

    // 合并执行：别名并入、内容取更长、关系合并、被并卡软删标记
    const mainAliases = Array.isArray(main.aliases) ? (main.aliases as string[]) : [];
    const extraAliases = merged.flatMap((x) => [x.name, ...(Array.isArray(x.aliases) ? (x.aliases as string[]) : [])]);
    const newAliases = Array.from(new Set([...mainAliases, ...extraAliases])).slice(0, 50);

    const mainBg = main.background || "";
    const bestBg = merged.reduce((m, x) => ((x.background || "").length > (m || "").length ? x.background : m), mainBg);
    const mainSl = main.storyLine || "";
    const bestSl = merged.reduce((m, x) => ((x.storyLine || "").length > (m || "").length ? x.storyLine : m), mainSl);

    await prisma.characterCard.update({
      where: { id: main.id },
      data: {
        aliases: newAliases,
        background: bestBg || mainBg,
        storyLine: bestSl || mainSl,
        relationships: mergeRelationships(
          main.relationships,
          merged.map((x) => x.relationships),
        ),
      } as any,
    });

    for (const x of merged) {
      await prisma.characterCard.update({
        where: { id: x.id },
        data: {
          tags: Array.from(new Set([...(Array.isArray(x.tags) ? (x.tags as string[]) : []), "🗂 已合并"])),
        },
      });
    }
  }

  // 龙套标记落库（幂等：已有该标签则跳过）
  for (const ch of capChars) {
    if (rocketNames.has(ch.name) && !(Array.isArray(ch.tags) && (ch.tags as string[]).includes("🎭 龙套"))) {
      await prisma.characterCard.update({
        where: { id: ch.id },
        data: { tags: Array.from(new Set([...(Array.isArray(ch.tags) ? (ch.tags as string[]) : []), "🎭 龙套"])) },
      });
    }
  }

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
