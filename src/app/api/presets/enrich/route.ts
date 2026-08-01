import { NextResponse } from "next/server";
import { createLLMClientFromSettings, getEffectiveConfig } from "@/core/llm/client";

/**
 * POST /api/presets/enrich  { type, description }
 *
 * 「LLM 丰满预设」——用户用大白话描述想要的预设（如「舞台剧风格：对白密集、动作夸张、情绪克制」），
 * 后端调用已配置的 LLM（模型名/Key 均从 AppSettings 读取），把松散描述扩展为结构化的创作预设，
 * 返回与上传向导 `upload` state 同字段的 JSON，前端直接合并进表单供用户审阅/修改后再发布。
 *
 * 这样非技术用户无需懂 JSON、无需逐项手填，也能创作高质量预设；同时保留手动编辑空间（"不要分得太细"）。
 *
 * 限制：regex / api_config 是高阶 JSON，语义不适合"自然语言丰满"，要求手动填，故不在支持列表。
 */

export const maxDuration = 120;

// 仅创意类预设支持 AI 丰满
const CREATIVE_TYPES = ["style", "worldview", "story_progression", "lorebook", "character", "table_template"];

// 各类型返回字段的契约提示（让 LLM 产出与向导 upload 同结构的 JSON）
const SCHEMA_HINT: Record<string, string> = {
  style: `返回 JSON：{ "title": 简短标题, "description": 一句话简介, "tags": [2-4个标签字符串], "styleFeeling": 一段丰满的文风描述（大白话，含基调/语感/节奏感/禁忌），"povType": 三选一 "first_person"|"third_person_limited"|"third_person_omniscient"，"pace": 三选一 "fast"|"medium"|"slow" }`,
  worldview: `返回 JSON：{ "title": 短标题, "description": 简介, "tags": [...], "entries": [ { "title": 设定/规则词条名, "content": 该定义的"具体规则或世界观描述" } ，2-5条 ] }。这是"创作定义·规则"区，适合放最高定义级规则（如"全文不得出现男性角色""禁止第一人称"）与世界观铁律。`,
  story_progression: `返回 JSON：{ "title": 短标题, "description": 简介, "tags": [...], "entries": [ { "title": 剧情倾向名, "content": 具体剧情推进倾向或模板描述 } ，2-4条 ] }。倾向要能融合进写作规则。`,
  lorebook: `返回 JSON：{ "title": 短标题, "description": 简介, "tags": [...], "entries": [ { "title": 世界书词条名, "content": 设定细节" } ，3-6条 ] }。这是关键词触发的世界书细节。`,
  character: `返回 JSON：{ "title": 短标题, "description": 简介, "tags": [...], "charName": 角色名, "charRole": 三选一 "protagonist"|"supporting"|"antagonist", "charDesc": 一段丰满的角色描述（外貌/性格/背景/动机） }`,
  table_template: `返回 JSON：{ "title": 短标题, "description": 简介, "tags": [...], "tableName": 表名, "tableCols": 逗号分隔的列名字符串（如 "姓名,年龄,好感度"） }`,
};

const POV = ["first_person", "third_person_limited", "third_person_omniscient"];
const PACE = ["fast", "medium", "slow"];
const ROLE = ["protagonist", "supporting", "antagonist"];

export async function POST(request: Request) {
  try {
    const { type, description } = (await request.json()) as { type?: string; description?: string };
    if (!CREATIVE_TYPES.includes(type || "")) {
      return NextResponse.json({ error: "该类型暂不支持 AI 丰满（regex / API参数 请手动填 JSON）" }, { status: 400 });
    }
    if (!description || !description.trim()) {
      return NextResponse.json({ error: "请先描述你想要的预设" }, { status: 400 });
    }

    const config = await getEffectiveConfig();
    if (!config.apiKey) {
      return NextResponse.json({ error: "未配置 LLM API Key，请先在「设置」页填写后再用 AI 丰满" }, { status: 400 });
    }

    const client = await createLLMClientFromSettings();
    const system = `你是小说创作辅助。用户会给你一个预设类型和一个大白话描述，请把这段松散描述"丰满"成一个结构化的创作预设，给出有创造力的具体内容，不要只复述用户的原话。
只输出一个 JSON 对象，不要任何解释、不要 markdown 代码块包裹。
${SCHEMA_HINT[type!]}
注意：title / description / tags 必须给出；各类型专属字段按上面要求生成；内容要具体、可落地。`;
    const userMsg = `类型：${type}
用户描述：${description.trim()}

请生成丰满后的预设 JSON。`;

    const res = await client.chat({
      model: config.writerModel || config.architectModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userMsg },
      ],
      temperature: 0.9,
      maxTokens: 2000,
    });

    const parsed = extractJSON(res.content);
    if (!parsed) return NextResponse.json({ error: "AI 返回无法解析，请换种说法重试" }, { status: 502 });

    const fields = sanitize(type!, parsed);
    if (Object.keys(fields).length === 0) return NextResponse.json({ error: "AI 未产出有效字段，请重试" }, { status: 502 });

    return NextResponse.json({ ok: true, fields });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "AI 丰满失败";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** 从 LLM 输出里稳健地抽取第一个 JSON 对象（兼容 ```json 代码块包裹与前后杂语） */
function extractJSON(text: string): any | null {
  if (!text) return null;
  let s = text.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) s = fence[1].trim();
  const a = s.indexOf("{");
  const b = s.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  let candidate = s.slice(a, b + 1);
  // 容错 1：LLM 常在对象/数组闭合前多打尾逗号（JSON.parse 不允许），先清理
  candidate = candidate.replace(/,(\s*[}\]])/g, "$1");
  // 容错 2：偶发的不可见字符（BOM / 制表符）也会让解析失败，一并清掉
  candidate = candidate.replace(/﻿/g, "").replace(/[\t\f\v]/g, " ");
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** 按类型校验/裁剪 AI 产出，确保字段与向导 upload state 完全对齐（tags 合并为逗号字符串） */
function sanitize(type: string, o: any): any {
  const out: any = {};
  if (typeof o.title === "string" && o.title.trim()) out.title = o.title.trim().slice(0, 60);
  if (typeof o.description === "string" && o.description.trim()) out.description = o.description.trim().slice(0, 200);
  if (Array.isArray(o.tags)) {
    out.tags = o.tags.filter((t: unknown) => typeof t === "string" && t.trim()).map(String).slice(0, 6).join(",");
  }

  if (type === "style") {
    if (typeof o.styleFeeling === "string" && o.styleFeeling.trim()) out.styleFeeling = o.styleFeeling.trim();
    if (POV.includes(o.povType)) out.povType = o.povType;
    if (PACE.includes(o.pace)) out.pace = o.pace;
  } else if (type === "worldview" || type === "story_progression" || type === "lorebook") {
    if (Array.isArray(o.entries)) {
      out.entries = o.entries
        .filter((e: any) => e && (e.title || e.content))
        .map((e: any) => ({ title: String(e.title || "").trim().slice(0, 40), content: String(e.content || "").trim().slice(0, 800) }))
        .slice(0, 8);
    }
  } else if (type === "character") {
    if (typeof o.charName === "string" && o.charName.trim()) out.charName = o.charName.trim().slice(0, 40);
    if (ROLE.includes(o.charRole)) out.charRole = o.charRole;
    if (typeof o.charDesc === "string" && o.charDesc.trim()) out.charDesc = o.charDesc.trim();
  } else if (type === "table_template") {
    if (typeof o.tableName === "string" && o.tableName.trim()) out.tableName = o.tableName.trim().slice(0, 40);
    if (typeof o.tableCols === "string" && o.tableCols.trim()) out.tableCols = o.tableCols.trim().slice(0, 200);
  }

  return out;
}
