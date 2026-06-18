/**
 * POST /api/game/outline/generate
 * Agent 按 P0 标准格式生成章纲
 *
 * 输出格式：C|→R|→L|→G|→P|→CF|→M|→K|→EL|→T|
 * 三层结构：章节元信息 / 叙事段落 / 技术规格
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getEffectiveConfig, createLLMClient } from "@/core/llm/client";

const OUTLINE_SYSTEM_PROMPT = `你是一位资深小说架构师，专精于将故事创意转化为可执行的"工程蓝图"。你的输出将被AI写作引擎直接解析和执行。

## 输出格式（严格遵循）

### 第一部分：章节元信息
C| 章节号 | 章节标题 | 开头承接（时空坐标）| 主视角人物
L0| ✅ 平台合规 | ✅ 数据有效性 | ✅ 剧情连贯
L1| ✅ 信息不对称 | ✅ 延迟揭示 | ✅ 章尾钩子(类型)
L2| ✅ 否定对比式比喻禁令 | ✅ 内省配额达标(<20%) | ✅ 段尾硬停 | ✅ 行为说话

### 第二部分：叙事段落
- 【章首衔接】：[与C行第三列完全一致的时空描写]
每段由以下行组成（按需使用）：
R| [角色名][身份标签] [动作] [对象/地点] [结果/状态]
⟨✍ 写作指令⟩（可选，给AI的导演批注）
L| [地点名] [场景描述/氛围]
G| [金手指名称] [触发条件/表现]
P| [事件描述]
K| [台词内容] | [说话人] | [情境]
- 【章尾悬念】：[本章最后一行，制造翻页欲]

### 第三部分：技术规格
CF| [伏笔名] | [操作类型:埋设/呼应/暗示/回收] | [操作细节]
M| [情绪类型] | [强度1-10] | [实现手段]
K| [台词内容] | [说话人] | [情境]（标志性金句）
EL| [当前幕] | [本章情绪定位] | [对整体曲线的贡献]
T| [下一章标题] | [剧情目标/需承接状态]

## 创作规则
1. 所有角色/地点/境界/势力名必须来自给定的"白名单"，严禁自创
2. 每章至少3个R|行，1-2个L|行，G|行按需
3. 【章首衔接】和【章尾悬念】是强制项，质量决定成败
4. ⟨✍ 写作指令⟩不构成故事内容，只指导AI怎么写
5. CF| 伏笔操作要明确写出"埋设了什么"和"如何体现"
6. M| 情绪强度用具体描写手段体现，不要旁白说"他很压抑"`;

export async function POST(req: Request) {
  try {
    const { projectId, nodeId, direction, existingOutline } = await req.json();
    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    // 1. 加载项目上下文
    const [project, node, characters, loreEntries, allNodes, summaries] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.storyNode.findUnique({ where: { id: nodeId } }),
      prisma.characterCard.findMany({ where: { projectId }, take: 30 }),
      prisma.lorebookEntry.findMany({ where: { projectId, enabled: true }, take: 20 }),
      prisma.storyNode.findMany({
        where: { projectId },
        orderBy: { order: "asc" },
        select: { id: true, title: true, order: true, type: true, status: true, outline: true },
      }),
      prisma.chapterSummary.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ]);

    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    // 2. 组装上下文
    const chapterIndex = allNodes.filter(n => n.type === "chapter" || n.type === "section")
      .findIndex(n => n.id === nodeId);
    const chapterNumber = chapterIndex >= 0 ? chapterIndex + 1 : 1;

    const prevNode = allNodes
      .filter(n => n.type === "chapter" || n.type === "section")
      .slice(0, chapterIndex)
      .pop();

    const nextNode = allNodes
      .filter(n => n.type === "chapter" || n.type === "section")
      .slice(chapterIndex + 1)[0];

    const characterWhitelist = characters.map(c =>
      `- ${c.name}（${c.role}）${c.currentStatus !== "alive" ? `[状态:${c.currentStatus}]` : ""}：${c.background?.slice(0, 80) || ""}`
    ).join("\n");

    const locationList = loreEntries
      .filter(l => l.category === "geography")
      .map(l => `- ${l.title}`)
      .join("\n");

    const factionList = loreEntries
      .filter(l => l.category === "faction")
      .map(l => `- ${l.title}`)
      .join("\n");

    const foreshadowList = await prisma.pendingCommitment.findMany({
      where: { projectId, status: { not: "voided" } },
      take: 15,
    });

    const foreshadowContext = foreshadowList.map(f =>
      `- ${f.description} [状态:${f.status}] [来源:第${allNodes.findIndex(n => n.id === f.sourceNodeId) + 1 || "?"}章]`
    ).join("\n");

    // 3. 组装用户提示词
    const userPromptParts = [
      `## 任务：为《${project.name}》生成第${chapterNumber}章章纲`,
      `章节标题：${node.title || "未命名"}`,
      "",
      "## 白名单——只能使用以下角色/地点/势力",
      "### 角色白名单",
      characterWhitelist || "（无角色数据）",
      "### 地点白名单",
      locationList || "（无地点数据）",
      "### 势力白名单",
      factionList || "（无势力数据）",
      "",
      "## 伏笔数据库（必须在本章中处理）",
      foreshadowContext || "（暂无活跃伏笔）",
      "",
      "## 前后章约束",
      prevNode ? `前章：${prevNode.title} — ${(prevNode.outline || "").slice(0, 200)}` : "（本章为首章）",
      nextNode ? `后章：${nextNode.title} — ${(nextNode.outline || "").slice(0, 200)}` : "（本章为末章）",
      "",
      "## 最近章节摘要（保持连贯）",
      summaries.map(s => `- 第${s.chapterTitle}章：${s.summary.slice(0, 150)}`).join("\n") || "（无）",
    ];

    if (existingOutline) {
      userPromptParts.push(`\n## 已有章纲（在此基础上修改）\n${existingOutline}`);
    }

    if (direction) {
      userPromptParts.push(`\n## 创作方向\n${direction}`);
    }

    userPromptParts.push(`\n请严格按格式输出第${chapterNumber}章《${node.title}》的完整章纲。`);

    // 4. 调用LLM
    const llmConfig = await getEffectiveConfig();
    const client = createLLMClient(llmConfig);

    const stream = client.chatStream({
      model: llmConfig.writerModel,
      messages: [
        { role: "system" as const, content: OUTLINE_SYSTEM_PROMPT },
        { role: "user" as const, content: userPromptParts.join("\n") },
      ],
      temperature: 0.8,
      maxTokens: 2000,
    });

    let fullResponse = "";
    for await (const chunk of stream) {
      if (chunk.content) {
        fullResponse += chunk.content;
      }
    }

    return NextResponse.json({
      outline: fullResponse,
      chapterNumber,
      chapterTitle: node.title,
    });
  } catch (err: any) {
    console.error("[game/outline/generate] 错误:", err);
    return NextResponse.json({ error: err.message || "内部错误" }, { status: 500 });
  }
}
