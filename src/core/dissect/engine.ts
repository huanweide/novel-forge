// ============================================================
// 拆书引擎 —— 分章 + 多维提取 + 进度追踪
//
// 五阶段流水线：
//   1. 预处理（文本清理、编码统一）
//   2. 章边界检测（三层：正则→语义→固定字数）
//   3. 逐维提取（快速1次/标准4组/精细15次 LLM 调用）
//   4. 全局蒸馏（别名合并、时间排序——后续迭代）
//   5. 结构化入库
// ============================================================

import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import type { LLMClient } from "@/core/llm/client";
import {
  buildDimensionPrompt,
  buildQuickExtractPrompt,
  buildChapterSummaryPrompt,
} from "./prompts";
import type {
  DimensionKey,
  DimensionResult,
  ChapterInfo,
  DissectDepth,
  DissectStatus,
} from "./types";
import {
  DISSECT_DIMENSIONS,
  DIMENSION_LABELS,
  DIMENSION_ICONS,
  DIMENSION_GROUPS,
} from "./types";

// ─── 文本预处理 ──────────────────────────────────────────

/** 清理文本：统一编码、合并断行、去页眉页脚 */
function preprocessText(raw: string): string {
  return raw
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // 去掉连续3个以上的空行
    .replace(/\n{4,}/g, "\n\n\n")
    // 去BOM
    .replace(/^﻿/, "")
    // 全角转半角（英文/数字部分）
    .trim();
}

// ─── 章边界检测 ──────────────────────────────────────────

/**
 * 三层章边界检测。
 * 返回章节信息列表，每项含 index/title/startPos/endPos。
 */
export function detectChapters(text: string): ChapterInfo[] {
  // 第1层：正则匹配章节标题
  const patterns = [
    /第[零一二三四五六七八九十百千万\d]+[章节卷篇回]/g,
    /Chapter\s+\d+/gi,
    /^\s*[#＃]\s*\d+/gm,
    /^第[零一二三四五六七八九十百千万\d]+[章节卷篇回]/gm,
  ];

  let matches: Array<{ index: number; title: string }> = [];

  for (const pattern of patterns) {
    const found = Array.from(text.matchAll(pattern));
    if (found.length >= 3) {
      // 至少3个匹配才算有效
      matches = found.map((m) => ({
        index: m.index!,
        title: m[0].trim(),
      }));
      break;
    }
  }

  // 第2层：如果正则匹配不足，按固定字数切分
  if (matches.length < 3) {
    const CHUNK_SIZE = 4000;
    const chunks: typeof matches = [];
    for (let i = 0; i < text.length; i += CHUNK_SIZE) {
      const end = Math.min(i + CHUNK_SIZE, text.length);
      chunks.push({
        index: i,
        title: `第${chunks.length + 1}章`,
      });
    }
    // 回退到固定字数切割
    matches = chunks;
  }

  // 构建章节列表
  const chapters: ChapterInfo[] = [];
  for (let i = 0; i < matches.length; i++) {
    const startPos = matches[i].index;
    const endPos =
      i < matches.length - 1 ? matches[i + 1].index : text.length;
    // 尝试提取更完整的标题行（取匹配位置到该行结束）
    const lineEnd = text.indexOf("\n", matches[i].index);
    const title =
      lineEnd > 0 && lineEnd < startPos + 80
        ? text.slice(matches[i].index, lineEnd).trim()
        : matches[i].title;

    chapters.push({
      index: i + 1,
      title: title || `第${i + 1}章`,
      startPos,
      endPos,
    });
  }

  return chapters;
}

// ─── 核心：执行拆解 ──────────────────────────────────────

export interface DissectOptions {
  taskId: string;
  depth: DissectDepth;
  extractChapterSummaries: boolean;
  onProgress?: (progress: number, status: DissectStatus, message: string) => void;
}

/**
 * 执行完整的拆书流水线。
 * 这是异步操作——调用方可以轮询 DB 获取进度。
 */
export async function runDissection(options: DissectOptions): Promise<void> {
  const { taskId, depth, extractChapterSummaries, onProgress } = options;

  const report = (progress: number, status: DissectStatus, message: string) => {
    onProgress?.(progress, status, message);
  };

  try {
    // 1. 加载任务
    const task = await prisma.dissectionTask.findUnique({ where: { id: taskId } });
    if (!task) throw new Error("任务不存在");

    const text = task.originalText as string;
    if (!text || text.length < 100) throw new Error("原文太短，至少需要100字");

    const cleanText = preprocessText(text);

    // 2. 分章
    report(5, "chunking", "正在检测章节边界...");
    const chapters = detectChapters(cleanText);
    await prisma.dissectionTask.update({
      where: { id: taskId },
      data: {
        totalChapters: chapters.length,
        chapterList: chapters as any,
        progress: 10,
        status: "chunking",
      },
    });

    // 3. 构建 LLM 客户端
    report(10, "extracting", "准备 AI 模型...");
    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const model = config.extractorModel || config.writerModel;

    // 4. 准备原文样本（对大文本做智能截取）
    const textSample = buildTextSample(cleanText, chapters);

    // 5. 按深度执行维度提取
    const groups = DIMENSION_GROUPS[depth];
    const totalGroups = groups.length;
    const dimensions: Record<string, DimensionResult> = {};

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi];
      const baseProgress = 10 + Math.round((gi / totalGroups) * 80); // 10%-90%

      report(baseProgress, "extracting", `正在提取：${group.map((d) => DIMENSION_LABELS[d]).join("、")}`);

      try {
        if (depth === "quick" && group.length > 1) {
          // 快速模式：一次提取全部
          const result = await extractDimensionsBatch(
            client, model, group, textSample, chapters.length,
          );
          Object.assign(dimensions, result);
        } else {
          // 标准/精细模式：逐组提取
          for (const dim of group) {
            const dimResult = await extractSingleDimension(
              client, model, dim, textSample, chapters.length,
            );
            dimensions[dim] = dimResult;
          }
        }
      } catch (err: any) {
        // 单个维度失败不阻断整体——标记为失败继续
        for (const dim of group) {
          if (!dimensions[dim]) {
            dimensions[dim] = {
              dimension: dim,
              label: DIMENSION_LABELS[dim],
              icon: DIMENSION_ICONS[dim],
              content: "",
              status: "failed",
              error: err?.message || "提取失败",
            };
          }
        }
      }

      // 实时更新 DB
      await prisma.dissectionTask.update({
        where: { id: taskId },
        data: {
          progress: baseProgress + Math.round((1 / totalGroups) * 80),
          dimensions: dimensions as any,
          status: "extracting",
        },
      });
    }

    // 6. 可选：逐章摘要提取
    if (extractChapterSummaries && chapters.length > 0) {
      report(90, "extracting", "正在提取章节摘要...");
      await extractChapterSummariesForTask(
        client, model, taskId, chapters, cleanText, 90, 99,
      );
    }

    // 7. 完成
    report(100, "completed", "拆解完成");
    await prisma.dissectionTask.update({
      where: { id: taskId },
      data: {
        progress: 100,
        status: "completed",
        dimensions: dimensions as any,
      },
    });
  } catch (err: any) {
    report(0, "failed", `拆解失败：${err.message}`);
    await prisma.dissectionTask.update({
      where: { id: taskId },
      data: {
        status: "failed",
        error: err.message,
      },
    });
  }
}

// ─── 维度提取辅助函数 ────────────────────────────────────

async function extractSingleDimension(
  client: LLMClient,
  model: string,
  dimension: DimensionKey,
  textSample: string,
  chapterCount: number,
): Promise<DimensionResult> {
  const prompt = buildDimensionPrompt(dimension, textSample, chapterCount);

  const response = await client.chat({
    model,
    messages: [
      { role: "system", content: "你是一位专业小说分析师。用结构化Markdown输出，不客套。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.3, // 低温度保证一致性
    maxTokens: 4096,
  });

  return {
    dimension,
    label: DIMENSION_LABELS[dimension],
    icon: DIMENSION_ICONS[dimension],
    content: response.content || "",
    status: "completed",
  };
}

async function extractDimensionsBatch(
  client: LLMClient,
  model: string,
  dimensions: DimensionKey[],
  textSample: string,
  chapterCount: number,
): Promise<Record<string, DimensionResult>> {
  const prompt = buildQuickExtractPrompt(textSample, chapterCount, dimensions);

  const response = await client.chat({
    model,
    messages: [
      { role: "system", content: "你是一位资深小说分析师。用Markdown输出，每个维度用##标题分隔。不客套，直接给结果。" },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    maxTokens: 8192,
  });

  const fullContent = response.content || "";

  // 按 ## 标题将结果拆分到各维度
  const results: Record<string, DimensionResult> = {};
  for (const dim of dimensions) {
    const label = DIMENSION_LABELS[dim];
    // 尝试从全文提取该维度的段落
    const sectionRegex = new RegExp(
      `##\\s*${escapeRegex(label)}[\\s\\S]*?(?=##\\s|$)`,
      "i",
    );
    const match = fullContent.match(sectionRegex);
    const content = match ? match[0].replace(/^##\s*[^\n]+\n?/, "").trim() : "";

    results[dim] = {
      dimension: dim,
      label,
      icon: DIMENSION_ICONS[dim],
      content: content || `（未提取到${label}相关内容）`,
      status: "completed",
    };
  }

  return results;
}

async function extractChapterSummariesForTask(
  client: LLMClient,
  model: string,
  taskId: string,
  chapters: ChapterInfo[],
  fullText: string,
  progressStart: number,
  progressEnd: number,
): Promise<void> {
  const total = chapters.length;
  for (let i = 0; i < total; i++) {
    const ch = chapters[i];
    const chapterText = fullText.slice(ch.startPos, ch.endPos);
    const prompt = buildChapterSummaryPrompt(ch.title, chapterText, i + 1, total);

    try {
      const response = await client.chat({
        model,
        messages: [
          { role: "system", content: "你是一个精准的小说分析师。只返回要求的JSON，不要额外文字。" },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        maxTokens: 1024,
      });

      // 尝试解析 JSON 响应
      const content = response.content || "";
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          ch.summary = parsed.summary || content.slice(0, 200);
        } else {
          ch.summary = content.slice(0, 200);
        }
      } catch {
        ch.summary = content.slice(0, 200);
      }
    } catch {
      ch.summary = `第${i + 1}章摘要提取失败`;
    }

    const pct = progressStart + Math.round(((i + 1) / total) * (progressEnd - progressStart));
    await prisma.dissectionTask.update({
      where: { id: taskId },
      data: {
        progress: pct,
        completedChapters: i + 1,
        chapterList: chapters as any,
      },
    });
  }
}

// ─── 原文样本构建 ────────────────────────────────────────

/**
 * 智能截取原文：首部+每章标题+尾部。
 * 对于大文本，无法全部放进 LLM 上下文，需要做策略性截取。
 */
function buildTextSample(fullText: string, chapters: ChapterInfo[]): string {
  const MAX_SAMPLE = 80000; // 最多 8 万字符
  if (fullText.length <= MAX_SAMPLE) return fullText;

  const head = fullText.slice(0, 15000);
  const tail = fullText.slice(-10000);

  // 每章取开头 300 字作为样本
  const chapterSamples = chapters.slice(0, 50).map((ch) => {
    const chText = fullText.slice(ch.startPos, Math.min(ch.startPos + 300, ch.endPos));
    return `[${ch.title}]\n${chText}...\n`;
  });

  return `${head}\n\n...（中间省略）...\n\n${chapterSamples.join("\n")}\n\n...（尾部）...\n\n${tail}`;
}

// ─── 工具函数 ────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── 转为项目 ────────────────────────────────────────────

/**
 * 将拆书结果转为 Novel Forge 项目。
 * 用提取的维度数据创建：项目基本信息 + 角色卡 + 世界观条目 + 风格卡 + 章节大纲。
 */
export async function convertToProject(taskId: string): Promise<string> {
  const task = await prisma.dissectionTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("拆书任务不存在");
  if (task.status !== "completed") throw new Error("拆解尚未完成，无法转为项目");

  const dims = task.dimensions as unknown as Record<string, DimensionResult>;
  const chapters = (task.chapterList as unknown as ChapterInfo[]) || [];

  // 提取基本信息维度作为项目名
  const basicInfo = dims.basic_info?.content || "";
  const projectName = task.bookName || task.taskName || "未命名拆书项目";
  const genre = guessGenre(basicInfo);

  // 创建项目
  const project = await prisma.project.create({
    data: {
      name: projectName,
      description: basicInfo.slice(0, 500),
      synopsis: dims.story_core?.content?.slice(0, 500) || "",
      genre,
      globalPrompt: buildGlobalPromptFromDimensions(dims),
    },
  });

  // 导入角色
  const charContent = dims.characters?.content || "";
  if (charContent) {
    const chars = parseCharacterList(charContent);
    for (const c of chars.slice(0, 20)) {
      await prisma.characterCard.create({
        data: {
          projectId: project.id,
          name: c.name,
          role: c.role || "supporting",
          background: c.description || "",
          abilities: c.abilities || [],
          personality: c.personality || ([] as any),
        },
      });
    }
  }

  // 导入世界观条目
  const worldviewContent = dims.worldview?.content || "";
  if (worldviewContent) {
    await prisma.lorebookEntry.create({
      data: {
        projectId: project.id,
        title: "世界观概要",
        category: "worldview",
        keys: ["世界", "世界观", "设定"],
        content: worldviewContent.slice(0, 2000),
        insertionOrder: 60,
      },
    });
  }

  // 导入势力
  const factionsContent = dims.factions?.content || "";
  if (factionsContent) {
    await prisma.lorebookEntry.create({
      data: {
        projectId: project.id,
        title: "势力阵营",
        category: "faction",
        keys: ["势力", "宗门", "组织"],
        content: factionsContent.slice(0, 2000),
        insertionOrder: 50,
      },
    });
  }

  // 导入力量体系
  const powerContent = dims.power_system?.content || dims.cultivation?.content || "";
  if (powerContent) {
    await prisma.lorebookEntry.create({
      data: {
        projectId: project.id,
        title: "力量体系",
        category: "magic_system",
        keys: ["修炼", "功法", "境界", "力量"],
        content: powerContent.slice(0, 2000),
        insertionOrder: 55,
      },
    });
  }

  // 导入地图
  const mapContent = dims.map?.content || "";
  if (mapContent && mapContent.length > 20) {
    await prisma.lorebookEntry.create({
      data: {
        projectId: project.id,
        title: "地理地图",
        category: "location",
        keys: ["地图", "地点", "地理"],
        content: mapContent.slice(0, 2000),
        insertionOrder: 40,
      },
    });
  }

  // 导入风格卡
  const styleContent = dims.style_analysis?.content || "";
  if (styleContent) {
    await prisma.styleCard.create({
      data: {
        projectId: project.id,
        styleDescription: styleContent.slice(0, 1000),
        sourceChapterCount: chapters.length,
      } as any,
    });
  }

  // 构建大纲节点
  if (chapters.length > 0) {
    const rootNode = await prisma.storyNode.create({
      data: {
        projectId: project.id,
        type: "volume",
        title: "正文",
        order: 0,
        status: "outline_only",
        outline: dims.story_core?.content?.slice(0, 500) || "",
      },
    });

    // 为每章创建节点（最多50章，避免太多）
    for (const ch of chapters.slice(0, 50)) {
      await prisma.storyNode.create({
        data: {
          projectId: project.id,
          parentId: rootNode.id,
          type: "chapter",
          title: ch.title,
          order: ch.index,
          status: "outline_only",
          outline: ch.summary || `第${ch.index}章`,
        },
      });
    }
  }

  // 标记任务为已转换
  await prisma.dissectionTask.update({
    where: { id: taskId },
    data: { convertedToProjectId: project.id },
  });

  return project.id;
}

// ─── 辅助解析函数 ────────────────────────────────────────

function guessGenre(text: string): string[] {
  const genreMap: Record<string, string[]> = {
    "仙侠": ["仙侠"],
    "玄幻": ["玄幻"],
    "都市": ["都市"],
    "科幻": ["科幻"],
    "奇幻": ["奇幻"],
    "历史": ["历史"],
    "悬疑": ["悬疑"],
    "言情": ["言情"],
    "武侠": ["武侠"],
    "末世": ["末世"],
    "游戏": ["游戏"],
    "轻小说": ["轻小说"],
  };
  for (const [kw, genre] of Object.entries(genreMap)) {
    if (text.includes(kw)) return genre;
  }
  return ["玄幻"]; // 默认
}

interface ParsedChar {
  name: string;
  role?: string;
  description?: string;
  abilities?: string[];
  personality?: string[];
}

function parseCharacterList(markdown: string): ParsedChar[] {
  const chars: ParsedChar[] = [];
  // 按 ## 或 ### 或 **粗体名** 或 - 列表项切分
  const lines = markdown.split("\n");
  let current: ParsedChar | null = null;

  for (const line of lines) {
    // 检测新角色开始
    const nameMatch =
      line.match(/^#{1,3}\s*(.+)/) ||
      line.match(/^\*\*(.+?)\*\*/) ||
      line.match(/^[-*]\s*\*?\*?(.+?)\*?\*?\s*[:：]/);

    if (nameMatch) {
      if (current && current.name) chars.push(current);
      const raw = nameMatch[1].replace(/[:：]/g, "").trim();
      // 过滤掉不是角色名的行（如"主角"、"反派"等分类标题）
      if (raw.length <= 20 && !/^(角色|人物|主角|配角|反派|主要|其他)/.test(raw)) {
        current = { name: raw };
      } else {
        current = null;
      }
      continue;
    }

    if (current) {
      const roleMatch = line.match(/(?:角色|身份|定位)[：:]\s*(.+)/);
      if (roleMatch) {
        current.role = mapRoleName(roleMatch[1]);
      }
      const descMatch = line.match(/(?:描述|背景|介绍)[：:]\s*(.+)/);
      if (descMatch) {
        current.description = (current.description || "") + descMatch[1];
      }
    }
  }

  if (current && current.name) chars.push(current);

  // 如果没解析到任何角色，尝试更暴力的方法：提取所有看起来像人名的东西
  if (chars.length === 0) {
    const chineseNames = markdown.match(/[一-龥]{2,4}(?=[：:，。\n])/g);
    if (chineseNames) {
      const unique = [...new Set(chineseNames)].slice(0, 20);
      for (const name of unique) {
        if (!/^(章节|第.|本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么)/.test(name)) {
          chars.push({ name, role: "supporting" });
        }
      }
    }
  }

  return chars;
}

function mapRoleName(raw: string): string {
  const lower = raw.trim().toLowerCase();
  if (/主角|主人公|男主|女主/.test(lower)) return "protagonist";
  if (/反派|敌人|对手/.test(lower)) return "antagonist";
  if (/导师|师父|师傅/.test(lower)) return "mentor";
  if (/恋人|爱人|情侣|对象/.test(lower)) return "love_interest";
  if (/搞笑|丑角|谐星/.test(lower)) return "comic_relief";
  if (/催化剂|关键/.test(lower)) return "catalyst";
  return "supporting";
}

function buildGlobalPromptFromDimensions(
  dims: Record<string, DimensionResult>,
): string {
  const parts: string[] = [];

  const worldview = dims.worldview?.content;
  if (worldview) parts.push(`## 世界观\n${worldview.slice(0, 1000)}`);

  const factions = dims.factions?.content;
  if (factions) parts.push(`## 势力\n${factions.slice(0, 500)}`);

  const power = dims.power_system?.content || dims.cultivation?.content;
  if (power) parts.push(`## 力量体系\n${power.slice(0, 800)}`);

  const special = dims.special_settings?.content;
  if (special) parts.push(`## 特殊设定\n${special.slice(0, 500)}`);

  return parts.join("\n\n");
}
