/**
 * POST /api/characters/expand
 *
 * SSE 流式：逐角色独立并行扩展。
 * - 每个角色一次 Flash 调用，不分组
 * - CONCURRENCY 控制同时请求数，做完自动补位
 * - 每完成一个角色即时推 SSE 进度——不再有空白等待
 * - 非流式 API：可靠收完整响应再解析
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const maxDuration = 300; // Hobby计划上限，100+角色并发10足够

const FLASH = "deepseek-ai/DeepSeek-V4-Flash";
const BASE_URL = (process.env.LLM_BASE_URL || "https://api.siliconflow.cn/v1").replace(/\/+$/, "");
const API_KEY = process.env.LLM_API_KEY || "";
const CONCURRENCY = 10; // 高并发，角色多时加速

// ─── 安全合并：空值不覆盖已有数据 ──────────────────────

function safeMerge<T>(result: T | undefined | null, fallback: T): T {
  if (result === undefined || result === null) return fallback;
  if (typeof result === "string" && result.trim().length === 0) return fallback;
  if (Array.isArray(result) && result.length === 0) return fallback;
  if (typeof result === "object" && !Array.isArray(result) && Object.keys(result as object).length === 0) return fallback;
  return result;
}

// ─── 精简上下文 ──────────────────────────────────────

function slimContext(
  project: { name: string; genre: string[]; synopsis: string },
  lore: { title: string; category: string; content: string }[],
  style: Record<string, unknown> | null,
): string {
  const loreText = lore.slice(0, 30).map(l =>
    `[${l.title}](${l.category}) ${l.content.slice(0, 80)}`
  ).join(" | ");

  const styleText = style
    ? `${(style.styleDescription as string)?.slice(0, 80) || ""} | POV:${style.povType || "第三人称"}`
    : "";

  return `${project.name}（${project.genre.join("、")}）${project.synopsis ? " | 总纲:" + project.synopsis.slice(0, 120) : ""}
世界观(${lore.length}条): ${loreText || "无"}
${styleText ? "文风: " + styleText : ""}`;
}

// ─── Flash 调用（非流式）───────────────────────────

async function callFlash(system: string, prompt: string, maxTokens = 8000): Promise<{ raw: string } | { error: string }> {
  try {
    const r = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({
        model: FLASH,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
        stream: false,
      }),
    });

    if (!r.ok) {
      const body = await r.text().catch(() => "");
      return { error: `API ${r.status}: ${body.slice(0, 200)}` };
    }

    const data = await r.json().catch(() => null);
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return { error: "Flash 返回空内容" };
    return { raw };
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).slice(0, 200) };
  }
}

// ─── 单角色扩展 ──────────────────────────────────

async function expandOne(
  char: { id: string; name: string; card: Record<string, unknown> },
  context: string,
): Promise<{ id: string; name: string; result: Record<string, unknown> | null; error?: string }> {
  const qic = (char.card.quickImportContent as string) || "";
  const bg = (char.card.background as string) || "";
  const sourceText = qic || bg;

  const prompt = `基于原始设定扩展【${char.name}】的角色卡——信息不能丢，能复述就别总结。

【世界观+文风——所有扩展基于此】
${context}

【该角色原始设定——逐字逐句保留，不要缩写】
${sourceText || "（无原始设定，基于角色地位推敲）"}

【当前卡面（已有结构化数据）】
${JSON.stringify(char.card)}

【输出格式——单角色完整JSON】
{
  "appearance": {"hair":"发色发型","eyes":"眼型瞳色","height":"身高","build":"体型","features":"特殊印记","attire":"标志性着装"},
  "personality": {"dominant":"主导性格","drive":"核心驱动力","contradiction":"内在矛盾","habits":["习惯动作"],"socialMask":"社交面具"},
  "background": "五要素：1)位置与境遇 2)短期目标 3)长期欲望 4)资源与限制 5)卷入核心事件的方式",
  "abilities": ["能力名·等级·一句话描述"],
  "timeline": [{"age":12,"event":"事件","era":"时期"}],
  "dialogueStyle": {"description":"说话风格","examples":["典型台词"],"vocabulary":["用词特点"],"speechPatterns":["句式模式"]},
  "hiddenMotives": ["隐藏动机"],
  "relationships": [{"targetName":"对象","relation":"关系","dynamic":"互动"}],
  "arcProgress": "人物弧光方向"
}

【核心原则——少总结，多复述，多扩展】
1. ❌ 禁止总结/缩写/概括原始设定——原文照搬，原汁原味
2. ✅ 原始设定中已分好类的能力（如「能力1：步频幻觉」）→ abilities字段逐条原样复述，包括原理、应用场景、限制
3. ✅ 背景缺失的信息→基于世界观、文风、同类角色的信息推敲补充
4. ✅ personality→从原始设定的描述中提炼性格特征
5. ✅ appearance→如果原始设定没有外貌描写，基于角色定位和世界观合理推敲
6. ❌ 任何字段禁止"无""未知""暂无"或留空——基于上下文推断填满
7. ✅ 只输出纯JSON，无markdown代码块`;

  const result = await callFlash("扩展角色卡。少总结多复述，原文照搬不缩写，空字段基于世界观推敲补全。只输出JSON。", prompt, 8000);

  if ("error" in result) {
    return { id: char.id, name: char.name, result: null, error: result.error };
  }

  // JSON 解析降级
  try {
    let s = result.raw.trim();
    const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (md) s = md[1].trim();
    const a = s.indexOf("{"), b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);

    const parsed = JSON.parse(s) as Record<string, unknown>;
    return { id: char.id, name: char.name, result: parsed };
  } catch (e) {
    return { id: char.id, name: char.name, result: null, error: `JSON解析失败: ${String(e).slice(0, 100)}` };
  }
}

// ─── 并发池（限制同时请求数，做完自动补位）─────

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
  const characterIds = (body.characterIds || []) as string[];

  if (!projectId || !characterIds.length) {
    return NextResponse.json({ error: "缺少 projectId 或 characterIds" }, { status: 400 });
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
        const loreCount = await prisma.lorebookEntry.count({ where: { projectId, enabled: true } });
        let context = project.globalPrompt || "";

        if (!context || !context.includes(`世界观(${loreCount}条)`)) {
          const [allLore, style] = await Promise.all([
            prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
            prisma.styleCard.findFirst({ where: { projectId }, orderBy: { updatedAt: "desc" } }),
          ]);
          context = slimContext(project, allLore, style);
          await prisma.project.update({ where: { id: projectId }, data: { globalPrompt: context } }).catch(() => {});
        }

        // ── 加载 + 去重（同名+别名+小名，只合并不删除）──
        const chars = await prisma.characterCard.findMany({ where: { id: { in: characterIds } } });

        // 标准化名字（最短2字以上才参与包含匹配，防止"一"误匹配"洁世一"）
        const normalizeName = (name: string): string => {
          return name.toLowerCase().replace(/[（(][^)）]*[)）]/g, "").replace(/\s+/g, "").trim();
        };
        const isSameCharacter = (a: string, b: string): boolean => {
          const na = normalizeName(a), nb = normalizeName(b);
          if (!na || !nb) return false;
          if (na === nb) return true;
          // 包含关系：较短名≥2字才参与（防单字误匹配），且短名是长名的子串
          const shorter = na.length <= nb.length ? na : nb;
          const longer = na.length > nb.length ? na : nb;
          if (shorter.length < 2) return false; // 单字不参与包含匹配
          if (longer.includes(shorter)) return true;
          return false;
        };

        const dedupedChars: typeof chars = [];
        const mergedNames: string[] = [];
        // 用 Map 跟踪已见过的角色名→主卡索引
        const seenNames = new Map<string, number>();

        for (const c of chars) {
          // 在已见过的角色中找相似项
          let foundIdx = -1;
          for (const [key, idx] of seenNames) {
            if (isSameCharacter(key, c.name)) { foundIdx = idx; break; }
          }

          if (foundIdx >= 0) {
            const primary = dedupedChars[foundIdx];
            // 合并内容到主卡（不删卡，副本保留在DB）
            const mergedQC = [primary.quickImportContent, c.quickImportContent]
              .filter(s => typeof s === 'string' && s.trim().length > 0)
              .join("\n\n---\n---\n\n");
            // 更新内存中的主卡数据
            const primaryQC = typeof primary.quickImportContent === 'string' ? primary.quickImportContent : '';
            primary.quickImportContent = mergedQC || primaryQC;
            if (!primary.background && c.background) primary.background = c.background;
            primary.abilities = [...new Set([...primary.abilities, ...c.abilities])];
            primary.hiddenMotives = [...new Set([...primary.hiddenMotives, ...c.hiddenMotives])];

            // 同步更新DB中主卡的 quickImportContent
            await prisma.characterCard.update({
              where: { id: primary.id },
              data: { quickImportContent: primary.quickImportContent },
            }).catch(() => {});

            mergedNames.push(`${primary.name}←${c.name}`);
            // 副本不加入扩展列表（跳过），但保留在DB
          } else {
            seenNames.set(c.name.toLowerCase().trim(), dedupedChars.length);
            dedupedChars.push(c);
          }
        }

        if (mergedNames.length > 0) {
          send({ type: "progress", stage: "dedup", message: `🔗 合并 ${mergedNames.length} 组重复角色: ${mergedNames.join("、")}`, pct: 2 });
        }

        const total = dedupedChars.length;
        if (total === 0) {
          send({ type: "error", message: "没有可扩展的角色" });
          controller.close();
          return;
        }

        // ── 构建角色列表（每角色独立一项）──
        const charItems = dedupedChars.map(c => ({
          id: c.id,
          name: c.name,
          card: {
            name: c.name, aliases: c.aliases, role: c.role,
            age: c.age, gender: c.gender,
            appearance: c.appearance, personality: c.personality,
            background: c.background,
            quickImportContent: c.quickImportContent,
            abilities: c.abilities,
            hiddenMotives: c.hiddenMotives, relationships: c.relationships,
            dialogueStyle: c.dialogueStyle, timeline: c.timeline,
            arcProgress: c.arcProgress, currentStatus: c.currentStatus,
          },
        }));

        send({
          type: "progress", stage: "start",
          message: `${total} 个角色 · 逐角色并行扩展 · 并发${CONCURRENCY}`,
          pct: 5, done: 0, total,
        });

        // ── 逐角色并行扩展 ──
        let doneCount = 0;
        const errors: string[] = [];
        const fallbackMap = new Map(charItems.map(c => [c.id, c.card]));

        await withConcurrency(charItems, async (item, idx) => {
          // 单个角色开始处理（不发事件，避免刷屏）
          const { result: r, error } = await expandOne(item, context);

          if (error) {
            errors.push(`${item.name}: ${error}`);
          }

          // 写 DB
          if (r) {
            const fallback = fallbackMap.get(item.id);
            try {
              await prisma.characterCard.update({
                where: { id: item.id },
                data: {
                  appearance: safeMerge(r.appearance, fallback?.appearance) as any,
                  personality: safeMerge(r.personality, fallback?.personality) as any,
                  dialogueStyle: safeMerge(r.dialogueStyle, fallback?.dialogueStyle) as any,
                  background: String(r.background || "").trim(), // AI总结覆盖原始导入描述
                  abilities: safeMerge(
                    Array.isArray(r.abilities) ? r.abilities.filter((a: unknown) => typeof a === "string") : null,
                    fallback?.abilities as string[] | undefined,
                  ) as string[],
                  hiddenMotives: safeMerge(
                    Array.isArray(r.hiddenMotives) ? r.hiddenMotives.filter((a: unknown) => typeof a === "string") : null,
                    fallback?.hiddenMotives as string[] | undefined,
                  ) as string[],
                  relationships: safeMerge(
                    Array.isArray(r.relationships) ? r.relationships : null,
                    fallback?.relationships as any,
                  ) as any,
                  timeline: safeMerge(
                    Array.isArray(r.timeline) ? r.timeline : null,
                    fallback?.timeline as any,
                  ) as any,
                  arcProgress: safeMerge(
                    String(r.arcProgress || "").trim() || null,
                    String(fallback?.arcProgress || ""),
                  ) as string,
                  quickImportContent: "", // 消化完毕，清空
                },
              });
            } catch (dbErr) {
              errors.push(`${item.name}写入失败: ${String(dbErr).slice(0, 100)}`);
            }
          }

          // ⭐ 即时推送单个角色完成进度
          doneCount++;
          send({
            type: "progress",
            stage: r ? "char-done" : "char-failed",
            message: `${r ? "✅" : "⚠️"} ${item.name}`,
            done: doneCount, total,
            name: item.name,
            pct: Math.round(5 + (doneCount / total) * 90),
          });
        }, CONCURRENCY);

        // ── 完成 ──
        const succeeded = total - errors.length;
        send({
          type: "done",
          message: errors.length > 0
            ? `扩展完成：${succeeded}/${total} · ${errors.length} 个错误`
            : `✅ 全部成功：${succeeded}/${total}`,
          done: succeeded, total,
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
        });
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
