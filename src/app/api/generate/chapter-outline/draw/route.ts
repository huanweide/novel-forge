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
  formatStorylines, extractLastChapterHook,
} from "@/core/pipeline/outline-context";
import { completeText } from "@/core/llm/client";

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

    const { project, node, allNodes, characters, summaries, storylines } = await loadOutlineData(projectId, nodeId, 3);
    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    const prevContext = extractPrevContext(allNodes, nodeId);
    const storylineContext = formatStorylines(storylines); // v0.46.57：章纲剧情感知
    const lastHook = extractLastChapterHook(allNodes, nodeId); // 上章钩子

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
  "outline": "自然语言章纲（严格按下方六小节，不要任何前缀符号）",
  "characters": ["角色名1", "角色名2"],
  "coreConflict": "一句话——谁和谁因为什么对立",
  "mood": "情感基调标签（如：暗流涌动 / 热血沸腾 / 哀而不伤）",
  "foreshadowing": "本章可埋的伏笔方向（一句话）",
  "cardLabel": "这张卡片的特色标签（如：🔥高冲突向 / 🧊冷峻智斗向 / 💔情感向 / ⚡快节奏动作向）"
}

【outline 字段必须严格按以下六小节输出——自然语言，禁止 C| R| K| 等任何前缀符号】

【场景】本章 2-3 个主要场景，每个一行：时间 + 地点 + 一句氛围
【事件】按顺序列出 3-5 个关键事件，每行一个：谁做了什么，导致什么
【人物】本章出场角色及其作用（每行一个：角色名——作用）
【悬念/钩子】本章结尾钩子（一句话，必须存在）
【伏笔】本章埋设/呼应的伏笔（每行一个：伏笔名——埋设或呼应）
【情绪】本章情绪走向（一句话，如：从压抑到破局 / 持续低气压）

【规则】
- 所有角色/地点/势力来自给定的白名单，不创造新角色
- 【场景】【事件】【悬念/钩子】强制存在
- 5条路线的章纲必须有明显不同的侧重点和走向
- 路线间的差异应体现在：核心冲突不同、角色侧重不同、章尾钩子类型不同、伏笔方向不同
- 章纲是给作者看的人话，不是机器指令——每个小节用流畅短句，不要任何代码式前缀`;

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

【活跃剧情线——本章必须顺着这些线推进（v0.46.57 剧情感知）】
${storylineContext || "（暂无剧情线，按总纲自由推进）"}

${lastHook ? `【上一章结尾钩子——本章开头必须承接】\n${lastHook}\n` : ""}

【角色卡】
${characterList}

请生成一条章纲路线。记住：每次调用给出不同方向的章纲。`;

    // ═══════════════════════════════════════════════
    // Step 3: 并行生成 N 张卡片（不同 temperature）
    // ═══════════════════════════════════════════════
    const temperatures = [0.3, 0.5, 0.7, 0.9, 1.0].slice(0, drawCount);

    const results = await Promise.allSettled(
      temperatures.map((temp) => completeText(system, userPrompt, { temperature: temp, maxTokens: 4096 }))
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
        // ── 鲁棒 JSON 解析（v0.46.55 修复：v4-flash 常返回 markdown 包裹/尾逗号/截断的 JSON）──
        let raw = result.value.trim();
        // 1) 剥 markdown 代码块（```json ... ``` 或 ``` ... ```）
        const md = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (md) raw = md[1].trim();
        // 2) 提取最外层 {...}（容忍前后杂文）
        const a = raw.indexOf("{"), b = raw.lastIndexOf("}");
        if (a >= 0 && b > a) raw = raw.slice(a, b + 1);
        // 3) 多级 JSON.parse：直接 → 去尾逗号 → 修复常见非法字符
        const tryParse = (s: string): Record<string, unknown> | null => {
          try { return JSON.parse(s) as Record<string, unknown>; } catch { /* 下一级 */ }
          try {
            const fixed = s
              .replace(/,\s*([}\]])/g, "$1")              // 去尾逗号
              .replace(/\u2028|\u2029/g, " ")              // 行分隔符
              .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, ""); // 控制字符
            return JSON.parse(fixed) as Record<string, unknown>;
          } catch { return null; }
        };
        let parsed = tryParse(raw);
        // 4) 正则兜底：直接提取各字段（JSON 完全不可解析时仍能拿到大纲）
        const grab = (key: string): string => {
          const m = raw.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
          return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : "";
        };
        if (!parsed) {
          parsed = {
            outline: grab("outline") || raw.slice(0, 1000),
            characters: grab("characters") ? grab("characters").split(/[,，、\s]+/).filter(Boolean) : [],
            coreConflict: grab("coreConflict"),
            mood: grab("mood"),
            foreshadowing: grab("foreshadowing"),
            cardLabel: grab("cardLabel"),
          };
        }

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
