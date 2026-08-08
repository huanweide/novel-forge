/**
 * POST /api/generate/conflict
 *
 * D4 冲突推演：给定当前局势（角色 / 世界观硬规则 / 近期章节），
 * 由 AI 产出 ≥3 个冲突 / 转折发展选项，每个标注「仅供参考」。
 *
 * 设计取舍：
 *  - 不写库、不改数据——纯建议，最终决定权在作者（与路线图 P3-5 一致）。
 *  - 结构化 JSON 输出（标题 / 触发 / 张力 / 走向 / 风险），前端卡片化呈现。
 *  - 上下文只取「世界观硬规则 + 主角卡 + 近 2 章」，控制 token，避免拉全量正文。
 */
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getEffectiveConfig, createLLMClient, buildProjectOverrides } from "@/core/llm/client";

export const maxDuration = 60;

function jsonArrayFrom(raw: string): any[] | null {
  let s = raw.trim();
  // 去掉可能的 ```json 围栏
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  // 截取第一个 [ 到最后一个 ]
  const start = s.indexOf("[");
  const end = s.lastIndexOf("]");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { projectId, situation } = await request.json();
    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        characters: {
          select: { id: true, name: true, aliases: true, role: true, personality: true, background: true, currentStatus: true },
          take: 12,
        },
        lorebookEntries: {
          where: { enabled: true },
          select: { title: true, category: true, content: true, keys: true },
          take: 10,
        },
        storyNodes: {
          where: { type: { in: ["chapter", "section"] } },
          orderBy: { updatedAt: "desc" },
          take: 2,
          select: { title: true, outline: true, content: true },
        },
      },
    });
    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    // ── 组装局势上下文 ──
    const ctxParts: string[] = [];
    ctxParts.push(`【作品】《${project.name}》｜题材：${(project.genre || []).join("、") || "未设定"}`);
    if (project.synopsis) ctxParts.push(`【梗概】${project.synopsis.slice(0, 300)}`);

    const chars = (project.characters || []).map((c) => {
      const p = c.personality ? JSON.stringify(c.personality) : "";
      return `- ${c.name}（${c.role || "角色"}｜状态：${c.currentStatus || "未知"}）：性格 ${p}${c.background ? `；背景：${c.background.slice(0, 120)}` : ""}`;
    });
    if (chars.length) ctxParts.push(`【主要角色】\n${chars.join("\n")}`);

    const lore = (project.lorebookEntries || []).map((l) => `- 《${l.title}》[${l.category || "custom"}]：${(l.content || "").slice(0, 280)}`);
    if (lore.length) ctxParts.push(`【世界观 / 硬规则 / 剧情倾向】\n${lore.join("\n")}`);

    const recent = (project.storyNodes || []).slice().reverse().map((n) => {
      const excerpt = (n.content || "").replace(/\s/g, "").slice(0, 200);
      return `- 《${n.title}》${n.outline ? `（大纲：${n.outline.slice(0, 80)}）` : ""}${excerpt ? `\n  近期正文片段：${excerpt}` : ""}`;
    });
    if (recent.length) ctxParts.push(`【近 2 章】\n${recent.join("\n")}`);

    if (situation && String(situation).trim()) {
      ctxParts.push(`【作者当前想推演的局势 / 方向】\n${String(situation).trim().slice(0, 500)}`);
    }

    const contextText = ctxParts.join("\n\n");

    // 角色名 → 真实角色 id 映射（含别名 lowercased），用于把 AI 输出的角色名
    // 匹配成可跳转的角色卡，让冲突推演与角色卡两个功能互相点名。
    const charIdMap = new Map<string, { id: string; name: string }>();
    for (const c of project.characters || []) {
      const keys = [c.name, ...((Array.isArray(c.aliases) ? c.aliases : []) as string[])]
        .map((n) => String(n).trim().toLowerCase())
        .filter(Boolean);
      const display = { id: c.id, name: c.name };
      for (const k of keys) charIdMap.set(k, display);
    }

    const systemPrompt = `你是资深小说情节策划顾问。给定一部小说的世界观硬规则、主要角色与近期进展，
你需要为作者推演出数个「冲突 / 转折」发展方向，帮助打破平淡、制造张力。

# 输出要求
- 必须输出 **不少于 3 个** 彼此差异明显的发展方向（角度、冲突来源、代价各不同）。
- 每个方向用一条 JSON 对象描述，字段：
  - title: 简短标题（≤14字）
  - trigger: 这个冲突/转折如何被触发（局势、事件或人物动作）
  - tension: 它为何制造张力（撕裂了什么关系/打破了什么平衡/带来什么两难）
  - outcome: 可能走向的 1-2 种结果
  - caution: 风险提示或需埋设的伏笔
  - characters: 这条冲突 / 转折主要涉及的角色名数组（必须从【主要角色】清单里挑选真实存在的名字；若不涉及具体角色则给空数组 []）
- 所有方向都要**尊重世界观硬规则**（不得出现世界观明确禁止的设定）。
- 只输出 JSON 数组，不要任何解释、前言、后记、markdown 围栏。

示例格式：
[
  {"title":"xxx","trigger":"...","tension":"...","outcome":"...","caution":"...","characters":["角色名"]},
  {"title":"xxx","trigger":"...","tension":"...","outcome":"...","caution":"...","characters":[]}
]`;

    const config = await getEffectiveConfig(buildProjectOverrides(project.llmConfig as unknown as Record<string, unknown> | null));
    const client = createLLMClient(config);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: `以下是小说当前局势，请推演发展选项：\n\n${contextText}` },
    ];

    // 模型偶发返回空内容（content_filter / 空生成），重试一次提升稳定性
    let content = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await client.chat({
        model: config.architectModel || config.writerModel,
        messages,
        temperature: 0.9,
        maxTokens: 1600,
      });
      content = r.content || "";
      if (content.trim()) break;
    }

    let options = jsonArrayFrom(content);
    if (!options || options.length === 0) {
      // 兜底：把原文按条目拆分
      const lines = content.split("\n").map((l) => l.trim()).filter(Boolean);
      options = lines.slice(0, 6).map((l, i) => ({ title: `方向 ${i + 1}`, trigger: l, tension: "", outcome: "", caution: "" }));
    }

    // 规整字段，确保前端安全渲染
    const safe = options.slice(0, 8).map((o: any, i: number) => {
      // 把 AI 输出的角色名匹配成真实角色卡（精确 name / 别名，大小写不敏感）
      const rawChars: string[] = Array.isArray(o.characters)
        ? o.characters.map((x: any) => String(x).trim()).filter(Boolean)
        : [];
      const matchedChars = rawChars
        .map((n) => charIdMap.get(n.toLowerCase()))
        .filter((v): v is { id: string; name: string } => !!v)
        .filter((v, idx, arr) => arr.findIndex((a) => a.id === v.id) === idx);
      return {
        title: String(o.title || `方向 ${i + 1}`).slice(0, 30),
        trigger: String(o.trigger || ""),
        tension: String(o.tension || ""),
        outcome: String(o.outcome || ""),
        caution: String(o.caution || ""),
        characters: matchedChars,
      };
    });

    return NextResponse.json({ options: safe, note: "以下由 AI 生成，仅供参考，最终情节决定权在作者。" });
  } catch (err) {
    console.error("冲突推演失败:", err);
    return jsonError(err);
  }
}
