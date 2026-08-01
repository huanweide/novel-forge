// @deprecated: 世界书摘要子功能无 UI 调用，前端无引用
/**
 * POST /api/lorebook/summarize
 *
 * 世界书结构化整理——预览模式：
 * 1. Phase 1: AI 扫描词条，主题聚类（轻量，max_tokens=4096）
 * 2. Phase 2: 逐主题生成整理结果（max_tokens=16384，超大聚类自动拆分）
 * 3. Phase 3: 输出覆盖校验——原文专有名词必须出现在输出中
 * 4. 结果存入服务端缓存，通过 done 事件返回 previewId（不通过 SSE 传完整数据）
 *
 * 用户确认后 → POST /api/lorebook/summarize/apply (传 previewId)
 *
 * v5: 服务端缓存——解决 SSE 大数据传输断裂问题
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";

export const maxDuration = 120;

import { callSiliconFlow } from "@/lib/llm";

// ═══════════════════════════════════════════════
// 服务端预览缓存（避免通过 SSE 传大量 JSON）
// ═══════════════════════════════════════════════

interface CachedPreview {
  entryIds: string[];
  results: Array<{ title: string; content: string; keys: string[] }>;
  expiresAt: number;
}

const previewCache = new Map<string, CachedPreview>();

// 每 5 分钟清理过期缓存
const CACHE_TTL = 5 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of previewCache) {
    if (now > val.expiresAt) previewCache.delete(key);
  }
}, 60_000).unref();

export function getPreviewFromCache(previewId: string): CachedPreview | undefined {
  const entry = previewCache.get(previewId);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    previewCache.delete(previewId);
    return undefined;
  }
  return entry;
}

export function deletePreviewFromCache(previewId: string): void {
  previewCache.delete(previewId);
}

// ─── Token 估算（中文：1字≈1.5 tokens）──────────────────

function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[一-鿿]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 1.5 + otherChars * 0.5);
}

// ─── 提取专有名词（用于覆盖校验）─────────────────────

function extractProperNouns(text: string): Set<string> {
  const nouns = new Set<string>();
  for (const m of text.matchAll(/《(.+?)》/g)) nouns.add(m[1]);
  for (const m of text.matchAll(/[「"](.+?)[」"]/g)) {
    if (m[1].length >= 2 && m[1].length <= 10) nouns.add(m[1]);
  }
  for (const m of text.matchAll(/【(.+?)】/g)) nouns.add(m[1]);
  return nouns;
}

function checkCoverage(originalTexts: string[], outputText: string): { covered: number; total: number; missing: string[] } {
  const sourceNouns = new Set<string>();
  for (const t of originalTexts) {
    for (const n of extractProperNouns(t)) sourceNouns.add(n);
  }
  const outputNouns = extractProperNouns(outputText);

  const missing: string[] = [];
  for (const n of sourceNouns) {
    if (!outputNouns.has(n) && ![...outputNouns].some(o => o.includes(n) || n.includes(o))) {
      missing.push(n);
    }
  }

  return {
    covered: sourceNouns.size - missing.length,
    total: sourceNouns.size,
    missing: missing.slice(0, 10),
  };
}

// ─── Flash 调用 ──────────────────────────────────

async function callFlash(system: string, prompt: string, maxTokens = 16384): Promise<string> {
  return callSiliconFlow({ system, prompt, maxTokens, temperature: 0.1 });
}

// ─── 解析 JSON ──────────────────────────────────

function parseResult(raw: string): Array<{ title: string; content: string; keys: string[] }> {
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  const a = s.indexOf("["), b = s.lastIndexOf("]");
  if (a >= 0 && b > a) s = s.slice(a, b + 1);

  const arr = JSON.parse(s) as Array<Record<string, unknown>>;
  return arr.map(item => ({
    title: String(item.title || "未命名"),
    content: String(item.content || ""),
    keys: Array.isArray(item.keys) ? item.keys.filter((k: unknown) => typeof k === "string") : [],
  }));
}

// ═══════════════════════════════════════════════
// POST (SSE) —— 预览模式，结果存入服务端缓存
// ═══════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }

  const projectId = body.projectId as string;
  const entryIds = (body.entryIds || []) as string[];

  if (!projectId || !entryIds.length) {
    return NextResponse.json({ error: "缺少 projectId 或 entryIds" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const t0 = Date.now();

        const entries = await prisma.lorebookEntry.findMany({
          where: { id: { in: entryIds }, projectId },
        });

        if (entries.length === 0) {
          send({ type: "error", message: "未找到词条" });
          controller.close();
          return;
        }

        // ═══════════════════════════════════════════════
        // Phase 1: 主题聚类
        // ═══════════════════════════════════════════════
        send({ type: "progress", stage: "cluster", message: `🧠 分析 ${entries.length} 个词条——识别主题聚类...`, pct: 5 });

        const entriesList = entries.map((e, i) =>
          `${i + 1}. [${e.id}]【${e.title}】(${e.category})\n${(e.content || "").slice(0, 500)}`
        ).join("\n\n---\n\n");

        const clusterSystem = `你是世界观整理专家。扫描所有词条，识别"主题聚类"——把关于同一事物/人物/势力/事件的词条归到一起。

【聚类原则——按主题，不是按category】
1. 关于同一个【人物】的所有词条 → 聚为一组（如"林风"的所有情报）
2. 关于同一个【势力/组织】的所有词条 → 聚为一组（如"青云宗"的所有情报）
3. 关于同一段【历史/事件】的所有词条 → 聚为一组（如"上古大战"相关）
4. 关于同一个【地点】的所有词条 → 聚为一组
5. 关于同一套【力量体系/功法】的所有词条 → 聚为一组
6. 无法归入以上任何主题的零散词条 → 归入"杂项"
7. 一个词条可以同时属于多个主题组

【输出格式——纯JSON】
{
  "clusters": [
    {"theme": "主题名", "type": "person|faction|history|location|system|misc", "entryIds": ["词条id"]}
  ]
}`;

        const clusterPrompt = `分析以下 ${entries.length} 个世界书词条，按主题聚类。

${entriesList}

请将关于同一个人物/势力/历史事件/地点/力量体系的词条归到一起。输出JSON。`;

        interface Cluster { theme: string; type: string; entryIds: string[]; }
        let clusters: Cluster[] = [];

        try {
          const clusterRaw = await callFlash(clusterSystem, clusterPrompt, 4096);
          const parsed = JSON.parse(
            (() => {
              let s = clusterRaw.trim();
              const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
              if (md) s = md[1].trim();
              const a = s.indexOf("{"), b = s.lastIndexOf("}");
              if (a >= 0 && b > a) s = s.slice(a, b + 1);
              return s;
            })()
          ) as Record<string, unknown>;
          if (Array.isArray(parsed.clusters)) {
            clusters = parsed.clusters as Cluster[];
          }
        } catch { /* 回退到按 category */ }

        if (clusters.length === 0) {
          const catGroups = new Map<string, typeof entries>();
          for (const e of entries) {
            const cat = e.category || "custom";
            if (!catGroups.has(cat)) catGroups.set(cat, []);
            catGroups.get(cat)!.push(e);
          }
          for (const [cat, group] of catGroups) {
            clusters.push({
              theme: categoryLabel(cat),
              type: cat,
              entryIds: group.map(e => e.id),
            });
          }
        }

        const coveredIds = new Set(clusters.flatMap(c => c.entryIds));
        const uncovered = entries.filter(e => !coveredIds.has(e.id));
        if (uncovered.length > 0) {
          clusters.push({
            theme: "杂项·其他设定",
            type: "misc",
            entryIds: uncovered.map(e => e.id),
          });
        }

        send({
          type: "progress", stage: "clustered",
          message: `📚 ${clusters.length} 个主题：${clusters.map(c => c.theme).join("、")}`,
          pct: 10, total: clusters.length, done: 0,
        });

        // ═══════════════════════════════════════════════
        // Phase 2: 逐主题整理
        // 结果积累到 allResults 数组，最后存入缓存
        // SSE 只传摘要信息（不含完整 content）
        // ═══════════════════════════════════════════════
        let doneCount = 0;
        const TOTAL_CLUSTERS = clusters.length;

        // 收集中间结果（用于存入缓存）
        const allResults: Array<{ title: string; content: string; keys: string[] }> = [];

        interface PreviewGroup {
          clusterTheme: string;
          clusterType: string;
          sourceCount: number;
          sourceTitles: string[];
          resultCount: number;
          resultTitles: string[];
          resultKeys: string[];
          coverage?: { covered: number; total: number; missing: string[] };
        }
        const previewGroups: PreviewGroup[] = [];

        async function processBatch(
          theme: string,
          batchEntries: typeof entries,
          batchIndex: number,
          totalBatches: number,
          isPerson: boolean,
          isFaction: boolean,
          isHistory: boolean,
          isMisc: boolean,
        ): Promise<{ results: Array<{ title: string; content: string; keys: string[] }>; coverage: { covered: number; total: number; missing: string[] } }> {
          const batchLabel = totalBatches > 1 ? `（第${batchIndex + 1}/${totalBatches}批）` : "";

          const entriesText = batchEntries.map((e, i) =>
            `${i + 1}. 【${e.title}】(${e.category})\n${e.content}`
          ).join("\n\n---\n\n");

          const prompt = `整理以下关于「${theme}」${batchLabel}的 ${batchEntries.length} 条设定。

${isPerson ? `▶ 这是关于一个人物的情报汇总——合并为一份完整的"人物相关设定档案"。
  - 包含：与他/她相关的所有地点、势力、事件、物品
  - 信息按类别分段：所属势力 / 相关地点 / 关键事件 / 持有物品 / 人际关系
  - 不丢任何细节` : ""}
${isFaction ? `▶ 这是关于一个势力的情报汇总——合并为一份完整的"势力档案"。
  - 包含：宗旨、成员、层级结构、历史沿革、势力范围、对外关系
  - 信息按类别分段
  - 关联人物、地点标注但不展开` : ""}
${isHistory ? `▶ 这是关于一段历史的情报汇总——合并为一份按时间线排列的"历史档案"。
  - 按时间从早到晚排列事件
  - 标注因果关系链
  - 关键时间节点必须保留` : ""}
${isMisc ? `▶ 这是零散设定——精简整合但不要删除。
  - 确实相关的合并，不相关的保持独立
  - 每条至少要保留标题和核心内容` : ""}

核心理念：**求同存异，信息不丢**
- 重叠则合并去重（保留最详细版本）
- 差异则各自保留（不强行合并）
- 专有名词零丢失、数值零丢失
- 精简但不压缩——去掉啰嗦重复，不概括掉具体细节

【铁律——禁止以下行为】
1. ❌ 禁止用"等"字省略——列出就是列出
2. ❌ 禁止概括具体数字——"修炼了三百年"不能写成"修炼多年"
3. ❌ 禁止合并不同来源的分歧信息
4. ❌ 禁止删除任何一个专有名词

【原始词条】
${entriesText}

【输出JSON数组——可输出多条独立词条，逐条列出，不概括】
[{"title":"词条标题","content":"完整整理后的设定内容","keys":["触发关键词"]}]

只输出JSON。`;

          const system = `整理「${theme}」${batchLabel}相关设定。${isPerson ? "关于该人物的全部情报汇总。" : isFaction ? "该势力的全部情报汇总。" : isHistory ? "该段历史的全部情报汇总。" : "求同存异精简整合。"}信息不丢——逐条列出，不概括。只输出JSON。`;

          const inputTokens = estimateTokens(system + prompt);
          const outputTokens = inputTokens > 50000 ? 32768 : 16384;

          const raw = await callFlash(system, prompt, outputTokens);
          const results = parseResult(raw);

          const allOriginal = batchEntries.map(e => e.content || "");
          const allOutput = results.map(r => `${r.title}\n${r.content}`).join("\n");
          const coverage = checkCoverage(allOriginal, allOutput);

          return { results, coverage };
        }

        for (const cluster of clusters) {
          const clusterEntries = entries.filter(e => cluster.entryIds.includes(e.id));
          if (clusterEntries.length === 0) { doneCount++; continue; }

          const isPerson = cluster.type === "person";
          const isFaction = cluster.type === "faction";
          const isHistory = cluster.type === "history";
          const isMisc = cluster.type === "misc";

          const titles = clusterEntries.map(e => `【${e.title}】`).join(" ");

          const estimatedInputTokens = estimateTokens(
            clusterEntries.map(e => e.content || "").join("\n")
          );
          const SPLIT_THRESHOLD = 40000;
          const needSplit = estimatedInputTokens > SPLIT_THRESHOLD && clusterEntries.length >= 3;
          const totalBatches = needSplit ? Math.ceil(estimatedInputTokens / SPLIT_THRESHOLD) : 1;

          send({
            type: "progress", stage: "group-start",
            message: needSplit
              ? `📝 ${cluster.theme} · ${clusterEntries.length}条（约${Math.round(estimatedInputTokens / 1000)}K tokens，分${totalBatches}批）`
              : `📝 ${cluster.theme} · ${clusterEntries.length}条: ${titles}`,
            pct: 10 + Math.round((doneCount / TOTAL_CLUSTERS) * 75),
            done: doneCount, total: TOTAL_CLUSTERS,
          });

          try {
            let clusterResults: Array<{ title: string; content: string; keys: string[] }> = [];
            let clusterCoverage = { covered: 0, total: 0, missing: [] as string[] };

            if (needSplit) {
              const batchSize = Math.ceil(clusterEntries.length / totalBatches);
              const allBatchResults: Array<{ results: Array<{ title: string; content: string; keys: string[] }>; coverage: { covered: number; total: number; missing: string[] } }> = [];

              for (let bi = 0; bi < totalBatches; bi++) {
                const batchEntries = clusterEntries.slice(bi * batchSize, (bi + 1) * batchSize);
                if (batchEntries.length === 0) continue;
                const br = await processBatch(cluster.theme, batchEntries, bi, totalBatches, isPerson, isFaction, isHistory, isMisc);
                allBatchResults.push(br);
              }

              // 合并多批结果
              const seenTitles = new Set<string>();
              for (const br of allBatchResults) {
                for (const r of br.results) {
                  const key = r.title.toLowerCase().trim();
                  if (!seenTitles.has(key)) {
                    seenTitles.add(key);
                    clusterResults.push(r);
                  }
                }
              }

              if (clusterResults.length > 5) {
                try {
                  const mergePrompt = `以下是对「${cluster.theme}」分 ${totalBatches} 批整理的结果，共 ${clusterResults.length} 条。请做最终合并去重。

${clusterResults.map((r, i) => `${i + 1}. 【${r.title}】\n${r.content.slice(0, 500)}`).join("\n\n---\n\n")}

【输出JSON——合并后的最终结果】
[{"title":"...", "content":"完整合并后的内容", "keys":["..."]}]
只输出JSON。`;

                  const mergeRaw = await callFlash(
                    `最终合并去重「${cluster.theme}」的${totalBatches}批结果。保留全部信息，只合并重叠部分。只输出JSON。`,
                    mergePrompt,
                    16384,
                  );
                  const merged = parseResult(mergeRaw);
                  if (merged.length > 0) clusterResults = merged;
                } catch { /* 保留原始合并 */ }
              }
            } else {
              const batchResult = await processBatch(cluster.theme, clusterEntries, 0, 1, isPerson, isFaction, isHistory, isMisc);
              clusterResults = batchResult.results;
              clusterCoverage = batchResult.coverage;
            }

            // 收集到全局结果
            allResults.push(...clusterResults);

            // SSE 只发摘要（不含完整 content，避免 SSE 断裂）
            previewGroups.push({
              clusterTheme: cluster.theme,
              clusterType: cluster.type,
              sourceCount: clusterEntries.length,
              sourceTitles: clusterEntries.map(e => e.title),
              resultCount: clusterResults.length,
              resultTitles: clusterResults.map(r => r.title),
              resultKeys: clusterResults.flatMap(r => r.keys),
              coverage: clusterCoverage,
            });

            let covMsg = "";
            if (clusterCoverage.missing.length > 0) {
              covMsg = ` ⚠️${clusterCoverage.total - clusterCoverage.covered}个专有名词可能丢失`;
            }

            send({
              type: "preview", stage: "group-done",
              clusterTheme: cluster.theme,
              clusterType: cluster.type,
              sourceCount: clusterEntries.length,
              sourceTitles: clusterEntries.map(e => e.title),
              resultCount: clusterResults.length,
              resultTitles: clusterResults.map(r => r.title),
              resultKeys: clusterResults.flatMap(r => r.keys),
              coverage: clusterCoverage,
              message: `✅ ${cluster.theme} → ${clusterResults.length}条: ${clusterResults.map(r => r.title).join("、")}${covMsg}`,
              pct: 10 + Math.round((doneCount + 1) / TOTAL_CLUSTERS * 75),
              done: doneCount + 1, total: TOTAL_CLUSTERS,
            });
          } catch (e) {
            send({
              type: "error", stage: "group-error",
              clusterTheme: cluster.theme,
              message: `${cluster.theme}: ${e instanceof Error ? e.message.slice(0, 80) : String(e).slice(0, 80)}`,
            });
          } finally {
            doneCount++;
          }
        }

        // ── 总覆盖校验 ──
        let totalNounsCovered = 0, totalNounsTotal = 0;
        const allMissing: string[] = [];
        for (const pg of previewGroups) {
          if (pg.coverage) {
            totalNounsCovered += pg.coverage.covered;
            totalNounsTotal += pg.coverage.total;
            allMissing.push(...pg.coverage.missing);
          }
        }
        const coveragePct = totalNounsTotal > 0
          ? Math.round(totalNounsCovered / totalNounsTotal * 100)
          : 100;

        // ── 统计 ──
        const totalSourceCount = previewGroups.reduce((sum, g) => sum + g.sourceCount, 0);
        const totalResultCount = allResults.length;
        const dedupRatio = totalSourceCount > 0
          ? Math.round((1 - totalResultCount / totalSourceCount) * 100)
          : 0;

        // ── 存入服务端缓存 ──
        const previewId = uuidv4();
        previewCache.set(previewId, {
          entryIds,
          results: allResults,
          expiresAt: Date.now() + CACHE_TTL,
        });

        const sec = ((Date.now() - t0) / 1000).toFixed(1);
        send({
          type: "done",
          ok: true,
          previewId, // 前端确认时回传此 ID
          preview: {
            groups: previewGroups,
            sourceCount: totalSourceCount,
            resultCount: totalResultCount,
            dedupRatio: dedupRatio >= 0 ? dedupRatio : 0,
            coveragePct,
            missingNouns: allMissing.slice(0, 10),
          },
          message: `✅ 预览完成：${totalSourceCount}条 → ${totalResultCount}条（精简${dedupRatio}%，专有名词保留${coveragePct}%）· ${sec}s`,
        });

        controller.close();
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : String(err) });
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function categoryLabel(cat: string): string {
  const map: Record<string, string> = {
    geography: "地理", faction: "势力组织", magic_system: "力量体系",
    history: "历史", culture: "文化风俗", creature: "生物种族",
    item: "器物法宝", custom: "自定义",
  };
  return map[cat] || cat;
}
