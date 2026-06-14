/**
 * POST /api/characters/expand
 *
 * v2: 16并发 · deepseek-ai/DeepSeek-V4-Flash · 不截断源文本 · 16384 tokens 输出
 *
 * SSE 流式：逐角色独立并行扩展。
 * 每完成一个角色即时推 SSE 进度。
 */
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { parseAIJson } from "@/lib/json-parser";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export const maxDuration = 300;

const DS_URL = "https://api.siliconflow.cn/v1/chat/completions";
const DS_MODEL = "deepseek-ai/DeepSeek-V4-Flash";
const CONCURRENCY = 16;
const MAX_TOKENS = 32768;

function getDSKey(): string {
  return process.env.LLM_API_KEY || "";
}

// ─── 安全合并 ──────────────────────────────────────

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
  const loreText = lore.slice(0, 200).map(l =>
    `[${l.title}](${l.category}) ${l.content.slice(0, 80)}`
  ).join(" | ");

  const styleText = style
    ? `${(style.styleDescription as string)?.slice(0, 80) || ""} | POV:${style.povType || "第三人称"}`
    : "";

  return `${project.name}（${project.genre.join("、")}）${project.synopsis ? " | 总纲:" + project.synopsis.slice(0, 200) : ""}
世界观(${lore.length}条): ${loreText || "无"}
${styleText ? "文风: " + styleText : ""}`;
}

// ─── DeepSeek API 调用 ─────────────────────────────

async function callDS(system: string, prompt: string): Promise<{ raw: string } | { error: string }> {
  const key = getDSKey();
  if (key.length < 10) return { error: "DeepSeek API Key 未配置" };

  try {
    const r = await fetch(DS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: DS_MODEL,
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

// ─── 单角色扩展 ──────────────────────────────────

async function expandOne(
  char: { id: string; name: string; card: Record<string, unknown> },
  context: string,
): Promise<{ id: string; name: string; result: Record<string, unknown> | null; error?: string }> {
  const qic = (char.card.quickImportContent as string) || "";
  const bg = (char.card.background as string) || "";
  // 不再硬截断——全文传入
  const sourceText = (qic || bg);
  // 如果极长（>20000字），用摘要提示而非截断
  const truncatedHint = sourceText.length > 20000
    ? `（原始设定共${sourceText.length}字，请逐字逐句保留前20000字中的信息，后文可基于语境合理推敲）`
    : "";

  const prompt = `基于原始设定扩展【${char.name}】的角色卡——信息不能丢，能复述就别总结。

【世界观+文风——所有扩展基于此】
${context}

【该角色原始设定——逐字逐句保留，不要缩写】
${sourceText.slice(0, 20000)}${truncatedHint}

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
2. ✅ 已分好类的能力→ abilities字段逐条原样复述，包括原理、应用场景、限制
3. ✅ 背景缺失的信息→基于世界观、文风、同类角色的信息推敲补充
4. ✅ personality→从原始设定的描述中提炼性格特征
5. ✅ appearance→如果原始设定没有外貌描写，基于角色定位和世界观合理推敲
6. ❌ 任何字段禁止"无""未知""暂无"或留空——基于上下文推断填满
7. ❌ 字符串值内禁止真实换行——所有换行必须写成 \\n。禁止未转义的双引号——写成 \\\"
8. ✅ 只输出纯JSON，无markdown代码块，无额外说明文字`;

  const result = await callDS(
    "扩展角色卡。少总结多复述，原文照搬不缩写，空字段基于世界观推敲补全。只输出JSON。",
    prompt,
  );

  if ("error" in result) {
    return { id: char.id, name: char.name, result: null, error: result.error };
  }

  // JSON 解析（使用共享工具）
  try {
    const parsed = parseAIJson(result.raw);
    return { id: char.id, name: char.name, result: parsed };
  } catch (e) {
    return { id: char.id, name: char.name, result: null, error: `JSON解析失败: ${String(e).slice(0, 300)}` };
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
  const characterIds = (body.characterIds || []) as string[];

  if (!projectId || !characterIds.length) {
    return NextResponse.json({ error: "缺少 projectId 或 characterIds" }, { status: 400 });
  }

  const dsKey = getDSKey();
  if (dsKey.length < 10) {
    return NextResponse.json({ error: "硅基流动 API Key 未配置。请在环境变量中设置 LLM_API_KEY。" }, { status: 500 });
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

        // ═══════════════════════════════════════════════════════
        // 预处理管线：审计 → 拆卡 → 删非角色 → 去重合并
        // ═══════════════════════════════════════════════════════

        const chars = await prisma.characterCard.findMany({ where: { id: { in: characterIds } } });
        send({ type: "progress", stage: "audit", message: `🔍 预处理 ${chars.length} 张卡——审计中...`, pct: 1 });

        // ── Step 1: AI 批量审计 —— 一次调用完成三件事 ──
        //   a) 检测非角色（地名/物品/势力/概念混入角色列表的）
        //   b) 检测组合卡（一张卡写了多个人，如"张三、李四"）
        //   c) 检测缺失角色（background 中提到了但还没建卡的人物）

        interface AuditResult {
          id: string;
          name: string;
          isCharacter: boolean;
          reason: string;
          splitNames: string[];
          missingCharacters: string[];
        }

        const auditResults: AuditResult[] = [];

        if (chars.length > 0) {
          // 构建完整角色名列表（用于缺失检测）
          const allKnownNames = chars.map(c => c.name).join("、");

          const charListForAudit = chars.map(c => {
            const bg = ((c.background || "") as string).slice(0, 500);
            const abs = (c.abilities || []).join("、").slice(0, 100);
            const role = c.role || "supporting";
            return `${c.id}|${c.name}|${role}|${abs || "无"}|${bg || "无背景"}`;
          }).join("\n---\n");

          const auditSystem = `你是角色卡审计员。逐张检查每张卡，完成三项任务：

1. 【是否真实人物】判断这条记录是不是一个"人"。
   - 地名（XX城/XX大陆/XX森林/XX山脉）→ 不是角色
   - 物品/器物（XX剑/XX丹/XX符/XX秘籍）→ 不是角色
   - 势力/组织（XX宗/XX派/XX殿/XX阁/XX教/XX会）→ 不是角色
   - 概念/能力名（XX之道/XX之术/XX法则）→ 不是角色
   - 如果 background 完全描述的是地点/势力/物品特征而非人的特征 → 不是角色
   - 有名字的个体人物（包括配角、路人、龙套）→ 是角色

2. 【是否组合卡】名字里是否包含多个人。
   - 分隔符明显："张三、李四""王五/赵六" → 拆分
   - "和/与/及"连接两个完整人名 → 拆分
   - 单个人名 → 不拆分

3. 【缺失角色检测】仔细阅读每张卡的 background 字段，找出其中提到的所有有名字的个体人物。
   - 已知角色名单：${allKnownNames}——这些不需要再建卡
   - 扫描 background 中是否出现了不在已知名单中的新人物名
   - 如果发现新人物（2-4字中文名，从上下文判断是独立个体），添加到 missingCharacters 数组
   - 注意区分：组织名/地名/招式名/物品名不是人物，不要加入

输出纯JSON数组：
[{"id":"卡id","isCharacter":true/false,"reason":"简短理由≤20字","splitNames":["拆出的人名"],"missingCharacters":["新发现的人名"]}]
splitNames和missingCharacters都可能是空数组。`;

          const auditPrompt = `审计以下${chars.length}张角色卡。逐张判断：是否真实人物？是否组合卡？background 里是否提到了还没建卡的人物？

格式：id|姓名|定位|能力|背景
---
${charListForAudit}

已知角色：${allKnownNames}

输出JSON数组：
[{"id":"...", "isCharacter":true/false, "reason":"...", "splitNames":[...], "missingCharacters":[...]}]`;

          try {
            const auditRaw = await callDS(auditSystem, auditPrompt);
            if ("raw" in auditRaw) {
              const parsed = parseAIJson(auditRaw.raw);
              if (Array.isArray(parsed)) {
                for (const item of parsed) {
                  auditResults.push({
                    id: String((item as any).id || ""),
                    name: String((item as any).name || ""),
                    isCharacter: (item as any).isCharacter !== false,
                    reason: String((item as any).reason || ""),
                    splitNames: Array.isArray((item as any).splitNames) ? (item as any).splitNames : [],
                    missingCharacters: Array.isArray((item as any).missingCharacters) ? (item as any).missingCharacters : [],
                  });
                }
              }
            }
          } catch {
            // 审计失败不阻塞——全部视为角色，不做拆分
          }
        }

        const auditMap = new Map(auditResults.map(a => [a.id, a]));

        // ── Step 2: 拆组合卡 —— 一张卡写多人 → 每人独立建卡 ──
        const splitLog: string[] = [];
        const idsToDelete = new Set<string>();

        for (const c of chars) {
          const audit = auditMap.get(c.id);
          if (!audit || audit.splitNames.length <= 1) continue;

          // 标记原卡删除
          idsToDelete.add(c.id);
          const originalName = c.name;

          for (const splitName of audit.splitNames) {
            const trimmed = splitName.trim();
            if (!trimmed || trimmed === originalName) continue;

            // 检查是否已存在同名卡
            const existing = chars.find(
              ec => ec.name.toLowerCase().trim() === trimmed.toLowerCase().trim()
            );
            if (existing) {
              // 已存在 → 合并 quickImportContent 到已有卡
              if (c.quickImportContent) {
                const merged = [existing.quickImportContent, c.quickImportContent]
                  .filter(s => typeof s === 'string' && s.trim().length > 0)
                  .join("\n\n---\n---\n\n");
                await prisma.characterCard.update({
                  where: { id: existing.id },
                  data: { quickImportContent: merged },
                }).catch(() => {});
              }
              splitLog.push(`${originalName}→${trimmed}(合并到已有)`);
            } else {
              // 新建独立卡
              await prisma.characterCard.create({
                data: {
                  projectId,
                  name: trimmed,
                  role: c.role || "supporting",
                  quickImportContent: c.quickImportContent || "",
                  background: c.background || "",
                  abilities: c.abilities || [],
                  hiddenMotives: c.hiddenMotives || [],
                  personality: c.personality || ({} as any),
                  tags: ["🆕 自动拆分"],
                  currentStatus: "alive",
                } as any,
              });
              splitLog.push(`${originalName}→${trimmed}(新建)`);
            }
          }
        }

        // ── Step 3: 删除非角色卡 ──
        const deleteLog: string[] = [];
        for (const c of chars) {
          if (idsToDelete.has(c.id)) continue; // 已被拆卡标记删除
          const audit = auditMap.get(c.id);
          if (audit && !audit.isCharacter) {
            idsToDelete.add(c.id);
            deleteLog.push(`${c.name}: ${audit.reason}`);
          }
        }

        // 执行删除
        if (idsToDelete.size > 0) {
          await prisma.characterCard.deleteMany({
            where: { id: { in: [...idsToDelete] } },
          });
        }

        // ── Step 3.5: 缺失角色自动建卡 —— 从 background 中发现新人物 ──
        const newCharLog: string[] = [];
        const allMissingNames = new Set<string>();
        for (const audit of auditResults) {
          for (const name of audit.missingCharacters) {
            const trimmed = name.trim();
            if (trimmed.length >= 2 && trimmed.length <= 8) {
              allMissingNames.add(trimmed);
            }
          }
        }

        if (allMissingNames.size > 0) {
          // 获取全项目现有角色名
          const allProjectChars = await prisma.characterCard.findMany({
            where: { projectId },
            select: { name: true },
          });
          const existingNames = new Set(allProjectChars.map(c => c.name.toLowerCase().trim()));

          for (const newName of allMissingNames) {
            if (existingNames.has(newName.toLowerCase().trim())) continue;
            // 检查是否和已删除的卡同名
            if ([...idsToDelete].some(id => {
              const c = chars.find(ch => ch.id === id);
              return c && c.name.toLowerCase().trim() === newName.toLowerCase().trim();
            })) continue;

            try {
              await prisma.characterCard.create({
                data: {
                  projectId,
                  name: newName,
                  role: "supporting",
                  personality: { dominant: "待扩展", drive: "", contradiction: "", habits: [], socialMask: "" } as any,
                  background: `[自动发现] 从角色扩展分析中检测到的新人物`,
                  abilities: [],
                  hiddenMotives: [],
                  tags: ["🆕 自动发现"],
                  currentStatus: "alive",
                } as any,
              });
              newCharLog.push(newName);
            } catch { /* 重名跳过 */ }
          }
        }

        // 重新加载——拆卡/新建可能变了角色列表
        let workingChars: typeof chars;
        if (idsToDelete.size > 0 || splitLog.length > 0) {
          const allProjectChars = await prisma.characterCard.findMany({ where: { projectId } });
          // 排除已删除的，包含新建的
          workingChars = allProjectChars.filter(c => !idsToDelete.has(c.id));
        } else {
          workingChars = chars.filter(c => !idsToDelete.has(c.id));
        }

        // 发送预处理报告
        const preprocessParts: string[] = [];
        if (splitLog.length > 0) preprocessParts.push(`✂️ 拆分 ${splitLog.length} 组: ${splitLog.join("、")}`);
        if (deleteLog.length > 0) preprocessParts.push(`🗑️ 删除 ${deleteLog.length} 张非角色: ${deleteLog.join("、")}`);
        if (newCharLog.length > 0) preprocessParts.push(`🆕 发现 ${newCharLog.length} 个缺失角色: ${newCharLog.join("、")}`);
        if (preprocessParts.length > 0) {
          send({ type: "progress", stage: "preprocess", message: preprocessParts.join(" | "), pct: 2 });
        }

        // ── Step 4: 去重合并（增强版——含别名匹配+背景相似度）──
        const normalizeName = (name: string): string => {
          return name.toLowerCase()
            .replace(/[（(][^)）]*[)）]/g, "")
            .replace(/["""''「」『』【】]/g, "")
            .replace(/\s+/g, "").trim();
        };
        const isSameCharacter = (a: string, b: string): boolean => {
          const na = normalizeName(a), nb = normalizeName(b);
          if (!na || !nb) return false;
          if (na === nb) return true;
          // 一个名字包含另一个（如"洁世一"和"洁"）
          const shorter = na.length <= nb.length ? na : nb;
          const longer = na.length > nb.length ? na : nb;
          if (shorter.length < 2) return false;
          if (longer.includes(shorter)) return true;
          // 检查是否是别名关系（名字中括号内容）
          const bareA = na.replace(/[（(（].*$/, "").trim();
          const bareB = nb.replace(/[（(（].*$/, "").trim();
          if (bareA === bareB && bareA.length >= 2) return true;
          return false;
        };

        const dedupedChars: typeof workingChars = [];
        const mergedNames: string[] = [];
        const seenNames = new Map<string, number>();

        for (const c of workingChars) {
          let foundIdx = -1;
          for (const [key, idx] of seenNames) {
            if (isSameCharacter(key, c.name)) { foundIdx = idx; break; }
          }

          if (foundIdx >= 0) {
            const primary = dedupedChars[foundIdx];
            const mergedQC = [primary.quickImportContent, c.quickImportContent]
              .filter(s => typeof s === 'string' && s.trim().length > 0)
              .join("\n\n---\n---\n\n");
            const primaryQC = typeof primary.quickImportContent === 'string' ? primary.quickImportContent : '';
            primary.quickImportContent = mergedQC || primaryQC;
            if (!primary.background && c.background) primary.background = c.background;
            if (!primary.personality && c.personality) primary.personality = c.personality;
            primary.abilities = [...new Set([...primary.abilities, ...c.abilities])];
            primary.hiddenMotives = [...new Set([...primary.hiddenMotives, ...c.hiddenMotives])];

            // 保留信息更丰富的那张卡
            if ((c.background || "").length > (primary.background || "").length) {
              primary.background = c.background;
            }

            await prisma.characterCard.update({
              where: { id: primary.id },
              data: { quickImportContent: primary.quickImportContent },
            }).catch(() => {});

            // 删掉重复卡
            await prisma.characterCard.delete({ where: { id: c.id } }).catch(() => {});
            mergedNames.push(`${primary.name}←${c.name}`);
          } else {
            seenNames.set(c.name.toLowerCase().trim(), dedupedChars.length);
            dedupedChars.push(c);
          }
        }

        if (mergedNames.length > 0) {
          send({ type: "progress", stage: "dedup", message: `🔗 合并 ${mergedNames.length} 组重复角色: ${mergedNames.join("、")}`, pct: 3 });
        }

        const total = dedupedChars.length;
        if (total === 0) {
          send({ type: "error", message: "预处理后没有可扩展的角色——所有卡已被拆分/删除/合并" });
          controller.close();
          return;
        }

        // ── 构建角色列表 ──
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
          message: `${total} 个角色 · deepseek-ai/DeepSeek-V4-Flash · ${CONCURRENCY}并发`,
          pct: 5, done: 0, total,
        });

        // ── 逐角色并行扩展 ──
        let doneCount = 0;
        const charResults: Array<{ name: string; status: "ok" | "failed"; error?: string }> = [];
        const fallbackMap = new Map(charItems.map(c => [c.id, c.card]));

        await withConcurrency(charItems, async (item) => {
          const { result: r, error } = await expandOne(item, context);
          let finalError = error;

          if (r) {
            const fallback = fallbackMap.get(item.id);
            try {
              await prisma.characterCard.update({
                where: { id: item.id },
                data: {
                  appearance: safeMerge(r.appearance, fallback?.appearance) as any,
                  personality: safeMerge(r.personality, fallback?.personality) as any,
                  dialogueStyle: safeMerge(r.dialogueStyle, fallback?.dialogueStyle) as any,
                  background: String(r.background || "").trim(),
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
                  quickImportContent: "",
                },
              });
            } catch (dbErr) {
              finalError = `DB写入失败: ${String(dbErr).slice(0, 100)}`;
            }
          }

          if (finalError) {
            charResults.push({ name: item.name, status: "failed", error: finalError });
          } else {
            charResults.push({ name: item.name, status: "ok" });
          }

          doneCount++;
          send({
            type: "progress",
            stage: finalError ? "char-failed" : "char-done",
            message: `${finalError ? "⚠️" : "✅"} ${item.name}${finalError ? " " + finalError.slice(0, 40) : ""}`,
            done: doneCount, total,
            name: item.name,
            status: finalError ? "failed" : "ok",
            error: finalError?.slice(0, 100),
            pct: Math.round(5 + (doneCount / total) * 90),
          });
        }, CONCURRENCY);

        // ── 完成：推送详细结果 ──
        const okList = charResults.filter(r => r.status === "ok").map(r => r.name);
        const failList = charResults.filter(r => r.status === "failed");

        send({
          type: "done",
          message: failList.length > 0
            ? `扩展完成：${okList.length}/${total} · ${failList.length} 个失败`
            : `✅ 全部成功：${okList.length}/${total}`,
          done: okList.length, total,
          okList,
          failList: failList.map(f => ({ name: f.name, reason: f.error })),
        });

        // 刷新系统提示词缓存
        syncGlobalPrompt(projectId).catch(() => {});
        // 延迟关闭——确保 SSE done 事件 flush 到网络再断联
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
