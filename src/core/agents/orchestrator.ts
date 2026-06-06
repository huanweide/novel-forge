/**
 * Agent 调度器 —— 多智能体协作编排
 *
 * 四个 Agent 的职责：
 *   Agent A（架构师）→ 生成小说总体大纲
 *   Agent B（导演）  → 拆解为分章细纲
 *   Agent C（主笔）  → 撰写具体文本
 *   Agent D（审校）  → 检查OOC/逻辑/世界观冲突
 *
 * 工作流：A → B → C → D → (不通过则回到C)
 *
 * 这里实现了单章生成的完整流水线。
 * 注意：Agent B 的职责被简化合并进 A（一次性拆好章节），
 * 实际运行时 A 负责大纲+拆章，C 负责写，D 负责审。
 */

import type {
  Project,
  CharacterCard,
  LorebookEntry,
  StoryNode,
  PromptContext,
  ChapterOutline,
  ChapterSummary,
  ReviewLog,
} from "@/core/types";
import type { LLMClient } from "@/core/llm/client";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";
import { assemblePrompt } from "@/core/assembly/engine";
import { matchLoreEntries } from "@/core/assembly/trigger";
import { countTokens } from "@/core/assembly/tokenizer";

// ─── Prompt 模板 ─────────────────────────────────────────────

const SYSTEM_PROMPTS = {
  /** Agent A：大纲架构师 */
  architect: `你是一位资深小说架构师，专精于长篇故事的宏观结构设计。

你的任务是根据给定的世界观和角色设定，生成小说的总体大纲和章节拆解。

输出要求：
- 采用"起承转合"四幕结构
- 每章包含：标题、核心冲突、出场角色、场景数量
- 确保伏笔前呼后应，主线支线交织合理
- 只输出结构化大纲，不要写正文`,

  /** Agent C：正文主笔 */
  writer: `你是一位顶级小说作家，拥有独特的文风和深厚的文字功底。

你的任务是按照给定的大纲和设定，撰写小说的具体文本内容。

写作要求：
- 严格遵循人物卡中的性格特征和对话风格，绝不允许角色崩坏（OOC）
- 遵循世界观设定，不凭空创造新设定
- 注意与前文的衔接，保持行文连贯
- 适当运用描写、对话、心理活动等叙事手法
- 控制节奏：该紧张时紧张，该舒缓时舒缓
- 字数要求会在指令中指定`,

  /** Agent D：审校/逻辑守护者 */
  reviewer: `你是一位严格的小说编辑和审校专家，你的唯一任务是找出文本中的问题。

请从以下维度逐一检查给定的文本：

1. **角色一致性（OOC检查）**：角色的言行是否符合其性格特征和对话风格？
2. **逻辑漏洞**：情节是否存在逻辑矛盾？
3. **世界观冲突**：是否违反或凭空创造了设定？
4. **连续性错误**：是否与之前的情节矛盾？（如已死角色复活、物品凭空出现）
5. **时间线问题**：时间推进是否合理？

对于每个发现的问题，请给出：
- 严重程度（critical/major/minor）
- 具体描述
- 修改建议

如果没有发现问题，请明确表示"审校通过"。请严格——宁可误报也不要漏报。`,
};

// ─── 调度器主类 ─────────────────────────────────────────────

export class AgentOrchestrator {
  private client: LLMClient;
  private config = getDefaultLLMConfig();

  constructor(client?: LLMClient) {
    this.client = client || getDefaultClient();
  }

  /**
   * Agent A：生成小说总体大纲
   */
  async generateOutline(
    project: Project,
    characters: CharacterCard[],
    loreEntries: LorebookEntry[]
  ): Promise<string> {
    const characterBriefs = characters
      .map((c) => `[${c.name}] 身份：${c.role} | 性格：${c.personality.join("、")} | 动机：${c.hiddenMotives.join("、")}`)
      .join("\n");

    const loreBriefs = loreEntries
      .filter((l) => l.enabled)
      .map((l) => `[${l.title}] ${l.content}`)
      .join("\n");

    const response = await this.client.chat({
      model: this.config.architectModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.architect },
        {
          role: "user",
          content: `请为以下小说项目生成总体大纲：

【作品信息】
名称：${project.name}
类型：${project.genre.join("、")}
目标字数：${project.targetWordCount.toLocaleString()}字
主线总纲：${project.synopsis}
基调：${project.toneKeywords.join("、")}

【角色设定】
${characterBriefs}

【世界观设定】
${loreBriefs}

请输出：1) 总体起承转合结构 2) 分章大纲（每章含标题、核心冲突、出场角色）`,
        },
      ],
      temperature: 0.8,
      maxTokens: 4096,
    });

    return response.content;
  }

  /**
   * Agent C：撰写正文（流式输出）
   *
   * @returns AsyncGenerator，逐 token 产出文本
   */
  async *writeSection(
    context: PromptContext,
    writingInstruction: string,
    targetWordCount: number
  ): AsyncGenerator<{ type: "token" | "done" | "error"; content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const { prompt } = assemblePrompt(
      context,
      this.config.contextWindowSize,
      `${writingInstruction}\n\n目标字数：约${targetWordCount}字。`
    );

    const systemPrompt = context.systemPrompt || SYSTEM_PROMPTS.writer;

    try {
      for await (const chunk of this.client.chatStream({
        model: this.config.writerModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: this.config.defaultTemperature,
        topP: this.config.defaultTopP,
        maxTokens: this.config.maxTokensPerRequest,
      })) {
        yield chunk;
      }
    } catch (err) {
      yield {
        type: "error",
        content: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Agent D：审校生成的文本
   *
   * @returns 审校日志
   */
  async reviewContent(
    generatedContent: string,
    nodeOutline: string,
    activeCharacters: CharacterCard[],
    activeLoreEntries: LorebookEntry[],
    previousSummary: string
  ): Promise<ReviewLog> {
    const characterRefs = activeCharacters
      .map((c) => {
        const dialogue = (typeof c.dialogueStyle === "object" && c.dialogueStyle !== null
          ? c.dialogueStyle
          : {}) as Record<string, unknown>;
        const examples = Array.isArray(dialogue.examples) ? (dialogue.examples as string[]).join("；") : "";
        return `[${c.name}] 性格：${(c.personality || []).join("、")} | 对话风格：${examples} | 动机：${(c.hiddenMotives || []).join("、")} | 状态：${c.currentStatus}`;
      })
      .join("\n");

    const loreRefs = activeLoreEntries
      .map((l) => `[${l.title}] ${l.content}`)
      .join("\n");

    const reviewPrompt = `请审校以下小说文本：

【本节大纲】
${nodeOutline}

【前情提要】
${previousSummary || "（本章开头，无前情）"}

【角色设定参考】
${characterRefs}

【世界观参考】
${loreRefs}

【待审文本】
${generatedContent}

请逐项检查并输出审校报告。`;

    const response = await this.client.chat({
      model: this.config.reviewerModel,
      messages: [
        { role: "system", content: SYSTEM_PROMPTS.reviewer },
        { role: "user", content: reviewPrompt },
      ],
      temperature: 0.3, // 审校用低温，更准确
      maxTokens: 2048,
    });

    // 解析审校结果为结构化数据
    return this.parseReviewResponse(response.content, nodeOutline);
  }

  /**
   * Agent 摘要：压缩章节为中期记忆
   */
  async summarizeChapter(
    chapterContent: string,
    chapterTitle: string,
    characters: CharacterCard[]
  ): Promise<{ summary: string; keyEvents: string[]; characterStates: string }> {
    const charNames = characters.map((c) => c.name).join("、");

    const response = await this.client.chat({
      model: this.config.summarizeModel,
      messages: [
        {
          role: "system",
          content: `你是一个高效的文本摘要助手。请将以下章节内容压缩为简洁摘要。
要求：
1. 摘要不超过200 Token
2. 提取不超过5个关键事件
3. 记录每个角色的最终状态变化（情绪、位置、做出的决定）

请用以下格式输出：
---
摘要：[摘要内容]
关键事件：
- [事件1]
- [事件2]
角色状态：[角色名]：[状态描述]；[角色名]：[状态描述]
---`,
        },
        {
          role: "user",
          content: `章节标题：${chapterTitle}\n出场角色：${charNames}\n\n正文：\n${chapterContent}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1024,
    });

    return this.parseSummaryResponse(response.content);
  }

  // ─── 私有方法 ─────────────────────────────────────────────

  private parseReviewResponse(response: string, nodeOutline: string): ReviewLog {
    const passed = response.includes("审校通过") || response.includes("没有问题") || response.includes("未发现问题");

    const issues = passed
      ? []
      : [
          {
            type: "logic_flaw" as const,
            severity: "major" as const,
            description: response,
            location: null,
          },
        ];

    return {
      id: "",
      nodeId: "",
      timestamp: new Date(),
      passed,
      issues,
      summary: response.slice(0, 500),
      suggestion: passed ? null : response,
    };
  }

  private parseSummaryResponse(response: string): {
    summary: string;
    keyEvents: string[];
    characterStates: string;
  } {
    const summaryMatch = response.match(/摘要[：:]\s*(.+)/);
    const eventsMatch = response.match(/关键事件[：:]\s*\n([\s\S]*?)(?=\n角色状态|$)/);
    const statesMatch = response.match(/角色状态[：:]\s*(.+)/);

    const keyEvents = eventsMatch
      ? eventsMatch[1]
          .split("\n")
          .map((l) => l.replace(/^[-\s]*/, "").trim())
          .filter(Boolean)
      : [];

    return {
      summary: summaryMatch?.[1]?.trim() || response.slice(0, 200),
      keyEvents,
      characterStates: statesMatch?.[1]?.trim() || "",
    };
  }
}

// ─── 辅助函数：构建 PromptContext ───────────────────────────

export function buildPromptContext(params: {
  project: Project;
  currentNode: StoryNode;
  previousNodes: StoryNode[];
  characters: CharacterCard[];
  loreEntries: LorebookEntry[];
  chapterSummaries: ChapterSummary[];
  authorNote?: string;
}): PromptContext {
  const { project, currentNode, previousNodes, characters, loreEntries, chapterSummaries, authorNote } = params;

  // 主角极简卡
  const protagonist = characters.find((c) => c.role === "protagonist") || characters[0];
  const characterBrief = protagonist
    ? {
        name: protagonist.name,
        personality: (protagonist.personality || []).slice(0, 5),
        goal: Array.isArray(protagonist.hiddenMotives) && protagonist.hiddenMotives.length > 0
          ? protagonist.hiddenMotives[0]
          : "推动剧情发展",
        status: protagonist.currentStatus,
      }
    : { name: "未知", personality: [], goal: "", status: "alive" };

  // 触发词匹配（扫描最近内容和当前大纲）
  const recentText = previousNodes
    .slice(-3)
    .map((n) => n.content || n.outline || "")
    .join(" ") + (currentNode.outline || "");

  const triggeredLore = matchLoreEntries(recentText, loreEntries, 8).map((t) => ({
    entry: t.entry,
    triggerKeyword: t.triggerKeyword,
    matchScore: t.matchScore,
  }));

  return {
    systemPrompt: `你是一位顶级小说作家，正在撰写《${project.name}》——一部${project.genre.join("、")}作品。`,
    globalMemory: {
      projectSynopsis: project.synopsis,
      currentProtagonist: characterBrief,
      toneKeywords: project.toneKeywords || [],
    },
    triggeredLore,
    slidingWindow: {
      shortTerm: previousNodes.slice(-4), // 最近4个小节
      mediumTerm: chapterSummaries.slice(-3), // 最近3章摘要
      longTerm: [], // TODO: 从 StoryBeat 表检索
    },
    authorNote: authorNote || null,
  };
}
