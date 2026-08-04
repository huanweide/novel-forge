/**
 * POST /api/import/commit
 *
 * 提交导入数据 —— 将用户确认后的分章和三卡写入数据库。
 * 同名角色/词条 → AI 模型合并（不冲突、不丢信息）
 * AI 失败 → 回退规则合并
 */

import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { getSettings, recordLlmCall } from "@/lib/llm";
import { normalizeRelationships } from "@/lib/relations";

export const maxDuration = 300;

// ─── P1-1：并发 commit 幂等锁 —— 基于 DB 唯一约束（ImportCommitLock.projectId+nodeId），跨实例有效 ───
// 替代原进程内存 Map（多实例/长事务并发会双写）。并发第二个请求触发 P2002 唯一冲突 → 视为重复提交，跳过（409）。
const COMMIT_LOCK_NODE = "__commit__"; // 项目级提交占位键；未来可细化到具体 nodeId

// ═══════════════════════════════════════════════════════════════
// AI 合并引擎 —— 模型分批并行（每批4个，N批并发）
// ═══════════════════════════════════════════════════════════════

interface MergePair {
  name: string;
  existingId: string;
  old: Record<string, unknown>;
  new: Record<string, unknown>;
}

const BATCH_SIZE = 4; // 每批最多4个角色/词条，小批量快速合并

function chunkPairs<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
  return chunks;
}

// ─── P1-1：merge 批并发限流（4 路信号量）───
// 与 parse 的 CONCURRENCY=4 池口径统一，杜绝超大导入一次性放飞数十个 merge 请求打爆 LLM 提供方。
// 注：BATCH_SIZE=4 是「每批条目数」，MERGE_LIMIT 才是「同时飞行的批数」上限。
function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => {
    if (active >= concurrency || queue.length === 0) return;
    active++;
    const job = queue.shift()!;
    job();
  };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() => {
        fn().then(resolve, reject).finally(() => { active--; next(); });
      });
      next();
    });
}
const MERGE_LIMIT = pLimit(4); // 共享信号量：char 与 lore 两路合计并发 ≤4

async function mergeOneBatch(
  pairs: MergePair[],
  globalContext: string,
  type: "char" | "lore",
  batchNames?: string[],
): Promise<Record<string, unknown>[] | null> {
  const settings = await getSettings();
  const baseURL = settings.baseUrl;
  const apiKey = settings.apiKey || process.env.LLM_API_KEY || "";
  const model = settings.model;

  const pairsText = pairs.map((p, i) =>
    `【${i + 1}】【${p.name}】
旧${type === "char" ? "卡" : "词条"}：${JSON.stringify(p.old)}
新${type === "char" ? "卡" : "词条"}：${JSON.stringify(p.new)}`
  ).join("\n\n---\n\n");

  const isChar = type === "char";
  // F3：拼接本批聚焦名称清单（邻近名称），与紧凑全局名索引互补，降低逐批冗余同时不丢本批上下文
  const batchFocus = Array.isArray(batchNames) && batchNames.length > 0
    ? `\n\n【本批聚焦合并对象】${batchNames.join("、")}`
    : "";
  const prompt = `合并以下${pairs.length}对${isChar ? "角色卡" : "世界书词条"}。核心理念：**求同存异**。

【全局上下文——所有扩展必须基于此】
${globalContext}${batchFocus}

【合并对象】
${pairsText}

【铁律——求同存异】
1. 求同——新旧描述同一概念/人物→合并为一条完整版。信息互补：你有的我保留，我有的你保留。冲突时选更详细/更晚的描述。
2. 存异——新旧描述不同概念/人物→各自保留，不强行合并。
3. ${isChar ? "❌ 禁止留\"无\"或空字段——appearance/personality/background/abilities 必须基于上下文补全。参考全局上下文中其他角色确保不抄袭、有区分度。" : "❌ content 禁止精简概括——旧词条有的细节新词条必须保留。keys 去重合并。专有名词、数值一个不丢。"}
4. 符合作品基调和世界观

【输出——纯JSON，无markdown】
{"merged":[{"name":"${isChar ? "角色名" : "词条标题"}","result":{${isChar ? "完整卡面" : "完整词条"}}},...]}`;

  const TIMEOUT_MS = 45000; // 45s 超时保护，防止单批卡死
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const r = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: isChar
            ? "合并角色卡。禁止留'无'，禁止抄袭，基于上下文补全。输出JSON。"
            : "合并词条。内容互补，基于上下文补全。输出JSON。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.15,
        stream: false,
        // 不传 thinking——硅基流动 Flash 不支持
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!r.ok) return null;
    const data = await r.json().catch(() => null);
    const usage = (data as any)?.usage;
    // P1-4：totalTokens 缺失时回退为 prompt+completion 求和（与 parse 口径一致），
    // 不再归零——否则 monitor 的 llmUsage.totalTokens 会被拉低/归零、成本失真。
    const promptTokens = usage?.prompt_tokens ?? usage?.promptTokens ?? 0;
    const completionTokens = usage?.completion_tokens ?? usage?.completionTokens ?? 0;
    recordLlmCall({
      model,
      role: "assistant",
      promptTokens,
      completionTokens,
      totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? (promptTokens + completionTokens),
      baseURL,
    });
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return null;

    let s = raw.trim();
    const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (md) s = md[1].trim();
    const parsed = JSON.parse(s) as Record<string, unknown>;
    const merged = Array.isArray(parsed.merged) ? parsed.merged as Record<string, unknown>[] : [];
    return merged.map(m => (m.result || {}) as Record<string, unknown>);
  } catch (e) {
    clearTimeout(timeoutId);
    const isAbort = (e as Error).name === "AbortError";
    if (isAbort) console.warn(`[mergeOneBatch] ${type} 批次超时 (${TIMEOUT_MS / 1000}s)，回退规则合并`);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 规则合并 —— AI 失败时的兜底（互补合并，不丢信息）
// ═══════════════════════════════════════════════════════════════

function ruleMergeChar(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const mergeArr = (key: string) => {
    const old = Array.isArray(existing[key]) ? existing[key] as unknown[] : [];
    const add = Array.isArray(incoming[key]) ? incoming[key] as unknown[] : [];
    return [...new Set([...old, ...add])];
  };

  const mergeObj = (key: string) => {
    const old = (typeof existing[key] === "object" && existing[key] !== null && !Array.isArray(existing[key]))
      ? existing[key] as Record<string, unknown> : {};
    const add = (typeof incoming[key] === "object" && incoming[key] !== null && !Array.isArray(incoming[key]))
      ? incoming[key] as Record<string, unknown> : {};
    return { ...old, ...add };
  };

  const mergeText = (key: string) => {
    const old = String(existing[key] || "").trim();
    const add = String(incoming[key] || "").trim();
    if (!add) return old;
    if (!old) return add;
    if (old === add || old.includes(add)) return old;
    if (add.includes(old)) return add;
    return old + "\n\n【补充】\n" + add;
  };

  const oldRels = normalizeRelationships(existing.relationships);
  const newRels = normalizeRelationships(incoming.relationships);
  const relNames = new Set(oldRels.map((r: any) => r?.targetName || ""));
  const mergedRels = [...oldRels, ...newRels.filter((r: any) => !relNames.has(r?.targetName || ""))];

  // 合并 timeline — 按 age 去重合并
  const oldTimeline = Array.isArray(existing.timeline) ? existing.timeline as Record<string, unknown>[] : [];
  const newTimeline = Array.isArray(incoming.timeline) ? incoming.timeline as Record<string, unknown>[] : [];
  const mergedTimeline = [...oldTimeline];
  for (const e of newTimeline) {
    const age = e.age;
    if (!oldTimeline.some((o: Record<string, unknown>) => o.age === age)) {
      mergedTimeline.push(e);
    }
  }
  mergedTimeline.sort((a, b) => (Number(a.age) || 0) - (Number(b.age) || 0));

  return {
    aliases: mergeArr("aliases"),
    abilities: mergeArr("abilities"),
    hiddenMotives: mergeArr("hiddenMotives"),
    relationships: mergedRels,
    background: mergeText("background"),
    personality: mergeObj("personality"),
    dialogueStyle: mergeObj("dialogueStyle"),
    appearance: mergeObj("appearance"),
    timeline: mergedTimeline,
    arcProgress: mergeText("arcProgress"),
    currentStatus: String(incoming.currentStatus || existing.currentStatus || "alive"),
    tags: [...new Set([...(Array.isArray(existing.tags) ? existing.tags as string[] : []), ...(Array.isArray(incoming.tags) ? incoming.tags as string[] : []), "📥导入"])],
    role: String(incoming.role || existing.role || "supporting"),
    age: String(incoming.age || existing.age || "未知"),
    gender: String(incoming.gender || existing.gender || "未知"),
  };
}

function ruleMergeLore(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  const oldContent = String(existing.content || "");
  const newContent = String(incoming.content || "");
  const mergedContent = oldContent && newContent && !oldContent.includes(newContent)
    ? oldContent + "\n\n【补充】\n" + newContent
    : (newContent || oldContent);

  const oldKeys = Array.isArray(existing.keys) ? existing.keys as string[] : [];
  const newKeys = Array.isArray(incoming.keys) ? incoming.keys as string[] : [];
  const mergedKeys = [...new Set([...oldKeys, ...newKeys])];

  const oldSub = (typeof existing.subFields === "object" && existing.subFields !== null && !Array.isArray(existing.subFields))
    ? existing.subFields as Record<string, unknown> : {};
  const newSub = (typeof incoming.subFields === "object" && incoming.subFields !== null && !Array.isArray(incoming.subFields))
    ? incoming.subFields as Record<string, unknown> : {};
  const mergedSub = { ...oldSub, ...newSub };

  return { content: mergedContent, keys: mergedKeys, subFields: mergedSub, category: String(incoming.category || existing.category || "custom") };
}

// ═══════════════════════════════════════════════════════════════
// 世界书 content 构建
// ═══════════════════════════════════════════════════════════════

function buildLoreContent(entry: Record<string, unknown>): string {
  const mainContent = String(entry.content || "");
  const subFields = entry.subFields as Record<string, unknown> | undefined;
  if (!subFields || Object.keys(subFields).length === 0) return mainContent;

  const fieldLabels: Record<string, string> = {
    eraAndTech: "时代与技术背景", fundamentalLaw: "世界根本法则",
    coreConflictSource: "核心冲突源", powerSystem: "力量体系",
    factionDetails: "势力详情", factionRelations: "势力关系",
    combatLogic: "战斗逻辑", rareResources: "稀有资源与传承",
    geographyAndCulture: "地理与人文", culturalImpact: "文化影响",
    historicalEvents: "重大历史事件", hiddenTruths: "被掩埋的真相",
  };

  const parts: string[] = [];
  if (mainContent) parts.push(mainContent);
  for (const [key, value] of Object.entries(subFields)) {
    const v = String(value || "").trim();
    if (v) parts.push(`【${fieldLabels[key] || key}】${v}`);
  }
  return parts.join("\n\n");
}

// ═══════════════════════════════════════════════════════════════
// 全局上下文构建 —— Flash 合并时需要知道全貌
// ═══════════════════════════════════════════════════════════════

function buildGlobalContext(
  project: { name: string; genre: string[]; synopsis?: string },
  allChars: { name: string; role: string; personality: unknown; appearance: unknown; background?: string; abilities: string[] }[],
  allLore: { title: string; category: string; content: string }[],
  style: { styleDescription?: string; povType?: string; narrativeDistance?: string } | null,
): string {
  // F3：全局上下文改为「紧凑名索引」——仅列 名称+角色/类别 并去重，去掉原性格/外貌/正文细节。
  // 体积从上千字符/批 降到仅名称；且覆盖全部角色/词条（不再 slice(0,50/30) 截断 → 修复后段上下文丢失）。
  // 逐批重复发送的仍是同一份小体积名索引；批次聚焦清单由 mergeOneBatch 按本批名称单独拼接。
  const seenChar = new Set<string>();
  const charNames = allChars
    .map(c => `${c.name}(${c.role || "supporting"})`)
    .filter(n => { const k = n.toLowerCase(); if (seenChar.has(k)) return false; seenChar.add(k); return true; });
  const seenLore = new Set<string>();
  const loreNames = allLore
    .map(l => `[${l.title}](${l.category || "custom"})`)
    .filter(n => { const k = n.toLowerCase(); if (seenLore.has(k)) return false; seenLore.add(k); return true; });

  const styleText = style
    ? `文风: ${style.styleDescription?.slice(0, 80) || ""} | POV: ${style.povType || ""} | 叙事距离: ${style.narrativeDistance || ""}`
    : "（未设定）";

  return `【作品全局上下文——角色/词条名索引（仅列名称，供合并时排查重名与区分度，不含正文细节）】

作品：${project.name}
类型：${project.genre.join("、")}
总纲：${project.synopsis?.slice(0, 200) || "（无）"}
风格：${styleText}

=== 全部已有角色（${charNames.length}人）===
${charNames.join("、") || "（暂无）"}

=== 全部世界书词条（${loreNames.length}条）===
${loreNames.join("、") || "（暂无）"}`;
}

// ═══════════════════════════════════════════════════════════════
// POST (SSE 流式)
// ═══════════════════════════════════════════════════════════════

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
  }
  const projectId = body.projectId as string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chapters = (body.chapters || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const characters = (body.characters || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const loreEntries = (body.loreEntries || []) as any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const style = (body.style || {}) as any;
  const volumeMode = !!body.volumeMode;
  const updateSynopsis = body.updateSynopsis !== false;

  if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

  const pid = projectId as string;

  // P0 修复：空载荷校验必须在加锁「之前」——否则 400 提前返回会跳过 finally，
  // 导致锁残留最长 300s，期间合法写入（含真实重试）被 409 阻塞，幂等锁反成拒绝服务。
  if (chapters.length === 0 && characters.length === 0 && loreEntries.length === 0)
    return NextResponse.json({ error: "没有任何要导入的数据" }, { status: 400 });

  // 并发幂等锁：基于 DB 唯一约束（ImportCommitLock），跨实例有效，替代进程内存 Map。
  // 持锁状态由「锁行是否存在」判定，移除 TTL 旁路；长事务并发的第二个请求触发 P2002 冲突 → 409 跳过。
  // N3 修复：进程在持锁期间崩溃会残留永久锁 → 后续提交永远 409。此处先清理 15 分钟前的陈旧锁，
  // 仅删除 stale（createdAt 早于阈值）的锁行，不影响仍在进行的正常并发锁（其锁较新，保留 → 仍 409）。
  const STALE_LOCK_MS = 15 * 60 * 1000; // 15 分钟
  const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
  await prisma.importCommitLock.deleteMany({
    where: { projectId: pid, nodeId: COMMIT_LOCK_NODE, createdAt: { lt: staleThreshold } },
  }).catch(() => {});

  let lockAcquired = false;
  try {
    await prisma.importCommitLock.create({ data: { projectId: pid, nodeId: COMMIT_LOCK_NODE } });
    lockAcquired = true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ error: "该项目正在导入中，请等待上一次提交完成（避免重复写入）" }, { status: 409 });
    }
    // 非冲突型 DB 异常（如锁表暂不可用）：放行但告警，避免误阻塞正常导入
    console.warn(`[import/commit] 幂等锁获取失败（非冲突）：${e instanceof Error ? e.message : e}`);
  }

  const sse = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      // P_a：commit 全局 deadline——避免 300s 平台强杀整段丢弃导入结果（与 parse 的 PARSE_DEADLINE 口径一致）。
      // 到点即停止放飞新批；已放飞批次照常落库；未放飞批次降级 ruleMerge（事务 else 分支兜底）；SSE 回报 partial。
      const COMMIT_DEADLINE_MS = 270_000; // 留 30s 余量给 maxDuration(300s) 与收尾事务
      const commitDeadline = Date.now() + COMMIT_DEADLINE_MS;
      let deadlineHit = false;
      const pastDeadline = () => Date.now() > commitDeadline;

      try {
        const project = await prisma.project.findUnique({ where: { id: projectId as string } });
        if (!project) { send({ type: "error", message: "项目不存在" }); controller.close(); return; }

        // ── 预加载全局上下文 ──
        const [allExistingChars, allExistingLore, existingStyle] = await Promise.all([
          prisma.characterCard.findMany({ where: { projectId: projectId as string } }),
          prisma.lorebookEntry.findMany({ where: { projectId: projectId as string, enabled: true } }),
          prisma.styleCard.findFirst({ where: { projectId: projectId as string }, orderBy: { updatedAt: "desc" } }),
        ]);
        const globalContext = buildGlobalContext(project, allExistingChars, allExistingLore, existingStyle);

        // P_a：受全局 deadline 约束的分批并行 AI 合并；到点停止放飞新批，未放飞批次结果留 null → 事务内走 ruleMerge 兜底。
        const runMergeBatches = async (
          batches: MergePair[][],
          type: "char" | "lore",
        ): Promise<(Record<string, unknown>[] | null)[]> => {
          const results: (Record<string, unknown>[] | null)[] = new Array(batches.length).fill(null);
          if (batches.length === 0) return results;
          const total = batches.length;
          let nextIdx = 0;
          const workerCount = Math.min(4, total); // 与 MERGE_LIMIT 并发上限一致，避免一次性放飞全部批次
          const workers: Promise<void>[] = [];
          const stage = type === "char" ? "chars-merge" : "lore-merge";
          const unit = type === "char" ? "角色" : "词条";
          for (let w = 0; w < workerCount; w++) {
            workers.push((async () => {
              while (true) {
                if (pastDeadline()) {
                  deadlineHit = true;
                  send({ type: "progress", stage, message: `⏱️ 全局 deadline 到点，停止放飞新批，未放飞批次降级规则合并`, pct: 90 });
                  break;
                }
                const ci = nextIdx++;
                if (ci >= total) break;
                const batch = batches[ci];
                const aiResult = await MERGE_LIMIT(() => mergeOneBatch(batch, globalContext, type, batch.map(p => p.name)));
                results[ci] = aiResult;
                send({ type: "progress", stage, message: `第${ci + 1}/${total}批 ${aiResult ? "✨AI" : "⚙️规则"}合并 (${batch.length}${unit})`, batch: ci + 1, totalBatches: total, done: ci + 1 });
              }
            })());
          }
          await Promise.all(workers);
          return results;
        };

        const created = { volumes: 0, chapters: 0, characters: 0, loreEntries: 0, styleCard: false, charMerged: 0, loreMerged: 0 };

        // ─── 1. 人物卡：内存查重 + AI 合并（仅计算，不写库；写库统一进整体事务）──

        const charByName = new Map<string, typeof allExistingChars[0]>();
        const charByAlias: { char: typeof allExistingChars[0]; aliasesLower: string[] }[] = [];
        for (const ec of allExistingChars) {
          charByName.set(ec.name.toLowerCase(), ec);
          if (ec.aliases.length > 0) {
            charByAlias.push({ char: ec, aliasesLower: ec.aliases.map((a: string) => a.toLowerCase()) });
          }
        }

        const charMergePairs: MergePair[] = [];
        const charNewData: Record<string, unknown>[] = [];
        const seenCharNames = new Set<string>(); // 同批去重：防止 createMany 写入重复行（工坊 P1）

        for (const char of characters) {
          if (!char.name) continue;
          const nameLower = String(char.name).toLowerCase();
          if (seenCharNames.has(nameLower)) continue; // 同批内重复名，跳过（取首个），避免重复写库
          seenCharNames.add(nameLower);
          let existing = charByName.get(nameLower);

          // 别名模糊匹配
          if (!existing) {
            const inAliases: string[] = Array.isArray(char.aliases) ? (char.aliases as string[]).map(a => String(a).toLowerCase()) : [];
            for (const { char: ec, aliasesLower } of charByAlias) {
              if (aliasesLower.some(a => a === nameLower || inAliases.includes(a))) {
                existing = ec;
                break;
              }
            }
          }

          if (existing) {
            charMergePairs.push({
              name: String(char.name),
              existingId: existing.id,
              old: {
                aliases: existing.aliases, abilities: existing.abilities,
                hiddenMotives: existing.hiddenMotives, relationships: existing.relationships,
                background: existing.background, personality: existing.personality,
                dialogueStyle: existing.dialogueStyle, appearance: existing.appearance,
                timeline: existing.timeline,
                arcProgress: existing.arcProgress, currentStatus: existing.currentStatus,
                role: existing.role, age: existing.age, gender: existing.gender, tags: existing.tags,
              },
              new: char as Record<string, unknown>,
            });
          } else {
            charNewData.push({
              projectId, name: String(char.name || ""),
              aliases: Array.isArray(char.aliases) ? char.aliases.filter(Boolean) : [],
              age: String(char.age || "未知"), gender: String(char.gender || "未知"),
              role: String(char.role || "supporting"),
              appearance: (char.appearance || {}) as any,
              personality: (char.personality || []) as any,
              dialogueStyle: (char.dialogueStyle || {}) as any,
              background: String(char.background || ""),
              abilities: Array.isArray(char.abilities) ? char.abilities.filter(Boolean) : [],
              hiddenMotives: Array.isArray(char.hiddenMotives) ? char.hiddenMotives.filter(Boolean) : [],
              timeline: Array.isArray(char.timeline) ? char.timeline : [],
              currentStatus: String(char.currentStatus || "alive"),
              arcProgress: String(char.arcProgress || ""),
              relationships: normalizeRelationships(char.relationships),
              tags: ["📥导入"],
            });
          }
        }

        // 角色合并：分批并行 AI（网络，事务外；仅算结果，不落库；受全局 deadline 约束，P_a）
        const charTotalBatches = Math.ceil(charMergePairs.length / BATCH_SIZE);
        const charBatches = charMergePairs.length > 0 ? chunkPairs(charMergePairs, BATCH_SIZE) : [];
        let charAiResults: (Record<string, unknown>[] | null)[] = [];
        if (charMergePairs.length > 0) {
          send({ type: "progress", stage: "chars-merge", message: `Flash 分批合并角色... 0/${charTotalBatches} 批 (共${charMergePairs.length}个)`, batch: 0, totalBatches: charTotalBatches, done: 0 });
          charAiResults = await runMergeBatches(charBatches, "char");
        }
        created.charMerged = charMergePairs.length;

        // ─── 2. 世界书词条：内存查重 + AI 合并（仅计算，不写库）──

        const allLoreForDedup = await prisma.lorebookEntry.findMany({
          where: { projectId: projectId as string },
          select: { id: true, title: true, content: true, keys: true, category: true },
        });
        const loreByTitle = new Map<string, typeof allLoreForDedup[0]>();
        for (const el of allLoreForDedup) {
          loreByTitle.set(el.title.toLowerCase(), el);
        }

        const loreMergePairs: MergePair[] = [];
        const loreNewData: Record<string, unknown>[] = [];
        const seenLoreTitles = new Set<string>(); // 同批去重：防止 createMany 写入重复词条（工坊 P1）

        for (const entry of loreEntries) {
          if (!entry.title) continue;
          const titleLower = String(entry.title).toLowerCase();
          if (seenLoreTitles.has(titleLower)) continue; // 同批内重复标题，跳过
          seenLoreTitles.add(titleLower);
          const existing = loreByTitle.get(titleLower);

          if (existing) {
            loreMergePairs.push({
              name: String(entry.title),
              existingId: existing.id,
              old: { content: existing.content, keys: existing.keys, category: existing.category },
              new: {
                content: buildLoreContent(entry),
                keys: Array.isArray(entry.keys) ? entry.keys.filter(Boolean) : [String(entry.title || "")],
                category: String(entry.category || "custom"),
                subFields: entry.subFields || {},
              },
            });
          } else {
            loreNewData.push({
              projectId, title: String(entry.title || ""),
              category: String(entry.category || "custom"),
              keys: Array.isArray(entry.keys) ? entry.keys.filter(Boolean) : [String(entry.title || "")],
              content: buildLoreContent(entry), insertionOrder: 50, enabled: true,
            });
          }
        }

        // 词条合并：分批并行 AI（网络，事务外；仅算结果，不落库；受全局 deadline 约束，P_a）
        const loreTotalBatches = Math.ceil(loreMergePairs.length / BATCH_SIZE);
        const loreBatches = loreMergePairs.length > 0 ? chunkPairs(loreMergePairs, BATCH_SIZE) : [];
        let loreAiResults: (Record<string, unknown>[] | null)[] = [];
        if (loreMergePairs.length > 0) {
          send({ type: "progress", stage: "lore-merge", message: `Flash 分批合并词条... 0/${loreTotalBatches} 批 (共${loreMergePairs.length}个)`, batch: 0, totalBatches: loreTotalBatches, done: 0 });
          loreAiResults = await runMergeBatches(loreBatches, "lore");
        }
        created.loreMerged = loreMergePairs.length;

        // ─── 3. 文风 + 总纲：先算好待写入内容 ───

        const writeStyle = style && Object.keys(style).length > 0;
        let synopsisText: string | null = null;
        if (updateSynopsis && chapters.length > 0) {
          const first = chapters[0].content;
          if (first && first.length > 100 && !project.synopsis) {
            synopsisText = `导入文本开篇：${first.slice(0, 500).replace(/\n/g, " ")}...`;
          }
        }

        // ─── 4. 整体事务：原子写入全部阶段，失败整体回滚，不留孤儿写（P1 修复）───
        send({ type: "progress", stage: "commit", message: "原子写入数据库（事务中）...", pct: 95 });
        await prisma.$transaction(async (tx) => {
          // 章节节点
          if (chapters.length > 0) {
            const volumeMap = new Map<string, string>();
            if (volumeMode) {
              const seenVolumes = new Set<string>();
              for (const ch of chapters) {
                if (ch.volumeTitle && !seenVolumes.has(ch.volumeTitle)) {
                  seenVolumes.add(ch.volumeTitle);
                  const volNode = await tx.storyNode.create({
                    data: { projectId: projectId as string, parentId: null, type: "volume", title: ch.volumeTitle,
                      order: seenVolumes.size - 1, status: "completed", wordCount: 0, activeCharacters: [], activeLoreIds: [] },
                  });
                  volumeMap.set(ch.volumeTitle, volNode.id);
                  created.volumes++;
                }
              }
            }
            for (let i = 0; i < chapters.length; i++) {
              const ch = chapters[i];
              await tx.storyNode.create({
                data: { projectId: projectId as string, parentId: volumeMode && ch.volumeTitle ? volumeMap.get(ch.volumeTitle) || null : null,
                  type: "chapter", title: ch.chapterTitle || `第${i + 1}章`, order: ch.order ?? i,
                  status: "completed", content: ch.content, outline: ch.content?.slice(0, 200) || null,
                  wordCount: ch.wordCount || ch.content?.length || 0, activeCharacters: [], activeLoreIds: [],
                  notes: "📥 从导入文本自动创建" },
              });
              created.chapters++;
            }
          }

          // 新角色直接批量写入
          if (charNewData.length > 0) {
            await tx.characterCard.createMany({ data: charNewData as any });
          }

          // 角色合并写回（AI 成功用其合并结果，否则规则合并兜底）
          for (let bi = 0; bi < charBatches.length; bi++) {
            const batch = charBatches[bi];
            const aiResult = charAiResults[bi];
            for (let j = 0; j < batch.length; j++) {
              const pair = batch[j];
              if (aiResult && aiResult.length === batch.length) {
                const merged = aiResult[j];
                await tx.characterCard.update({
                  where: { id: pair.existingId },
                  data: {
                    ...merged,
                    name: pair.name,
                    projectId: undefined,
                    relationships: normalizeRelationships((merged as any)?.relationships),
                  } as any,
                });
              } else {
                const merged = ruleMergeChar(pair.old, pair.new);
                await tx.characterCard.update({ where: { id: pair.existingId }, data: merged as any });
              }
            }
          }

          // 新词条直接批量写入
          if (loreNewData.length > 0) {
            await tx.lorebookEntry.createMany({ data: loreNewData as any });
          }

          // 词条合并写回
          for (let bi = 0; bi < loreBatches.length; bi++) {
            const batch = loreBatches[bi];
            const aiResult = loreAiResults[bi];
            for (let j = 0; j < batch.length; j++) {
              const pair = batch[j];
              if (aiResult && aiResult.length === batch.length) {
                const merged = aiResult[j];
                await tx.lorebookEntry.update({
                  where: { id: pair.existingId },
                  data: { content: String(merged.content || ""), keys: Array.isArray(merged.keys) ? merged.keys : [] } as any,
                });
              } else {
                const merged = ruleMergeLore(pair.old, pair.new);
                await tx.lorebookEntry.update({
                  where: { id: pair.existingId },
                  data: { content: merged.content as string, keys: merged.keys as string[] } as any,
                });
              }
            }
          }

          // 文风卡
          if (writeStyle) {
            await tx.styleCard.deleteMany({ where: { projectId: projectId as string } });
            await tx.styleCard.create({
              data: {
                projectId: projectId as string,
                avgSentenceLength: (style.avgSentenceLength as number) || 25,
                shortSentenceRatio: (style.shortSentenceRatio as number) || 0.3,
                longSentenceRatio: (style.longSentenceRatio as number) || 0.15,
                dialogueRatio: (style.dialogueRatio as number) || 0.35,
                descriptionRatio: (style.descriptionRatio as number) || 0.25,
                actionRatio: (style.actionRatio as number) || 0.25,
                innerThoughtRatio: (style.innerThoughtRatio as number) || 0.15,
                povType: String(style.povType || "third_person_limited"),
                narrativeDistance: String(style.narrativeDistance || "medium"),
                tonalMarkers: (style.tonalMarkers || {}) as any,
                lexicalFeatures: (style.lexicalFeatures || {}) as any,
                styleDescription: String(style.styleDescription || ""),
                sampleText: String(style.sampleText || ""),
                sourceChapterCount: chapters.length,
              },
            });
            created.styleCard = true;
          }

          // 总纲
          if (synopsisText) {
            await tx.project.update({
              where: { id: projectId as string },
              data: { synopsis: synopsisText },
            });
          }
        });

        created.characters = charNewData.length + created.charMerged;
        created.loreEntries = loreNewData.length + created.loreMerged;

        const totalChars = created.characters;
        send({
          type: "done",
          status: deadlineHit ? "partial" : "completed",
          created,
          message: `✅ 导入完成：${created.volumes}卷 ${created.chapters}章 ${totalChars}角色 ${created.loreEntries}词条${created.styleCard ? " +文风卡" : ""}（含${created.charMerged}个AI合并 +${created.loreMerged}个词条合并）${deadlineHit ? " · ⏱️ 全局 deadline 截断，未放飞批次已降级规则合并" : ""}`,
        });

        syncGlobalPrompt(projectId).catch(() => {});

      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "导入失败" });
      } finally {
        controller.close();
        // 释放幂等锁：删除锁行即视为解锁（进程被杀则依赖部署侧重启/清理，不再用 TTL 兜底）
        if (lockAcquired) {
          await prisma.importCommitLock.deleteMany({
            where: { projectId: pid, nodeId: COMMIT_LOCK_NODE },
          }).catch(() => {});
        }
      }
    },
  });

  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
