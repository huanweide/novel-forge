/**
 * 故事线 LLM 生成核心（与 Next.js route 解耦，便于单测 mock）。
 *
 * 抽出自 /api/storylines/generate 的「调 LLM 生成 + 解析 + 转 suggestions」逻辑，
 * 供「真后台 GenerationTask」后台执行器复用（v1.8.6, #174）。
 */

import { completeText } from "@/core/llm/client";

export type GenProject = {
  name: string;
  genre: string[];
  synopsis?: string | null;
  toneKeywords: string[];
  buildConfig?: Record<string, unknown>;
};
export type GenCharacter = { name: string; role?: string | null; background?: string | null };
export type GenLore = { title: string; content: string; enabled?: boolean };
export type GenExisting = { type: string; title: string; status?: string };

export interface StorylineSuggestion {
  type: "main" | "side";
  title: string;
  description: string;
  sevenElements: {
    desire: string;
    obstacle: string;
    action: string;
    result: string;
    twist: string;
    turn: string;
    ending: string | null;
  };
}

const SYSTEM = `你是小说故事线架构师。你为小说设计事件线（Storylines）——每条事件线是一个完整的小故事单元，用"七要素"驱动。

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

【输出格式——纯JSON】
{
  "lines": [
    {
      "type": "main",
      "title": "事件线名称",
      "description": "一句话概述这条线",
      "desire": "...", "obstacle": "...", "action": "...", "result": "...",
      "twist": "...", "turn": "...", "ending": "..."
    }
  ]
}`;

/**
 * 纯函数：基于项目上下文让 LLM 生成故事线 suggestions。
 * 仅依赖 completeText（可被 vitest mock），不触碰 prisma，便于单测。
 */
export async function generateStorylineSuggestions(input: {
  project: GenProject;
  characters: GenCharacter[];
  loreEntries: GenLore[];
  existingStorylines: GenExisting[];
  mode?: string;
  extra?: string;
}): Promise<StorylineSuggestion[]> {
  const { project, characters, loreEntries, existingStorylines, mode = "auto" } = input;

  const buildConfig = (project.buildConfig || {}) as Record<string, unknown>;
  const pace = buildConfig.stitchPace || "steady";
  const paceDesc =
    pace === "fast"
      ? "节奏快：高频事件、每章都有新变数与冲突升级，剧情快速推进"
      : pace === "slow"
        ? "节奏慢热：铺垫充分、伏笔密集，冲突逐步累积后爆发"
        : "节奏均衡：稳步推进，隔章设置变数与阶段性小高潮";

  const prompt = `【作品信息】
名称：${project.name}
类型：${project.genre.join("、")}
总纲：${project.synopsis || "（未设定总纲）"}

【角色卡——${characters.length}人】
${characters.slice(0, 30).map((c) => `- ${c.name}（${c.role ?? "未知"}）：${c.background?.slice(0, 100) ?? "暂无背景"}`).join("\n")}

【世界观设定——${loreEntries.length}条】
${loreEntries.slice(0, 20).map((e) => `- ${e.title}：${e.content.slice(0, 200)}`).join("\n")}

【已有故事线——${existingStorylines.length}条（如有则在此基础上补充，主线已存在则只生成支线）】
${existingStorylines.map((s) => `- [${s.type === "main" ? "主线" : "支线"}] ${s.title}`).join("\n")}

【缝合怪节奏——构造新主线时按此节奏设计事件密度（v1.6.0）】
${paceDesc}

请为这部小说生成故事线：
${
  mode === "newMain"
    ? "前一条主线已完结（缝合怪推进·构造新主线）。请构造一条承接前主线结局的新主线——延续世界观与人物当前状态，开启下一阶段的更大冲突，并配套 3-5 条支线。"
    : existingStorylines.filter((s) => s.type === "main").length === 0
      ? "生成 1 条主线和 3-5 条支线。"
      : "主线已存在，生成 3-5 条支线来丰富主线。"
}`;

  const raw = await completeText(SYSTEM, prompt, { maxTokens: 8192, temperature: 0.5 });

  let parsed: Record<string, unknown>;
  try {
    let s = raw.trim();
    const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (md) s = md[1].trim();
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a >= 0 && b > a) s = s.slice(a, b + 1);
    parsed = JSON.parse(s) as Record<string, unknown>;
  } catch {
    throw new Error("AI 返回格式解析失败");
  }

  const parsedLines = parsed.lines as Array<Record<string, unknown>> | undefined;
  if (!Array.isArray(parsedLines) || parsedLines.length === 0) {
    throw new Error("AI 未生成任何故事线");
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
  const emptySevenElements = () => ({
    desire: "", obstacle: "", action: "", result: "", twist: "", turn: "", ending: null,
  });

  // 治理铁律：已有活跃主线且非 newMain → 任何"主线"建议都降级为支线（双保险，落库层 route.ts 会再次强制）
  const hasActiveMain = existingStorylines.some((s) => s.type === "main" && s.status === "active");
  const isNewMainMode = mode === "newMain";

  return parsedLines.map((l, i) => {
    const rawType = (l.type as string) === "main" ? "main" : "side";
    const effectiveType = rawType === "main" && hasActiveMain && !isNewMainMode ? "side" : rawType;
    return {
      type: effectiveType,
      title: (l.title as string) || `事件线${i + 1}`,
      description: (l.description as string) || "",
      // 主线七要素留空；支线正常填充
      sevenElements: effectiveType === "main" ? emptySevenElements() : toSevenElements(l),
    };
  });
}
