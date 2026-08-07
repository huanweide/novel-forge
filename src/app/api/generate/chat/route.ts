/**
 * POST /api/generate/chat
 *
 * 底部 AI 对话——纯 JSON 意图解析。
 *
 * 流程：
 *   1. LLM 分析用户消息 → 输出 JSON {action, args} 或 {reply}
 *   2. 有 action → 执行工具 → LLM 将结果格式化为回复
 *   3. 无 action → 直接返回 LLM 回复
 *
 * 不用 function calling 协议——兼容所有模型（DeepSeek/硅基/OpenAI）。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";
import { toolRegistry } from "@/core/agents/tool-registry";
import type { ToolContext } from "@/core/agents/tool-registry";
import { getRecentContext, appendExchange } from "@/lib/chat-sessions";

export const maxDuration = 60;

function buildToolContext(projectId: string): ToolContext {
  return {
    projectId, prisma,
    findCharacters: async (query: string) => {
      return await prisma.characterCard.findMany({
        where: { projectId, OR: [{ name: { contains: query, mode: "insensitive" } }, { aliases: { has: query } }] },
      }) as any;
    },
    findLore: async (keywords: string[]) => {
      return await prisma.lorebookEntry.findMany({
        where: { projectId, enabled: true, OR: keywords.map((kw) => ({
          OR: [{ title: { contains: kw, mode: "insensitive" } }, { content: { contains: kw, mode: "insensitive" } }, { keys: { has: kw } }],
        })) }, take: 10,
      }) as any;
    },
    findForeshadowing: async (description: string) => {
      return await prisma.pendingCommitment.findMany({
        where: { projectId, description: { contains: description, mode: "insensitive" } }, take: 10,
      }) as any;
    },
    detectEntities: async (text: string) => {
      const [chars, lore] = await Promise.all([
        prisma.characterCard.findMany({ where: { projectId } }),
        prisma.lorebookEntry.findMany({ where: { projectId, enabled: true } }),
      ]);
      const results: Array<{ name: string; type: string; confidence: number }> = [];
      const lower = text.toLowerCase();
      for (const c of chars) {
        if (lower.includes(c.name.toLowerCase())) results.push({ name: c.name, type: "character", confidence: 1.0 });
        for (const alias of (c.aliases || [])) {
          if (lower.includes(alias.toLowerCase())) results.push({ name: alias, type: "character", confidence: 0.8 });
        }
      }
      for (const l of lore) {
        if (lower.includes(l.title.toLowerCase())) results.push({ name: l.title, type: l.category || "custom", confidence: 0.9 });
        for (const key of (l.keys || [])) {
          if (lower.includes(key.toLowerCase())) results.push({ name: key, type: l.category || "custom", confidence: 0.7 });
        }
      }
      return results;
    },
  };
}

// ═══════════════════════════════════════════
// 意图解析 Prompt
// ═══════════════════════════════════════════

export async function POST(request: Request) {
  try {
    const { projectId, message, context, mode } = await request.json();
    if (!projectId || !message) {
      return NextResponse.json({ error: "缺少 projectId 或 message" }, { status: 400 });
    }

    // v0.46.58：只读模式（设置 → Agent 模式）——禁止一切写工具
    const readonlyMode = mode === "readonly";
    const WRITE_TOOLS = new Set([
      "character_create", "character_update", "character_delete",
      "lore_create", "lore_update", "lore_delete",
      "outline_create", "outline_update", "outline_delete",
      "foreshadowing_create", "foreshadowing_update",
      "chapter_generate", "relation_sync",
    ]);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { name: true, genre: true, synopsis: true, toneKeywords: true },
    });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    const config = await getEffectiveConfig();
    const client = createLLMClient(config);
    const toolCtx = buildToolContext(projectId);

    // v1.6.3：实时项目快照——让 Agent 每轮都感知当前项目状态（认知实时更新）
    const [charCount, loreEnabled, storylineRows] = await Promise.all([
      prisma.characterCard.count({ where: { projectId } }),
      prisma.lorebookEntry.count({ where: { projectId, enabled: true } }),
      prisma.storyline.findMany({ where: { projectId }, select: { type: true, title: true, status: true } }),
    ]);
    const storylineSummary = storylineRows.length
      ? storylineRows.map((s) => `${s.type === "main" ? "主线" : "支线"}·${s.title}(${s.status})`).join("；")
      : "（暂无）";
    const projectSnapshot = `项目实时概况：角色卡 ${charCount} 张｜已启用世界卡 ${loreEnabled} 条｜故事线 ${storylineRows.length} 条（${storylineSummary}）。`;
    const modeLine = readonlyMode
      ? "权限模式：只读——只能查询/分析，禁止任何写工具（character_*/lore_*/outline_*/foreshadowing_*/chapter_generate/relation_sync 均被拒绝，调用会返回明确错误）。"
      : "权限模式：可操作——可执行查询与写工具（创建/修改/删除角色、世界卡、大纲、伏笔、生成章节、同步关系）。";

    // ── 意图解析 prompt ──
    const systemPrompt = `你是小说写作Agent。思维路径：先判断意图类型 → 选择数据源 → 查询 → 分析 → 回复。

## 第一步：判断意图（选路径）
- **路径A（纯对话）**：打招呼/创作讨论/写作建议/分析文本 → 直接 CHAT
- **路径B（查数据）**：问角色/设定/大纲/伏笔/故事线/规则/风格/项目统计 → 选对应工具
- **路径C（改数据）**：创建/修改/删除 → 选对应写工具
- **路径D（写正文）**：生成章节 → chapter_generate
- **路径E（写后分析）**：分析本章/检查角色卡一致性 → analyze_chapter

## 第二步：选数据源（精准查，不全量扫）
- 问角色信息/比较/排名 → character_list 看全局 → 只 character_get 关键2-3人
- 问世界观/势力/物品/功法 → lore_get(keywords) 精准查
- 问大纲/章节结构 → outline_list
- 问伏笔 → foreshadowing_list
- 问故事线 → storyline_list
- 问规则限制 → rule_list
- 问文风 → style_get
- 问项目概况 → project_info
- 扫描文本实体 → detect_entities
- **正文(chapter_get)仅在用户明确说"查看第X章内容"时调用，否则不碰**

## 输出格式
TOOL:工具名
{参数JSON}
或
CHAT
回复内容

## 工具速查
角色: character_list | character_get(query) | character_create(name,role?,gender?,personality?,background?,currentStatus?,aliases?,abilities?) | character_update(characterId,...) | character_delete(characterId)
世界: lore_list(category?) | lore_get(keywords) | lore_create | lore_update | lore_delete
大纲: outline_list | outline_create | outline_update | outline_delete
伏笔: foreshadowing_list(status?) | foreshadowing_create | foreshadowing_update
故事线: storyline_list(status?) | 规则: rule_list | 风格: style_get
正文: chapter_generate(nodeId,instruction?,targetWords?) | chapter_get(nodeId?)
分析: analyze_chapter(nodeId?,instruction?) — 对比正文vs角色卡，找出缺失信息
关系: analyze_relationships(scope?) — 从正文提取角色互动关系网
同步: relation_sync(nodeId?,autoApply?) — 提取关系并自动写入世界书
其他: detect_entities(text) | project_info

## 铁律
- 每轮只调一个TOOL，调完看结果再决定下一步
- **非必要不读正文**——角色卡和设定才是数据源
- **精准查询**——问势力就查势力分类，别拉全量世界书
- 比较角色 → character_list + 2-3个 character_get，别127个全查
- 缺角色ID时先查列表拿到ID
- TOOL行JSON必须有效，一行

作品：《${project.name}》| ${project.genre.join("、")}

## 当前项目实时状态（每轮刷新）
${projectSnapshot}

## 权限与边界
${modeLine}
- 写工具仅在「可操作」模式有效；只读模式调用写工具会被拒绝并返回提示，不要重试写操作。
- 修改数据前先用对应查询工具确认目标存在，避免重复创建。`;

    // ── 会话记忆：注入最近对话历史 ──
    const recentContext = getRecentContext(projectId, 10);

    const userPrompt = context
      ? `【上下文】${context.slice(0, 500)}\n\n【用户消息】${message}`
      : message;

    const augmentedUserPrompt = recentContext
      ? `${recentContext}\n\n【当前】${userPrompt}`
      : userPrompt;

    // ── 多轮Agent循环：TOOL→执行→喂结果→继续，直到CHAT为止 ──
    const conversationMessages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: augmentedUserPrompt },
    ];

    let finalReply = "";
    const frontendActions: Array<{ type: string; payload: unknown }> = [];
    const toolTrace: Array<{ tool: string; args: Record<string, unknown>; summary: string }> = [];
    const maxTurns = 5;

    for (let turn = 0; turn < maxTurns; turn++) {
      const response = await client.chat({
        model: config.extractorModel || config.writerModel,
        messages: conversationMessages as any,
        temperature: 0,
        maxTokens: 1200,
      });

      const rawContent = response.content.trim();
      const lines = rawContent.split("\n");

      // 找第一行 TOOL: 或 CHAT（可能在废话后面）
      const toolLineIdx = lines.findIndex((l) => l.trim().startsWith("TOOL:"));
      const chatLineIdx = lines.findIndex((l) => l.trim().startsWith("CHAT"));

      // TOOL 模式（优先，因为可能需要多轮）
      if (toolLineIdx >= 0 && (chatLineIdx < 0 || toolLineIdx < chatLineIdx)) {
        const toolLine = lines[toolLineIdx].trim();
        const toolName = toolLine.slice(5).trim();
        const argsLine = lines.slice(toolLineIdx + 1).join(" ").trim();

        let args: Record<string, unknown> = {};
        try {
          let jsonStr = argsLine;
          const jsonMatch = argsLine.match(/\{[\s\S]*\}/);
          if (jsonMatch) jsonStr = jsonMatch[0];
          args = JSON.parse(jsonStr);
        } catch { /* keep empty args */ }

        const result = readonlyMode && WRITE_TOOLS.has(toolName)
          ? { success: false, error: "只读模式下不可修改项目数据（请在设置 → Agent 模式开启「可操作」权限）", data: null as unknown, frontendAction: null }
          : await toolRegistry.execute(toolName, args, toolCtx);
        if (result.frontendAction) frontendActions.push(result.frontendAction);

        // 生成人类可读的思考摘要
        const traceSummary = buildTraceSummary(toolName, args, result);

        toolTrace.push({ tool: toolName, args, summary: traceSummary });

        // 把工具结果喂回对话，让 LLM 决定下一步
        const resultSummary = JSON.stringify({
          tool: toolName,
          success: result.success,
          data: result.data,
          error: result.error,
        }).slice(0, 2000);

        conversationMessages.push(
          { role: "assistant", content: rawContent },
          { role: "user", content: `[工具执行结果]\n${resultSummary}\n\n请继续：如果任务已完成输出CHAT确认，如果还需要操作继续输出TOOL。` },
        );
        continue;
      }

      // CHAT 模式——结束循环
      if (chatLineIdx >= 0) {
        finalReply = lines.slice(chatLineIdx + 1).join("\n").trim() || rawContent.slice(rawContent.indexOf("CHAT") + 4).trim();
        break;
      }

      // 兜底
      finalReply = rawContent.replace(/```[\s\S]*?```/g, "").trim();
      break;
    }

    if (!finalReply) finalReply = "（处理完成）";

    // ── 保存会话记忆 ──
    const usedTools = toolTrace.map((t) => t.tool);
    appendExchange(projectId, message, finalReply, usedTools);

    // ── 创造性润色：保持信息完整，去掉机械感 ──
    if (finalReply.length > 30) {
      try {
        const polishResponse = await client.chat({
          model: config.extractorModel || config.writerModel,
          messages: [
            {
              role: "system",
              content: `你是小说写作伙伴。重写以下回复：保持全部关键信息（角色名、数据、分析结论），但用更口语自然的语气。不要用"已成功""已获取""已列出"——换成"翻了一遍""扫了一眼""来看看"。可以加适度点评。不超250字。`,
            },
            { role: "user", content: `原始：${finalReply.slice(0, 600)}` },
          ],
          temperature: 0.7,
          maxTokens: 350,
        });
        const polished = polishResponse.content?.trim();
        if (polished && polished.length > 10) {
          finalReply = polished;
        }
      } catch { /* 润色失败用原始回复 */ }
    }

    return NextResponse.json({
      reply: finalReply.slice(0, 500),
      toolTrace,
      ...(frontendActions.length > 0 ? { frontendActions } : {}),
    });
  } catch (err) {
    console.error("AI 对话失败:", err);
    return jsonError(err);
  }
}

// ═══════════════════════════════════════════
// 思考过程可视化——生成人类可读的工具调用摘要
// ═══════════════════════════════════════════

function buildTraceSummary(toolName: string, args: Record<string, unknown>, result: any): string {
  const data = result?.data;
  switch (toolName) {
    case "character_list": {
      const total = data?.total || data?.characters?.length || 0;
      return `查角色列表 → ${total} 人`;
    }
    case "character_get": {
      const name = data?.character?.name || args.query || "?";
      return data?.found ? `细查「${name}」→ 能力/背景/弧光` : `查「${name}」→ 未找到`;
    }
    case "character_create": {
      return `创建角色「${data?.created?.name || args.name}」`;
    }
    case "character_update": {
      const fields = data?.updated?.changedFields?.join("、") || "";
      return `修改「${data?.updated?.name || args.characterId}」${fields ? ` → ${fields}` : ""}`;
    }
    case "lore_list": {
      const total = data?.total || data?.entries?.length || 0;
      const cat = args.category ? `（${args.category}）` : "";
      return `查世界设定${cat} → ${total} 条`;
    }
    case "lore_get": {
      const count = data?.entries?.length || 0;
      return `查设定「${args.keywords}」→ ${count} 条匹配`;
    }
    case "lore_create": {
      return `创建设定「${data?.created?.title || args.title}」`;
    }
    case "outline_list": {
      const total = data?.total || 0;
      return `查大纲 → ${total} 节点`;
    }
    case "foreshadowing_list": {
      const total = data?.total || data?.foreshadowings?.length || 0;
      return `查伏笔 → ${total} 条`;
    }
    case "foreshadowing_create": {
      return `埋设伏笔`;
    }
    case "storyline_list": {
      const total = data?.total || 0;
      return `查故事线 → ${total} 条`;
    }
    case "rule_list": {
      const total = data?.total || 0;
      return `查写作规则 → ${total} 条`;
    }
    case "style_get": {
      return data?.found !== false ? "查文风设置" : "查文风 → 未设置";
    }
    case "chapter_get": {
      return `查正文「${data?.title || args.nodeId}」`;
    }
    case "chapter_generate": {
      return `打开写作面板 → ${data?.title || args.nodeId}`;
    }
    case "analyze_chapter": {
      return `分析章节 → ${data?.title || args.nodeId}（${data?.wordCount || 0}字）`;
    }
    case "analyze_relationships": {
      return `分析角色关系 → ${data?.chapterCount || 0} 章正文`;
    }
    case "relation_sync": {
      return `同步角色关系 → ${data?.title || "最新章"} → 世界书`;
    }
    case "project_info": {
      return `查项目概览 → 《${data?.name}》`;
    }
    case "detect_entities": {
      const count = data?.entities?.length || 0;
      return `扫描实体 → ${count} 个`;
    }
    default:
      return `${toolName}`;
  }
}
