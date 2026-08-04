/**
 * POST /api/import/commit
 *
 * 提交导入数据 —— 将用户确认后的分章和三卡写入数据库。
 * 同名角色/词条 → AI 模型合并（不冲突、不丢信息）
 * AI 失败 → 回退规则合并
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";
import { getSettings, recordLlmCall } from "@/lib/llm";
import { normalizeRelationships } from "@/lib/relations";

export const maxDuration = 300;

// ─── P1-4：并发 commit 幂等锁 —— 同一 projectId 禁止并发执行，防双击/重试导致重复写库 ───
const commitLocks = new Map<string, number>(); // projectId -> 加锁时间戳
const COMMIT_LOCK_TTL = 300_000; // 锁最长持有 300s，超时自动视为失效，避免异常遗留死锁

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

async function mergeOneBatch(
  pairs: MergePair[],
  globalContext: string,
  type: "char" | "lore",
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
  const prompt = `合并以下${pairs.length}对${isChar ? "角色卡" : "世界书词条"}。核心理念：**求同存异**。

【全局上下文——所有扩展必须基于此】
${globalContext}

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
    recordLlmCall({
      model,
      role: "assistant",
      promptTokens: usage?.prompt_tokens ?? usage?.promptTokens ?? 0,
      completionTokens: usage?.completion_tokens ?? usage?.completionTokens ?? 0,
      totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0,
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
  const charList = allChars.slice(0, 50).map(c => {
    const p = typeof c.personality === "object" && c.personality !== null && !Array.isArray(c.personality)
      ? (c.personality as Record<string, unknown>).dominant || ""
      : Array.isArray(c.personality) ? (c.personality as string[]).join("、") : "";
    const a = typeof c.appearance === "object" && c.appearance !== null
      ? [ (c.appearance as Record<string, unknown>).hair, (c.appearance as Record<string, unknown>).attire ].filter(Boolean).join("，")
      : "";
    return `${c.name}(${c.role})${p ? " 性格:" + String(p).slice(0, 30) : ""}${a ? " 外貌:" + a : ""}`;
  }).join("\n");

  const loreList = allLore.slice(0, 30).map(l =>
    `[${l.title}](${l.category}) ${l.content.slice(0, 80)}`
  ).join("\n");

  const styleText = style
    ? `文风: ${style.styleDescription?.slice(0, 80) || ""} | POV: ${style.povType || ""} | 叙事距离: ${style.narrativeDistance || ""}`
    : "（未设定）";

  return `【作品全局上下文——你的所有扩展必须基于此】

作品：${project.name}
类型：${project.genre.join("、")}
总纲：${project.synopsis?.slice(0, 200) || "（无）"}

=== 已有角色（${allChars.length}人）===
${charList || "（暂无）"}

=== 世界书词条（${allLore.length}条）===
${loreList || "（暂无）"}

=== 风格卡 ===
${styleText}`;
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

  // 并发幂等锁：同一 projectId 正在提交则拒绝（409），防重复写入
  const lockedAt = commitLocks.get(pid);
  if (lockedAt && Date.now() - lockedAt <= COMMIT_LOCK_TTL) {
    return NextResponse.json({ error: "该项目正在导入中，请等待上一次提交完成（避免重复写入）" }, { status: 409 });
  }
  commitLocks.set(pid, Date.now());

  const sse = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

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

        // 角色合并：分批并行 AI（网络，事务外；仅算结果，不落库）
        const charTotalBatches = Math.ceil(charMergePairs.length / BATCH_SIZE);
        const charBatches = charMergePairs.length > 0 ? chunkPairs(charMergePairs, BATCH_SIZE) : [];
        let charAiResults: (Record<string, unknown>[] | null)[] = [];
        if (charMergePairs.length > 0) {
          send({ type: "progress", stage: "chars-merge", message: `Flash 分批合并角色... 0/${charTotalBatches} 批 (共${charMergePairs.length}个)`, batch: 0, totalBatches: charTotalBatches, done: 0 });
          charAiResults = await Promise.all(charBatches.map(async (batch, idx) => {
            const aiResult = await mergeOneBatch(batch, globalContext, "char");
            send({ type: "progress", stage: "chars-merge", message: `第${idx + 1}/${charTotalBatches}批 ${aiResult ? "✨AI" : "⚙️规则"}合并 (${batch.length}角色)`, batch: idx + 1, totalBatches: charTotalBatches, done: idx + 1 });
            return aiResult;
          }));
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

        // 词条合并：分批并行 AI（网络，事务外；仅算结果，不落库）
        const loreTotalBatches = Math.ceil(loreMergePairs.length / BATCH_SIZE);
        const loreBatches = loreMergePairs.length > 0 ? chunkPairs(loreMergePairs, BATCH_SIZE) : [];
        let loreAiResults: (Record<string, unknown>[] | null)[] = [];
        if (loreMergePairs.length > 0) {
          send({ type: "progress", stage: "lore-merge", message: `Flash 分批合并词条... 0/${loreTotalBatches} 批 (共${loreMergePairs.length}个)`, batch: 0, totalBatches: loreTotalBatches, done: 0 });
          loreAiResults = await Promise.all(loreBatches.map(async (batch, idx) => {
            const aiResult = await mergeOneBatch(batch, globalContext, "lore");
            send({ type: "progress", stage: "lore-merge", message: `第${idx + 1}/${loreTotalBatches}批 ${aiResult ? "✨AI" : "⚙️规则"}合并 (${batch.length}词条)`, batch: idx + 1, totalBatches: loreTotalBatches, done: idx + 1 });
            return aiResult;
          }));
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
          created,
          message: `✅ 导入完成：${created.volumes}卷 ${created.chapters}章 ${totalChars}角色 ${created.loreEntries}词条${created.styleCard ? " +文风卡" : ""}（含${created.charMerged}个AI合并 +${created.loreMerged}个词条合并）`,
        });

        syncGlobalPrompt(projectId).catch(() => {});

      } catch (err) {
        send({ type: "error", message: err instanceof Error ? err.message : "导入失败" });
      } finally {
        controller.close();
        commitLocks.delete(pid); // 释放幂等锁
      }
    },
  });

  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}
