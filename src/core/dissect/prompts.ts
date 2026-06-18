// ============================================================
// 拆书维度提取 Prompt 模板
//
// 每个维度有独立 prompt，注入原文片段后调用 LLM 提取。
// 精细模式每维度单独调，标准模式分组调，快速模式一次全提。
// ============================================================

import type { DimensionKey } from "./types";
import { DIMENSION_LABELS } from "./types";

/** 构建单维度提取 prompt */
export function buildDimensionPrompt(
  dimension: DimensionKey,
  textSample: string,
  chapterCount: number,
): string {
  const label = DIMENSION_LABELS[dimension];
  const base = `你是一位专业的小说分析师。请从以下小说文本中提取「${label}」相关内容。

【原文】（共 ${chapterCount} 章，以下为全文内容）

${textSample.slice(0, 60000)}

【提取要求】
${getDimensionInstruction(dimension)}

【输出格式】
请用 Markdown 格式输出，结构清晰，分类明确。直接输出分析结果，不要客套话，不要"根据原文"开头。`;

  return base;
}

/** 快速模式：一次提取所有维度 */
export function buildQuickExtractPrompt(
  textSample: string,
  chapterCount: number,
  selectedDimensions?: DimensionKey[],
): string {
  const dims = selectedDimensions || Object.keys(DIMENSION_LABELS) as DimensionKey[];
  const dimList = dims.map((d) => `- ${DIMENSION_LABELS[d]}`).join("\n");

  return `你是一位资深小说分析师。请对以下小说进行全面的多维度拆解。

【原文】（共 ${chapterCount} 章）

${textSample.slice(0, 80000)}

【拆解维度——请逐一分析以下每个维度】

${dimList}

【每个维度的分析要求】
${dims.map((d) => `### ${DIMENSION_LABELS[d]}\n${getDimensionInstruction(d)}`).join("\n\n")}

【输出格式】
用 Markdown 输出。每个维度用 ## 标题分隔。每个维度下用列表/表格呈现，结构清晰。直接输出分析结果。`;
}

/** 构建章节摘要提取 prompt */
export function buildChapterSummaryPrompt(
  chapterTitle: string,
  chapterText: string,
  chapterIndex: number,
  totalChapters: number,
): string {
  return `从以下小说第 ${chapterIndex}/${totalChapters} 章提取摘要。

【章节标题】${chapterTitle || "无标题"}

【章节正文】
${chapterText.slice(0, 8000)}

【要求】
1. 用3-5句话概括本章核心情节（≤150字）
2. 列出本章新出场的关键角色（如有）
3. 列出本章埋下的伏笔或悬念（如有）
4. 标注本章的情感基调（紧张/轻松/悲伤/燃等）

输出 JSON 格式：
{
  "summary": "情节摘要",
  "newCharacters": ["角色名"],
  "foreshadowing": ["伏笔描述"],
  "tone": "情感基调"
}`;
}

// ─── 各维度提取指令 ──────────────────────────────────────

function getDimensionInstruction(d: DimensionKey): string {
  const instructions: Record<DimensionKey, string> = {
    basic_info: `提取小说的基本信息：
- 书名、作者（如有提及）
- 总字数、总章节数
- 小说类型/流派（仙侠/玄幻/都市/科幻等）
- 一句话简介（核心卖点）
- 目标读者群`,

    worldview: `提取小说的世界观设定：
- 世界背景（古代/现代/架空/异世界等）
- 世界的核心规则（有什么与众不同的法则）
- 世界的历史脉络（重大历史事件）
- 种族/文明体系
- 天地灵气/魔法/科技水平描述
- 世界的危险与机遇`,

    story_core: `提取故事核心要素：
- 主线剧情梗概（300字以内）
- 核心冲突（主角 vs 什么）
- 主题/母题（成长/复仇/救赎/探索等）
- 故事的高潮设计
- 结局走向（如有）`,

    characters: `提取所有角色信息：
- 主角：姓名、性别、年龄、外貌、性格、能力、背景、动机
- 主要配角（逐个）：姓名、与主角关系、性格特点、能力、在剧情中的作用
- 反派（逐个）：姓名、动机、与主角冲突点
- 其他重要角色

每个角色请标注：
- 别名/称号
- 说话风格特点
- 关键剧情节点`,

    plot_thread: `提取情节脉络：
- 按时间顺序列出主要情节节点（每节点一句话）
- 标注重要转折点
- 标注每个情节点所在的章节范围
- 分析叙事节奏（哪里快哪里慢）
- 故事线结构（单线/多线并行/网状）`,

    outline_summary: `提取大纲摘要：
- 按章节列出每章的一句话概要
- 标注每章的核心事件
- 标注每章的出场关键角色
- 标注每章的情感/节奏标签（铺垫/冲突/高潮/过渡）`,

    foreshadowing: `提取伏笔系统：
- 列出所有已识别的伏笔
- 每个伏笔标注：
  - 埋设位置（第几章）
  - 伏笔内容
  - 是否已回收（回收位置）
  - 重要性（高/中/低）
- 标注悬而未决的伏笔`,

    map: `提取地理/地图信息：
- 列出所有出现的地名
- 每个地点标注：
  - 地理位置关系（东西南北/上下界）
  - 所属势力
  - 特点/功能
  - 首次出现章节
- 画出简单的地理关系（如：A城在B宗北面300里）`,

    factions: `提取势力阵营：
- 列出所有势力/组织/宗门/国家
- 每个势力标注：
  - 核心成员
  - 势力范围/地盘
  - 与其他势力的关系（敌对/盟友/中立）
  - 势力目标/野心
  - 实力评估`,

    power_system: `提取力量/战斗体系：
- 力量等级划分（如：炼气→筑基→金丹→元婴→化神）
- 每个等级的能力描述
- 力量提升方式（修炼/吞噬/奇遇/科技改造）
- 战斗方式（法术/体术/法宝/科技武器）
- 力量体系的规则和限制`,

    special_settings: `提取特殊设定：
- 文中独特的世界规则（不同于常规设定的部分）
- 特殊的时间/空间设定
- 独特的因果律/命运设定
- 任何"这个世界独有的"东西
- 穿越/重生/系统等特殊设定（如有）`,

    currency: `提取货币/经济体系：
- 货币种类和兑换关系
- 物价水平参考（比如一把普通武器多少钱）
- 经济来源（修炼资源怎么获取）
- 资源稀缺性（什么东西值钱）
- 交易方式（以物易物/灵石/金币）`,

    items: `提取重要物品：
- 列出所有重要的法宝/神器/丹药/材料
- 每个物品标注：
  - 品级/等级
  - 功能/效果
  - 所属者
  - 首次出现章节
  - 在剧情中的作用`,

    cultivation: `提取功法/修炼体系：
- 列出所有出现的功法/秘籍/修炼方法
- 每个功法标注：
  - 品级/等级
  - 修炼条件（灵根/血脉/境界要求）
  - 效果/特点
  - 修炼者
  - 出处/传承`,

    style_analysis: `分析写作风格：
- 平均句子长度（估计）
- 对话占比（高/中/低）
- 描写密度（1-10）
- 叙事视角（第一人称/第三人称限知/全知）
- 语言风格（古风/现代/半文半白/简洁/华丽）
- 节奏特点
- 擅长的场景类型（战斗/对话/心理/环境）
- 代表性精彩段落（摘抄2-3段）`,
  };

  return instructions[d] || "提取相关内容，用结构化方式呈现。";
}
