/**
 * POST /api/agent/extract-chapter
 *
 * 章节自动提取——每章生成完毕后自动运行。
 * 一次 LLM 调用提取全部维度：角色、场景、势力、道具、伏笔、
 * 角色经历、关系变化、情绪节奏、关键台词、章节摘要、下章衔接、写作要素。
 *
 * 输出结构化 JSON，前端面板逐项展示，用户选择采纳/编辑/取消。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { jsonError } from "@/lib/api-error";

export const maxDuration = 90;

// ═══════════════════════════════════════════
// 输出类型
// ═══════════════════════════════════════════

export interface ExtractedCharacter {
  name: string;
  role: string;              // protagonist/antagonist/supporting/mentor/love_interest/background
  importance: number;        // 1-10 重要性评分
  mentionCount: number;      // 提及次数
  hasDialogue: boolean;      // 有对话
  hasAction: boolean;        // 有独立行动
  isNew: boolean;            // 是否新角色
  existingCardId: string | null;
  experience: string;        // 本章经历（→ timeline）
  suggestion: "create" | "update" | "ignore";  // 建议操作
  aliases?: string[];
  abilities?: string[];      // 新发现的能力
}

export interface ExtractedLocation {
  name: string;
  type: string;              // 大陆/国家/城市/宗门/秘境/禁地/建筑
  parent: string;            // 所属上层地域
  description: string;
  isNew: boolean;
  existingEntryId: string | null;
  suggestion: "create" | "update" | "ignore";
}

export interface ExtractedFaction {
  name: string;
  type: string;              // 宗门/家族/帝国/帮派/圣地/组织
  description: string;
  leader: string;
  territory: string;
  isNew: boolean;
  existingEntryId: string | null;
  suggestion: "create" | "update" | "ignore";
}

export interface ExtractedItem {
  name: string;
  type: string;              // 武器/法宝/丹药/材料/法器/功法
  rarity: string;            // 凡品/灵品/宝品/仙品/神品
  owner: string;             // 持有者角色名
  description: string;
  isNew: boolean;
  existingEntryId: string | null;
  suggestion: "create" | "update" | "ignore";
}

export interface ExtractedForeshadowing {
  description: string;
  importance: "极高" | "高" | "中";
  scope: "全局" | "多线" | "单线";
  status: "埋设" | "暗示";
  progressPercent: number;   // 兑现进度 0-100
  isNew: boolean;
  existingId: string | null;
  suggestion: "create" | "ignore";
}

export interface ExtractedEmotion {
  type: string;              // 爽点/悬念/压抑/恢弘/温情/紧张/悲伤
  intensity: number;         // 1-10
  trigger: string;           // 触发场景
}

export interface ExtractedDialogue {
  speaker: string;
  line: string;
  context: string;
}

export interface ChapterSummaryExtract {
  openingConnection: string; // 章首衔接
  keyEvents: string[];       // 关键事件
  chapterEndHook: string;    // 章尾钩子
  closingSnapshot: string;   // 章尾氛围
}

export interface NextChapterConnection {
  aiOpening: string;         // AI生成的章首衔接
  originalOpening: string;   // 原始章首
}

export interface WritingElements {
  opening: string;           // 开头承接
  keyDialogue: string;       // 关键对话
  keyPoints: string;         // 写作要点
  hook: string;              // 钩子设计
}

export interface CharacterExperience {
  characterName: string;
  experience: string;        // 本章经历摘要
  evidence: string;          // 正文证据
}

export interface RelationshipChange {
  charA: string;
  charB: string;
  relation: string;
  reason: string;            // 变化原因
  evidence: string;          // 正文证据
}

export interface ExtractionResult {
  characters: ExtractedCharacter[];
  locations: ExtractedLocation[];
  factions: ExtractedFaction[];
  items: ExtractedItem[];
  foreshadowings: ExtractedForeshadowing[];
  emotions: ExtractedEmotion[];
  keyDialogues: ExtractedDialogue[];
  summary: ChapterSummaryExtract;
  nextChapter: NextChapterConnection;
  writingElements: WritingElements;
  characterExperiences: CharacterExperience[];
  relationshipChanges: RelationshipChange[];
  /** 统计 */
  counts: {
    characters: number;
    locations: number;
    factions: number;
    items: number;
    foreshadowings: number;
    experiences: number;
    relationshipChanges: number;
  };
}

// ═══════════════════════════════════════════
// API
// ═══════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const { projectId, chapterContent, chapterTitle, nodeId } = await request.json();
    if (!projectId || !chapterContent) {
      return NextResponse.json({ error: "缺少 projectId 或 chapterContent" }, { status: 400 });
    }

    // ── 找下一章节点 ──
    let nextNode: { id: string; title: string; outline: string | null } | null = null;
    if (nodeId) {
      const currentNode = await prisma.storyNode.findUnique({
        where: { id: nodeId },
        select: { order: true },
      });
      if (currentNode) {
        nextNode = await prisma.storyNode.findFirst({
          where: { projectId, type: "chapter", order: { gt: currentNode.order }, deletedAt: null },
          orderBy: { order: "asc" },
          select: { id: true, title: true, outline: true },
        });
      }
    }

    // ── 加载参考数据 ──
    const [characters, loreEntries, existingForeshadowings] = await Promise.all([
      prisma.characterCard.findMany({
        where: { projectId },
        select: { id: true, name: true, aliases: true, role: true, abilities: true, timeline: true },
      }),
      prisma.lorebookEntry.findMany({
        where: { projectId, enabled: true },
        select: { id: true, title: true, category: true, keys: true, content: true },
      }),
      prisma.pendingCommitment.findMany({
        where: { projectId },
        select: { id: true, description: true, status: true },
        take: 30,
      }),
    ]);

    // 构建参考摘要
    const charRoster = characters.map((c) =>
      `${c.name}(${c.role}，别名：${(c.aliases || []).join("、") || "无"}，已有能力：${(c.abilities || []).join("、") || "无"})`
    ).join("\n");

    // 全量世界书条目（15 类，仅 enabled）——供 LLM 识别"已有/别名/重复"，避免重复建卡（#222-B）
    const loreDigest = loreEntries
      .map((l) => `- ${l.title}（${l.category}）：${(l.content || "").slice(0, 60)}`)
      .join("\n");

    const foreshadowingList = existingForeshadowings
      .map((f) => `- [${f.status}] ${f.description.slice(0, 100)}`)
      .join("\n");

    // ── 构建提取 Prompt ──
    const extractionPrompt = `你是小说章节分析专家。从以下正文中一次性提取全部维度。

## 角色名册（用于匹配）
${charRoster.slice(0, 4000)}

## 已有世界书（全量，含地点/势力/道具/功法/其他设定）
${loreDigest.slice(0, 1500) || "（无）"}

## 已有伏笔
${foreshadowingList.slice(0, 800) || "（无）"}

## 章节正文
标题：${chapterTitle || "未命名"}
${chapterContent.slice(0, 6000)}

## 提取规则

### 去重与别名（最高优先级）
- 凡正文中出现的名称，先与上方「角色名册 / 已有世界书」比对：
  - 是已有条目的**主名、别名、俗称、小名、异称**之一 → **绝不新建**，suggestion 设为 "update"，并尽量填好 existingCardId / existingEntryId；
  - 同一实体在正文用多个名字（如「龙门」与「龙庭集团」指代同一势力）→ **合并为一个条目**，主名取最正式者，其余作为别名，不要拆成两条。
- 以下**不要抽取**（不符合审查机制，抽了也是垃圾，会污染世界书）：
  - 一次性路人称谓（"那人道友"、"某个少年"）、纯口语指代（"这东西"、"那玩意"）；
  - 仅出现一次、无具体设定意义的模糊名词；
  - 已被前文判定无实质意义、或明显是作者笔误/口语碎片的词。
- 需要补充信息的已有条目 → suggestion="update"，在对应 description 里补正文新披露的信息（不要另建新条）。

### 出场角色
- 列出本章实际出场的所有角色（名册中有则匹配，没有则标 isNew=true）
- importance 评分：提及≥5次或至少有1次独立行动才能 ≥5 分
- hasDialogue：角色有对话内容；hasAction：角色有独立行动（不是纯粹被提及）
- 路人判定：mentionCount < 3 且 无对话 且 无行动 → importance ≤ 3, suggestion="ignore"
- 新角色判定：mentionCount ≥ 4 或 (hasDialogue && hasAction) → suggestion="create"
- experience：该角色本章做了什么，1-2句话

### 场景地点
- 提取所有具名场景，含类型和所属区域
- 已有地点 → suggestion="update"，新地点 → suggestion="create"
- 临时过场地点（只提了一次、无描述）标 suggestion="ignore"

### 势力阵营
- 提取正文中明确命名的势力/组织
- 含类型、首领（若有）、领地（若有）、一句话描述

### 道具物品
- 提取具名道具/法宝/武器/丹药
- 含类型、稀有度、持有者、一句话描述

### 伏笔线索
- 提取本章埋设的伏笔（暗示未解之事、未来冲突的种子）
- importance 根据对主线的影响判断
- 本章已解决的标 status="已回收"

### 情绪节奏
- 提取本章的情绪波峰/波谷
- type: 爽点/悬念/压抑/恢弘/温情/紧张/悲伤

### 关键台词
- 提取最具冲击力的 1-3 句台词

### 章节摘要
- openingConnection：章首如何承接上文
- keyEvents：本章关键事件列表
- chapterEndHook：章尾钩子
- closingSnapshot：章尾氛围

### 下章衔接
- aiOpening：基于本章结尾，AI 生成的下一章开头
- originalOpening：${nextNode?.outline ? `下一章已有大纲：${nextNode.outline.slice(0, 200)}` : "下一章暂未设大纲"}

### 写作要素
- opening：开头承接方式
- keyDialogue：关键对话主题
- keyPoints：写作要点
- hook：钩子设计

### 角色经历（重要！→ characterCard.timeline）
- 每个角色在本章的经历摘要，用正文原句做证据
- 只提取有实质行动的角色（importance ≥ 5）

### 关系变化（重要！→ 世界书 character_relationship 条目）
- 角色间关系的变化，含原因和正文证据
- 新关系/interaction、已有关系的进展/转折

## 输出格式（严格 JSON，不要 markdown 包裹）
{
  "characters": [{ "name":"...", "role":"protagonist|antagonist|supporting|mentor|love_interest|background", "importance":8, "mentionCount":12, "hasDialogue":true, "hasAction":true, "isNew":false, "existingCardId":null, "experience":"...", "suggestion":"create|update|ignore", "aliases":[], "abilities":[] }],
  "locations": [{ "name":"...", "type":"...", "parent":"...", "description":"...", "isNew":false, "existingEntryId":null, "suggestion":"create|update|ignore" }],
  "factions": [{ "name":"...", "type":"...", "description":"...", "leader":"", "territory":"", "isNew":false, "existingEntryId":null, "suggestion":"create|update|ignore" }],
  "items": [{ "name":"...", "type":"...", "rarity":"...", "owner":"...", "description":"...", "isNew":false, "existingEntryId":null, "suggestion":"create|update|ignore" }],
  "foreshadowings": [{ "description":"...", "importance":"极高|高|中", "scope":"全局|多线|单线", "status":"埋设|暗示", "progressPercent":0, "isNew":false, "existingId":null, "suggestion":"create|ignore" }],
  "emotions": [{ "type":"爽点|悬念|压抑|恢弘|温情|紧张|悲伤", "intensity":8, "trigger":"..." }],
  "keyDialogues": [{ "speaker":"...", "line":"...", "context":"..." }],
  "summary": { "openingConnection":"...", "keyEvents":["..."], "chapterEndHook":"...", "closingSnapshot":"..." },
  "nextChapter": { "aiOpening":"...", "originalOpening":"..." },
  "writingElements": { "opening":"...", "keyDialogue":"...", "keyPoints":"...", "hook":"..." },
  "characterExperiences": [{ "characterName":"...", "experience":"...", "evidence":"..." }],
  "relationshipChanges": [{ "charA":"...", "charB":"...", "relation":"...", "reason":"...", "evidence":"..." }]
}`;

    // ── 调 LLM ──
    const config = await getEffectiveConfig();
    const client = createLLMClient(config);

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: "你是小说章节分析专家。输出严格 JSON，不要 markdown 包裹。所有角色名使用角色名册中的准确名字，新角色使用正文中的准确名字。description/experience 用中文写。" },
        { role: "user", content: extractionPrompt },
      ],
      temperature: 0,
      maxTokens: 4000,
    });

    const raw = response.content?.trim() || "";

    // ── 解析 ──
    let result: ExtractionResult;
    try {
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);

      // 默认值填充
      result = {
        characters: (parsed.characters || []).map((c: any) => ({
          ...c,
          importance: c.importance || 5,
          mentionCount: c.mentionCount || 1,
          hasDialogue: c.hasDialogue || false,
          hasAction: c.hasAction || false,
          isNew: c.isNew !== undefined ? c.isNew : !c.existingCardId,
          existingCardId: c.existingCardId || null,
          suggestion: c.suggestion || "ignore",
        })),
        locations: parsed.locations || [],
        factions: parsed.factions || [],
        items: parsed.items || [],
        foreshadowings: parsed.foreshadowings || [],
        emotions: parsed.emotions || [],
        keyDialogues: parsed.keyDialogues || [],
        summary: parsed.summary || { openingConnection: "", keyEvents: [], chapterEndHook: "", closingSnapshot: "" },
        nextChapter: parsed.nextChapter || { aiOpening: "", originalOpening: nextNode?.outline || "" },
        writingElements: parsed.writingElements || { opening: "", keyDialogue: "", keyPoints: "", hook: "" },
        characterExperiences: parsed.characterExperiences || [],
        relationshipChanges: parsed.relationshipChanges || [],
        counts: {
          characters: (parsed.characters || []).length,
          locations: (parsed.locations || []).length,
          factions: (parsed.factions || []).length,
          items: (parsed.items || []).length,
          foreshadowings: (parsed.foreshadowings || []).length,
          experiences: (parsed.characterExperiences || []).length,
          relationshipChanges: (parsed.relationshipChanges || []).length,
        },
      };

      // 匹配已有角色ID
      const nameToId = new Map(characters.map((c) => [c.name, c.id]));
      for (const alias of characters) {
        for (const a of alias.aliases || []) {
          if (!nameToId.has(a)) nameToId.set(a, alias.id);
        }
      }
      for (const c of result.characters) {
        if (!c.isNew && !c.existingCardId) {
          c.existingCardId = nameToId.get(c.name) || null;
          if (!c.existingCardId) c.isNew = true;
        }
      }

      // 匹配已有地点/势力/道具 ID
      const titleToLoreId = new Map(loreEntries.map((l) => [l.title, l.id]));
      // #222-B：别名/同义词索引——世界书条目的 keys 字段存了别名/俗称/异称
      // （见 apply-extraction / entity-auto-creator 的 keys 写入）。LLM 输出别名时
      // 也能反向匹配到已有条目 → suggestion="update" 而非误建 "create"。
      const loreKeyToId = new Map<string, string>();
      for (const l of loreEntries) {
        for (const k of ((l.keys as string[]) || [])) {
          const low = k.trim().toLowerCase();
          if (low && !loreKeyToId.has(low)) loreKeyToId.set(low, l.id);
        }
      }
      for (const loc of result.locations) {
        if (!loc.isNew && !loc.existingEntryId) loc.existingEntryId = titleToLoreId.get(loc.name) || loreKeyToId.get(loc.name.toLowerCase()) || null;
      }
      for (const fac of result.factions) {
        if (!fac.isNew && !fac.existingEntryId) fac.existingEntryId = titleToLoreId.get(fac.name) || loreKeyToId.get(fac.name.toLowerCase()) || null;
      }
      for (const it of result.items) {
        if (!it.isNew && !it.existingEntryId) it.existingEntryId = titleToLoreId.get(it.name) || loreKeyToId.get(it.name.toLowerCase()) || null;
      }
    } catch (err) {
      console.error("提取结果解析失败:", err, raw.slice(0, 300));
      return NextResponse.json({
        error: "提取结果解析失败",
        rawPreview: raw.slice(0, 300),
      }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("章节提取失败:", err);
    return jsonError(err);
  }
}
