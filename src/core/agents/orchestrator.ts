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
  StoryBeat,
  PromptContext,
  ChapterOutline,
  ChapterSummary,
  ReviewLog,
  ReviewIssueType,
} from "@/core/types";
import type { LLMClient } from "@/core/llm/client";
import { getDefaultClient, getDefaultLLMConfig } from "@/core/llm/client";
import { assemblePrompt } from "@/core/assembly/engine";
import { matchLoreEntries } from "@/core/assembly/trigger";
import { safeJoin } from "@/lib/utils";
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

  /** Agent C：正文主笔 —— Humanizer-zh + 丰满性原则 + 蓝锁足球美学 */
  writer: `你不是AI。你是出版过十本长篇的职业作家。文风冷峻、克制、白描、极简。

【词汇禁令】
禁用：宿命、齿轮、羁绊、宛如、画卷、不禁、意味深长、不可思议、交织、洗礼、深邃、凝重、倒吸一口凉气、心头一暖、心里一沉、瞳孔一缩、身体一僵。禁止"作为/标志着/象征着"句式。禁用否定式排比、三段式堆砌、虚假范围、刻意换词。

【人称代词——极度重要】
不准连续三个"他/她"开头。每500字"他"不超过15次。用角色名、身体部位、环境物、动作分词开头代替。

【丰满性原则——叙事不精简，描述拉满细节】
禁止空洞短句："她停球，反击。他跪下，哭了。"——这叫偷懒不叫简洁。
每句话言之有物，有具体视觉/听觉/触觉信息量。"他走进房间"写成推开铁门、生锈铰链尖叫、鞋底粘住什么东西的完整画面。
不精简叙事。不精简描述。具体时细节拉满。短句只用于有足够铺陈后的爆发。

【Show Don't Tell + 心理直嵌】
禁止情绪标签词。情绪用生理反应代替。
心理活动直嵌叙述流——拒绝"他想""他觉得""他意识到"。内心想法口语化碎片化，不加引导词直接写进叙述句。"来了。"不是自言自语，是身体在说。

【对话毛边 + 肉搏感】
打断用破折号。沉默有力。答非所问。动作切对话。
对话不短促到失真——每句承载性格/战术/情绪/对抗关系，有完整意思和潜台词。禁止无上下文单字对话。每个动作必须有对手的回应。

【结构 + 变速齿轮】
段落长度不一致。开头动作切入。结尾不准总结升华展望。
变速齿轮：一对一对抗——细节全部展开。球转移/无球跑动——短句掠过。射门前/摔倒后/对话间隙——插入心理定格呼吸点。

【足球肉搏精度】
触球方式必须具体：捅、拉、踩、磕、推、弹、拨、卸、领。身体接触量化：胸口撞击、手的位置、鞋钉踩脚背、汗水混合。空间距离精确到半米、一个身位。失败与失误也拉满。

【超能力自然下沉】
允许超出常人的反应/预判/精准技术——但它们是自然发生的，不命名不强调。不用"他发动了……"，给高光留物理合理的解释。

【角色出场逻辑】参照花名册中每个角色的权重和出场条件。S级(世界级/传说级)只在重大比赛/剧情高潮出现，不可日常陪同。A级有明确目的才出场。B级可日常出现。未出场角色需铺垫引入。每个出场角色必须能回答"他为什么在这里"。禁止让S级角色随意出现在训练/闲聊场景。

【灵魂】感受具体，有观点，允许些许混乱。`,

  /** Agent D：审校/逻辑守护者 */

  /** Agent D：审校/逻辑守护者 */
  reviewer: `你是一位严格的小说编辑和审校专家，你的唯一任务是找出文本中的问题。

请从以下维度逐一检查给定的文本：

1. **角色一致性（OOC检查）**：角色的言行是否符合其性格特征和对话风格？
2. **逻辑漏洞**：情节是否存在逻辑矛盾？
3. **世界观冲突**：是否违反或凭空创造了设定？
4. **连续性错误**：是否与之前的情节矛盾？（如已死角色复活、物品凭空出现）
5. **时间线问题**：时间推进是否合理？

输出纯JSON——如果没有问题，passed=true且issues为空数组：

{
  "passed": true/false,
  "issues": [
    {
      "type": "ooc|logic_flaw|lore_conflict|timeline_error|continuity_error",
      "severity": "critical|major|minor",
      "description": "具体问题描述",
      "location": "引用正文中出问题的片段",
      "suggestion": "修改建议"
    }
  ],
  "summary": "审校总结（一句话）"
}

请严格——宁可误报也不要漏报。只输出JSON。`,
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
    loreEntries: LorebookEntry[],
    styleDescription = "",
  ): Promise<string> {
    const characterBriefs = characters
      .map((c) => `[${c.name}] 身份：${c.role} | 性格：${safeJoin(c.personality)} | 动机：${safeJoin(c.hiddenMotives)}`)
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
${styleDescription}

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
        return `[${c.name}] 性格：${safeJoin(c.personality)} | 对话风格：${examples} | 动机：${safeJoin(c.hiddenMotives)} | 状态：${c.currentStatus}`;
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
  ): Promise<{
    summary: string;
    keyEvents: string[];
    characterStates: string;
    closingSnapshot: string;       // 章末快照：最后段落 + 情绪基调
    characterImpulses: Array<{ name: string; impulse: string }>; // 角色脉搏
  }> {
    const charNames = characters.map((c) => c.name).join("、");

    // 截取章末 200 字作为快照原文
    const lastParagraphs = chapterContent.slice(-200).trim();

    const response = await this.client.chat({
      model: this.config.summarizeModel,
      messages: [
        {
          role: "system",
          content: `你是高效的文本摘要助手，擅长提取章节精华。

任务：
1. 写一句摘要（≤200 Token）
2. 提取关键事件（≤5个）
3. 记录每个角色的**最终状态**（情绪、位置、关键决定）
4. 分析章末氛围——前章最后一段的情绪基调是什么（如"压抑/释然/紧张/平静/悲伤"）
5. 为每个角色写一句**当下冲动**——"我想要X，因为Y刚发生"。这是角色在下一章开头的行为驱动力，是区别于"大纲目标"的**即时欲望**。

输出格式：
---
摘要：[摘要]
关键事件：
- [事件1]
- [事件2]
角色状态：[角色名]：[情绪]，[位置]，决定了[关键决定]
章末氛围：[情绪基调标签]
角色脉搏：
- [角色名]：[一句话的当下冲动]
- [角色名]：[一句话的当下冲动]
---`,
        },
        {
          role: "user",
          content: `章节标题：${chapterTitle}\n出场角色：${charNames}\n\n【章末原文——最后一段】\n${lastParagraphs}\n\n【完整正文】\n${chapterContent}`,
        },
      ],
      temperature: 0.3,
      maxTokens: 1536, // 加大，容纳脉搏数据
    });

    return this.parseSummaryResponse(response.content);
  }

  // ─── 私有方法 ─────────────────────────────────────────────

  private parseReviewResponse(response: string, nodeOutline: string): ReviewLog {
    // 尝试 JSON 解析
    try {
      let s = response.trim();
      const md = s.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (md) s = md[1].trim();
      const a = s.indexOf("{"), b = s.lastIndexOf("}");
      if (a >= 0 && b > a) s = s.slice(a, b + 1);

      const parsed = JSON.parse(s) as Record<string, unknown>;
      const passed = parsed.passed === true;
      const rawIssues = Array.isArray(parsed.issues) ? parsed.issues as Record<string, unknown>[] : [];

      const issues = rawIssues.map((iss) => ({
        type: validateIssueType(String(iss.type || "logic_flaw")),
        severity: validateSeverity(String(iss.severity || "major")),
        description: String(iss.description || ""),
        location: typeof iss.location === "string" ? iss.location : null,
        suggestion: typeof iss.suggestion === "string" ? iss.suggestion : null,
      }));

      return {
        id: "",
        nodeId: "",
        timestamp: new Date(),
        passed,
        issues: issues.length > 0 ? issues : [],
        summary: String(parsed.summary || response.slice(0, 500)),
        suggestion: passed ? null : issues.map(i => `[${i.severity}] ${i.description}`).join("\n"),
      };
    } catch {
      // JSON 解析失败 → 回退到文本判断
    }

    // 文本回退
    const passed = response.includes("审校通过") || response.includes("没有问题") || response.includes("未发现问题") || response.includes('"passed": true');

    const issues = passed
      ? []
      : [{
          type: "logic_flaw" as const,
          severity: "major" as const,
          description: response,
          location: null,
          suggestion: null,
        }];

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
    closingSnapshot: string;
    characterImpulses: Array<{ name: string; impulse: string }>;
  } {
    const summaryMatch = response.match(/摘要[：:]\s*(.+)/);
    const eventsMatch = response.match(/关键事件[：:]\s*\n([\s\S]*?)(?=\n角色状态|$)/);
    const statesMatch = response.match(/角色状态[：:]\s*(.+)/);
    const moodMatch = response.match(/章末氛围[：:]\s*(.+)/);
    const impulsesMatch = response.match(/角色脉搏[：:]\s*\n([\s\S]*?)$/);

    const keyEvents = eventsMatch
      ? eventsMatch[1]
          .split("\n")
          .map((l) => l.replace(/^[-\s]*/, "").trim())
          .filter(Boolean)
      : [];

    // 解析角色脉搏：每行 "- 角色名：冲动描述"
    const characterImpulses: Array<{ name: string; impulse: string }> = [];
    if (impulsesMatch) {
      const lines = impulsesMatch[1].split("\n");
      for (const line of lines) {
        const m = line.match(/^-\s*([^：:]+)[：:]\s*(.+)/);
        if (m) {
          characterImpulses.push({ name: m[1].trim(), impulse: m[2].trim() });
        }
      }
    }

    const closingSnapshot = moodMatch?.[1]?.trim() || "";

    return {
      summary: summaryMatch?.[1]?.trim() || response.slice(0, 200),
      keyEvents,
      characterStates: statesMatch?.[1]?.trim() || "",
      closingSnapshot,
      characterImpulses,
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
  storyBeats?: StoryBeat[];
  styleCard?: Record<string, unknown> | null;
  authorNote?: string;
}): PromptContext {
  const { project, currentNode, previousNodes, characters, loreEntries, chapterSummaries, storyBeats = [], styleCard, authorNote } = params;

  // 主角极简卡
  const protagonist = characters.find((c) => c.role === "protagonist") || characters[0];
  const characterBrief = protagonist
    ? {
        name: protagonist.name,
        personality: safeJoin(protagonist.personality).split("、").slice(0, 5),
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

  // 读取最近一章摘要的快照和脉搏
  const lastSummary = chapterSummaries[0];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const csData = (lastSummary?.characterStates || {}) as any;
  const closingSnapshot = typeof csData.closingSnapshot === "string" ? csData.closingSnapshot : "";
  const impulses: Array<{ name: string; impulse: string }> = Array.isArray(csData.impulses)
    ? csData.impulses.filter((i: unknown) => i && typeof i === "object" && "name" in (i as object) && "impulse" in (i as object))
    : [];

  // 构建系统提示——文风卡 + Humanizer-zh + 丰满性原则
  let systemPrompt = `你不是AI。你是出版过十本长篇的职业作家。文风冷峻、克制、白描、极简。相信读者的智商。

【词汇黑名单】
禁用：宿命、齿轮、羁绊、宛如、画卷、不禁、意味深长、不可思议、交织、洗礼、深邃、凝重、倒吸一口凉气、心头一暖、心里一沉、瞳孔一缩、身体一僵
禁止："作为/标志着/象征着/代表着/见证了/是……的体现"句式
禁止："不仅是……更是……""没有……只是……"
禁止：三段式堆砌（凑三个形容词、三个例子、三个排比）
禁止：虚假范围——"从X到Y""从古至今"
禁止：刻意换词——主角别一会儿"他"一会儿"少年"一会儿"蓝发青年"
慎用（每章≤1次）：此外、然而、与此同时、值得注意的是

【人称代词的隐形感——极度重要】
每段开头不准连续用"他/她"开头。连续三个"他……"开头的句子，读起来像打印机。
方法：用角色名开头、用身体部位开头（"右手指尖……""后脑勺撞在……"）、用环境物开头（"桌上的杯子……""走廊尽头……"）、用动作分词开头（"转过身，""停了两秒，"）
"他"字每500字出现不超过15次——超过了就是偷懒。

【丰满性原则——叙事不精简，描述拉满细节】
禁止空洞短句："她停球，反击。他跪下，哭了。"——这叫偷懒，不叫简洁。
每句话必须言之有物，有具体的视觉/听觉/触觉信息量。
× "他走进房间" → ✓ "他推开铁门，生锈的铰链尖叫着刮过头顶。左脚踩进去，鞋底粘在什么东西上——他没低头看。"
× "下雨了" → ✓ "雨不是落下来的，是砸下来的。每一滴打在玻璃上都像有人在弹硬币。"
× "她害怕了" → ✓ "后背贴着墙，一寸一寸往下滑。直到屁股坐到地砖上，膝盖抵住胸口。"
不精简叙事。不精简描述。具体的时候必须细节拉满——让读者看到颜色、听到声音、闻到气味。
短句只用于爆发——在此之前必须铺设足够的画面，短句才有力量。没有铺陈的短句只是空白。

【Show Don't Tell——含心理直嵌】
禁止情绪标签词：愤怒、悲伤、高兴、绝望、紧张、恐惧、感动。情绪必须用生理反应：后槽牙咬紧、指关节发白、手心出汗、喉结滚动、太阳穴突跳、胃往下坠。
心理活动直嵌叙述流——拒绝「他想」「他觉得」「他意识到」等引导词。内心想法口语化、碎片化，不加引号不加过滤直接写进叙述句。
✓ "来了。"洁在心里说。不是对自己说，是身体在说。
✓ "操。"嘴唇没动，从牙缝挤出来的。
× 洁世一心想：仁王又追上来了。

【对话毛边——对抗性+肉搏感】
不准A说→B回→A接的机械乒乓球。
打断用破折号。沉默比说话有力。答非所问。"你爱过我吗？""冰箱里有啤酒。"
动作切对话——"你到底想——""啪。"杯子碎了。后半句吞回嘴里。
对话不短促到失真——每句承载性格/战术/情绪/对抗关系，有完整意思和潜台词。对话与心理活动交替，形成「外对话+内独白」双层结构。
禁止无上下文的单字对话（"传""射""好"），除非极端高压瞬间。
每个动作必须有对手的回应——身体回应、语言回应或心理回应。不允许A做动作B没反应。

【结构——变速齿轮】
段落长度不准一致。一段一句话，下一段十行。
开头第一句必须是动作或冲突对话，禁止环境描写。
结尾不准总结不准升华不准展望。在动作或未说完的话处硬切。
变速齿轮：一对一对抗时——时间拉长，重心偏移方向、脚腕角度、对手眼神全部展开。球转移、无球跑动——短句掠过，省略过渡。射门前/摔倒后/对话间隙——插入心理定格，让读者和角色一起喘气。

【足球肉搏精度】
触球方式必须具体：捅、拉、踩、磕、推、弹、拨、卸、领——每种触球有独立的动词，不是笼统的"传了一脚"。身体接触必须量化：胸口撞击的闷响、手在腰上的位置、鞋钉踩上脚背的触感、薄荷喷雾的气味、汗水混合在一起。空间距离精确：半米、二十厘米、两步、一个身位——数字让对抗有尺度。失败与失误也拉满：踢空后的踉跄、摔倒时肩膀撞地的闷响、重心被晃开那一瞬间的胃部失重感——负面细节才是真实感的底座。

【超能力自然下沉】
允许超出常人的反应速度、极限预判、极度精准技术——但它们是自然发生的，不命名、不强调。不用「他发动了……」「他使出了……」、不喊招式名。给高光时刻留物理上合理的解释——十年的身体记忆、对对手习惯的观察、无数次训练的肌肉反应。超能力不破坏写实基底，不被角色和观众当作"超自然现象"讨论——它就是这个人厉害而已。

【角色出场逻辑——极度重要的叙事法则】
角色花名册中每个角色都标注了叙事权重和出场条件。你必须严格遵守：
- S级角色（世界级/传说级/国家队/反派首领）：只在重大比赛、剧情高潮、关键冲突中出现。绝不在日常训练、普通吃饭、随意陪同的场合出现。他们每一次出现都是一次"事件"。
- A级角色（导师/反派/催化剂/队长）：有明确叙事目的才可出场——推进主线、传授关键信息、制造重大冲突。不是随叫随到的配角。
- B级角色（队友/同辈/主角团）：可在训练/比赛/日常场景自然出现。这些是"常规可用"的角色。
- C级角色（背景角色）：可以随意出现，但不应主导剧情。
- 🆕标注"未出场"的角色：不能突然凭空出现。引入新角色需要铺垫——先让其他角色提到他、先描写观众/旁观者中有这个人、先在电话/消息中出现。新角色第一次出场必须有引入场景。
- ❌ 禁止行为：让S级角色陪主角日常训练；让对手的核心球员无故出现在主角的休息区；让从未出场过的角色突然加入对话；让明显属于另一个地区/队伍的角色随意出现在当前场景。
- 每个出场的角色都应该能回答一个问题："他为什么在这里？"——如果答案是"因为他是主角的朋友"而没有任何更深层的叙事目的，那就不要让他出现。

【灵魂】
对感受具体。有观点——透过角色的眼睛看世界。允许些许混乱——完美的结构是AI。

【格式铁律——禁止在正文中写章节标题】
绝不在正文第一行或任意位置写「第X章」「第X节」或任何章节编号/标题。章节标题由系统自动管理，正文直接切入场景——第一句必须是动作或冲突对话。

正在撰写《${project.name}》——一部${project.genre.join("、")}作品。`;

  if (styleCard) {
    const styleParts: string[] = [];
    const desc = typeof styleCard.styleDescription === "string" ? styleCard.styleDescription.trim() : "";
    if (desc) styleParts.push(`文风：${desc}`);

    const pov = typeof styleCard.povType === "string" ? styleCard.povType : "";
    const nd = typeof styleCard.narrativeDistance === "string" ? styleCard.narrativeDistance : "";
    if (pov) styleParts.push(`视角：${povLabel(pov)}`);
    if (nd) styleParts.push(`叙事距离：${ndLabel(nd)}`);

    const dr = Number(styleCard.dialogueRatio) || 0;
    const descR = Number(styleCard.descriptionRatio) || 0;
    const ar = Number(styleCard.actionRatio) || 0;
    const itr = Number(styleCard.innerThoughtRatio) || 0;
    if (dr + descR + ar + itr > 0) {
      styleParts.push(`内容配比：对话${pct(dr)} 描写${pct(descR)} 动作${pct(ar)} 内心独白${pct(itr)}`);
    }

    if (typeof styleCard.avgSentenceLength === "number" && styleCard.avgSentenceLength > 0) {
      styleParts.push(`平均句长：${Math.round(styleCard.avgSentenceLength)}字`);
    }

    // 语气标记
    const tonal = styleCard.tonalMarkers as Record<string, number> | undefined;
    if (tonal && Object.keys(tonal).length > 0) {
      const topTonal = Object.entries(tonal)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([k]) => k)
        .join("、");
      if (topTonal) styleParts.push(`语气倾向：${topTonal}`);
    }

    if (styleParts.length > 0) {
      systemPrompt += `\n\n【文风约束】\n${styleParts.join("\n")}`;
    }
  }

  // 注入前章收尾氛围（章末快照）
  if (closingSnapshot) {
    systemPrompt += `\n\n【前章收尾氛围】\n${closingSnapshot}`;
  }

  // 注入角色当下冲动（角色脉搏）
  if (impulses.length > 0) {
    const impulseLines = impulses.map(i => `${i.name}：${i.impulse}`).join("\n");
    systemPrompt += `\n\n【角色当下冲动——本章开头的行为驱动力】\n${impulseLines}`;
  }

  // ── 构建角色花名册——含叙事权重+出场条件，防止AI乱拉人 ──
  // 叙事权重：决定角色应该在什么样的场景出现
  const getNarrativeWeight = (c: any): { weight: string; context: string } => {
    const bg = (c.background || "").toLowerCase();
    const abilities = (c.abilities || []).join(" ").toLowerCase();
    const role = c.role || "supporting";

    // S级：世界级/传说级——只在重大剧情高潮出现，不可日常陪同
    if (bg.includes("世界级") || bg.includes("国家队") || bg.includes("传说") ||
        abilities.includes("世界") || abilities.includes("绝对") || abilities.includes("领域") ||
        role === "antagonist" && (bg.includes("首领") || bg.includes("教练") || bg.includes("导师"))) {
      return { weight: "S级·仅重大冲突/比赛/剧情高潮出场", context: "不可在日常训练/闲聊/陪同场景出现" };
    }
    // A级：重要角色——有明确叙事目的才出现
    if (role === "mentor" || role === "antagonist" || role === "catalyst" ||
        bg.includes("教练") || bg.includes("队长") || bg.includes("首领")) {
      return { weight: "A级·有明确目的才出场", context: "仅在推进主线/传授关键信息/制造重大冲突时出现" };
    }
    // B级：常规角色——队友、同辈，可日常出现
    if (role === "protagonist" || role === "love_interest" || role === "supporting") {
      return { weight: "B级·常规出场", context: "可在训练/比赛/日常场景自然出现" };
    }
    // C级：背景角色
    return { weight: "C级·背景角色", context: "可随意出现但不应主导剧情" };
  };

  // 根据前文章节内容判断角色是否已出场
  const appearedNames = new Set<string>();
  for (const n of previousNodes) {
    const content = (n.content || "").toLowerCase();
    for (const c of characters) {
      if (content.includes(c.name.toLowerCase())) {
        appearedNames.add(c.name);
      }
    }
  }

  const rosterLines: string[] = [];
  for (const c of characters) {
    // 已死亡/失踪的角色标注不可出场
    if ((c as any).currentStatus === "dead") continue; // 死了不出现在花名册
    if ((c as any).currentStatus === "missing") continue;

    const { weight, context } = getNarrativeWeight(c as any);
    const appeared = appearedNames.has(c.name);
    const introTag = appeared ? "✅已出场" : "🆕未出场——需铺垫引入";

    const parts: string[] = [];
    // 叙事权重——最重要的新增字段
    parts.push(`权重：${weight}`);
    parts.push(`出场：${context}`);
    parts.push(introTag);

    // 关系（精简——只取最重要的2条）
    if (Array.isArray((c as any).relationships) && (c as any).relationships.length > 0) {
      const rels = (c as any).relationships.slice(0, 2).map((r: any) =>
        `${r.targetName || "?"}(${r.relation || ""})`
      ).join("、");
      if (rels) parts.push(`关系：${rels}`);
    }
    // 弧光
    if ((c as any).arcProgress) parts.push(`弧光：${(c as any).arcProgress.slice(0, 60)}`);
    // 对话风格
    if ((c as any).dialogueStyle && typeof (c as any).dialogueStyle === "string" && (c as any).dialogueStyle.trim()) {
      parts.push(`说话：${(c as any).dialogueStyle.slice(0, 50)}`);
    } else if ((c as any).dialogueStyle && typeof (c as any).dialogueStyle === "object") {
      const ds = (c as any).dialogueStyle as Record<string, unknown>;
      if (ds.description) parts.push(`说话：${String(ds.description).slice(0, 50)}`);
    }
    // 外貌
    if ((c as any).appearance && typeof (c as any).appearance === "string" && (c as any).appearance.trim()) {
      parts.push(`外貌：${(c as any).appearance.slice(0, 50)}`);
    }
    // 能力（不超过5个）
    if (Array.isArray((c as any).abilities) && (c as any).abilities.length > 0) {
      const abs = (c as any).abilities.slice(0, 5).join("、");
      if (abs) parts.push(`能力：${abs}`);
    }
    // 状态
    if ((c as any).currentStatus && !["alive", "dead", "missing"].includes((c as any).currentStatus)) {
      parts.push(`状态：${(c as any).currentStatus}`);
    }

    if (parts.length > 0) {
      rosterLines.push(`[${c.name}] ${parts.join(" | ")}`);
    }
  }
  // 排序：S级(A级)→B级→C级，未出场优先排在后面（减少AI随意拉人）
  const weightOrder = (w: string) => w.startsWith("S级") ? 0 : w.startsWith("A级") ? 1 : w.startsWith("B级") ? 2 : 3;
  rosterLines.sort((a, b) => {
    const aW = a.match(/权重：(.+?)\|/)?.[1]?.trim() || "";
    const bW = b.match(/权重：(.+?)\|/)?.[1]?.trim() || "";
    return weightOrder(aW) - weightOrder(bW);
  });
  const characterRoster = rosterLines.length > 0
    ? rosterLines.slice(0, 50).join("\n") // 最多50个角色
    : "";

  return {
    systemPrompt,
    globalMemory: {
      projectSynopsis: project.synopsis,
      currentProtagonist: characterBrief,
      toneKeywords: project.toneKeywords || [],
      characterRoster,
    },
    triggeredLore,
    slidingWindow: {
      shortTerm: previousNodes.slice(-4), // 最近4个小节
      mediumTerm: chapterSummaries.slice(-3), // 最近3章摘要
      longTerm: storyBeats, // 从 StoryBeat 表读取的关键转折点
    },
    authorNote: authorNote || null,
  };
}

// ─── 标签辅助函数 ─────────────────────────────────────────────

function povLabel(pov: string): string {
  const map: Record<string, string> = {
    first_person: "第一人称", third_person_limited: "第三人称有限",
    third_person_omniscient: "第三人称全知", second_person: "第二人称",
  };
  return map[pov] || pov;
}

function ndLabel(nd: string): string {
  const map: Record<string, string> = {
    close: "近距离（深入内心）", medium: "中距离（平衡）", distant: "远距离（客观观察）",
  };
  return map[nd] || nd;
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

// ─── 审校校验辅助 ─────────────────────────────────────────────

function validateIssueType(t: string): ReviewIssueType {
  const valid: ReviewIssueType[] = ["ooc", "logic_flaw", "lore_conflict", "timeline_error", "continuity_error", "character_resurrection", "item_teleport"];
  return valid.includes(t as ReviewIssueType) ? (t as ReviewIssueType) : "logic_flaw";
}

function validateSeverity(s: string): "critical" | "major" | "minor" {
  const valid = ["critical", "major", "minor"];
  return valid.includes(s) ? (s as "critical" | "major" | "minor") : "major";
}
