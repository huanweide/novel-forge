// ============================================================
// 拆书引擎 —— 分章 + 多维提取 + 进度追踪
//
// 五阶段流水线：
//   1. 预处理（文本清理、编码统一）
//   2. 章边界检测（三层：正则→语义→固定字数）
//   3. 逐维提取（快速1次/标准4组并行/精细15维并发池）
//   4. 全局蒸馏（别名合并、时间排序——后续迭代）
//   5. 结构化入库
//
// 性能优化（v0.20.28）：
//   - 维度提取并行化：标准4组并行 / 精细15维并发池(limit=8)
//   - 章节摘要并发池：withConcurrency(8)，50章从串行~250s→~35s
//   - 智能文本采样：按维度定向截取相关段落
// ============================================================

import { asArray } from "@/lib/utils";
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

// ─── 并发控制 ──────────────────────────────────────────

/** LLM 并发上限——避免触发 API 限流 */
const LLM_CONCURRENCY = 8;

/**
 * 通用并发池。
 * 复用 characters/expand 的 withConcurrency 模式——
 * limit 个 worker 并行消费 items，任一失败不阻断其他。
 */
async function withConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  limit: number = LLM_CONCURRENCY,
): Promise<(R | null)[]> {
  const results: (R | null)[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = await fn(items[idx], idx);
      } catch {
        results[idx] = null;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}

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

    // 4. 准备原文样本（智能截取——按维度定向采样）
    const textSample = buildTextSample(cleanText, chapters);

    // 5. 并行维度提取
    const dimensions: Record<string, DimensionResult> = {};

    if (depth === "quick") {
      // 快速模式：单次 LLM 全提（无法并行——本身就是一次调用）
      report(15, "extracting", "快速模式：一次性提取全部15维度...");
      try {
        const group = DIMENSION_GROUPS.quick[0];
        const result = await extractDimensionsBatch(
          client, model, group, textSample, chapters.length,
        );
        Object.assign(dimensions, result);
      } catch (err: any) {
        // 快速模式失败——标记所有维度为失败
        for (const dim of DISSECT_DIMENSIONS) {
          dimensions[dim] = {
            dimension: dim,
            label: DIMENSION_LABELS[dim],
            icon: DIMENSION_ICONS[dim],
            content: "",
            status: "failed",
            error: err?.message || "批量提取失败",
          };
        }
      }
      report(90, "extracting", "维度提取完成");

      // 实时写 DB
      await prisma.dissectionTask.update({
        where: { id: taskId },
        data: { progress: 90, dimensions: dimensions as any, status: "extracting" },
      });
    } else {
      // 标准/精细模式：并行提取
      const allDims: DimensionKey[] = DIMENSION_GROUPS[depth].flat();
      const totalDims = allDims.length;
      let completedDims = 0;

      report(15, "extracting", `并行提取 ${totalDims} 个维度（并发${LLM_CONCURRENCY}）...`);

      // 并发池——所有维度同时跑，limit 控制并发数
      const results = await withConcurrency(
        allDims,
        async (dim) => {
          // 为每个维度构建定向文本样本
          const dimSample = buildDimensionTextSample(cleanText, chapters, dim);
          const result = await extractSingleDimension(
            client, model, dim, dimSample, chapters.length,
          );
          completedDims++;
          const pct = 15 + Math.round((completedDims / totalDims) * 75);
          // 每完成一个维度就更新 DB（让前端看到实时进度）
          dimensions[dim] = result;
          await prisma.dissectionTask.update({
            where: { id: taskId },
            data: {
              progress: pct,
              dimensions: dimensions as any,
              status: "extracting",
            },
          }).catch(() => {}); // 更新失败不阻断
          report(pct, "extracting", `✅ ${DIMENSION_LABELS[dim]} (${completedDims}/${totalDims})`);
          return result;
        },
        LLM_CONCURRENCY,
      );

      // 标记失败的维度
      for (let i = 0; i < allDims.length; i++) {
        const dim = allDims[i];
        if (!dimensions[dim]) {
          dimensions[dim] = {
            dimension: dim,
            label: DIMENSION_LABELS[dim],
            icon: DIMENSION_ICONS[dim],
            content: "",
            status: "failed",
            error: "并发提取失败",
          };
        }
      }
    }

    // 6. 可选：逐章摘要提取（并发池加速）
    if (extractChapterSummaries && chapters.length > 0) {
      report(90, "extracting", `并发提取章节摘要（${chapters.length}章，并发${LLM_CONCURRENCY}）...`);
      await extractChapterSummariesConcurrent(
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
  const failedDims: DimensionKey[] = [];

  for (const dim of dimensions) {
    const label = DIMENSION_LABELS[dim];

    // 策略1：精确匹配 ## label
    let content = extractSectionByLabel(fullContent, label);

    // 策略2：如果精确匹配结果太短，尝试模糊匹配（允许 label 前后有修饰词）
    if (content.length < 20) {
      content = extractSectionFuzzy(fullContent, label);
    }

    results[dim] = {
      dimension: dim,
      label,
      icon: DIMENSION_ICONS[dim],
      content: content || `（未提取到${label}相关内容）`,
      status: content.length >= 10 ? "completed" : "failed",
      error: content.length < 10 ? `${label}提取内容过短（${content.length}字）` : undefined,
    };

    if (content.length < 10) {
      failedDims.push(dim);
    }
  }

  // 策略3：对失败维度发起独立 LLM 调用补救
  if (failedDims.length > 0) {
    console.log(`[dissect] quick模式分割后${failedDims.length}个维度内容过短，逐一重试...`);
    for (const dim of failedDims) {
      try {
        const retryResult = await extractSingleDimension(
          client, model, dim, textSample, chapterCount,
        );
        results[dim] = retryResult;
      } catch (err: any) {
        results[dim].error = `重试失败: ${err?.message || "未知错误"}`;
      }
    }
  }

  return results;
}

// ─── AI输出分割辅助 ──────────────────────────────────────

/**
 * 从 AI 批量输出中按标签精确匹配段落。
 * 匹配模式：## label 开头，到下一个 ## 或字符串结尾。
 */
function extractSectionByLabel(fullContent: string, label: string): string {
  const sectionRegex = new RegExp(
    `##\\s*${escapeRegex(label)}[\\s\\S]*?(?=##\\s|$)`,
    "i",
  );
  const match = fullContent.match(sectionRegex);
  if (!match) return "";
  return match[0].replace(/^##\s*[^\n]+\n?/, "").trim();
}

/**
 * 模糊匹配：允许标题有其他变体。
 * 尝试匹配包含 label 的标题（如 "## 角色信息"、"## 主要角色"、"### 角色"）。
 */
function extractSectionFuzzy(fullContent: string, label: string): string {
  // 尝试多种标题变体
  const variants = [
    label,                          // 角色
    `${label}信息`,                 // 角色信息
    `${label}分析`,                 // 角色分析
    `主要${label}`,                 // 主要角色
    `${label}列表`,                 // 角色列表
    `${label}设定`,                 // 角色设定
  ];

  for (const variant of variants) {
    const content = extractSectionByLabel(fullContent, variant);
    if (content.length >= 20) return content;
  }

  // 最后兜底：用更宽松的正则——允许标签前后有任意字符
  const looseRegex = new RegExp(
    `#{1,3}\\s*[^\\n]*${escapeRegex(label)}[^\\n]*[\\s\\S]*?(?=#{1,3}\\s|$)`,
    "i",
  );
  const match = fullContent.match(looseRegex);
  if (!match) return "";
  return match[0].replace(/^#{1,3}\s*[^\n]+\n?/, "").trim();
}

/**
 * 并发池版章节摘要提取。
 * 复用 withConcurrency 模式——8章并行跑，比串行快 ~8x。
 */
async function extractChapterSummariesConcurrent(
  client: LLMClient,
  model: string,
  taskId: string,
  chapters: ChapterInfo[],
  fullText: string,
  progressStart: number,
  progressEnd: number,
): Promise<void> {
  const total = chapters.length;
  let completedCount = 0;

  await withConcurrency(
    chapters,
    async (ch, i) => {
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

      completedCount++;
      const pct = progressStart + Math.round((completedCount / total) * (progressEnd - progressStart));
      // 静默更新进度（不阻塞并发）
      await prisma.dissectionTask.update({
        where: { id: taskId },
        data: {
          progress: pct,
          completedChapters: completedCount,
          chapterList: chapters as any,
        },
      }).catch(() => {});
    },
    LLM_CONCURRENCY,
  );
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

/**
 * 按维度定向采样。
 *
 * 不同维度关注文本的不同部位——盲目发全文既浪费 token 又稀释关键信息。
 * 这里复用 memory-injector 的"选择性字段"思路（Strategy 2），
 * 每个维度只拿对它最有价值的那部分文本。
 */
function buildDimensionTextSample(
  fullText: string,
  chapters: ChapterInfo[],
  dimension: DimensionKey,
): string {
  const MAX_SAMPLE = 60000;
  const base = buildTextSample(fullText, chapters);

  // 如果全文已经够小，直接返回
  if (fullText.length <= MAX_SAMPLE) return fullText;

  // 根据维度类型定向采样
  switch (dimension) {
    case "characters": {
      // 角色维度：取对话密集的段落 + 前5章的完整角色出场
      const dialogues = extractDialogueSections(fullText, 3000);
      const firstChapters = chapters.slice(0, 5).map((ch) =>
        fullText.slice(ch.startPos, Math.min(ch.startPos + 800, ch.endPos))
      ).join("\n---\n");
      return `【角色出场段落】\n${firstChapters}\n\n【对话密集段落】\n${dialogues}\n\n${base.slice(0, 20000)}`;
    }

    case "style_analysis": {
      // 风格维度：头/中/尾各取一段，保证代表性
      const mid = Math.floor(chapters.length / 2);
      const headSample = fullText.slice(0, 2000);
      const midSample = chapters[mid]
        ? fullText.slice(chapters[mid].startPos, Math.min(chapters[mid].startPos + 2000, chapters[mid].endPos))
        : "";
      const tailSample = fullText.slice(-2000);
      return `【开头样本】\n${headSample}\n\n【中间样本】\n${midSample}\n\n【结尾样本】\n${tailSample}`;
    }

    case "plot_thread": {
      // 情节维度：每章开头段落（情节通常在章首引入）
      const openings = chapters.slice(0, 40).map((ch) => {
        const snippet = fullText.slice(ch.startPos, Math.min(ch.startPos + 400, ch.endPos));
        return `[${ch.title}] ${snippet.slice(0, 200)}...`;
      }).join("\n");
      return `【各章开头】\n${openings}\n\n${base.slice(0, 30000)}`;
    }

    case "map":
    case "factions": {
      // 地图/势力：搜索含地名/势力名的段落
      const locationTerms = /(?:城|宗|山|谷|殿|阁|府|界|域|国|派|门|族|盟|会|楼|堂|峰|海|林|原|境)/g;
      const relevantSections = extractRelevantSections(fullText, locationTerms, 4000);
      return `【地点/势力相关段落】\n${relevantSections}\n\n${base.slice(0, 20000)}`;
    }

    case "power_system":
    case "cultivation": {
      // 力量/功法：搜索修炼相关段落
      const powerTerms = /(?:修炼|突破|境界|功法|灵气|丹田|元婴|金丹|筑基|炼气|化神|渡劫|秘籍|法术|神通|力量|等级|阶|品|层|重|星|环)/g;
      const relevantSections = extractRelevantSections(fullText, powerTerms, 4000);
      return `【修炼/功法相关段落】\n${relevantSections}\n\n${base.slice(0, 20000)}`;
    }

    case "currency":
    case "items": {
      // 货币/物品：搜索交易和物品描述段落
      const itemTerms = /(?:灵石|金币|银两|丹药|法宝|神器|兵器|材料|购买|交易|价格|价值|拍卖|坊市|店铺)/g;
      const relevantSections = extractRelevantSections(fullText, itemTerms, 3000);
      return `【物品/交易相关段落】\n${relevantSections}\n\n${base.slice(0, 20000)}`;
    }

    default:
      // 其他维度用标准采样
      return base;
  }
}

/** 提取含对话的段落 */
function extractDialogueSections(text: string, maxChars: number): string {
  const lines = text.split("\n");
  const dialogueLines: string[] = [];
  for (const line of lines) {
    if (line.includes("「") || line.includes("」") || line.includes("\"") || line.includes("：") || line.includes("说") || line.includes("道")) {
      dialogueLines.push(line);
      if (dialogueLines.join("\n").length > maxChars) break;
    }
  }
  return dialogueLines.join("\n").slice(0, maxChars);
}

/** 提取包含特定关键词的段落 */
function extractRelevantSections(text: string, regex: RegExp, maxChars: number): string {
  const sections: string[] = [];
  let accumulated = 0;
  // 按段落切分（双换行）
  const paragraphs = text.split(/\n\n+/);
  for (const para of paragraphs) {
    if (regex.test(para)) {
      sections.push(para.slice(0, 300));
      accumulated += para.length;
      if (accumulated > maxChars) break;
    }
  }
  return sections.join("\n---\n").slice(0, maxChars);
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
export async function convertToProject(
  taskId: string,
  modifications?: string,
): Promise<string> {
  const task = await prisma.dissectionTask.findUnique({ where: { id: taskId } });
  if (!task) throw new Error("拆书任务不存在");
  if (task.status !== "completed") throw new Error("拆解尚未完成，无法转为项目");

  const dims = task.dimensions as unknown as Record<string, DimensionResult>;
  const chapters = (task.chapterList as unknown as ChapterInfo[]) || [];
  const isAdapted = !!modifications;

  // 提取基本信息维度作为项目名
  const basicInfo = dims.basic_info?.content || "";
  const baseName = task.bookName || task.taskName || "未命名拆书项目";
  const projectName = isAdapted ? `[改编] ${baseName}` : baseName;
  const genre = guessGenre(basicInfo);

  // 构建全局提示词——改编模式追加修改要求
  let globalPrompt = buildGlobalPromptFromDimensions(dims);
  if (modifications) {
    globalPrompt = `${globalPrompt}\n\n---\n## ⚠️ 改编要求（最高优先级）\n以下是对原著的修改方案，所有生成内容必须遵守：\n\n${modifications}`;
  }

  // 创建项目
  const project = await prisma.project.create({
    data: {
      name: projectName,
      description: isAdapted
        ? `[改编自《${baseName}》] ${modifications.slice(0, 300)}`
        : basicInfo.slice(0, 500),
      synopsis: dims.story_core?.content?.slice(0, 500) || "",
      genre,
      globalPrompt,
      authorNote: isAdapted ? `改编要求:\n${modifications}` : "",
    },
  });

  // ── 导入角色（多策略：维度解析 → 兜底扫描 → AI批量结构化）──
  const charContent = dims.characters?.content || "";
  let chars: ParsedChar[] = [];
  let fromFallback = false;

  if (charContent && charContent.length >= 20) {
    // 主策略：解析角色维度内容（已有合法性过滤）
    chars = parseCharacterList(charContent);
  }

  // 兜底策略：如果角色维度解析颗粒无收，从其他维度扫描角色名
  if (chars.length === 0) {
    console.log("[convertToProject] 角色维度解析为空，启用全维度兜底扫描...");
    const fallbackNames = extractCharacterNamesFromAllDimensions(dims);
    fromFallback = true;

    if (fallbackNames.length > 0) {
      // 尝试AI批量结构化（一次LLM调用补全所有角色的年龄/性别/外貌等）
      console.log(`[convertToProject] 兜底扫描到${fallbackNames.length}个角色名，AI批量结构化...`);
      chars = await aiStructureCharacters(fallbackNames, dims);

      // 如果AI结构化失败，降级为只填名字
      if (chars.length === 0) {
        console.log("[convertToProject] AI结构化失败，降级为仅名字导入");
        chars = fallbackNames.map((name) => ({
          name,
          role: guessRoleFromNameAndContext(name, dims),
          description: `从拆书维度自动提取的角色：${name}`,
        }));
      }
    }
  }

  // 导入角色卡——映射到完整 CharacterCard 字段
  for (const c of chars.slice(0, 30)) {
    await prisma.characterCard.create({
      data: {
        projectId: project.id,
        name: c.name,
        role: c.role || "supporting",
        age: c.age || "未知",
        gender: c.gender || "未知",
        aliases: c.aliases || [],
        background: c.description || "",
        abilities: c.abilities || [],
        personality: c.personality || ([] as any),
        appearance: (c.appearance || {}) as any,
        dialogueStyle: (c.dialogueStyle || {}) as any,
        tags: fromFallback ? ["📥拆书导入", "🤖AI补全"] : ["📥拆书导入"],
        reviewStatus: "pending",
      },
    });
  }
  console.log(`[convertToProject] 导入了 ${chars.length} 个角色（${fromFallback ? "兜底+AI结构化" : "主策略解析"}）`);

  // ── 全维度导入为世界书词条 ──
  const loreDimensions: Array<{
    dimKey: string;
    title: string;
    category: string;
    keys: string[];
    order: number;
  }> = [
    { dimKey: "worldview", title: "世界观概要", category: "custom", keys: ["世界观", "世界", "设定", "背景", "天地", "宇宙"], order: 60 },
    { dimKey: "story_core", title: "故事核心", category: "custom", keys: ["主线", "故事", "核心", "剧情", "冲突", "主题"], order: 58 },
    { dimKey: "factions", title: "势力阵营", category: "faction", keys: ["势力", "宗门", "组织", "帮派", "国家", "阵营", "门派", "家族"], order: 50 },
    { dimKey: "power_system", title: "力量体系", category: "magic_system", keys: ["修炼", "境界", "力量", "等级", "突破", "实力"], order: 55 },
    { dimKey: "cultivation", title: "功法体系", category: "technique", keys: ["功法", "秘籍", "法术", "神通", "武技", "秘术", "传承"], order: 54 },
    { dimKey: "map", title: "地理地图", category: "geography", keys: ["地图", "地点", "地理", "位置", "区域"], order: 40 },
    { dimKey: "special_settings", title: "特殊设定", category: "custom", keys: ["特殊", "设定", "规则", "独特", "限制"], order: 45 },
    { dimKey: "currency", title: "货币体系", category: "currency", keys: ["货币", "灵石", "金币", "交易", "价格", "购买", "经济"], order: 30 },
    { dimKey: "items", title: "重要物品", category: "item", keys: ["物品", "法宝", "神器", "丹药", "兵器", "材料", "宝物"], order: 35 },
    // 注：情节脉络/伏笔/大纲不属于世界书 15 类，交由故事线/大纲系统管理，不再写入 LorebookEntry，
    // 避免非法 category（"plot"）污染世界书与"特殊设定"计数。
  ];

  for (const ld of loreDimensions) {
    const dimContent = dims[ld.dimKey]?.content;
    if (!dimContent || dimContent.length < 15) continue;

    // 智能提取触发关键词：从内容中找出现频率最高的专有名词
    const extraKeys = extractKeyTerms(dimContent);
    const allKeys = [...new Set([...asArray<string>(ld.keys), ...extraKeys])].slice(0, 10);

    await prisma.lorebookEntry.create({
      data: {
        projectId: project.id,
        title: ld.title,
        category: ld.category,
        keys: allKeys,
        content: dimContent.slice(0, 2500),
        insertionOrder: ld.order,
      },
    });
  }

  // ── 导入风格卡 ──
  const styleContent = dims.style_analysis?.content || "";
  if (styleContent && styleContent.length > 20) {
    await prisma.styleCard.create({
      data: {
        projectId: project.id,
        styleDescription: styleContent.slice(0, 1200),
        sourceChapterCount: chapters.length,
      } as any,
    });
  }

  // ── 不创建章纲节点 —— 用户按自己想法写 ──

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
  personality?: string[] | any;
  age?: string;
  gender?: string;
  aliases?: string[];
  appearance?: Record<string, string>;
  dialogueStyle?: Record<string, unknown>;
}

/**
 * 从所有维度中扫描角色名（兜底策略）。
 * 扫描大纲摘要、故事核心、势力阵营、情节脉络等维度。
 */
function extractCharacterNamesFromAllDimensions(
  dims: Record<string, DimensionResult>,
): string[] {
  const priorityDims = ["outline_summary", "story_core", "factions", "plot_thread"];
  const allNames = new Set<string>();

  for (const key of priorityDims) {
    const content = dims[key]?.content;
    if (!content || content.length < 20) continue;

    // 策略1：用角色解析器的三策略提取（内部已过滤）
    const parsed = parseCharacterList(content);
    for (const p of parsed) {
      if (p.name && p.name.length >= 2 && isValidCharacterName(p.name)) {
        allNames.add(p.name);
      }
    }

    // 策略2：补充暴力中文名扫描（通过合法性校验）
    if (allNames.size < 3) {
      const names = allChineseNames(content);
      for (const n of names) {
        if (isValidCharacterName(n)) allNames.add(n);
        if (allNames.size >= 30) break;
      }
    }
  }

  return [...allNames].slice(0, 30);
}

/**
 * 根据角色名和上下文猜测角色定位。
 */
/**
 * AI批量结构化角色。
 * 当角色名来自兜底扫描（只有名字没有详细信息）时，
 * 一次LLM调用将所有角色结构化为完整数据，映射到CharacterCard字段。
 */
async function aiStructureCharacters(
  charNames: string[],
  dims: Record<string, DimensionResult>,
): Promise<ParsedChar[]> {
  if (charNames.length === 0) return [];

  const config = await getEffectiveConfig();
  const client = createLLMClient(config);
  const model = config.extractorModel || config.writerModel;

  // 收集上下文
  const storyCore = dims.story_core?.content?.slice(0, 800) || "";
  const worldview = dims.worldview?.content?.slice(0, 500) || "";
  const factions = dims.factions?.content?.slice(0, 500) || "";
  const outline = dims.outline_summary?.content?.slice(0, 800) || "";
  const styleAnalysis = dims.style_analysis?.content?.slice(0, 500) || "";

  const namesList = charNames.map((n, i) => `${i + 1}. ${n}`).join("\n");

  const prompt = `你是一位专业小说角色设计师。请为以下角色列表逐一完善详细信息。

【角色名列表】
${namesList}

【小说上下文】
${storyCore ? `故事核心：${storyCore}` : ""}
${worldview ? `世界观：${worldview}` : ""}
${factions ? `势力阵营：${factions}` : ""}
${outline ? `大纲摘要：${outline.slice(0, 600)}` : ""}
${styleAnalysis ? `写作风格：${styleAnalysis}` : ""}

【要求】
为每个角色输出：
- role: protagonist/antagonist/mentor/love_interest/supporting
- age: 年龄描述（如"25岁"、"外表18岁实际300岁"）
- gender: 男/女/未知
- background: 2-4句话背景（位置境遇+短期目标+长期欲望+卷入方式）
- abilities: 能力/技能列表（3-6项，用逗号分隔）
- personality: 性格详析JSON {dominant, drive, contradiction, habits: [], socialMask}
- appearance: 外貌JSON {hair, eyes, height, build, features, attire}
- aliases: 别名列表

【输出格式——严格JSON数组】
[
  {
    "name": "角色名",
    "role": "protagonist",
    "age": "25岁",
    "gender": "男",
    "background": "背景描述...",
    "abilities": ["能力1", "能力2", "能力3"],
    "personality": {"dominant": "外冷内热", "drive": "复仇", "contradiction": "渴望认可但自尊极强", "habits": ["咬指甲"], "socialMask": "对外冷漠"},
    "appearance": {"hair": "黑长直", "eyes": "丹凤眼", "height": "178cm", "build": "修长", "features": "左脸刀疤", "attire": "黑色劲装"},
    "aliases": ["别号1", "别号2"]
  },
  ...
]

只能输出JSON数组，不要其他文字。如果某个角色的某个字段无法推断，用"未知"或空数组。`;

  try {
    const response = await client.chat({
      model,
      messages: [
        { role: "system", content: "你是一位小说角色设计师。只返回严格JSON数组，不客套。" },
        { role: "user", content: prompt },
      ],
      temperature: 0.5,
      maxTokens: 4096,
    });

    const rawContent = response.content || "";
    const jsonMatch = rawContent.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("[aiStructureCharacters] 无法从AI输出中提取JSON数组:", rawContent.slice(0, 300));
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return [];

    const result: ParsedChar[] = [];
    for (const item of parsed) {
      if (!item.name || !isValidCharacterName(item.name)) continue;

      const pc: ParsedChar = {
        name: item.name,
        role: item.role || "supporting",
        age: item.age || "未知",
        gender: item.gender || "未知",
        description: item.background || "",
        abilities: Array.isArray(item.abilities) ? item.abilities : [],
        aliases: Array.isArray(item.aliases) ? item.aliases : [],
        appearance: item.appearance || {},
        personality: item.personality || [],
      };

      result.push(pc);
    }

    return result;
  } catch (err) {
    console.error("[aiStructureCharacters] 解析失败:", err);
    return [];
  }
}

function guessRoleFromNameAndContext(
  name: string,
  dims: Record<string, DimensionResult>,
): string {
  const storyCore = dims.story_core?.content || "";
  const outline = dims.outline_summary?.content || "";
  const combined = `${storyCore} ${outline}`;

  // 在上下文中搜索该角色名附近的角色标记
  const idx = combined.indexOf(name);
  if (idx >= 0) {
    const context = combined.slice(Math.max(0, idx - 30), idx + name.length + 50);
    if (/主角|主人公|男主|女主/.test(context)) return "protagonist";
    if (/反派|敌人|对手|仇人/.test(context)) return "antagonist";
    if (/导师|师父|师傅|老师/.test(context)) return "mentor";
    if (/恋人|爱人|情侣|道侣/.test(context)) return "love_interest";
  }

  return "supporting";
}

function parseCharacterList(markdown: string): ParsedChar[] {
  const chars: ParsedChar[] = [];
  const lines = markdown.split("\n");

  // ── 策略1：按行扫描，识别"名称 + 角色描述"模式 ──
  // 匹配多种格式：
  //   ## 李尘
  //   **李尘** - 主角
  //   1. **李尘**：主角，炼气期弟子
  //   - 李尘：主角
  //   李尘——主角
  const namePatterns = [
    // Markdown标题: ## 李尘
    /^#{1,3}\s*(.+)$/,
    // 粗体名: **李尘**
    /\*\*(.+?)\*\*/,
    // 编号列表: 1. **李尘** 或 1. 李尘
    /^\d+[.\)]\s*\*?\*?(.+?)\*?\*?/,
    // 短横列表: - 李尘 或 - **李尘**
    /^[-*]\s+\*?\*?(.+?)\*?\*?/,
  ];

  let current: ParsedChar | null = null;

  for (const line of lines) {
    // 尝试匹配角色名
    let rawName = "";
    for (const pat of namePatterns) {
      const m = line.match(pat);
      if (m) {
        rawName = m[1].replace(/[:：\-\s]+$/g, "").trim();
        break;
      }
    }

    // 如果没匹配到标准格式，尝试"中文字符名 - 描述"模式
    if (!rawName) {
      const looseMatch = line.match(/^([一-鿿]{2,4})[：:\-\s——]+(.+)/);
      if (looseMatch) {
        const potentialName = looseMatch[1];
        const rest = looseMatch[2];
        // 排除分类标题、字段标签、不含姓氏的2字词
        if (/^(角色|人物|主角|反派|主要|其他|说明|以上|以下|注意|备注)/.test(potentialName)) continue;
        if (FIELD_LABELS.has(potentialName)) continue;
        if (potentialName.length === 2 && !COMMON_SURNAMES.has(potentialName[0])) continue;

        rawName = potentialName;
        // 从rest中提取角色信息
        if (/主角|主人公|男主|女主/.test(rest)) {
          chars.push({ name: rawName, role: "protagonist", description: rest.slice(0, 200) });
          continue;
        }
        if (/反派|敌人/.test(rest)) {
          chars.push({ name: rawName, role: "antagonist", description: rest.slice(0, 200) });
          continue;
        }
        chars.push({ name: rawName, role: "supporting", description: rest.slice(0, 200) });
        continue;
      }
    }

    if (rawName && rawName.length >= 2 && rawName.length <= 10) {
      // 过滤分类标题和字段标签
      if (/^(角色|人物|主角|配角|反派|主要角色|次要角色|其他角色|龙套|背景角色)/.test(rawName)) {
        current = null;
        continue;
      }
      if (/^(章节|本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么|第一章|第二章)/.test(rawName)) {
        current = null;
        continue;
      }
      // 过滤含顿号的分段标题（如 "一、主角"、"二、主要配角"）
      if (/[、，]/.test(rawName)) {
        current = null;
        continue;
      }
      // 过滤纯字段标签
      if (FIELD_LABELS.has(rawName)) {
        current = null;
        continue;
      }
      // 过滤不以常见姓氏开头的2字词（大概率不是人名）
      if (rawName.length === 2 && !COMMON_SURNAMES.has(rawName[0])) {
        continue; // 跳过此行但保留当前角色上下文
      }

      // 保存上一个角色
      if (current && current.name) chars.push(current);
      current = { name: rawName };

      // 从同一行提取角色信息
      const afterName = line.slice(line.indexOf(rawName) + rawName.length);
      if (afterName) {
        extractRoleAndDesc(current, afterName);
      }
      continue;
    }

    // 为当前角色追加信息
    if (current) {
      extractRoleAndDesc(current, line);
    }
  }

  if (current && current.name) chars.push(current);

  // ── 策略2：如果策略1颗粒无收，用暴力正则扫中文名 ──
  if (chars.length === 0) {
    const allText = markdown;
    // 找"中文名+冒号/破折号+描述"的组合
    const nameDescPattern = /([一-鿿]{2,4})[：:\-\s——]+(.+?)(?=[\n，。]|$)/g;
    let m;
    const seen = new Set<string>();
    while ((m = nameDescPattern.exec(allText)) !== null) {
      const name = m[1];
      if (seen.has(name)) continue;
      if (/^(章节|本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么|第一章)/.test(name)) continue;
      seen.add(name);
      const desc = m[2].slice(0, 200);
      const role = guessRoleFromText(desc);
      chars.push({ name, role, description: desc });
      if (chars.length >= 20) break;
    }
  }

  // ── 策略3：全扫2-4字中文名（最后手段）──
  if (chars.length === 0) {
    const names = allChineseNames(markdown);
    for (const name of names.slice(0, 20)) {
      chars.push({ name, role: "supporting" });
    }
  }

  // ── 后处理：拆分"/"分隔的复合名 + 合法性过滤 ──
  const processed: ParsedChar[] = [];
  for (const c of chars) {
    // 处理 "叶临渊 / 林玄言" 这种复合名
    if (c.name.includes("/") || c.name.includes("／")) {
      const parts = c.name.split(/[\/／]/).map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        if (isValidCharacterName(part)) {
          processed.push({ ...c, name: part });
        }
      }
    } else if (isValidCharacterName(c.name)) {
      processed.push(c);
    }
  }
  return processed;
}

/** 从文本片段中提取角色定位和描述 */
function extractRoleAndDesc(c: ParsedChar, text: string) {
  const t = text.replace(/^[-*•\s]+/, "").trim();
  if (!t) return;

  // 角色定位
  if (/主角|主人公|男主|女主/.test(t) && !c.role) c.role = "protagonist";
  else if (/反派|敌人|对手|仇人/.test(t) && !c.role) c.role = "antagonist";
  else if (/导师|师父|师傅|老师/.test(t) && !c.role) c.role = "mentor";
  else if (/恋人|爱人|情侣|对象|道侣/.test(t) && !c.role) c.role = "love_interest";

  // 年龄
  const ageMatch = t.match(/(?:年龄|岁数)[：:]\s*(\S+)/);
  if (ageMatch) c.age = ageMatch[1];
  else {
    const ageNum = t.match(/(\d{1,3})\s*岁/);
    if (ageNum) c.age = `${ageNum[1]}岁`;
  }

  // 性别
  if (/男[性子人]/.test(t)) c.gender = "男";
  else if (/女[性子人]/.test(t)) c.gender = "女";

  // 别名
  const aliasMatch = t.match(/(?:别名|称号|绰号|外号|又称)[：:]\s*(.+)/);
  if (aliasMatch) {
    c.aliases = aliasMatch[1].split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }

  // 外貌
  const appearanceHints: Record<string, string> = {};
  const hairMatch = t.match(/(?:头发|发型|发色)[：:]\s*(\S+)/);
  if (hairMatch) appearanceHints.hair = hairMatch[1];
  const eyeMatch = t.match(/(?:眼睛|眼眸|瞳孔|眼色)[：:]\s*(\S+)/);
  if (eyeMatch) appearanceHints.eyes = eyeMatch[1];
  const heightMatch = t.match(/(?:身高|个子)[：:]\s*(\S+)/);
  if (heightMatch) appearanceHints.height = heightMatch[1];
  const buildMatch = t.match(/(?:体型|身材|体态)[：:]\s*(\S+)/);
  if (buildMatch) appearanceHints.build = buildMatch[1];
  const featureMatch = t.match(/(?:特征|印记|特点)[：:]\s*(\S+)/);
  if (featureMatch) appearanceHints.features = featureMatch[1];
  if (Object.keys(appearanceHints).length > 0) {
    c.appearance = { ...(c.appearance || {}), ...appearanceHints };
  }

  // 性格
  const personalityMatch = t.match(/(?:性格|个性)[：:]\s*(.+)/);
  if (personalityMatch) {
    c.personality = personalityMatch[1].split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }

  // 能力
  const abilityMatch = t.match(/(?:能力|技能|功法|修为|境界|擅长)[：:]\s*(.+)/);
  if (abilityMatch) {
    c.abilities = abilityMatch[1].split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
  }

  // 描述积累
  if (!personalityMatch && !abilityMatch && t.length < 200) {
    c.description = c.description ? `${c.description}; ${t}` : t;
  }
}

function guessRoleFromText(text: string): string {
  if (/主角|主人公|男主|女主/.test(text)) return "protagonist";
  if (/反派|敌人|对手/.test(text)) return "antagonist";
  if (/导师|师父|师傅/.test(text)) return "mentor";
  return "supporting";
}

function allChineseNames(text: string): string[] {
  const names = text.match(/[一-鿿]{2,4}(?=[：:，。、\n\s\-—])/g) || [];
  const stopWords = /^(章节|本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么|第一章|第二章|但是|所以|因为|如果|虽然|然而|不过|只是|已经|正在|将会|可以|必须|应该|一定|非常|特别|比较|一般|基本|大概|可能|或许|似乎|系统|世界|修炼|境界|主角|反派|势力|宗门|家族|组织|国家|大陆|功法|法术|神通|秘籍|丹药|法宝|神器|灵石|金币|交易|购买|拍卖|价格|价值|材料|剧情|情节|转折|发展|高潮|线索|伏笔|悬念|铺垫|回收|暗示|大纲|摘要|章节|概要|结构|物品|兵器|地图|地点|地理|位置|区域|货币|经济|设定|背景|规则|独特|限制|描写|分析|统计|数据|计算|估计|总计|总计|平均|以上|以下|综合|评估|评级|等级|等级|分类|类型)/;
  return [...new Set(names)].filter((n) => !stopWords.test(n));
}

/** 常见中文姓氏——用于姓名合法性校验 */
const COMMON_SURNAMES = new Set([
  "李","王","张","刘","陈","杨","赵","黄","周","吴","徐","孙","马","胡","朱","郭",
  "何","罗","高","林","郑","梁","谢","唐","许","邓","韩","冯","曹","彭","曾","萧",
  "田","董","潘","袁","蔡","蒋","于","杜","叶","程","魏","苏","吕","丁","任","卢",
  "姚","沈","钟","崔","谭","陆","汪","范","金","石","廖","贾","夏","韦","付","方",
  "白","邹","孟","熊","秦","邱","江","尹","薛","闫","段","雷","侯","龙","史","陶",
  "黎","贺","顾","毛","郝","龚","邵","万","钱","严","覃","武","戴","莫","孔","向",
  "季","裴","柳","温","常","汤","阎","段","易","欧阳","上官","慕容","南宫","夏侯",
  "诸葛","司马","司徒","尉迟","长孙","独孤","皇甫","令狐","宇文","东方",
]);

/**
 * AI输出中常见的字段标签——这些不是角色名。
 * 包括维度提取指令中的所有字段名。
 */
const FIELD_LABELS = new Set([
  // 角色维度字段标签（来自 prompts.ts getDimensionInstruction("characters")）
  "姓名","性别","年龄","外貌","性格","能力","背景","动机","别名","称号",
  "说话风格","说话","风格","关键剧情","关键","剧情节点","节点",
  "在剧情","剧情中的","作用","中的作用","在剧情中的作用",
  "与主角","与主角关系","主角关系","关系",
  "能力技能","功法修为","修为境界","境界",
  "别名称号","绰号","外号","又称",
  "主角","主人公","男主","女主","主要角色","主角身份","身份",
  "反派","敌人","对手","仇人","主要配角","配角","其他角色","龙套","背景角色",
  "一","二","三","四","五","六","七","八","九","十",
  "一主角","二主要配角","三反派","四其他",
  "外貌描述","性格特点","能力技能","动机目标","关系网",
  "头发","发型","发色","眼睛","眼眸","瞳孔","眼色",
  "身高","个子","体型","身材","体态","特征","印记","特点",
  "标志","着装","服饰","装备",
  // 其他维度常见字段
  "书名","作者","总字数","章节数","类型","流派","简介","读者群",
  "世界背景","核心规则","历史脉络","种族文明","天地灵气","魔法","科技",
  "主线","故事核心","核心冲突","主题","母题","高潮","结局",
  "时间线","叙事节奏","故事线","单线","多线","网状",
  "力量等级","等级划分","提升方式","战斗方式","规则限制",
  "势力范围","核心成员","势力关系","势力目标","实力评估",
  "品级","等级","修炼条件","效果特点","出处传承",
  "货币种类","兑换关系","物价水平","经济来源","资源稀缺","交易方式",
  "地理位置","所属势力","首次出现","功能特点",
  "句子长度","对话占比","描写密度","叙事视角","语言风格","节奏特点",
  "擅长场景","代表性","精彩段落",
  // 常见分析词
  "分析","总结","概述","描述","特点","特征","备注","说明","补充","注意",
  "状态","进度","完成","待办","计划","目标",
  // 数字和序号
  "第一章","第二章","第三章","第四章","第五章",
  "第一节","第二节","第三节",
  "第一部","第二部","第三部",
]);

/**
 * 校验一个字符串是否看起来像真实的中文角色名。
 * 过滤规则：
 *   1. 2-4个中文字符
 *   2. 不在字段标签集中
 *   3. 如果2字——必须以常见姓氏开头
 *   4. 如果3-4字——常见姓氏开头 或 不包含明显非名字词
 *   5. 不包含标点/数字/英文
 */
function isValidCharacterName(name: string): boolean {
  const trimmed = name.trim();
  // 基础长度校验
  if (trimmed.length < 2 || trimmed.length > 5) return false;
  // 必须是纯中文
  if (!/^[一-鿿]{2,5}$/.test(trimmed)) return false;
  // 不能是字段标签
  if (FIELD_LABELS.has(trimmed)) return false;
  // 不能是单字标签组合
  if (/^[在背与性说别年外能动关一二三四五六七八九十]$/.test(trimmed)) return false;

  // 2字名：必须以常见姓氏开头
  if (trimmed.length === 2) {
    const first = trimmed[0];
    if (!COMMON_SURNAMES.has(first)) return false;
  }

  // 3-4字名：常见姓氏开头 或 复姓开头
  if (trimmed.length >= 3) {
    const first = trimmed[0];
    const firstTwo = trimmed.slice(0, 2);
    const hasSurname = COMMON_SURNAMES.has(first) || COMMON_SURNAMES.has(firstTwo);
    if (!hasSurname) return false;
  }

  return true;
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

/** 从维度文本中提取关键词作为触发词 */
export function extractKeyTerms(content: string): string[] {
  // 提取2-6字的专有名词（中文大写字母开头的词组）
  const terms = content.match(/(?:[一-鿿]{2,6})(?=[：:，。、\n\s\-—（）\(\)])/g) || [];
  // 残词过滤（Max Loop Round3·P4）：量词/虚词/人称/方位词开头的片段（如「片空旷区域」）、
  // 以「的/了/着/过/地/得/们」结尾的片段，不是专有名词，不入世界书 keys（宁缺勿滥，避免污染设定库）
  const BAD_PREFIX = /^(?:片|个|只|块|根|条|把|这|那|有|在|是|从|被|让|向|往|将|已|还|也|都|很|真|太|又|再|就|才|我|你|他|她|它|我们|你们|他们|一个|一片|一座|一位|一种|关于|对于|随着|通过|经过|因为|所以)/;
  const BAD_SUFFIX = /(?:的|了|着|过|地|得|们)$/;
  // 去重 + 排序（按出现次数降序）
  const freq: Record<string, number> = {};
  for (const t of terms) {
    if (/^(本文|作者|内容|以下|上述|根据|可以|需要|注意|是否|这个|那个|什么|怎么|为什么|但是|所以|因为|如果|虽然)/.test(t)) continue;
    if (BAD_PREFIX.test(t) || BAD_SUFFIX.test(t)) continue;
    freq[t] = (freq[t] || 0) + 1;
  }
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k]) => k);
}

function buildGlobalPromptFromDimensions(
  dims: Record<string, DimensionResult>,
): string {
  const parts: string[] = [];

  const story = dims.story_core?.content;
  if (story) parts.push(`## 故事核心\n${story.slice(0, 600)}`);

  const worldview = dims.worldview?.content;
  if (worldview) parts.push(`## 世界观\n${worldview.slice(0, 800)}`);

  const factions = dims.factions?.content;
  if (factions) parts.push(`## 势力阵营\n${factions.slice(0, 500)}`);

  const power = dims.power_system?.content || dims.cultivation?.content;
  if (power) parts.push(`## 力量与功法\n${power.slice(0, 800)}`);

  const special = dims.special_settings?.content;
  if (special) parts.push(`## 特殊设定\n${special.slice(0, 500)}`);

  const plot = dims.plot_thread?.content;
  if (plot) parts.push(`## 情节脉络\n${plot.slice(0, 500)}`);

  const items = dims.items?.content;
  if (items) parts.push(`## 重要物品\n${items.slice(0, 400)}`);

  const currency = dims.currency?.content;
  if (currency) parts.push(`## 货币体系\n${currency.slice(0, 300)}`);

  const map = dims.map?.content;
  if (map) parts.push(`## 地理\n${map.slice(0, 400)}`);

  return parts.join("\n\n");
}
