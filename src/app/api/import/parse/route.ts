/**
 * POST /api/import/parse
 *
 * 智能导入解析 —— 正则分章 + LLM 三卡抽取。
 *
 * 请求体：
 * {
 *   projectId: string;
 *   rawText: string;          // 要导入的原始文本（可以是整本书）
 *   volumeMode?: boolean;     // 是否启用分卷识别（默认true）
 * }
 *
 * 响应：
 * {
 *   detectedChapters: [{ volumeTitle?, chapterTitle, order, wordCount, contentSnippet }],
 *   extractedCharacters: CharacterCard[],
 *   extractedLoreEntries: LorebookEntry[],
 *   extractedStyle: StyleFeatures
 * }
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getDefaultClient } from "@/core/llm/client";
import { countTokens } from "@/core/assembly/tokenizer";

// ─── 正则状态机：中文分章分卷 ──────────────────────────────

const VOLUME_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*卷)\s*(.*)/;
const CHAPTER_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*章|楔子|楔子|序章|序言|引子|引章|尾声|终章|番外|番外篇|序幕|幕间)\s*(.*)/;
const SECTION_PATTERN = /^\s*(第\s*[一二三四五六七八九十百千\d]+\s*[节話回])\s*(.*)/;

interface DetectedChapter {
  volumeTitle?: string;
  chapterTitle: string;
  order: number;
  content: string;
  wordCount: number;
  contentSnippet: string; // 前100字预览
}

/**
 * 用正则状态机切分章节。
 * 状态流转：无标题文本 → 遇到分卷标记 → 遇到分章标记 → 正文
 */
function segmentChapters(rawText: string, volumeMode: boolean): DetectedChapter[] {
  const lines = rawText.split(/\n/);
  const chapters: DetectedChapter[] = [];
  let currentVolume = "";
  let currentChapterTitle = "";
  let currentContent: string[] = [];
  let order = 0;

  function flushChapter() {
    const content = currentContent.join("\n").trim();
    if (content.length < 10) {
      currentContent = [];
      return; // 空章节跳过
    }
    chapters.push({
      volumeTitle: volumeMode && currentVolume ? currentVolume : undefined,
      chapterTitle: currentChapterTitle || `第${order + 1}章`,
      order: order++,
      content,
      wordCount: content.length,
      contentSnippet: content.slice(0, 100).replace(/\n/g, " "),
    });
    currentContent = [];
  }

  for (const line of lines) {
    const volMatch = line.match(VOLUME_PATTERN);
    const chMatch = line.match(CHAPTER_PATTERN);
    const secMatch = line.match(SECTION_PATTERN);

    if (volMatch && volumeMode) {
      // 遇到新分卷，把上一章收尾
      if (currentContent.length > 0) flushChapter();
      currentVolume = (volMatch[1] + (volMatch[2] ? " " + volMatch[2] : "")).trim();
      currentChapterTitle = "";
    } else if (chMatch || (secMatch && volumeMode)) {
      const match = chMatch || secMatch!;
      if (currentContent.length > 0) flushChapter();
      currentChapterTitle = (match[1] + (match[2] ? " " + match[2] : "")).trim();
    } else {
      currentContent.push(line);
    }
  }

  // 收尾最后一章
  if (currentContent.length > 0) flushChapter();

  // 如果什么都没识别到，整段当一章
  if (chapters.length === 0) {
    chapters.push({
      chapterTitle: "第一章",
      order: 0,
      content: rawText.trim(),
      wordCount: rawText.trim().length,
      contentSnippet: rawText.trim().slice(0, 100),
    });
  }

  return chapters;
}

// ─── LLM 三卡抽取 Prompt ──────────────────────────────────

function buildExtractionPrompt(
  projectName: string,
  genre: string[],
  chapters: DetectedChapter[],
  volumeMode: boolean
): string {
  // 拼接代表性文本：前2章全文 + 其余章节各取前500字
  const samples = chapters.slice(0, 2).map((c) => c.content).join("\n\n---\n\n");
  const snippets = chapters.slice(2).map((c) =>
    `【${c.chapterTitle}】${c.content.slice(0, 500)}`
  ).join("\n\n");
  const allText = samples + (snippets ? "\n\n---\n\n" + snippets : "");

  // Token 预算管理：最多送8000字的文本给 LLM 分析
  const truncatedText = allText.length > 8000 ? allText.slice(0, 8000) + "\n\n[...后续文本已截断]" : allText;

  return `你是一个专业的小说编辑和分析师。请仔细阅读以下小说文本，提取三方面的结构化信息。

【作品信息】
名称：${projectName}
类型：${genre.join("、")}
分卷模式：${volumeMode ? "是（已识别分卷结构）" : "否（纯章节结构）"}
已识别章节数：${chapters.length}

【已识别的章节目录】
${chapters.map((c) => `- ${c.volumeTitle ? `[${c.volumeTitle}] ` : ""}${c.chapterTitle}`).join("\n")}

【待分析文本】
${truncatedText}

请输出一个严格符合 JSON 格式的结构化分析结果，包含三个部分：

1. characters: 角色列表，每个角色包含：
   - name: 角色名
   - aliases: 别名数组
   - role: 角色定位 (protagonist/antagonist/supporting/mentor/love_interest/background)
   - personality: 性格关键词数组(3-7个)
   - appearance: { hair, eyes, height, build, features, attire }
   - background: 背景简述(≤200字)
   - dialogueStyle: { description, examples: [3句台词], vocabulary: [常用词], speechPatterns: [句式特征] }
   - hiddenMotives: 隐藏动机数组
   - age: 年龄描述
   - gender: 性别

2. lore: 世界观词条列表，每个词条包含：
   - title: 词条标题
   - category: 分类 (geography/faction/magic_system/history/culture/creature/item/custom)
   - keys: 触发关键词数组(3-8个)——自动生成最容易在续写中被提到的词
   - content: 设定内容(≤200字)

3. style: 文风量化分析：
   - avgSentenceLength: 平均句子长度(字)
   - shortSentenceRatio: 短句占比(<15字)
   - longSentenceRatio: 长句占比(>40字)
   - dialogueRatio: 对话占比
   - descriptionRatio: 环境描写占比
   - actionRatio: 动作描写占比
   - innerThoughtRatio: 内心独白占比
   - povType: 叙事视角 (first_person/third_person_limited/third_person_omniscient/second_person)
   - narrativeDistance: 叙事距离 (close/medium/far)
   - tonalMarkers: 语气特征对象 {coldness, satire, tragedy, humor, warmth, suspense, grandeur}
   - lexicalFeatures: 词汇特征对象 {classicalRatio, modernRatio, termDensity, idiomsDensity}
   - styleDescription: 一句话概括文风(≤50字)
   - sampleText: 选择一段最能代表文风的原文(约200字)

输出格式必须是纯 JSON，不要任何 markdown 标记或解释文字：
{"characters": [...], "lore": [...], "style": {...}}`;
}

function buildExtractionSystemPrompt(): string {
  return `你是一个专业的小说结构化分析引擎。你的唯一任务是从小说文本中提取角色、世界观和文风信息，输出严格 JSON。

规则：
1. 角色：从文本中识别所有有名有姓或有明确对话的角色。依上下文推断性格、动机和对话风格。如果文中提到角色的外貌特征(发色/瞳色/体型等)，一定要记录。
2. 世界观词条：识别文本中的特殊地名、组织、能力体系、历史事件、文化规则、关键物品。为每个词条自动生成触发关键词(别只用标题，要加同义词和缩写)。
3. 文风：基于全篇文本量化分析。对话占比通过统计引号包围的文本比例估算。不要乱填——仔细读文本。
4. 只输出 JSON，不要任何额外文字。`;
}

// ─── POST 处理器 ──────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { projectId, rawText, volumeMode = true } = body;

    if (!projectId || !rawText) {
      return NextResponse.json(
        { error: "缺少 projectId 或 rawText" },
        { status: 400 }
      );
    }

    if (rawText.length < 50) {
      return NextResponse.json(
        { error: "文本太短（最少50字），无法导入" },
        { status: 400 }
      );
    }

    // 加载项目信息
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 });
    }

    // Step 1: 正则分章
    const chapters = segmentChapters(rawText, volumeMode);

    // Step 2: LLM 三卡抽取
    const client = getDefaultClient();
    const extractionPrompt = buildExtractionPrompt(
      project.name,
      project.genre,
      chapters,
      volumeMode
    );

    const response = await client.chat({
      model: (project.llmConfig as Record<string, unknown>)?.architectModel as string || "deepseek-ai/DeepSeek-V4-Pro",
      messages: [
        { role: "system", content: buildExtractionSystemPrompt() },
        { role: "user", content: extractionPrompt },
      ],
      temperature: 0.3, // 低温确保稳定输出
      maxTokens: 8192,
    });

    // 解析 LLM 输出的 JSON
    let extracted: {
      characters: Record<string, unknown>[];
      lore: Record<string, unknown>[];
      style: Record<string, unknown>;
    } = { characters: [], lore: [], style: {} };

    try {
      // 尝试提取 JSON（有时 LLM 会包在 ```json ``` 里）
      let jsonStr = response.content.trim();
      const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) jsonStr = jsonMatch[1].trim();
      extracted = JSON.parse(jsonStr);
    } catch {
      // JSON 解析失败，返回空结果，但章节分割结果保留
      console.warn("LLM 三卡抽取 JSON 解析失败，返回空卡面");
    }

    // 计算输入 Token
    const inputTokens = countTokens(extractionPrompt);

    return NextResponse.json({
      detectedChapters: chapters,
      extractedCharacters: (extracted.characters || []).map((c) => ({
        ...c,
        // 确保必填字段有默认值
        personality: (c.personality as string[]) || [],
        aliases: (c.aliases as string[]) || [],
        hiddenMotives: (c.hiddenMotives as string[]) || [],
        appearance: (c.appearance as Record<string, unknown>) || { hair: "未知", eyes: "未知", height: "未知", build: "未知", features: "", attire: "" },
        dialogueStyle: (c.dialogueStyle as Record<string, unknown>) || { description: "", examples: [], vocabulary: [], speechPatterns: [] },
        role: (c.role as string) || "supporting",
        age: (c.age as string) || "未知",
        gender: (c.gender as string) || "未知",
        background: (c.background as string) || "",
      })),
      extractedLoreEntries: (extracted.lore || []).map((l) => ({
        ...l,
        keys: (l.keys as string[]) || [],
        category: (l.category as string) || "custom",
        content: (l.content as string) || "",
      })),
      extractedStyle: (extracted.style || {}) as Record<string, unknown>,
      meta: {
        chapterCount: chapters.length,
        characterCount: (extracted.characters || []).length,
        loreCount: (extracted.lore || []).length,
        inputTokens,
        volumeMode,
      },
    });
  } catch (err) {
    console.error("导入解析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "导入解析失败" },
      { status: 500 }
    );
  }
}
