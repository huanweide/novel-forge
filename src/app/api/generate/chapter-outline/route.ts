/**
 * POST /api/generate/chapter-outline
 *
 * v2: 上下文增强 + AI 自主选角
 *
 * 流程：
 * 1. 读取前 5 章大纲 + 上一章结尾正文 → 上下文
 * 2. 读取全部角色卡摘要 + 作者指令（最高优先级）
 * 3. AI 根据章纲目标 + 前文 + 作者指令 → 自主决定本章出场角色
 * 4. 用选定角色 + 完整上下文 → 生成详细章纲
 * 5. 返回章纲 + AI 选角列表
 *
 * 核心理念：不让用户手动勾选角色，AI 根据剧情逻辑决定谁应该出现。
 * 作者指令 > 章纲目标 > 前文惯性 > 角色关系。
 */

export const maxDuration = 120;
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";


import {
  loadOutlineData, extractPrevContext, extractNextContext,
  buildCharacterList, prepareOutlineDirective, formatSummaries,
} from "@/core/pipeline/outline-context";
import { callSiliconFlow } from "@/lib/llm";

export async function POST(request: Request) {
  try {
    const { projectId, nodeId, prompt: customPrompt, authorNote: explicitAuthorNote } = await request.json();

    if (!projectId || !nodeId) {
      return NextResponse.json({ error: "缺少 projectId 或 nodeId" }, { status: 400 });
    }

    // ═══════════════════════════════════════════════
    // Step 1: 读数据——使用共享模块
    // ═══════════════════════════════════════════════

    const { project, node, allNodes, characters, summaries } = await loadOutlineData(projectId, nodeId, 3);
    if (!project || !node) {
      return NextResponse.json({ error: "项目或章节不存在" }, { status: 404 });
    }

    const prevContext = extractPrevContext(allNodes, nodeId);
    const nextContext = extractNextContext(allNodes, nodeId);

    const authorDirectiveRaw = await prepareOutlineDirective(projectId, explicitAuthorNote || project.authorNote);
    const authorDirective = authorDirectiveRaw
      ? `\n## ⚠️ 作者指令——最高优先级，必须逐条遵守\n${authorDirectiveRaw}\n`
      : "";

    const characterList = buildCharacterList(characters, false);
    const recentSummary = formatSummaries(summaries);
    const nodeIndex = allNodes.findIndex((n: any) => n.id === nodeId);
    const effectiveAuthorNote = explicitAuthorNote?.trim() || (project as any).authorNote?.trim() || "";

    // ═══════════════════════════════════════════════
    // Step 2: AI 选角——根据章纲目标 + 前文 + 作者指令 → 决定谁出场
    // ═══════════════════════════════════════════════
    const selectionSystem = `你是小说章纲专家。你的任务是：阅读章纲目标、作者指令和前文上下文，从角色列表中选出**本章应该出现的角色**。

【选角原则——按优先级排序】
1. 作者指令明确提到的人物 → 必须出场（最高优先级）
2. 前文末段正在发展的人物线 → 自然延续出场
3. 章纲目标需要的人物 → 剧情需要谁就选谁
4. 与选中人物有紧密关系的人物 → 可能需要出场（如师徒、恋人、当前敌对）
5. 不强行塞人——如果一个人物和本章剧情无关，即使他是主角的前女友/前对手，也不要放进来

【输出格式——纯JSON】
{
  "selected": ["角色名1", "角色名2"],
  "reasoning": "一句话解释选角逻辑（如：本章主线是XX，所以选了A、B、C）"
}`;

    const authorNoteInjection = effectiveAuthorNote
      ? `\n\n## ⚠️ 作者指令（最高优先级，必须逐条遵守）\n${effectiveAuthorNote}\n`
      : "";

    const hasCustomPrompt = customPrompt?.trim();

    const selectionPrompt = `【章纲目标——本章要写什么】
${hasCustomPrompt ? `用户提示词：${customPrompt}\n` : ""}本章标题：${node.title}（第${nodeIndex + 1}章）
${node.outline ? `现有大纲（如有）：${node.outline.slice(0, 300)}\n` : ""}（大纲为空则根据前后文 + 作者指令推断本章方向）
${authorNoteInjection}
【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【前文上下文——你读了才知道谁在场上】
${prevContext || "（本章为开头，无前文）"}
${recentSummary ? `\n最近摘要：${recentSummary}` : ""}

【所有角色卡——选出本章应该出场的人】
${characterList}

请从以上角色列表中选出本章应该出场的角色。不要塞无关人物。`;

    let selectedNames: string[] = [];
    let selectionReasoning = "";

    try {
      const selectionRaw = await callSiliconFlow({ system: selectionSystem, prompt: selectionPrompt, maxTokens: 2048, temperature: 0.3 });
      const parsed = JSON.parse(
        (() => {
          let s = selectionRaw.trim();
          const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (md) s = md[1].trim();
          const a = s.indexOf("{"), b = s.lastIndexOf("}");
          if (a >= 0 && b > a) s = s.slice(a, b + 1);
          return s;
        })()
      ) as Record<string, unknown>;
      if (Array.isArray(parsed.selected)) {
        selectedNames = parsed.selected as string[];
        selectionReasoning = (parsed.reasoning as string) || "";
      }
    } catch {
      // AI 选角失败 → 回退：至少保主角
      const protag = characters.find((c: any) => c.role === "protagonist");
      if (protag) selectedNames = [protag.name];
    }

    // 确保主角一定在（除非明确排除了）
    const protagonist = characters.find((c: any) => c.role === "protagonist");
    if (protagonist && !selectedNames.some(n => n.toLowerCase() === protagonist.name.toLowerCase())) {
      selectedNames.unshift(protagonist.name);
      selectionReasoning = "（自动补入主角）" + selectionReasoning;
    }

    // 名字匹配角色详情
    const selectedChars = characters.filter((c: any) =>
      selectedNames.some(n => n.toLowerCase() === c.name.toLowerCase() ||
        (c.aliases || []).some((a: string) => a.toLowerCase() === n.toLowerCase()))
    );

    if (selectedChars.length === 0 && characters.length > 0) {
      selectedChars.push(characters[0]); // 兜底：至少有一个角色
    }

    // ═══════════════════════════════════════════════
    // Step 3: 生成章纲——只用选定角色 + 完整上下文
    // ═══════════════════════════════════════════════

    // 选定角色的详细档案
    const charBriefs = selectedChars.map((c: any) => {
      const p = typeof c.personality === "object" && !Array.isArray(c.personality) ? c.personality as Record<string, unknown> : {};
      const parts: string[] = [];
      parts.push(`【${c.name}】${c.aliases?.length ? `（${c.aliases.join("、")}）` : ""}`);
      parts.push(`  定位：${c.role || "supporting"} | 状态：${c.currentStatus || "alive"}`);
      if (p.dominant) parts.push(`  主导性格：${p.dominant}`);
      if (p.drive) parts.push(`  核心驱动：${p.drive}`);
      if (p.contradiction) parts.push(`  内在矛盾：${p.contradiction}`);
      if (Array.isArray(p.habits) && p.habits.length) parts.push(`  习惯：${(p.habits as string[]).join("、")}`);
      if (p.socialMask) parts.push(`  社交面具：${p.socialMask}`);
      if (c.background && c.background.length > 10) parts.push(`  背景：${String(c.background).slice(0, 600)}`);
      if (Array.isArray(c.abilities) && c.abilities.length) parts.push(`  能力：${(c.abilities as string[]).join("；")}`);
      if (Array.isArray(c.aliases) && c.aliases.length) parts.push(`  别名：${(c.aliases as string[]).join("、")}`);
      const rels = c.relationships as any[];
      if (Array.isArray(rels) && rels.length) {
        const relText = rels.map((r: any) => `${r.targetName || "?"}(${r.relation || "?"}${r.dynamic ? `·${r.dynamic}` : ""})`).join("、");
        if (relText) parts.push(`  关系：${relText}`);
      }
      const ds = c.dialogueStyle as Record<string, unknown> | undefined;
      if (ds?.description) {
        parts.push(`  说话风格：${ds.description}`);
        if (Array.isArray(ds.examples) && ds.examples.length) parts.push(`  台词示例：${(ds.examples as string[]).join(" / ")}`);
      }
      if (c.hiddenMotives && Array.isArray(c.hiddenMotives) && c.hiddenMotives.length) parts.push(`  隐藏动机：${(c.hiddenMotives as string[]).join("；")}`);
      return parts.join("\n");
    }).join("\n\n");

    const outlineSystem = `你是小说章纲专家。你必须严格基于提供的【角色档案】【作者指令】和【前文上下文】来生成章纲。

【铁律——违反任一即不合格】
1. 出场角色只能从下方"选定角色"列表中选——除此之外的角色本章不允许出现
2. 角色行为必须与其性格五维一致（主导性格/核心驱动/内在矛盾/习惯）
3. 角色互动必须与其关系设定一致——关系好的人不会突然翻脸，除非背景中有冲突伏笔
4. 绝不让角色做出违背其"核心驱动"的行为
5. 文风必须匹配给定的风格描述、视角、句长
6. 作者指令 > 章纲目标 > 前文惯性 > 角色关系——优先级链

【章纲结构——每章 300-600 字】
1. 本章核心冲突（一句话——谁和谁因为什么对立）
2. 本章情感基调（从角色性格推导本章的情绪氛围）
3. 场景序列（3-5个场景，每个场景标注：地点 / 出场角色 / 发生什么 / 角色的情感变化）
4. 关键对话点子（至少一句体现角色性格的对话方向）
5. 与前章的衔接钩子 + 为后章埋的伏笔

输出纯文本。不用编号——但用自然段落把上面的结构讲清楚。`;

    const outlinePrompt = `${authorDirective}
【章纲目标——本章要写什么】
${hasCustomPrompt ? `用户提示词：${customPrompt}\n` : ""}本章标题：${node.title}（第${nodeIndex + 1}章）
${node.outline ? `现有大纲（如有）：${node.outline.slice(0, 300)}\n` : ""}
${authorDirective}
【作品信息】
名称：${project.name} · 类型：${project.genre.join("、")}
总纲：${project.synopsis}

【前文上下文——你读了才知道从哪里接】
${prevContext || "（本章为开头）"}

【后文——知道后面会发生什么才能埋好伏笔】
${nextContext || "（无后续章节规划）"}

【最近摘要】
${recentSummary || "无"}

【AI 选定出场角色——本章只允许这些人出现】
${charBriefs}

【铁律再强调】
- 作者指令（如有）必须逐条遵守，不得遗漏
- 不允许让未选定的角色出场
- 不允许让角色做出违背其性格和关系的行为
- 不允许凭空创造新角色

请为「${node.title}」生成章纲。`;

    let outlineText = "";
    try {
      outlineText = await callSiliconFlow({ system: outlineSystem, prompt: outlinePrompt, maxTokens: 4096, temperature: 0.3 });
    } catch (err) {
      return NextResponse.json(
        { error: `章纲生成失败：${err instanceof Error ? err.message : String(err)}` },
        { status: 502 }
      );
    }

    if (!outlineText || outlineText.length < 10) {
      return NextResponse.json({ error: "模型返回空内容，请重试" }, { status: 502 });
    }

    // 写入数据库
    await prisma.storyNode.update({
      where: { id: nodeId },
      data: { outline: outlineText, status: node.status === "outline_only" ? "outline_only" : node.status },
    });

    return NextResponse.json({
      outline: outlineText,
      nodeId,
      title: node.title,
      modelUsed: "v4-flash",
      // 新增：AI 选角信息
      selectedCharacters: selectedChars.map((c: any) => ({
        id: c.id,
        name: c.name,
        role: c.role,
      })),
      selectionReason: selectionReasoning,
      totalCharacters: characters.length,
    });
  } catch (err) {
    return jsonError(err);
  }
}
