/**
 * POST /api/agent/analyze-relationships
 *
 * Agent 读取全部章节正文，理解角色间的实际互动关系。
 * 不只依赖角色卡的 relationships 字段——从正文中提取：
 *   谁和谁在什么场景下互动、关系性质、亲密度变化趋势。
 *
 * 输出可直接喂给 RelationshipGraph 组件渲染。
 */

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";

export const maxDuration = 90;

interface ExtractedRelation {
  /** 源角色名 */
  from: string;
  /** 目标角色名 */
  to: string;
  /** 关系类型 */
  relation: string;
  /** 关系动态/趋势 */
  dynamic: string;
  /** 正文证据 */
  evidence: string;
  /** 出现在哪一章 */
  chapterTitle: string;
  /** 置信度 */
  confidence: number;
}

interface RelationshipAnalysis {
  relations: ExtractedRelation[];
  /** 角色卡已有但正文未体现的关系 */
  staleRelations: Array<{
    from: string;
    to: string;
    relation: string;
    note: string;
  }>;
  summary: string;
}

export async function POST(request: Request) {
  try {
    const { projectId, scope = "all" } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    // ── 取角色列表（用于关系匹配） ──
    const characters = await prisma.characterCard.findMany({
      where: { projectId },
      select: {
        id: true, name: true, aliases: true, role: true,
        relationships: true,
      },
    });

    if (characters.length === 0) {
      return NextResponse.json({
        relations: [],
        staleRelations: [],
        summary: "项目还没有角色卡",
      });
    }

    // ── 取章节内容 ──
    const chapters = await prisma.storyNode.findMany({
      where: {
        projectId,
        type: "chapter",
        content: { not: null },
      },
      select: { id: true, title: true, content: true },
      orderBy: { order: "asc" },
    });

    if (chapters.length === 0) {
      return NextResponse.json({
        relations: [],
        staleRelations: [],
        summary: "项目还没有章节内容",
      });
    }

    // 根据 scope 决定读多少章
    const targetChapters = scope === "latest"
      ? chapters.slice(-2)
      : scope === "first"
        ? chapters.slice(0, 2)
        : chapters.slice(0, 8); // "all" 最多 8 章

    // ── 构建角色名册 ──
    const charRoster = characters.map((c) => {
      const names = [c.name, ...(c.aliases || [])];
      return `${c.name}(${c.role}，别名：${names.slice(1).join("、") || "无"})`;
    }).join("\n");

    // ── 构建正文摘要 ──
    const chapterTexts = targetChapters.map((ch) => {
      return `【${ch.title}】\n${(ch.content || "").slice(0, 2000)}`;
    }).join("\n\n---\n\n");

    // ── LLM 分析 ──
    const analysisPrompt = `你是小说关系分析师。以下是全部角色和章节正文，请提取角色间的实际互动关系。

## 角色名册
${charRoster.slice(0, 2000)}

## 章节正文
${chapterTexts.slice(0, 8000)}

## 任务
1. 从正文中提取角色间的互动关系——只提取正文中实际发生的互动
2. 关系类型分类：师徒/敌对/盟友/暗恋/单恋/夫妻/血亲/仇敌/利用/守护/竞争/陌路
3. 每条关系提供：双方角色名、关系类型、动态趋势（升温/降温/稳定/反复）、正文证据
4. 置信度低于 0.6 的不报告
5. 同一对角色只报告最重要的一条关系

## 输出格式（严格 JSON，无其他文字）
{
  "relations": [
    {
      "from": "陈凡",
      "to": "凌霜",
      "relation": "师徒",
      "dynamic": "从冷漠逐渐转为信任，凌霜开始主动请教",
      "evidence": "凌霜犹豫了一下，还是开口叫了声师父",
      "chapterTitle": "第三章",
      "confidence": 0.9
    }
  ],
  "summary": "分析了X章，发现Y对角色互动关系"
}`;

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: "你是小说关系分析师。输出严格 JSON，不要 markdown 包裹。from/to 必须使用角色名册中的准确名字。" },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0,
      maxTokens: 3000,
    });

    const raw = response.content?.trim() || "";

    // ── 解析结果 ──
    let result: RelationshipAnalysis;
    try {
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      result = {
        relations: Array.isArray(parsed.relations) ? parsed.relations : [],
        staleRelations: Array.isArray(parsed.staleRelations) ? parsed.staleRelations : [],
        summary: parsed.summary || `分析了 ${targetChapters.length} 章`,
      };
    } catch {
      result = { relations: [], staleRelations: [], summary: "分析结果解析失败" };
    }

    // ── 对比角色卡已有关系，标记 "stale"（角色卡写了但正文没体现） ──
    const cardRels = new Set<string>();
    for (const c of characters) {
      for (const r of (c.relationships || []) as any[]) {
        const target = r.targetName || r.targetCharacterId || "";
        if (target) {
          cardRels.add(`${c.name}|${target}|${r.relation}`);
        }
      }
    }

    const extractedPairs = new Set(result.relations.map((r) => `${r.from}|${r.to}|${r.relation}`));

    // 角色卡有但正文分析没发现的 → 可能是过时关系
    for (const cardRel of cardRels) {
      if (!extractedPairs.has(cardRel)) {
        const [from, to, relation] = cardRel.split("|");
        // 检查角色是否在分析中完全没出现
        const fromInAnalysis = result.relations.some((r) => r.from === from || r.to === from);
        const toInAnalysis = result.relations.some((r) => r.from === to || r.to === to);
        if (fromInAnalysis || toInAnalysis) {
          result.staleRelations.push({
            from, to, relation,
            note: "角色卡记录了此关系，但当前分析的章节中未发现体现",
          });
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("关系分析失败:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "分析失败" },
      { status: 500 },
    );
  }
}
