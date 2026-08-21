/**
 * POST /api/storylines/generate
 *
 * AI 自动生成故事线——基于项目总纲、角色卡、世界书，生成主线 + 支线。
 *
 * v1.8.4 双模式：
 *  - 默认（无 commit）：调 LLM 生成，返回 suggestions（不落库），供前端中间编辑态。
 *  - commit=true：
 *      · 请求体带 suggestions（前端编辑后回传）→ 直接落库，不再调 LLM；
 *      · 否则（如 mode=newMain 缝合怪）→ 调 LLM 生成并落库。
 */

export const maxDuration = 120;
import { jsonError } from "@/lib/api-error";

import { prisma } from "@/lib/prisma";
import { getApprovedCharacters, getApprovedLore } from "@/lib/approved-cards";
import { NextResponse } from "next/server";

import { completeText } from "@/core/llm/client";
import { getCompletedMainIds, isRehangTargetActiveMain } from "@/core/pipeline/outline-context";
import { storylineStyleDesc } from "@/core/storyline/generate";
import { deriveMainElements } from "@/core/storyline/complete";

export async function runStorylineGeneration(bodyJson: any) {
  try {
    const { projectId, mode, commit, suggestions } = bodyJson;
    if (!projectId) return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });

    const [project, characters, loreEntries, existingStorylines] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      getApprovedCharacters(prisma, projectId),
      getApprovedLore(prisma, projectId),
      prisma.storyline.findMany({ where: { projectId } }),
    ]);

    if (!project) return NextResponse.json({ error: "项目不存在" }, { status: 404 });

    // v1.8.13 故事线生成模式（风格轴 × 自动化轴），从 buildConfig 读取，缺省 creative/auto
    const buildConfig = (project.buildConfig || {}) as Record<string, unknown>;
    const storylineStyle = (buildConfig.storylineStyle as string) || "creative";
    const automation = (buildConfig.storylineAutomation as string) || "auto";

    // v1.8.4：前端编辑后回传 suggestions 且要求 commit → 直接落库，不调 LLM
    const hasClientSuggestions = commit === true && Array.isArray(suggestions) && suggestions.length > 0;
    // v1.8.13：自动化轴 free=仅建议不落库；auto/full=自动落库；commit/newMain 强制落库
    const shouldCommit =
      commit === true || mode === "newMain" || automation === "auto" || automation === "full";

    let lines: Array<Record<string, unknown>>;
    if (hasClientSuggestions) {
      // 把前端带回的 sevenElements 展平回 LLM 输出形状，供 toSevenElements 读取
      lines = (suggestions as Array<Record<string, unknown>>).map((s) => ({
        type: s.type,
        title: s.title,
        description: s.description,
        ...(s.sevenElements && typeof s.sevenElements === "object"
          ? (s.sevenElements as Record<string, unknown>)
          : {}),
      }));
    } else {
      // —— 调 LLM 生成（原有逻辑）——
      const system = `你是小说故事线架构师。你为小说设计事件线（Storylines）——每条事件线是一个完整的小故事单元，用"七要素"驱动。

【七要素定义——每条事件线必须包含】
1. 欲望：主角这条线想要什么（推动力）
2. 阻碍：谁/什么挡着（冲突源）
3. 行动：主角怎么做（主动行为，不是被动反应）
4. 结果：暂时成/败（让读者想知道接下来怎样）
5. 意外：突然转折（打破读者预期）
6. 转折：方向改变（故事的意义/方向因意外而改变）
7. 结局：本事件线的收束（可以是阶段性的，不必全书结局）

【铁律】
- 每条线都是"因为想要X → 遇到Y → 做Z → 得到结果 → 意外发生 → 方向改变 → 收束"的完整因果链
- 支线必须服务于主线的"阻碍"或"转折"
- 七要素要具体，不要"变强""克服困难"这种万金油
- 事件线命名要像微型标题，如"获得灵剑认主"而非"主角获得宝剑"

【主线与支线铁律（最高优先级，务必遵守）】
- 主线 = 贯穿全书的核心目标线（像大树主干），必须能撑起数十章到数百章，牵动整个故事的命运与最终结局。一个项目通常只有 1 条主线。
- 支线 = 由主线触发、服务主线、可独立收束的小故事（像树枝）。支线的产生和结束都为主线的"阻碍"或"转折"服务，绝不能盖过主线。
- 判断法（拔剧情测试）：拔掉这段剧情故事还成立吗？能拔掉但很有趣→支线；拔掉就无法解释后续→主线。
- 严禁把"发现一个东西觉得它可能有用""两个人一场对话""准备去某地"这类小事开成独立主线或支线——它们应作为主线时间轴上的事件节点（MILESTONE/CLUE），或并入已有支线，而不是新建一条线。
- 如果已有主线存在（非前主线已完结的 newMain 场景），你只能生成支线，绝不能再开第二条主线。多开主线会被系统强制降级为支线。
- 主线七要素默认留空：大主线不预填七要素，等主线全部推进完结后由系统/AI 自动回填；支线可正常填七要素。

【伏笔/线索（悬念）归属说明】
- 伏笔/线索（悬念）请不要作为故事线生成。本系统有专门的「伏笔面板」负责埋设、追踪与收束率统计——悬念请在那里记录，不要在故事线里另开一条线。
- 严禁把"对话/发现/前往某地"这类小事开成支线——它们应作为主线时间轴上的事件节点（MILESTONE/CLUE），或并入已有支线，绝不是一条新线。

【输出格式——纯JSON】
{
  "lines": [
    {
      "type": "main" | "side",  // 主线 / 支线（伏笔/线索请使用专门的伏笔面板）
      "title": "事件线名称",
      "description": "一句话概述这条线",
      "desire": "...", "obstacle": "...", "action": "...", "result": "...",
      "twist": "...", "turn": "...", "ending": "..."
    }
  ]
}`;

      const pace = buildConfig.stitchPace || "steady";
      const paceDesc =
        pace === "fast"
          ? "节奏快：高频事件、每章都有新变数与冲突升级，剧情快速推进"
          : pace === "slow"
            ? "节奏慢热：铺垫充分、伏笔密集，冲突逐步累积后爆发"
            : "节奏均衡：稳步推进，隔章设置变数与阶段性小高潮";

      const prompt = `【作品信息】
名称：${project.name}
类型：${safeJoin(project.genre)}
总纲：${project.synopsis || "（未设定总纲）"}

【角色卡——${characters.length}人】
${characters.slice(0, 30).map(c => `- ${c.name}（${c.role}）：${c.background?.slice(0, 100) || "暂无背景"}`).join("\n")}

【世界观设定——${loreEntries.length}条】
${loreEntries.slice(0, 20).map(e => `- ${e.title}：${e.content.slice(0, 200)}`).join("\n")}

【已有故事线——${existingStorylines.length}条（如有则在此基础上补充，主线已存在则只生成支线）】
${existingStorylines.map(s => `- [${s.type === "main" ? "主线" : "支线"}] ${s.title}`).join("\n")}
${
  existingStorylines.some(s => s.type === "main" && s.status === "active") && mode !== "newMain"
    ? "\n⚠️ 当前已有活跃主线，本次只能生成支线，严禁再开主线。小事件（对话/发现/前往某地）不要建为支线，应作为主线时间轴事件或并入已有支线。"
    : ""
}

【缝合怪节奏——构造新主线时按此节奏设计事件密度（v1.6.0）】
${paceDesc}

【故事线风格——按此风格收敛设定密度（v1.8.13）】
${storylineStyleDesc(storylineStyle)}

请为这部小说生成故事线：
${
  mode === "newMain"
    ? "前一条主线已完结（缝合怪推进·构造新主线）。请构造一条承接前主线结局的新主线——延续世界观与人物当前状态，开启下一阶段的更大冲突，并配套 3-5 条支线。"
    : existingStorylines.filter(s => s.type === "main").length === 0
      ? "生成 1 条主线和 3-5 条支线。"
      : "主线已存在，生成 3-5 条支线来丰富主线。"
}`;

      const raw = await completeText(system, prompt, { maxTokens: 8192, temperature: 0.5 });

      let parsed: Record<string, unknown>;
      try {
        let s = raw.trim();
        const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (md) s = md[1].trim();
        const a = s.indexOf("{"), b = s.lastIndexOf("}");
        if (a >= 0 && b > a) s = s.slice(a, b + 1);
        parsed = JSON.parse(s) as Record<string, unknown>;
      } catch {
        return NextResponse.json({ error: "AI 返回格式解析失败", raw: raw.slice(0, 500) }, { status: 502 });
      }

      const parsedLines = parsed.lines as Array<Record<string, unknown>> | undefined;
      if (!Array.isArray(parsedLines) || parsedLines.length === 0) {
        return NextResponse.json({ error: "AI 未生成任何故事线", raw: raw.slice(0, 500) }, { status: 502 });
      }
      lines = parsedLines;
    }

    const toSevenElements = (line: Record<string, unknown>) => ({
      desire: (line.desire as string) || "",
      obstacle: (line.obstacle as string) || "",
      action: (line.action as string) || "",
      result: (line.result as string) || "",
      twist: (line.twist as string) || "",
      turn: (line.turn as string) || "",
      ending: null, // 结局不可预填，仅作待收束/已收束标记
    });
    // 主线七要素默认留空（大主线不预填，等推进完结后由系统/AI 回填）
    const emptySevenElements = () => ({
      desire: "", obstacle: "", action: "", result: "", twist: "", turn: "", ending: null,
    });

    // 非落库（草稿预览）→ 返回 suggestions 供前端中间编辑态
    if (!shouldCommit) {
      const suggestionView = lines.map((l, i) => {
        const rawType = (l.type as string);
        const isMain = rawType === "main";
        const isThread = rawType === "thread";
        return {
          type: isMain ? "main" : isThread ? "thread" : "side",
          title: (l.title as string) || `事件线${i + 1}`,
          description: (l.description as string) || "",
          // 主线与伏笔(thread)七要素留空；支线正常填充
          sevenElements: isMain || isThread ? emptySevenElements() : toSevenElements(l),
        };
      });
      return NextResponse.json({ suggestions: suggestionView });
    }

    // ── 落库逻辑（buildData 改用 sevenElements）──
    const maxOrder = existingStorylines.reduce((max, s) => Math.max(max, s.order), 0);
    const mainLines = lines.filter((l) => (l.type as string) === "main");
    let sideLines = lines.filter((l) => (l.type as string) === "side");
    let threadLines = lines.filter((l) => (l.type as string) === "thread"); // #223：伏笔/线索独立一类

    const hasActiveMain = existingStorylines.some((s) => s.type === "main" && s.status === "active");
    const isNewMainMode = mode === "newMain";
    // 治理铁律：已有活跃主线且非 newMain → 任何"主线"都降级为支线挂回主线，杜绝多条不明所以的主线
    if (hasActiveMain && !isNewMainMode && mainLines.length > 0) {
      sideLines.push(...mainLines);
      mainLines.length = 0;
    }

    let mainId: string | null =
      existingStorylines.find((s) => s.type === "main" && s.status === "active")?.id ?? null;

    const created: any[] = [];
    const buildData = (
      line: Record<string, unknown>,
      type: string,
      order: number,
      parentId: string | null,
    ) => ({
      projectId,
      type,
      parentId,
      title: (line.title as string) || `事件线${order}`,
      description: (line.description as string) || "",
      order,
      // 主线用三要素（origin/process/result）：前端回传优先；否则按风格预填
      // （简约/平常先把绝对主线的固线项拟定好，创意留空让 AI 发挥）
      sevenElements:
        type === "main"
          ? line.origin || line.process || line.result
            ? {
                origin: (line.origin as string) || "",
                process: (line.process as string) || "",
                result: (line.result as string) || "",
              }
            : storylineStyle === "creative"
              ? { origin: "", process: "", result: "" }
              : deriveMainElements({
                  title: line.title as string,
                  description: line.description as string,
                })
          // #223：伏笔(thread)不要求七要素，留空，由 UI 以线索事件数展示
          : type === "thread"
            ? { desire: "", obstacle: "", action: "", result: "", twist: "", turn: "", ending: null }
            : toSevenElements(line),
    });

    // 先建主线（如有），拿到 id 供支线/伏笔挂载
    for (const line of mainLines) {
      const m = await prisma.storyline.create({
        data: buildData(line, "main", maxOrder + created.length + 1, null),
      });
      created.push(m);
      if (!mainId) mainId = m.id;
    }

    // N4 修复 + N8 回归加固：newMain 场景下，把仍指向「已完结旧主线」的支线重挂到当前活跃主线。
    const oldCompletedMainIds = getCompletedMainIds(existingStorylines);
    if (mainId && oldCompletedMainIds.length > 0 && isRehangTargetActiveMain(mainId, existingStorylines)) {
      await prisma.storyline.updateMany({
        where: { projectId, type: "side", parentId: { in: oldCompletedMainIds } },
        data: { parentId: mainId },
      });
    }

    // #223：伏笔(thread)必须依附主线；若没有任何主线（理论上 mainId 必有，双保险）则降级为支线避免孤立
    if (!mainId && threadLines.length > 0) {
      sideLines.push(...threadLines);
      threadLines = [];
    }

    // 再建支线，parentId 挂到主线（让"支线服务于主线"数据化）
    const createdSides = await Promise.all(
      sideLines.map((line, i) =>
        prisma.storyline.create({
          data: buildData(line, "side", maxOrder + created.length + i + 1, mainId),
        })
      )
    );
    created.push(...createdSides);

    // 建伏笔(thread)，强制挂主线，七要素留空
    const createdThreads = mainId && threadLines.length > 0
      ? await Promise.all(
          threadLines.map((line, i) =>
            prisma.storyline.create({
              data: buildData(line, "thread", maxOrder + created.length + i + 1, mainId),
            })
          )
        )
      : [];
    created.push(...createdThreads);

    return NextResponse.json({
      storylines: created,
      count: created.length,
      types: {
        main: created.filter((s) => s.type === "main").length,
        side: created.filter((s) => s.type === "side").length,
        thread: created.filter((s) => s.type === "thread").length,
      },
    });
  } catch (err) {
    return jsonError(err);
  }
}

export async function POST(request: Request) {
  try {
    const bodyJson: any = await request.json();
    return await runStorylineGeneration(bodyJson);
  } catch (err) {
    return jsonError(err);
  }
}
