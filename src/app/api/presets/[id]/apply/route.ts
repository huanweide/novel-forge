import { jsonError } from "@/lib/api-error";
import { jsonError as apiJsonError } from "@/lib/api";
import { isLikelyUnsafeRegex } from "@/core/post-process/regex";
import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { syncGlobalPrompt } from "@/core/sync-global-prompt";

export const maxDuration = 60;

// N5：llmConfig 子键白名单——取「运行期实际消费的键 ∪ LLMConfig 接口规范键 ∪ 内置预设已知键」并集，
// 仅这些键允许进入 llmConfig，未知键一律丢弃，避免预设 content 摊平污染配置。
const LLM_CONFIG_KEYS: ReadonlySet<string> = new Set([
  // 运行期 buildProjectOverrides 及生成端点实际读取的键
  "model", "baseUrl", "baseURL", "apiKey",
  "temperature", "defaultTemperature", "topP", "defaultTopP",
  "writerModel", "extractorModel", "povType",
  "dimensions", "styleTemplateId", "customStyleNotes", "customForbiddenPatterns",
  // LLMConfig 接口规范键
  "architectModel", "reviewerModel", "summarizeModel",
  "maxTokensPerRequest", "contextWindowSize", "fallbackModels",
  // 内置 api_config 示范预设使用的简写键（语义等同 maxTokensPerRequest）
  "maxTokens",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// 按白名单逐层深合并：对象型子键递归合并，标量/数组直接覆盖，未知键丢弃。
function deepMergeLLMConfig(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...current };
  for (const key of Object.keys(incoming)) {
    if (!LLM_CONFIG_KEYS.has(key)) continue; // 剔除非配置键，杜绝污染
    const inc = incoming[key];
    const cur = current[key];
    if (isPlainObject(inc) && isPlainObject(cur)) {
      result[key] = deepMergeLLMConfig(cur, inc); // 仅对象型子键逐层深合并
    } else {
      result[key] = inc; // 标量/数组直接覆盖
    }
  }
  return result;
}

// POST /api/presets/[id]/apply  { projectId }
// 把预设内容落到项目：
//   表格模板 → 建 LoreTable；文风 → 建/改 StyleCard；
//   世界观/剧情推进/世界书 → 建 LorebookEntry；角色卡 → 建 CharacterCard；
//   正则(regex) → 写入 Project.postProcessingRules；
//   API参数(api_config) → 合并到 Project.llmConfig；
// 并累加下载数。
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { projectId } = (await request.json()) as any;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const preset = await prisma.preset.findUnique({ where: { id } });
    if (!preset) return NextResponse.json({ error: "预设不存在" }, { status: 404 });

    const content: any = preset.content || {};
    const created: any[] = [];

    if (preset.type === "table_template") {
      const tables: any[] = content.tables || [];
      for (const t of tables) {
        const exists = await prisma.loreTable.findFirst({ where: { projectId, key: t.key } });
        if (exists) continue;
        const lt = await prisma.loreTable.create({
          data: {
            projectId,
            name: t.name,
            key: t.key,
            note: t.note || "",
            category: t.category || "custom",
            columns: t.columns || [],
            rows: t.rows || [],
            marker: `[ACU-${projectId}]`,
          } as any,
        });
        created.push({ kind: "table", id: lt.id, name: lt.name });
      }
    } else if (preset.type === "style") {
      const existing = await prisma.styleCard.findFirst({ where: { projectId } });
      const data = {
        projectId,
        styleDescription: content.styleDescription || "",
        povType: content.povType || "third_person_limited",
        avgSentenceLength: content.avgSentenceLength ?? 25,
        shortSentenceRatio: content.shortSentenceRatio ?? 0.3,
        longSentenceRatio: content.longSentenceRatio ?? 0.15,
        dialogueRatio: content.dialogueRatio ?? 0.35,
        descriptionRatio: content.descriptionRatio ?? 0.25,
        actionRatio: content.actionRatio ?? 0.25,
        innerThoughtRatio: content.innerThoughtRatio ?? 0.15,
        tonalMarkers: content.tonalMarkers || {},
        lexicalFeatures: content.lexicalFeatures || {},
        sampleText: content.sampleText || null,
      } as any;
      if (existing) {
        await prisma.styleCard.update({ where: { id: existing.id }, data });
        created.push({ kind: "style", id: existing.id, name: "文风卡" });
      } else {
        const sc = await prisma.styleCard.create({ data });
        created.push({ kind: "style", id: sc.id, name: "文风卡" });
      }
    } else if (preset.type === "worldview" || preset.type === "story_progression") {
      // U2：按 projectId+category+title 去重，重复套用则更新覆盖内容而非叠加重复词条
      const entries: any[] = content.entries || [];
      const cat = preset.type === "worldview" ? "worldview" : "story_progression";
      for (const e of entries) {
        const title = e.title || "未命名词条";
        const existing = await prisma.lorebookEntry.findFirst({ where: { projectId, category: cat, title } });
        if (existing) {
          const le = await prisma.lorebookEntry.update({
            where: { id: existing.id },
            data: { content: e.content || "", keys: e.keys || [], depth: e.depth ?? 3, enabled: true } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title, updated: true });
        } else {
          const le = await prisma.lorebookEntry.create({
            data: {
              projectId,
              title,
              category: cat,
              content: e.content || "",
              keys: e.keys || [],
              depth: e.depth ?? 3,
              enabled: true,
            } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title });
        }
      }
    } else if (preset.type === "character") {
      // P2-③：按 projectId+name(忽略大小写) 去重，重复套用角色预设不叠加同名卡
      const c = content;
      const charName = c.name || "未命名角色";
      const existingChar = await prisma.characterCard.findFirst({
        where: { projectId, name: { equals: charName } },
      });
      if (existingChar) {
        created.push({ kind: "character", id: existingChar.id, name: existingChar.name, skipped: true });
      } else {
        const cc = await prisma.characterCard.create({
          data: {
            projectId,
            name: charName,
            role: c.role || "supporting",
            background: c.background || "",
            personality: c.personality || {},
            appearance: c.appearance || {},
            tags: c.tags || [],
          } as any,
        });
        created.push({ kind: "character", id: cc.id, name: cc.name });
      }
    } else if (preset.type === "regex") {
      // 正则后处理预设：合并 rules 到项目级 postProcessingRules，按 name 去重
      const incoming: any[] = Array.isArray(content.rules) ? content.rules : [];
      // P2-② 前移校验：预设 regex 属外部/用户可控来源，apply 落库前先做 ReDoS 预判，
      // 命中即返回 422 拦截，避免写入后到生成热路径才由 applyRegexRules 执行期失败。
      // 工具内置安全正则（如删除思维链 <think>…）会被判为安全而正常放行。
      for (const r of incoming) {
        if (!r.pattern || typeof r.pattern !== "string") continue;
        const unsafe = isLikelyUnsafeRegex(r.pattern, r.flags || "g");
        if (unsafe) {
          return apiJsonError(
            `预设正则规则「${r.name || "(未命名规则)"}」存在灾难性回溯风险，已拒绝（${unsafe}），套用已中止`,
            422,
          );
        }
      }
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const existing: any[] = Array.isArray(project?.postProcessingRules)
        ? (project.postProcessingRules as any[])
        : [];
      const existingNames = new Set(existing.map((r) => r.name));
      const merged = [...existing];
      for (const r of incoming) {
        if (!r.name || !r.pattern) continue;
        if (existingNames.has(r.name)) {
          // 同名更新
          const idx = merged.findIndex((x) => x.name === r.name);
          if (idx >= 0) merged[idx] = r;
        } else {
          merged.push(r);
          existingNames.add(r.name);
        }
      }
      await prisma.project.update({
        where: { id: projectId },
        data: { postProcessingRules: merged as any },
      });
      created.push({ kind: "regex", name: `正则规则×${incoming.filter((r) => r.name && r.pattern).length}` });
    } else if (preset.type === "lorebook") {
      // 世界书预设：与 worldview/story_progression 共用 LorebookEntry，category=lorebook
      // U2：按 projectId+category+title 去重，重复套用则更新覆盖内容而非叠加重复词条
      const entries: any[] = content.entries || [];
      for (const e of entries) {
        const title = e.title || "未命名词条";
        const existing = await prisma.lorebookEntry.findFirst({ where: { projectId, category: "lorebook", title } });
        if (existing) {
          const le = await prisma.lorebookEntry.update({
            where: { id: existing.id },
            data: { content: e.content || "", keys: e.keys || [], depth: e.depth ?? 3, enabled: true } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title, updated: true });
        } else {
          const le = await prisma.lorebookEntry.create({
            data: {
              projectId,
              title,
              category: "lorebook",
              content: e.content || "",
              keys: e.keys || [],
              depth: e.depth ?? 3,
              enabled: true,
            } as any,
          });
          created.push({ kind: "lorebook", id: le.id, name: title });
        }
      }
    } else if (preset.type === "api_config") {
      // API 参数预设：按白名单逐层深合并到项目 llmConfig（N5：仅已知子键、对象型子键深合并、剔除未知键）
      const project = await prisma.project.findUnique({ where: { id: projectId } });
      const current = ((project?.llmConfig || {}) as unknown as Record<string, unknown>);
      const incoming = (isPlainObject(content) ? content : {}) as Record<string, unknown>;
      const merged = deepMergeLLMConfig(current, incoming);
      await prisma.project.update({
        where: { id: projectId },
        data: { llmConfig: merged as any },
      });
      created.push({ kind: "api_config", name: `API参数:${(content.model || content.temperature) ?? "覆盖"}` });
    } else {
      // N6：未知/新版本 type 穿透所有分支，杜绝静默 no-op 仍写 appliedPresets/downloads
      return NextResponse.json({ error: "未知预设类型" }, { status: 400 });
    }

    // —— F5：记录已应用预设到 project.appliedPresets（配置中心追踪/移除用）——
    try {
      const projectRec = await prisma.project.findUnique({ where: { id: projectId } });
      const list: any[] = Array.isArray((projectRec as any)?.appliedPresets)
        ? ((projectRec as any).appliedPresets as any[])
        : [];
      const filtered = list.filter((p: any) => p.presetId !== id);
      const rec: any = {
        presetId: id,
        type: preset.type,
        title: preset.title,
        appliedAt: new Date().toISOString(),
      };
      if (preset.type === "regex") {
        rec.ruleNames = (Array.isArray(content.rules) ? content.rules : [])
          .filter((r: any) => r.name && r.pattern)
          .map((r: any) => r.name);
      }
      if (preset.type === "api_config") {
        rec.configKeys = Object.keys(content || {});
      }
      filtered.push(rec);
      await prisma.project.update({
        where: { id: projectId },
        data: { appliedPresets: filtered as any },
      });
    } catch (e) {
      console.error("[apply] 记录 appliedPresets 失败:", e instanceof Error ? e.message : String(e));
    }

    // 应用预设后刷新全局提示词，使文风/世界观/角色等立即对生成生效
    // （对齐工具栏切文风的行为；之前漏调导致创意工坊套用文风不生效）
    syncGlobalPrompt(projectId).catch((e) =>
      console.error("[apply] globalPrompt 刷新失败:", e instanceof Error ? e.message : String(e)),
    );

    await prisma.preset.update({ where: { id }, data: { downloads: { increment: 1 } } });
    return NextResponse.json({ ok: true, created });
  } catch (e) {
    return jsonError(e);
  }
}
