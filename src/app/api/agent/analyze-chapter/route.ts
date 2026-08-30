/**
 * POST /api/agent/analyze-chapter
 *
 * 写后分析——扫描刚写完的章节，对比角色卡数据，
 * 揪出正文里出现了但角色卡上没记录的信息：
 *   新能力、情绪变化、关系互动、新外号、状态变更
 *
 * 用 LLM 做语义匹配，不用规则硬匹配。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { safeJoin } from "@/lib/utils";

export const maxDuration = 60;

interface AnalysisDifference {
  characterName: string;
  characterId: string;
  /** 缺失字段：abilities | personality | relationships | aliases | currentStatus | appearance */
  field: string;
  /** 当前角色卡上的值（JSON 或 文本） */
  current: string;
  /** 建议补充的内容 */
  suggested: string;
  /** 正文中的证据（原句） */
  evidence: string;
  /** 置信度 0-1 */
  confidence: number;
}

interface AnalysisResult {
  differences: AnalysisDifference[];
  summary: string;
  /** 分析覆盖的角色数 */
  charactersAnalyzed: number;
}

export async function POST(request: Request) {
  try {
    const { projectId, chapterContent, nodeTitle } = await request.json();
    if (!projectId || !chapterContent) {
      return NextResponse.json(
        { error: "缺少 projectId 或 chapterContent" },
        { status: 400 },
      );
    }

    // 取所有角色卡（只取分析需要的字段）
    const characters = await prisma.characterCard.findMany({
      where: { projectId },
      select: {
        id: true,
        name: true,
        aliases: true,
        role: true,
        abilities: true,
        personality: true,
        relationships: true,
        currentStatus: true,
        appearance: true,
        background: true,
        hiddenMotives: true,
        arcProgress: true,
      },
    });

    if (characters.length === 0) {
      return NextResponse.json({
        differences: [],
        summary: "项目还没有角色卡，先创建角色再来分析吧。",
        charactersAnalyzed: 0,
      });
    }

    // 只分析在正文中出现的角色（用名字/别名做快速初筛，减少 LLM 负担）
    const chapterLower = chapterContent.toLowerCase();
    const relevantChars = characters.filter((c) => {
      const names = [c.name, ...(c.aliases || [])];
      return names.some((n) => chapterLower.includes(n.toLowerCase()));
    });

    if (relevantChars.length === 0) {
      return NextResponse.json({
        differences: [],
        summary: `本章未检测到已有角色出场。${characters.length} 张角色卡待命中。`,
        charactersAnalyzed: 0,
      });
    }

    // 如果出场角色超过 15 个，只取前 15 个（按出场次数排序）
    const ranked = relevantChars
      .map((c) => {
        const allNames = [c.name, ...(c.aliases || [])];
        let mentions = 0;
        for (const n of allNames) {
          const regex = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
          const matches = chapterLower.match(regex);
          mentions += matches ? matches.length : 0;
        }
        return { char: c, mentions };
      })
      .sort((a, b) => b.mentions - a.mentions)
      .slice(0, 15);

    const targetChars = ranked.map((r) => r.char);

    // ── 构建分析 prompt ──
    const charsSummary = targetChars.map((c) => {
      const parts = [
        `【${c.name}】(${c.role})`,
        `别名：${safeJoin(c.aliases, "、") || "无"}`,
        `能力：${safeJoin(c.abilities, "、") || "未记录"}`,
        `性格：${JSON.stringify(c.personality || {})}`,
        `关系：${JSON.stringify(c.relationships || [])}`,
        `状态：${c.currentStatus || "alive"}`,
        `外貌：${JSON.stringify(c.appearance || {})}`,
        `弧光：${c.arcProgress || "未记录"}`,
      ];
      return parts.join("\n");
    }).join("\n\n");

    const analysisPrompt = `你是小说编辑助手。你的任务是：**对比本章正文和角色卡数据，找出角色卡需要更新的地方**。

## 要检查的维度
1. **新能力**：正文中角色使用了角色卡 abilities 里没记录的能力/技能/功法
2. **情绪/性格变化**：角色表现出角色卡 personality 里没记录的性格特征
3. **新关系**：角色与其他角色有互动但 relationships 里没记录
4. **新外号/称谓**：正文中出现了 aliases 里没记录的新称呼
5. **状态变化**：角色受伤/突破/失踪等状态变更
6. **外貌描述**：正文中出现了 appearance 里没记录的外貌特征

## 规则
- 只报告**角色卡上明确缺失**的信息，不报告"写得好/写得差"
- 证据必须是正文原句（截取相关片段）
- 置信度低于 0.6 的不要报告
- 如果角色卡已经记录了相关信息，不要重复报告
- 不要编造——找不到差异就说找不到

## 输出格式（严格JSON，无其他文字）
{
  "differences": [
    {
      "characterName": "角色名",
      "field": "abilities",
      "current": "角色卡现有值（简写）",
      "suggested": "建议补充的内容",
      "evidence": "正文原句片段",
      "confidence": 0.85
    }
  ],
  "summary": "一句话总结分析结果"
}

章节标题：${nodeTitle || "未命名"}
章节内容：
${chapterContent.slice(0, 4000)}

角色卡数据：
${charsSummary.slice(0, 3000)}`;

    // ── 调 LLM 分析 ──
    const config = await getEffectiveConfig();
    const client = createLLMClient(config);

    const response = await client.chat({
      model: config.extractorModel || config.writerModel,
      messages: [
        { role: "system", content: "你是小说编辑助手。输出严格 JSON，不要 markdown 包裹。" },
        { role: "user", content: analysisPrompt },
      ],
      temperature: 0,
      maxTokens: 2000,
    });

    const raw = response.content?.trim() || "";

    // 解析 JSON（v0.46.55 修复：模型偶发返回 markdown 包裹/尾逗号/截断 JSON，用多级鲁棒解析）
    let result: AnalysisResult;
    try {
      let jsonStr = raw.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
      const a = jsonStr.indexOf("{"), b = jsonStr.lastIndexOf("}");
      if (a >= 0 && b > a) jsonStr = jsonStr.slice(a, b + 1);
      const tryParse = (s: string): Record<string, unknown> | null => {
        try { return JSON.parse(s) as Record<string, unknown>; } catch { /* 下一级 */ }
        try {
          return JSON.parse(s
            .replace(/,\s*([}\]])/g, "$1")
            .replace(/\u2028|\u2029/g, " ")
            .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")) as Record<string, unknown>;
        } catch { return null; }
      };
      const parsed = tryParse(jsonStr);
      if (!parsed) throw new Error("JSON 解析失败");
      result = {
        differences: Array.isArray(parsed.differences) ? parsed.differences : [],
        summary: typeof parsed.summary === "string" ? parsed.summary : "分析完成",
        charactersAnalyzed: targetChars.length,
      };
    } catch {
      // JSON 解析失败——尝试从文本中提取
      result = {
        differences: [],
        summary: "分析结果解析失败，请重试",
        charactersAnalyzed: targetChars.length,
      };
    }

    // 补充 characterId（根据角色名匹配）
    const nameToId = new Map(targetChars.map((c) => [c.name, c.id]));
    for (const d of result.differences) {
      d.characterId = nameToId.get(d.characterName) || "";
      // 确保必填字段存在
      d.current = d.current || "未记录";
      d.evidence = d.evidence || "";
      d.confidence = d.confidence || 0.7;
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("章节分析失败:", err);
    return jsonError(err);
  }
}
