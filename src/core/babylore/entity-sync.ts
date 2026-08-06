/**
 * 章节实体同步（v1.2.1）—— 自动填表链路里「角色卡 / 世界书（世界卡）也能填」。
 *
 * 背景：babylore fill 只写结构化表格（LoreTable）。用户要求「角色卡、世界卡内的所有
 * 内容都能够填写，格式需与内置格式相同」。本模块在每章填表后：
 *  1. LLM 按内置格式抽取章节中新出现且确定的角色与世界观实体；
 *  2. 查重（复用 entity-auto-creator 的 isSimilarName，繁简/错别字变体不重建）；
 *  3. 角色 → CharacterCard（内置字段：name/role/background/storyLine/personality/appearance/currentStatus/tags/relationships）；
 *      - 新角色建卡时写入 relationships；已存在角色卡则按名称匹配补 relationships（合并去重，不覆盖手填）。
 *  4. 其他实体 → LorebookEntry（内置字段：title/category/keys/content）。
 *
 * 速度：每章 1 次轻量 LLM 调用（复用 fillModelOf：推理模型映射 deepseek-chat）。
 */

import { prisma } from "@/lib/prisma";
import { isSimilarName } from "@/lib/entity-auto-creator";
import { fillModelOf } from "./fill";

interface LlmCreds {
  baseURL: string;
  apiKey: string;
  model: string;
}

export interface EntitySyncResult {
  createdChars: string[];
  createdLore: string[];
  skipped: string[];
  error?: string;
}

const ENTITY_SYSTEM_PROMPT = `你是小说实体抽取助手（自动填表链路·角色卡/世界书入库）。阅读【正文】，抽取其中【新出现且确定】的角色与世界观实体，并按角色卡/世界书的内置格式给出设定内容。
输出严格 JSON（response_format=json_object），不要任何解释文字：
{"entities":[{"name":"实体名","type":"character|location|item|technique|organization|creature|other","summary":"一句话概括","description":"3-5 句设定（基于正文，名称与事实零杜撰）","role":"主角/配角/反派/导师/其他（仅角色）","appearance":"外貌一句话（仅角色）","personality":"性格一句话（仅角色）","relationships":[{"name":"对方角色名","relation":"关系（如：师徒/宿敌/暗恋/上下级）","dynamic":"动态一句话（可选，如：反目成仇后互不信任）"}]（仅角色，1-4 条，只记正文中明确体现的关系）"}]}
铁律：
1. 名称零杜撰：实体名必须逐字复制【正文】里的原文用字，禁止改写/缩写/自创同义变体。
2. 只抽取正文中确定出现的新实体；明显是章节临时道具/路人可跳过。
3. 每个实体的 description 必须基于正文事实，禁止臆造正文没有的内容。
4. 已在前文确立的核心角色（如主角）无需重复抽取。
5. relationships 只写正文里确实发生互动的角色关系，不许脑补；拿不准就留空数组。`;

const TYPE_TO_CATEGORY: Record<string, string> = {
  location: "geography",
  item: "item",
  technique: "technique",
  organization: "faction",
  creature: "creature",
  other: "custom",
};

const ROLE_TEXT_TO_ENUM: Record<string, string> = {
  主角: "protagonist",
  反派: "antagonist",
  导师: "mentor",
  恋爱: "love_interest",
  配角: "supporting",
  背景: "background",
  其他: "supporting",
};

export async function syncChapterEntities(
  projectId: string,
  chapterText: string,
  llm: LlmCreds,
): Promise<EntitySyncResult> {
  const result: EntitySyncResult = { createdChars: [], createdLore: [], skipped: [] };
  if (!(chapterText || "").trim()) return result;

  // 1) LLM 抽取实体（一次调用，覆盖本章全部新实体；推理模型映射基础对话模型）
  const url = llm.baseURL.endsWith("/v1")
    ? `${llm.baseURL}/chat/completions`
    : `${llm.baseURL}/v1/chat/completions`;
  let entities: Array<Record<string, unknown>> = [];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${llm.apiKey}` },
      signal: AbortSignal.timeout(90000),
      body: JSON.stringify({
        model: fillModelOf(llm.model),
        messages: [
          { role: "system", content: ENTITY_SYSTEM_PROMPT },
          { role: "user", content: `【正文】\n${chapterText.slice(0, 12000)}\n\n请抽取新实体并输出 JSON。` },
        ],
        temperature: 0.5,
        max_tokens: 8000,
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      result.error = `实体抽取 API ${res.status}`;
      return result;
    }
    const data = await res.json();
    const msg0 = data?.choices?.[0]?.message || {};
    let s = (msg0.content || "").trim();
    // 推理模型兜底：content 为空时从推理尾部提取最后一个 JSON 块
    if (!s) {
      const reasoning = String(msg0.reasoning_content || "");
      const a = reasoning.lastIndexOf("{");
      const b = reasoning.lastIndexOf("}");
      if (a >= 0 && b > a) s = reasoning.slice(a, b + 1);
    }
    const clean = s.replace(/```(?:json)?\s*([\s\S]*?)```/g, "$1").trim();
    const parsed = JSON.parse(clean);
    const arr = Array.isArray(parsed) ? parsed : (parsed as any).entities;
    if (Array.isArray(arr)) {
      entities = arr.filter((e: any) => e && typeof e.name === "string" && String(e.name).trim().length >= 2);
    }
  } catch (e) {
    result.error = e instanceof Error ? e.message : "实体抽取失败";
    return result;
  }

  if (entities.length === 0) return result;

  // 2) 查重：现有角色名 + 别名 + 世界书标题（大小写不敏感 + 相似度）；同时记录已有角色卡 id 与关系（供补 relationships）
  const [existingChars, existingLore] = await Promise.all([
    prisma.characterCard.findMany({ where: { projectId }, select: { id: true, name: true, aliases: true, relationships: true } }),
    prisma.lorebookEntry.findMany({ where: { projectId }, select: { title: true } }),
  ]);
  const existingNames = new Set<string>();
  const existingList: string[] = [];
  const charByName = new Map<string, { id: string; relationships: Array<Record<string, unknown>> }>();
  for (const c of existingChars) {
    existingNames.add(c.name.toLowerCase());
    existingList.push(c.name);
    charByName.set(c.name.toLowerCase(), { id: c.id, relationships: Array.isArray(c.relationships) ? (c.relationships as Array<Record<string, unknown>>) : [] });
    for (const al of Array.isArray(c.aliases) ? (c.aliases as string[]) : []) {
      if (typeof al === "string" && al.trim()) {
        existingNames.add(al.toLowerCase());
        existingList.push(al);
      }
    }
  }
  for (const l of existingLore) {
    existingNames.add(l.title.toLowerCase());
    existingList.push(l.title);
  }
  const addName = (name: string) => {
    existingNames.add(name.toLowerCase());
    existingList.push(name);
  };

  // 3) 入库（内置格式）
  for (const e of entities) {
    const name = String(e.name || "").trim();
    if (!name || name.length < 2) continue;
    // 关系（仅角色）：过滤掉空 targetName，封顶 8 条
    const rawRels = Array.isArray(e.relationships)
      ? (e.relationships as Array<Record<string, unknown>>).filter(
          (r) => r && typeof r.name === "string" && String(r.name).trim().length >= 2
        )
      : [];
    const newRels = rawRels.slice(0, 8).map((r) => ({
      targetName: String(r.name).trim(),
      relation: String(r.relation || "相识").slice(0, 30),
      dynamic: String(r.dynamic || "").slice(0, 80),
    }));
    const type = String(e.type || "other");
    const summary = String(e.summary || "");
    const description = String(e.description || summary || `${name}，自动发现。`);
    // 命中已有角色卡 → 补 relationships（合并去重，不覆盖已有同名关系）
    const hitKey = existingNames.has(name.toLowerCase()) ? name.toLowerCase() : null;
    if (type === "character" && newRels.length > 0 && hitKey && charByName.has(hitKey)) {
      const card = charByName.get(hitKey)!;
      const merged = [...card.relationships];
      for (const r of newRels) {
        if (merged.some((x) => String(x.targetName || "") === r.targetName)) continue; // 同名关系已存在，保留原值
        merged.push(r);
        if (merged.length >= 8) break;
      }
      if (merged.length !== card.relationships.length) {
        try {
          await prisma.characterCard.update({ where: { id: card.id }, data: { relationships: merged as any } });
          result.createdChars.push(`${name}（补关系）`);
        } catch {
          result.skipped.push(`${name}（补关系失败）`);
        }
      }
      addName(name);
      continue;
    }
    if (existingNames.has(name.toLowerCase()) || existingList.some((en) => isSimilarName(en, name))) {
      result.skipped.push(name);
      addName(name);
      continue;
    }
    addName(name);
    try {
      if (type === "character") {
        const roleText = String(e.role || "配角");
        const roleEnum =
          ROLE_TEXT_TO_ENUM[roleText] ||
          (roleText.includes("反") ? "antagonist" : roleText.includes("主") ? "protagonist" : "supporting");
        await prisma.characterCard.create({
          data: {
            projectId,
            name,
            role: roleEnum,
            age: "未知",
            gender: "未知",
            background: description,
            storyLine: summary,
            personality: { dominant: String(e.personality || ""), surface: "", middle: "", core: "" },
            appearance: { features: String(e.appearance || "") },
            abilities: [],
            currentStatus: "alive",
            relationships: newRels as any,
            tags: ["🆕 自动发现"],
          } as any,
        });
        result.createdChars.push(name);
      } else {
        const category = TYPE_TO_CATEGORY[type] || "custom";
        await prisma.lorebookEntry.create({
          data: {
            projectId,
            title: name,
            category,
            keys: [name, type],
            content: description.slice(0, 200),
            insertionOrder: 50,
            enabled: true,
            relatedEntryIds: [],
          },
        });
        result.createdLore.push(name);
      }
    } catch {
      result.skipped.push(name);
    }
  }
  return result;
}
