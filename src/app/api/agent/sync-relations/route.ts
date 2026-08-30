/**
 * POST /api/agent/sync-relations
 *
 * Agent 读取章节正文，提取角色间的关系互动，
 * 自动创建/更新世界书中的 character_relationship 条目。
 *
 * 融合替代策略：
 *   - 已有同名关系条目 → 融合内容（新证据追加到已有描述后面）
 *   - 没有 → 自动新建 lorebook 条目（category=character_relationship）
 *   - 正文中出现的新关系动态 → 更新已有条目
 *
 * 设计目标：正文生成时必定读取这些条目，让 LLM 理解角色间的实际关系。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import {  safeJoin, asArray } from "@/lib/utils";

export const maxDuration = 60;

interface ExtractedRelation {
  characterA: string;
  characterB: string;
  relation: string;
  reason: string;
  dynamic: string;
  evidence: string;
  confidence: number;
  action: "create" | "update" | "skip";
}

export async function POST(request: Request) {
  try {
    const { projectId, chapterContent, chapterTitle, autoApply = true } = await request.json();
    if (!projectId || !chapterContent) {
      return NextResponse.json({ error: "缺少 projectId 或 chapterContent" }, { status: 400 });
    }

    // ── 取角色（用于名字匹配） ──
    const characters = await prisma.characterCard.findMany({
      where: { projectId },
      select: { id: true, name: true, aliases: true, role: true },
    });

    if (characters.length === 0) {
      return NextResponse.json({ relations: [], summary: "项目还没有角色卡" });
    }

    // ── 取已有的关系条目 ──
    const existingRels = await prisma.lorebookEntry.findMany({
      where: { projectId, category: "character_relationship", enabled: true },
      select: { id: true, title: true, keys: true, content: true },
    });

    // ── 构建分析 prompt ──
    const charRoster = characters.map((c) => {
      const names = [c.name, ...asArray<string>(c.aliases)];
      return `${c.name}(${c.role}，别名：${names.slice(1).join("、") || "无"})`;
    }).join("\n");

    const existingSummary = existingRels.length > 0
      ? `\n已有关系条目：\n${existingRels.map((r) => `- ${r.title} [keys: ${safeJoin(r.keys, ", ")}] 内容：${(r.content || "").slice(0, 100)}`).join("\n")}`
      : "\n（尚无关系条目）";

    const analysisPrompt = `你是小说关系分析师。从以下章节正文中提取角色间的实际互动关系。

## 角色名册
${charRoster.slice(0, 2500)}

## 章节
标题：${chapterTitle || "未命名"}
内容：
${chapterContent.slice(0, 5000)}
${existingSummary}

## 任务
1. 从正文中提取角色间的互动关系——必须是正文中实际发生过的
2. 对每条关系提取：
   - characterA/characterB：双方角色名（用角色名册中的准确名字）
   - relation：关系类型（师徒/敌对/盟友/暗恋/单恋/夫妻/血亲/仇敌/利用/守护/竞争/陌路/朋友）
   - reason：为什么有这个关系（基于正文内容，不是编造）
   - dynamic：关系在本文中的动态变化
   - evidence：正文原句证据（截取关键片段）
   - confidence：置信度 0-1
   - action：create（新关系）/ update（已有条目的更新）/ skip（无需变更）
3. 如果已有关系条目能覆盖，标记 action=update 并只提供更新内容
4. 如果已有关系条目已完整覆盖且无需更新，标记 action=skip
5. 置信度低于 0.6 的不报告

## 输出格式（严格 JSON，无其他文字）
{
  "relations": [
    {
      "characterA": "陈凡",
      "characterB": "凌霜",
      "relation": "师徒",
      "reason": "陈凡在妖兽口中救下凌霜，见她天赋异禀收为弟子",
      "dynamic": "凌霜从抗拒到逐渐接受这个师父",
      "evidence": "凌霜犹豫了一下，还是开口叫了声师父",
      "confidence": 0.92,
      "action": "create"
    }
  ],
  "summary": "提取到X对关系，新建Y条，更新Z条"
}`;

    // ── LLM 分析 ──
    const config = await getEffectiveConfig();
    const client = createLLMClient(config);

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: "你是小说关系分析师。输出严格 JSON，不要 markdown 包裹。角色名必须使用角色名册中的准确名字。" },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0,
      maxTokens: 2000,
    });

    const raw = response.content?.trim() || "";

    let relations: ExtractedRelation[] = [];
    let summary = "";
    try {
      const jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const parsed = JSON.parse(jsonStr);
      relations = Array.isArray(parsed.relations) ? parsed.relations : [];
      summary = parsed.summary || "";
    } catch {
      return NextResponse.json({
        relations: [],
        summary: "关系分析解析失败",
        created: 0,
        updated: 0,
      });
    }

    // ── 自动应用：创建/更新 lorebook 条目 ──
    let created = 0;
    let updated = 0;

    if (autoApply) {
      for (const rel of relations) {
        if (rel.action === "skip" || rel.confidence < 0.6) continue;

        // 构建 keys：两个角色名 + 关系类型
        const keys = [rel.characterA, rel.characterB, rel.relation];
        const title = `${rel.characterA} ↔ ${rel.characterB}：${rel.relation}`;
        const content = `关系类型：${rel.relation}
关系原因：${rel.reason}
关系动态：${rel.dynamic}
正文证据：${rel.evidence}
来源章节：${chapterTitle || "未知"}`;

        if (rel.action === "create") {
          // 检查是否已有类似条目（keys 中有这两个角色名）
          const existing = existingRels.find((e) => {
            const ek = asArray<string>(e.keys);
            return ek.includes(rel.characterA) && ek.includes(rel.characterB);
          });

          if (existing) {
            // 融合替代：旧内容 + 新内容
            const mergedContent = `${existing.content || ""}\n\n---\n更新于 ${chapterTitle || "最新章"}：\n${content}`;
            await prisma.lorebookEntry.update({
              where: { id: existing.id },
              data: {
                content: mergedContent.slice(0, 5000),
                keys: [...new Set([...asArray<string>(existing.keys), ...keys])],
              },
            });
            updated++;
          } else {
            // 新建
            await prisma.lorebookEntry.create({
              data: {
                projectId,
                title,
                category: "character_relationship",
                keys,
                content: content.slice(0, 5000),
                enabled: true,
                reviewStatus: "pending",
              },
            });
            created++;
          }
        } else if (rel.action === "update") {
          // 找已有条目并更新
          const existing = existingRels.find((e) => {
            const ek = asArray<string>(e.keys);
            return ek.includes(rel.characterA) && ek.includes(rel.characterB);
          });

          if (existing) {
            const mergedContent = `${existing.content || ""}\n\n---\n更新于 ${chapterTitle || "最新章"}：\n${content}`;
            await prisma.lorebookEntry.update({
              where: { id: existing.id },
              data: {
                content: mergedContent.slice(0, 5000),
                keys: [...new Set([...asArray<string>(existing.keys), ...keys])],
              },
            });
            updated++;
          } else {
            // 没有现成条目但标记了 update → 按 create 处理
            await prisma.lorebookEntry.create({
              data: {
                projectId,
                title,
                category: "character_relationship",
                keys,
                content: content.slice(0, 5000),
                enabled: true,
                reviewStatus: "pending",
              },
            });
            created++;
          }
        }
      }
    }

    return NextResponse.json({
      relations,
      summary: summary || `提取 ${relations.length} 对关系`,
      created,
      updated,
    });
  } catch (err) {
    console.error("关系同步失败:", err);
    return jsonError(err);
  }
}
