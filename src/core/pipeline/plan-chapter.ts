// 生成前剧情预设规划（用户逻辑 1b：点击生成一章之前，先用 LLM 按回忆召回机制推进剧情线）
//
// 职责：
// 1. planChapterStoryline：基于活跃剧情线 + 大纲 + 作者指令 + 记忆召回块，让 LLM 规划本章剧情推进，
//    返回结构化 JSON（焦点/推进/障碍/转折/执行提示），并拼成可注入写作指令的文本块。
// 2. applyChapterPlanToStorylines：规划后把本章绑定追加写回活跃剧情线（持续修正、不矛盾、不丢历史）。
//
// 容错：任何异常返回 null，绝不阻断正文生成（规划是"锦上添花"，不是交付前置）。

import { prisma } from "@/lib/prisma";
import { getSettings, recordLlmCall } from "@/lib/llm";
import { STORYLINE_STATUS, withStorylineLock } from "@/core/story-status";
import { safeJoin } from "@/lib/utils";

export interface ChapterPlan {
  /** 本章核心焦点（一句话） */
  focus?: string;
  /** 本章推进哪些剧情线/欲望 */
  advance?: string[];
  /** 本章主要障碍/冲突 */
  obstacle?: string;
  /** 可选转折 */
  twist?: string;
  /** 给写作模型的执行提示 */
  note?: string;
}

export interface PlanResult {
  planText: string;
  plan?: ChapterPlan;
}

function parsePlan(raw: string): ChapterPlan | undefined {
  if (!raw) return undefined;
  let s = raw.trim();
  const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (md) s = md[1].trim();
  else {
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
  }
  try {
    const p = JSON.parse(s);
    if (p && typeof p === "object") return p as ChapterPlan;
  } catch {
    /* 解析失败返回 undefined */
  }
  return undefined;
}

/**
 * 生成前剧情规划。无剧情线 / 无 LLM 配置 / 调用失败 均返回 null。
 */
export async function planChapterStoryline(input: {
  projectId: string;
  chapterOrder: number;
  outline?: string;
  authorNote?: string;
  recallBlock?: string;
  storylines: any[];
}): Promise<PlanResult | null> {
  let settings;
  try {
    settings = await getSettings();
  } catch {
    return null;
  }
  if (!settings?.apiKey) return null;

  const active = (input.storylines || []).filter((s: any) => s.status === STORYLINE_STATUS.ACTIVE);
  if (active.length === 0) return null; // 无活跃剧情线则不规划（用户可能尚未建立）

  const slText = active
    .map((s: any) => {
      const se = s.sevenElements && typeof s.sevenElements === "object" ? s.sevenElements : {};
      const progress = ["desire", "obstacle", "action", "result", "twist", "turn", "ending"]
        .map((k) => (typeof se[k] === "string" && se[k].trim() ? se[k] : null))
        .filter(Boolean)
        .join(" → ");
      return `【${s.type === "main" ? "主线" : "支线"}·${s.title}】当前进度：${progress || s.description || "暂无"}`;
    })
    .join("\n");

  const systemPrompt = `你是小说剧情预设规划器。在生成正文章节之前，你先基于"活跃剧情线"思考本章应当如何推进剧情线。
规则：
- 只基于已给出的剧情线状态、大纲、作者指令与记忆召回规划，绝不编造新设定或新角色。
- 输出严格 JSON（response_format=json_object），不要任何解释文字、不要 Markdown。
- 返回结构：{"focus":"本章核心焦点(一句话)","advance":["推进主线X的欲望Y","支线Z障碍解除"...],"obstacle":"本章主要障碍/冲突(可空串)","twist":"可选转折(可空串)","note":"给写作模型的本章执行提示(2-3句，强调呼应已有设定、避免重复与矛盾)"}
- 目标：让本章自然推进剧情线，呼应已有设定与召回记忆，保持连贯。`;

  const userPrompt = `【活跃剧情线】
${slText}

【本节大纲】${input.outline || "（无）"}
【作者指令】${input.authorNote || "（无）"}
【记忆召回（已有设定/表格）】${input.recallBlock || "（无）"}
【本章序号】第${input.chapterOrder + 1}节

请规划本章剧情推进，输出 JSON。`;

  const url = settings.baseUrl?.endsWith("/v1")
    ? `${settings.baseUrl}/chat/completions`
    : `${settings.baseUrl}/v1/chat/completions`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.apiKey}`,
      },
      signal: AbortSignal.timeout(60000),
      body: JSON.stringify({
        model: settings.model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const usage = (data as any)?.usage;
    recordLlmCall({
      model: settings.model,
      role: "assistant",
      promptTokens: usage?.prompt_tokens ?? usage?.promptTokens ?? 0,
      completionTokens: usage?.completion_tokens ?? usage?.completionTokens ?? 0,
      totalTokens: usage?.total_tokens ?? usage?.totalTokens ?? 0,
      baseURL: settings.baseUrl,
    });
    const raw = data?.choices?.[0]?.message?.content?.trim() || "";
    const plan = parsePlan(raw);
    if (!plan) return null;

    const planText = `【剧情预设·本章规划——生成前已用回忆召回机制推演】
焦点：${plan.focus || "—"}
推进：${safeJoin(plan.advance, "；") || "—"}
障碍：${plan.obstacle || "—"}
${plan.twist ? `转折：${plan.twist}` : ""}
执行提示：${plan.note || "—"}`;
    return { planText, plan };
  } catch {
    return null;
  }
}

/**
 * 把本章规划追加写回活跃剧情线（动态更新、持续修正、不矛盾）。
 * 基于已有 chapterBindings 追加本章绑定，不删除历史，仅保留最近 50 章防止无限膨胀。
 */
export async function applyChapterPlanToStorylines(
  projectId: string,
  plan: ChapterPlan,
  chapterOrder: number,
): Promise<void> {
  try {
    const active = await prisma.storyline.findMany({
      where: { projectId, status: STORYLINE_STATUS.ACTIVE },
      select: { id: true, type: true },
    });
    for (const s of active) {
      // L3-003：按 storylineId 串行化创建，避免并发写不同章时彼此覆盖
      try {
        await withStorylineLock(s.id, async () => {
          // v1.8.x：本章规划回写为时间轴大事件（StorylineEvent），保留"写作自动记录大事件"语义。
          const summary = [
            `推进：${safeJoin(plan.advance, "；") || "—"}`,
            `障碍：${plan.obstacle || "—"}`,
            plan.twist ? `转折：${plan.twist}` : "",
            `执行提示：${plan.note || "—"}`,
          ].filter(Boolean).join("\n");
          await prisma.storylineEvent.create({
            data: {
              storylineId: s.id,
              kind: s.type === "main" ? "MILESTONE" : "EVENT",
              title: `第${(chapterOrder ?? 0) + 1}章 · 规划`,
              content: summary,
              position: typeof chapterOrder === "number" ? chapterOrder : 0,
              sourceRefs: JSON.stringify([{ type: "chapter", ref: null, chapterOrder: chapterOrder ?? null }]),
            },
          });
        });
      } catch (e) {
        console.warn("[plan-chapter] 单条剧情线回写失败:", e instanceof Error ? e.message : String(e));
      }
    }
    console.log(`[plan-chapter] 剧情预设回写 project=${projectId} 条数=${active.length} 章序=${chapterOrder + 1}`);
  } catch (e) {
    // 剧情线回写失败静默降级——不影响正文与填表交付
    console.warn("[plan-chapter] 剧情线回写失败:", e instanceof Error ? e.message : String(e));
  }
}
