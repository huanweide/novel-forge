// @deprecated: 已被 /api/characters/expand 取代，前端无调用
/**
 * POST /api/lorebook/expand
 *
 * 世界书词条 AI 自动扩展 —— 五步管线：
 *   1. AI审计：检测非词条/组合词条/缺失词条
 *   2. 拆分：一个词条涵盖多个主题→各建独立词条
 *   3. 删非词条：角色名/物品名误入世界书列表
 *   4. 去重合并：名称相似或内容重叠→智能合并
 *   5. 并发扩展：补全短内容/生成触发词/修正分类
 *
 * SSE 流式：每完成一个词条即时推送进度。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { parseAIJson } from "@/lib/json-parser";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { getSettings } from "@/lib/llm";

export const maxDuration = 300;

const CONCURRENCY = 12;
const MAX_TOKENS = 16384;

// ─── 安全合并 ──────────────────────────────────────

function safeMerge<T>(result: T | undefined | null, fallback: T): T {
  if (result === undefined || result === null) return fallback;
  if (typeof result === "string" && result.trim().length === 0) return fallback;
  if (Array.isArray(result) && result.length === 0) return fallback;
  if (typeof result === "object" && !Array.isArray(result) && Object.keys(result as object).length === 0) return fallback;
  return result;
}

// ─── LLM API 调用 ────────────────────────────────────

async function callDS(system: string, prompt: string, model: string, baseUrl: string, apiKey: string): Promise<{ raw: string } | { error: string }> {
  if (apiKey.length < 10) return { error: "API Key 未配置" };

  const url = baseUrl.endsWith("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: MAX_TOKENS,
        stream: false,
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { error: `DS ${r.status}: ${body.slice(0, 180)}` };
    }

    const data = await r.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return { error: "DeepSeek 返回空内容" };
    return { raw };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).slice(0, 180) };
  }
}

// ─── 单词条扩展 ──────────────────────────────────

async function expandOne(
  entry: { id: string; title: string; card: Record<string, unknown> },
  context: string,
  model: string,
  baseUrl: string,
  apiKey: string,
): Promise<{ id: string; title: string; result: Record<string, unknown> | null; error?: string }> {
  const content = (entry.card.content as string) || "";
  const keys = (entry.card.keys as string[]) || [];
  const category = (entry.card.category as string) || "custom";

  const prompt = `扩展世界书词条【${entry.title}】——填补缺漏，丰富细节。

【项目上下文】
${context}

【当前词条数据】
- 标题：${entry.title}
- 分类：${category}
- 触发关键词：${keys.join("、") || "无"}
- 内容：${content.slice(0, 3000) || "（内容为空，需要基于标题和上下文推断）"}

【输出格式——单个词条完整JSON】
{
  "title": "优化后的标题（保持原意，更简洁清晰）",
  "category": "geography|faction|magic_system|history|culture|creature|item|worldview|economy|plot|custom",
  "content": "扩展后的完整内容（200-500字，包含：定义、特征、关联要素、在故事中的作用）",
  "keys": ["触发词1", "触发词2", "触发词3", "触发词4", "触发词5"],
  "shouldSplit": false,
  "splitEntries": []
}

【分类修正规则】
- 地点/区域/大陆 → geography
- 势力/组织/宗门/国家 → faction
- 修炼/魔法/力量规则 → magic_system
- 历史事件/时间线 → history
- 文化/风俗/节日 → culture
- 生物/种族/怪物 → creature
- 关键物品/法宝/神器 → item
- 世界观基础设定 → worldview
- 经济/货币/资源 → economy
- 情节线/故事脉络 → plot

【核心原则】
1. 如果内容为空——基于标题和项目世界观推断补全
2. 如果分类明显错误——修正到正确的分类
3. 如果触发词缺失——基于内容提取5-8个关键词
4. 如果内容混杂多个独立主题（如一个词条同时讲"青云宗"和"修炼体系"）——shouldSplit=true，列出拆分方案
5. 信息不丢——原内容中的具体信息必须保留
6. 只输出JSON，无markdown代码块`;

  const result = await callDS(
    "扩展世界书词条。补全缺漏、修正分类、生成触发词。只输出JSON。",
    prompt,
    model,
    baseUrl,
    apiKey,
  );

  if ("error" in result) {
    return { id: entry.id, title: entry.title, result: null, error: result.error };
  }

  try {
    const parsed = parseAIJson(result.raw);
    return { id: entry.id, title: entry.title, result: parsed };
  } catch (e) {
    return { id: entry.id, title: entry.title, result: null, error: `JSON解析失败: ${String(e).slice(0, 300)}` };
  }
}

// ─── 并发池 ─────────────────────────────────────

async function withConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

// ═══════════════════════════════════════════════
// POST (SSE)
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

  const settings = await getSettings();
  const dsModel = settings.model;
  const dsBaseUrl = settings.baseUrl;
  const dsKey = settings.apiKey;

  if (dsKey.length < 10) {
    return NextResponse.json({ error: "API Key 未配置。请在设置页面填入 Key。" }, { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const project = await prisma.project.findUnique({ where: { id: projectId } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        // ── 加载上下文 ──
        let context = project.globalPrompt || "";
        if (!context) {
          const [allChars, style] = await Promise.all([
            prisma.characterCard.findMany({ where: { projectId } }),
            prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
          ]);
          context = `${project.name}（${project.genre.join("、")}）${project.synopsis ? " | " + project.synopsis.slice(0, 200) : ""}`;
          if (allChars.length > 0) context += ` | 角色: ${allChars.map(c => c.name).slice(0, 10).join("、")}`;
          if (style) context += ` | 文风: ${(style.styleDescription || "").slice(0, 80)}`;
          await prisma.project.update({ where: { id: projectId }, data: { globalPrompt: context } }).catch(() => {});
        }

        // ═══════════════════════════════════════════════════════
        // 预处理管线：审计 → 拆分 → 删非词条 → 去重合并
        // ═══════════════════════════════════════════════════════

        const entries = await prisma.lorebookEntry.findMany({ where: { id: { in: entryIds } } });
        send({ type: "progress", stage: "audit", message: `🔍 预处理 ${entries.length} 个词条——审计中...`, pct: 1 });

        // ── Step 1: AI 批量审计 ──
        //   a) 检测非词条（角色名/物品名/无关内容混入）
        //   b) 检测组合词条（一个词条涵盖多个独立主题）
        //   c) 检测分类错误

        interface AuditResult {
          id: string;
          title: string;
          isLoreEntry: boolean;
          reason: string;
          correctCategory: string;
          splitTitles: string[];
        }

        const auditResults: AuditResult[] = [];

        if (entries.length > 0) {
          const entryListForAudit = entries.map(e => {
            const content = (e.content || "").slice(0, 500);
            const keys = (e.keys || []).join("、");
            return `${e.id}|${e.title}|${e.category}|${keys || "无"}|${content || "无内容"}`;
          }).join("\n---\n");

          const auditSystem = `你是世界书词条审计员。逐条检查每个词条，完成三项任务：

1. 【是否真实词条】判断这条记录是否应该存在于世界书中。

【🚨 绝对非词条——以下任何标题直接标记 isLoreEntry=false 🚨】
  • 角色字段标签（来自角色提取指令，绝不可能为世界设定）：
    "性别"、"年龄"、"外貌"、"性格"、"能力"、"背景"、"动机"、"别名/称号"、"说话风格"
    "关键剧情节点"、"与主角关系"、"在剧情中的作用"、"头发"、"发型"、"身高"、"体型"
  • 分段标题类：
    "一、主角"、"二、主要配角"、"三、反派"、"主要角色"、"次要角色"
  • 角色名/人名（如"李尘""张三""裴语涵""季婵溪"等2-4字中文姓名）→ 不是词条

【是词条的情况】
  - 具体物品名（如"屠龙刀""筑基丹"）→ 是词条（items类）
  - 地点名（如"青云城"）→ 是词条（geography类）
  - 势力名（如"青云宗"）→ 是词条（faction类）
  - 概念/设定（如"灵气""修炼体系"）→ 是词条（magic_system或custom类）

2. 【分类是否正确】检查 category 字段是否匹配标题和内容。
   - 标题含"城/山/谷/大陆/森林" → 应该是 geography
   - 标题含"宗/派/门/殿/阁/教/会/族/国" → 应该是 faction
   - 标题含"功法/修炼/境界/灵气/魔法" → 应该是 magic_system
   - 标题含"历史/年表/起源" → 应该是 history
   - 标题含"节日/风俗/礼仪" → 应该是 culture
   - 标题含"兽/怪物/种族/灵兽" → 应该是 creature
   - 标题含"剑/刀/丹/符/法宝/神器" → 应该是 item
   - 给出修正后的正确分类

3. 【是否组合词条】内容是否涵盖多个独立主题需要拆分。
   - 如一个词条同时详细描述"剑气"和"剑宗" → 建议拆分
   - 如一个词条详细描述两个不相关的地点 → 建议拆分
   - 内容只讲一个核心主题 → 不拆分
   - splitTitles 列出拆分后的词条标题

输出纯JSON数组：
[{"id":"词条id","isLoreEntry":true/false,"reason":"简短理由≤20字","correctCategory":"修正后的分类","splitTitles":["拆分标题1","拆分标题2"]}]`;

          const auditPrompt = `审计以下${entries.length}个世界书词条。逐条判断：是否真实词条？分类是否正确？是否需拆分？

格式：id|标题|分类|触发词|内容
---
${entryListForAudit}

输出JSON数组：
[{"id":"...", "isLoreEntry":true/false, "reason":"...", "correctCategory":"...", "splitTitles":[...]}]`;

          try {
            const auditRaw = await callDS(auditSystem, auditPrompt, dsModel, dsBaseUrl, dsKey);
            if ("raw" in auditRaw) {
              const parsed = parseAIJson(auditRaw.raw);
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  auditResults.push({
                    id: String((item as any).id || ""),
                    title: String((item as any).title || ""),
                    isLoreEntry: (item as any).isLoreEntry !== false,
                    reason: String((item as any).reason || ""),
                    correctCategory: String((item as any).correctCategory || ""),
                    splitTitles: Array.isArray((item as any).splitTitles) ? (item as any).splitTitles : [],
                  });
                }
              }
            }
          } catch {
            // 审计失败不阻塞
          }
        }

        const auditMap = new Map(auditResults.map(a => [a.id, a]));

        // ── Step 2: 拆组合词条 ──
        const splitLog: string[] = [];
        const idsToDelete = new Set<string>();

        for (const e of entries) {
          const audit = auditMap.get(e.id);
          if (!audit || audit.splitTitles.length <= 1) continue;

          idsToDelete.add(e.id);
          const originalTitle = e.title;

          for (const splitTitle of audit.splitTitles) {
            const trimmed = splitTitle.trim();
            if (!trimmed || trimmed === originalTitle) continue;

            // 检查是否已存在同名
            const existing = entries.find(
              ee => ee.title.toLowerCase().trim() === trimmed.toLowerCase().trim()
            );
            if (existing) {
              // 合并内容
              const merged = [existing.content, e.content]
                .filter(s => typeof s === 'string' && s.trim().length > 0)
                .join("\n\n---\n\n");
              await prisma.lorebookEntry.update({
                where: { id: existing.id },
                data: { content: merged.slice(0, 2500) },
              }).catch(() => {});
              splitLog.push(`${originalTitle}→${trimmed}(合并)`);
            } else {
              await prisma.lorebookEntry.create({
                data: {
                  projectId,
                  title: trimmed,
                  category: audit.correctCategory || e.category,
                  keys: e.keys || [],
                  content: e.content.slice(0, 2500),
                  insertionOrder: e.insertionOrder,
                  enabled: true,
                },
              });
              splitLog.push(`${originalTitle}→${trimmed}(新建)`);
            }
          }
        }

        // ── Step 3: 删除非词条 + 修正分类 ──
        const deleteLog: string[] = [];
        const fixCategoryLog: string[] = [];

        for (const e of entries) {
          if (idsToDelete.has(e.id)) continue;
          const audit = auditMap.get(e.id);

          if (audit && !audit.isLoreEntry) {
            idsToDelete.add(e.id);
            deleteLog.push(`${e.title}: ${audit.reason}`);
            continue;
          }

          // 修正分类
          if (audit && audit.correctCategory && audit.correctCategory !== e.category && audit.correctCategory.length > 3) {
            await prisma.lorebookEntry.update({
              where: { id: e.id },
              data: { category: audit.correctCategory },
            }).catch(() => {});
            fixCategoryLog.push(`${e.title}: ${e.category}→${audit.correctCategory}`);
          }
        }

        if (idsToDelete.size > 0) {
          await prisma.lorebookEntry.deleteMany({
            where: { id: { in: [...idsToDelete] } },
          });
        }

        // ── Step 4: 去重合并 ──
        let workingEntries = entries.filter(e => !idsToDelete.has(e.id));

        const normalizeTitle = (t: string): string => {
          return t.toLowerCase().replace(/[（(][^)）]*[)）]/g, "")
            .replace(/["""''「」『』【】]/g, "")
            .replace(/\s+/g, "").trim();
        };
        const isSameEntry = (a: string, b: string): boolean => {
          const na = normalizeTitle(a), nb = normalizeTitle(b);
          if (!na || !nb) return false;
          if (na === nb) return true;
          const shorter = na.length <= nb.length ? na : nb;
          const longer = na.length > nb.length ? na : nb;
          if (shorter.length < 2) return false;
          return longer.includes(shorter);
        };

        const dedupedEntries: typeof workingEntries = [];
        const mergedNames: string[] = [];
        const seenTitles = new Map<string, number>();

        for (const e of workingEntries) {
          let foundIdx = -1;
          for (const [key, idx] of seenTitles) {
            if (isSameEntry(key, e.title)) { foundIdx = idx; break; }
          }

          if (foundIdx >= 0) {
            const primary = dedupedEntries[foundIdx];
            const mergedContent = [primary.content, e.content]
              .filter(s => typeof s === 'string' && s.trim().length > 0)
              .join("\n\n---\n\n");
            const mergedKeys = [...new Set([...primary.keys, ...e.keys])];
            await prisma.lorebookEntry.update({
              where: { id: primary.id },
              data: { content: mergedContent.slice(0, 2500), keys: mergedKeys.slice(0, 10) },
            }).catch(() => {});
            await prisma.lorebookEntry.delete({ where: { id: e.id } }).catch(() => {});
            mergedNames.push(`${primary.title}←${e.title}`);
          } else {
            seenTitles.set(e.title.toLowerCase().trim(), dedupedEntries.length);
            dedupedEntries.push(e);
          }
        }

        // 发送预处理报告
        const reportParts: string[] = [];
        if (splitLog.length > 0) reportParts.push(`✂️ 拆分 ${splitLog.length}: ${splitLog.join("、")}`);
        if (deleteLog.length > 0) reportParts.push(`🗑️ 删除 ${deleteLog.length} 非词条: ${deleteLog.join("、")}`);
        if (fixCategoryLog.length > 0) reportParts.push(`🏷️ 修正 ${fixCategoryLog.length} 分类: ${fixCategoryLog.join("、")}`);
        if (mergedNames.length > 0) reportParts.push(`🔗 合并 ${mergedNames.length} 重复: ${mergedNames.join("、")}`);
        if (reportParts.length > 0) {
          send({ type: "progress", stage: "preprocess", message: reportParts.join(" | "), pct: 3 });
        }

        const total = dedupedEntries.length;
        if (total === 0) {
          send({ type: "error", message: "预处理后没有可扩展的词条——所有词条已被拆分/删除/合并" });
          controller.close();
          return;
        }

        // ── 构建词条列表 ──
        const entryItems = dedupedEntries.map(e => ({
          id: e.id,
          title: e.title,
          card: {
            title: e.title,
            category: e.category,
            keys: e.keys,
            content: e.content,
            insertionOrder: e.insertionOrder,
            enabled: e.enabled,
          },
        }));

        send({
          type: "progress", stage: "start",
          message: `${total} 个词条 · ${dsModel} · ${CONCURRENCY}并发`,
          pct: 5, done: 0, total,
        });

        // ── 逐词条并发扩展 ──
        let doneCount = 0;
        const entryResults: Array<{ title: string; status: "ok" | "failed"; error?: string }> = [];
        const fallbackMap = new Map(entryItems.map(e => [e.id, e.card]));

        await withConcurrency(entryItems, async (item) => {
          const { result: r, error } = await expandOne(item, context, dsModel, dsBaseUrl, dsKey);
          let finalError = error;

          if (r) {
            const fallback = fallbackMap.get(item.id);
            try {
              await prisma.lorebookEntry.update({
                where: { id: item.id },
                data: {
                  title: safeMerge(
                    String((r as any).title || "").trim() || null,
                    fallback?.title as string,
                  ) as string,
                  category: safeMerge(
                    String((r as any).category || "").trim() || null,
                    fallback?.category as string,
                  ) as string,
                  content: safeMerge(
                    String((r as any).content || "").trim().slice(0, 2500) || null,
                    fallback?.content as string,
                  ) as string,
                  keys: safeMerge(
                    Array.isArray((r as any).keys)
                      ? (r as any).keys.filter((k: unknown) => typeof k === "string")
                      : null,
                    fallback?.keys as string[],
                  ) as string[],
                },
              });

              // 处理拆分请求
              if ((r as any).shouldSplit && Array.isArray((r as any).splitEntries) && (r as any).splitEntries.length > 0) {
                for (const split of (r as any).splitEntries) {
                  const splitTitle = String(split.title || "").trim();
                  if (!splitTitle || splitTitle === item.title) continue;
                  try {
                    await prisma.lorebookEntry.create({
                      data: {
                        projectId,
                        title: splitTitle,
                        category: String(split.category || fallback?.category || "custom"),
                        keys: Array.isArray(split.keys) ? split.keys : [],
                        content: String(split.content || "").slice(0, 2500),
                        insertionOrder: (fallback?.insertionOrder as number) || 50,
                        enabled: true,
                      },
                    });
                    entryResults.push({ title: splitTitle, status: "ok" });
                  } catch { /* 重名跳过 */ }
                }
              }
            } catch (dbErr) {
              finalError = `DB写入失败: ${String(dbErr).slice(0, 100)}`;
            }
          }

          if (finalError) {
            entryResults.push({ title: item.title, status: "failed", error: finalError });
          } else {
            entryResults.push({ title: item.title, status: "ok" });
          }

          doneCount++;
          send({
            type: "progress",
            stage: finalError ? "entry-failed" : "entry-done",
            message: `${finalError ? "⚠️" : "✅"} ${item.title}${finalError ? " " + finalError.slice(0, 40) : ""}`,
            done: doneCount, total,
            name: item.title,
            status: finalError ? "failed" : "ok",
            error: finalError?.slice(0, 100),
            pct: Math.round(5 + (doneCount / total) * 90),
          });
        }, CONCURRENCY);

        // ── 完成 ──
        const okList = entryResults.filter(r => r.status === "ok").map(r => r.title);
        const failList = entryResults.filter(r => r.status === "failed");

        send({
          type: "done",
          message: failList.length > 0
            ? `扩展完成：${okList.length}/${total} · ${failList.length} 个失败`
            : `✅ 全部成功：${okList.length}/${total}`,
          done: okList.length, total,
          okList,
          failList: failList.map(f => ({ name: f.title, reason: f.error })),
        });

        syncGlobalPrompt(projectId).catch(() => {});
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "扩展失败" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
