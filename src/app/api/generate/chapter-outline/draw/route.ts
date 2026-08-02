/**
 * POST /api/generate/chapter-outline/draw
 *
 * 抽卡模式——并行生成 3-5 张不同走向的章纲卡片，用户选一张。
 *
 * 每张卡片 = 一次独立的 AI 调用，temperature 不同，产出不同走向。
 * 卡片包含：章纲全文 + 选角列表 + 核心冲突 + 情绪基调 + 伏笔方向
 */

export const maxDuration = 120;
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


import {
  loadOutlineData, extractPrevContext,
  buildCharacterList, prepareOutlineDirective, formatSummaries,
} from "@/core/pipeline/outline-context";
import { callSiliconFlow } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, prompt: customPrompt, authorNote: explicitAuthorNote, count = 4 } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    const drawCount = Math.min(Math.max(count, 3), 5); // 3-5张

    // ═══════════════════════════════════════════════
    // Step 1: 读数据——使用共享模块
    // ═══════════════════════════════════════════════

    const { project, node, allNodes, characters, summaries } = await loadOutlineData(projectId, nodeId, 3);
    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    const prevContext = extractPrevContext(allNodes, nodeId);

    const authorDirectiveRaw = await prepareOutlineDirective(projectId, explicitAuthorNote || project.authorNote);
    const authorDirective = authorDirectiveRaw
      ? `\n## ⚠️ 作者指令——最高优先级\n${authorDirectiveRaw}\n`
      : "";

    // draw 模式带性格特征
    const characterList = buildCharacterList(characters, true);
    const recentSummary = formatSummaries(summaries);
    const nodeIndex = allNodes.findIndex((n: any) => n.id === nodeId);
    const hasCustomPrompt = customPrompt?.trim();

    // ═══════════════════════════════════════════════
    // Step 2: 构建统一 prompt（选角+章纲一次完成）
    // ═══════════════════════════════════════════════
    const system = `你是小说章纲专家。每张卡片=一条独立的章节路线。

【卡片格式——纯JSON】
{
  "outline": "完整的标准格式章纲（详见下方）",
  "characters": ["角色名1", "角色名2"],
  "coreConflict": "一句话——谁和谁因为什么对立",
  "mood": "情感基调标签（如：暗流涌动 / 热血沸腾 / 哀而不伤）",
  "foreshadowing": "本章可埋的伏笔方向（一句话）",
  "cardLabel": "这张卡片的特色标签（如：🔥高冲突向 / 🧊冷峻智斗向 / 💔情感向 / ⚡快节奏动作向）"
}

【outline 字段必须严格按以下P0标准格式输出——三层结构】

### 第一部分：章节元信息
C| 章节号 | 章节标题 | 开头承接（时间+地点+氛围）| 主视角人物
L0| ✅ 平台合规 | ✅ 数据有效性 | ✅ 剧情连贯
L1| ✅ 信息不对称 | ✅ 延迟揭示 | ✅ 章尾钩子(类型)
L2| ✅ 否定对比式比喻禁令 | ✅ 内省配额(<20%) | ✅ 段尾硬停 | ✅ 行为说话

### 第二部分：叙事段落
- 【章首衔接】：[与C行第三列一致的时空描写]
以下行按需交替使用（每行单独占一行）：
R| [角色名][标签] [动作] [对象/地点] [结果/状态]
⟨✍ 写作指令⟩（可选，给AI的导演批注）
L| [地点名] [场景氛围描述]
G| [金手指名称] [触发条件/表现]
P| [事件描述]
K| [台词内容] | [说话人] | [情境]
- 【章尾悬念】：[本章最后一行]

### 第三部分：技术规格
CF| [伏笔名] | [操作类型:埋设/呼应/暗示/回收] | [操作细节]
M| [情绪类型] | [强度1-10] | [通过什么描写手段实现]
K| [金句内容] | [说话人] | [情境]
EL| [当前幕名] | [本章情绪定位] | [对整体曲线的贡献]
T| [下一章标题] | [剧情目标/需承接的状态]

【规则】
- 所有角色/地点/势力来自给定的白名单，不创造新角色
- 每章至少3个R|行,1-2个L|行
- 【章首衔接】和【章尾悬念】强制且必须存在
- CF| 伏笔操作要明确写出埋设了什么和如何体现
- 5条路线的章纲必须有明显不同的侧重点和走向
- 路线间的差异应体现在：核心冲突不同、角色侧重不同、章尾钩子类型不同、伏笔方向不同`;

    const userPrompt = `${authorDirective}
【章纲目标】
${hasCustomPrompt ? `用户提示词：${customPrompt}\n` : ""}本章标题：${node.title}（第${nodeIndex + 1}章）
${node.outline ? `现有大纲（如有）：${node.outline.slice(0, 300)}\n` : ""}

【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【前文上下文】
${prevContext || "（本章为开头）"}
${recentSummary ? `\n最近摘要：${recentSummary}` : ""}

【角色卡】
${characterList}

请生成一条章纲路线。记住：每次调用给出不同方向的章纲。`;

    // ═══════════════════════════════════════════════
    // Step 3: 并行生成 N 张卡片（不同 temperature）
    // ═══════════════════════════════════════════════
    const temperatures = [0.3, 0.5, 0.7, 0.9, 1.0].slice(0, drawCount);

    const results = await Promise.allSettled(
      temperatures.map((temp) => callSiliconFlow({ system, prompt: userPrompt, temperature: temp, maxTokens: 4096 }))
    );

    // 解析结果
    const cards: Array<{
      outline: string; characters: string[]; coreConflict: string;
      mood: string; foreshadowing: string; cardLabel: string;
      temperature: number; error?: string;
    }> = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === "rejected") {
        cards.push({
          outline: "", characters: [], coreConflict: "", mood: "", foreshadowing: "",
          cardLabel: `路线${i + 1}（生成失败）`, temperature: temperatures[i],
          error: result.reason instanceof Error ? result.reason.message : "未知错误",
        });
        continue;
      }

      try {
        let raw = result.value.trim();
        const md = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (md) raw = md[1].trim();
        const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
        if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
        const parsed = JSON.parse(raw) as Record<string, unknown>;

        cards.push({
          outline: (parsed.outline as string) || "",
          characters: Array.isArray(parsed.characters) ? parsed.characters as string[] : [],
          coreConflict: (parsed.coreConflict as string) || "",
          mood: (parsed.mood as string) || "",
          foreshadowing: (parsed.foreshadowing as string) || "",
          cardLabel: (parsed.cardLabel as string) || `路线${i + 1}`,
          temperature: temperatures[i],
        });
      } catch {
        // 解析失败——尝试当纯文本章纲
        cards.push({
          outline: result.value.slice(0, 1000),
          characters: [],
          coreConflict: "",
          mood: "",
          foreshadowing: "",
          cardLabel: `路线${i + 1}（纯文本）`,
          temperature: temperatures[i],
          error: "JSON解析失败，已转为纯文本章纲",
        });
      }
    }

    // 匹配角色详情
    const allSelectedNames = [...new Set(cards.flatMap(c => c.characters))];
    const charDetails = characters
      .filter((c: any) => allSelectedNames.some(n =>
        n.toLowerCase() === c.name.toLowerCase() ||
        (c.aliases || []).some((a: string) => a.toLowerCase() === n.toLowerCase())
      ))
      .map((c: any) => ({ id: c.id, name: c.name, role: c.role }));

    return NextResponse.json({
      nodeId,
      title: node.title,
      cards,
      totalCharacters: characters.length,
      characterDetails: charDetails,
      modelUsed: "v4-flash",
    });
  } catch (err) {
    return jsonError(err);
  }
}
