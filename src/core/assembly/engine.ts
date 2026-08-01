/**
 * Prompt 组装引擎 —— 系统的心脏
 *
 * 每一次请求 LLM 前，这个函数负责拼装完整的 Prompt。
 * 它把"当前场景施工图"发给 AI：你是谁、世界什么样、之前发生了什么、现在要写什么。
 *
 * 组装顺序（从顶到底）：
 * 1. System Prompt      —— AI身份定义
 * 2. Global Memory      —— 主线总纲 + 主角极简卡 + 基调
 * 3. Triggered Lore     —— 关键词触发注入的世界观
 * 4. Character Arcs     —— 角色弧光追踪（新）
 * 5. Storyline Progress —— 活跃故事线进度（新）
 * 6. Long Term Memory   —— 关键转折点提示（按 impact 排序）
 * 7. Medium Term Memory —— 章节摘要（按角色重叠检索优先）
 * 8. Short Term Memory  —— 最近的正文（行文连贯）
 * 9. Author's Note      —— 作者强制介入指令
 */

import type {
  PromptContext,
  GlobalMemory,
  TriggeredLore,
  SlidingWindow,
  StoryNode,
  TokenBudget,
  CharacterCard,
  Storyline,
  EventImportances,
  LorebookEntry,
} from "@/core/types";
import { countTokens, truncateByTokens } from "./tokenizer";
import { safeJoin } from "@/lib/utils";
import { formatEventsForPrompt } from "@/core/distillation";

// ─── 配置常量 ───────────────────────────────────────────────

/** 各区域 Token 分配比例 */
const BUDGET_RATIOS = {
  systemPrompt: 0.08,    // 8%
  globalMemory: 0.10,    // 10%
  triggeredLore: 0.15,   // 15%
  arcMemory: 0.01,       // 1%  —— 角色弧光追踪
  storylineMemory: 0.01, // 1%  —— 活跃故事线进度
  shortTerm: 0.20,       // 20% —— 近期正文（让5%给出S级记忆）
  mediumTerm: 0.10,      // 10%
  longTerm: 0.05,        // 5%
  foreshadowing: 0.05,   // 5%  —— S级记忆：未回收伏笔+major转折
  authorNote: 0.02,      // 2%
  responseReserve: 0.23, // 23% —— 留给出文
};

// ─── 核心组装函数 ───────────────────────────────────────────

/**
 * 组装完整 Prompt
 *
 * @param context 上下文各组件
 * @param contextWindowSize 模型上下文窗口大小
 * @param writingInstruction Agent C 的撰写指令（要写什么）
 * @returns 组装好的 Prompt 字符串 + Token 预算报告
 */
/** assemblePrompt 的可选配置 */
export interface AssembleOpts {
  /** 远楼层节点的 LLM 压缩摘要，key = StoryNode.id。提供则用摘要替换折叠标记，不提供则回退原折叠标记。 */
  distantSummaries?: Record<string, string>;
}

/** 被预算折叠的远楼层节点（供编排层在其上生成 LLM 压缩摘要） */
export interface DistantFloor {
  id: string;
  title: string;
  content: string | null;
  outline: string | null;
}

export function assemblePrompt(
  context: PromptContext,
  contextWindowSize: number,
  writingInstruction: string,
  opts?: AssembleOpts
): { prompt: string; budget: TokenBudget } {
  const budget = calculateBudget(contextWindowSize);

  // 1. 系统指令区
  const systemSection = buildSystemSection(context.systemPrompt, budget.allocations.systemPrompt);

  // 2. 全局静态记忆
  const globalSection = buildGlobalMemorySection(context.globalMemory, budget.allocations.globalMemory);

  // 3. 动态触发世界书
  const loreSection = buildLoreSection(context.triggeredLore, budget.allocations.triggeredLore);

  // 4. 角色弧光追踪
  const arcSection = buildArcSection(context.characters, budget.allocations.arcMemory);

  // 5. 活跃故事线进度
  const storylineSection = buildStorylineSection(context.storylines, budget.allocations.storylineMemory);

  // 6. S级记忆：未回收伏笔（最高优先级——防止AI忘掉自己埋的线）
  const foreshadowingSection = buildForeshadowingSection(
    context.pendingCommitments, budget.allocations.foreshadowing,
  );

  // 7. 长期记忆（关键转折点+章节S级事件）
  const longSection = buildLongTermSection(context.slidingWindow, budget.allocations.longTermMemory);

  // 8. 中期记忆（章节摘要）—— 带角色重叠检索
  const currentCharacterNames = context.characters?.map(c => c.name) || undefined;
  const mediumSection = buildMediumTermSection(context.slidingWindow, budget.allocations.mediumTermMemory, currentCharacterNames);

  // 9. 短期记忆（近期正文）
  const shortSection = buildShortTermSection(context.slidingWindow, budget.allocations.shortTermMemory, opts?.distantSummaries);

  // 10. 作者注释
  const authorSection = context.authorNote
    ? buildAuthorSection(context.authorNote, budget.allocations.authorNote)
    : "";

  // ── 世界书深度注入（酒馆 worldbook depth 0-4 迁移）──
  // depth 0=正文前强效(用户指令下方) | 1=用户指令上方 | 2=系统上下文 | 3/4=背景设定(关键词触发，已在 loreSection)
  const forced = context.forcedLore || [];
  const forcedByDepth: Record<number, LorebookEntry[]> = { 0: [], 1: [], 2: [] };
  for (const e of forced) {
    const d = e.depth ?? 3;
    if (d <= 2) forcedByDepth[d].push(e);
  }
  // depth 2 → 系统上下文区（紧跟全局记忆之后，作为基础设定常驻）
  const forcedDepth2Section = buildForcedLoreSection(forcedByDepth[2], "系统上下文（强制常驻·始终生效）");
  // depth 1 → 撰写指令上方；depth 0 → 撰写指令下方（正文前·最强效）
  const forcedDepth1Block = buildForcedLoreSection(forcedByDepth[1], "强制世界书（撰写指令上方）");
  const forcedDepth0Block = buildForcedLoreSection(forcedByDepth[0], "强制世界书（正文前·强效）");

  // 拼装全文：用 XML 标签明确包裹每个区块的边界（酒馆 / Agent 编排分层惯例）。
  // 相比此前的「---」分隔符 +【xxx】标题，XML 开闭标签让 LLM 无歧义地识别块角色，
  // 并区分「上下文」与「撰写任务」两层，消除模型把指令误当正文、正文误当指令的混淆。
  const contextBlocks = [
    wrapBlock("system_instruction", systemSection),
    wrapBlock("global_setting", globalSection),
    wrapBlock("forced_context", forcedDepth2Section),
    wrapBlock("world_lore", loreSection),
    wrapBlock("character_arcs", arcSection),
    wrapBlock("storylines", storylineSection),
    wrapBlock("pending_commitments", foreshadowingSection),
    wrapBlock("key_turning_points", longSection),
    wrapBlock("chapter_summaries", mediumSection),
    wrapBlock("recent_history", shortSection),
    wrapBlock("author_directive", authorSection),
  ].filter(Boolean);

  const assembledContext = contextBlocks.join("\n");

  // 撰写任务区：depth1 在指令上方、depth0 在指令下方（正文前·最强效），统一包进 <writing_task>
  const instructionInner = [forcedDepth1Block, writingInstruction, forcedDepth0Block]
    .filter(Boolean)
    .join("\n\n");

  // 最终 Prompt：根标签区分上下文与撰写任务
  const prompt = `<novel_forge_context>\n${assembledContext}\n</novel_forge_context>\n\n<writing_task>\n${instructionInner}\n</writing_task>`;

  // 计算实际 Token 用量
  const actualUsed = countTokens(prompt);
  budget.used = actualUsed;

  return { prompt, budget };
}

/**
 * 用 XML 标签包裹一个上下文区块，提供无歧义的开闭边界。
 * content 为空时返回空串（调用方 .filter(Boolean) 即可跳过空块）。
 */
function wrapBlock(tag: string, content: string): string {
  if (!content || !content.trim()) return "";
  return `<${tag}>\n${content}\n</${tag}>`;
}

// ─── 各区块构建函数 ─────────────────────────────────────────

function buildSystemSection(systemPrompt: string, maxTokens: number): string {
  const content = truncateByTokens(systemPrompt, maxTokens);
  return `【系统指令】\n${content}`;
}

function buildGlobalMemorySection(memory: GlobalMemory, maxTokens: number): string {
  const parts: string[] = [];

  parts.push(`【主线总纲】\n${memory.projectSynopsis}`);

  if (memory.currentProtagonist) {
    const p = memory.currentProtagonist;
    parts.push(
      `【当前主角】${p.name}\n性格：${safeJoin(p.personality)}\n当前目标：${p.goal}\n当前状态：${p.status}`
    );
  }

  if (memory.toneKeywords.length > 0) {
    parts.push(`【小说基调】${memory.toneKeywords.join("、")}`);
  }

  // Tier 2: 调度卡全量展开——AI 应该深度使用的角色（~15人完整卡面）
  if (memory.scheduledCards) {
    parts.push(`【📋 本章调度卡——以下角色的完整信息，请优先且深度使用】\n${memory.scheduledCards}`);
  }
  // Tier 1: 全量基础信息——所有角色一览（178人每人一行极简）
  if (memory.characterRoster) {
    parts.push(`【📇 全角色一览——所有人物的基础信息（★为本次调度卡，🆕为未登场）】\n${memory.characterRoster}`);
  }

  const fullContent = `【全局设定——始终牢记】\n${parts.join("\n\n")}`;
  return truncateByTokens(fullContent, maxTokens);
}

/** 板块分类标签——宽松的自然语言格式，不给 LLM 压力 */
const CATEGORY_SECTIONS: Record<string, { emoji: string; label: string }> = {
  geography:    { emoji: "🗺️", label: "地理环境" },
  faction:      { emoji: "⚔️", label: "势力阵营" },
  item:         { emoji: "💎", label: "重要物品" },
  magic_system: { emoji: "⚡", label: "力量体系" },
  technique:    { emoji: "📜", label: "功法技能" },
  creature:     { emoji: "🐉", label: "生物种族" },
  culture:      { emoji: "🎭", label: "文化风俗" },
  history:      { emoji: "📚", label: "历史背景" },
  law:          { emoji: "⚖️", label: "世界法则" },
  currency:     { emoji: "💰", label: "货币体系" },
  custom:       { emoji: "🔮", label: "特殊设定" },
};

function buildLoreSection(
  triggeredLore: TriggeredLore[],
  maxTokens: number
): string {
  if (triggeredLore.length === 0) return "";

  // 按深度升序（depth 3 在前、depth 4 在后）：越深越弱、越接近背景，渲染顺序靠后
  const sorted = [...triggeredLore].sort(
    (a, b) => (a.entry.depth ?? 3) - (b.entry.depth ?? 3)
  );

  // 按板块分组注入，每板块独立小标题——格式宽松，纯自然语言
  const grouped = new Map<string, typeof sorted>();
  for (const t of sorted) {
    const cat = (t.entry as any).category || "custom";
    const key = CATEGORY_SECTIONS[cat] ? cat : "custom";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(t);
  }

  const sections: string[] = [];
  for (const [cat, items] of grouped) {
    const sec = CATEGORY_SECTIONS[cat] || CATEGORY_SECTIONS.custom;
    const lines = items.map((t) => {
      const title = t.entry.title;
      const content = (t.entry.content || "").replace(/\n/g, "；");
      return `- ${title}：${content}`;
    });
    sections.push(`【${sec.emoji} ${sec.label}】\n${lines.join("\n")}`);
  }

  let result = sections.join("\n\n");
  return truncateByTokens(result, maxTokens);
}

/**
 * 共享渲染：把一组世界书词条按板块分组渲染成「- 标题：内容」文本。
 * 同时服务于关键词触发的 loreSection 与强制注入的 forced 区块。
 */
function renderLoreEntries(entries: { title: string; content: string; category?: string }[]): string {
  if (entries.length === 0) return "";
  const grouped = new Map<string, typeof entries>();
  for (const e of entries) {
    const cat = (e.category as any) || "custom";
    const key = CATEGORY_SECTIONS[cat] ? cat : "custom";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(e);
  }
  const sections: string[] = [];
  for (const [cat, items] of grouped) {
    const sec = CATEGORY_SECTIONS[cat] || CATEGORY_SECTIONS.custom;
    const lines = items.map((e) => `- ${e.title}：${(e.content || "").replace(/\n/g, "；")}`);
    sections.push(`【${sec.emoji} ${sec.label}】\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
}

/**
 * 强制世界书区块（depth<=2，不依赖关键词，始终注入）。
 * 用 🌟 标记以区别于关键词触发的世界书，便于排查。
 */
function buildForcedLoreSection(entries: LorebookEntry[], label: string): string {
  if (!entries || entries.length === 0) return "";
  const rendered = renderLoreEntries(entries as any);
  if (!rendered) return "";
  return `【🌟 ${label}】\n${rendered}`;
}

function buildShortTermSection(
  window: SlidingWindow,
  maxTokens: number,
  distantSummaries?: Record<string, string>
): string {
  const nodes = window.shortTerm;
  if (nodes.length === 0) return "";

  // 保留标题与正文，便于折叠时标注边界
  const items = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    body: `### ${n.title}\n${n.content || n.outline || ""}`,
  }));

  // 从最新往旧拼接，保证最新的内容不会被截断。
  // 较远楼层（放不下的旧节点）：
  //  - 若提供 LLM 压缩摘要（distantSummaries）——用摘要保留情节要义（酒馆记忆迁移最后一环）；
  //  - 否则做「折叠标记」而非静默丢弃——对应酒馆「记忆清除 / 上下文溢出治理」，
  //    明确告知模型哪些内容被压缩，避免其把截断片段误读为完整情节而产生剧情断裂幻觉。
  let result = "";
  let folded = 0;
  for (let i = items.length - 1; i >= 0; i--) {
    const candidate = items[i].body + (result ? "\n\n---\n\n" + result : "");
    if (countTokens(candidate) > maxTokens) {
      const remaining = maxTokens - countTokens("\n\n---\n\n" + result);
      const summary = distantSummaries?.[items[i].id];
      if (summary && summary.trim()) {
        // 远楼层 LLM 压缩摘要：保留情节要义而非静默丢弃
        result = `【远楼层摘要·AI 压缩】「${items[i].title}」\n${summary.trim()}\n\n---\n\n${result}`;
      } else if (remaining > 60) {
        // 保留末尾（与后续节点的衔接点），开头被折叠，显式标注边界
        const tail = truncateByTokens(items[i].body, remaining, true);
        result = `[…较远楼层「${items[i].title}」开头已折叠，以下为结尾衔接]\n${tail}\n\n---\n\n${result}`;
      } else {
        // 预算极小：整段折叠为一行提示，绝不静默丢弃
        result = `[⚠️ 远楼层「${items[i].title}」已折叠·非完整原文]\n\n---\n\n${result}`;
      }
      folded++;
      break;
    }
    result = candidate;
  }

  const foldNote =
    folded > 0
      ? `（注：含 ${folded} 个较远楼层，已用 AI 压缩摘要保留情节要义，请勿当作完整原文）`
      : "";
  return result ? `【前文回顾——最近发生的事】${foldNote}\n${result}` : "";
}

/**
 * 检测短期记忆中"放不进预算"的远楼层节点（即会被 buildShortTermSection 折叠的节点）。
 *
 * 供编排层在调用 assemblePrompt 之前，用 LLM 为这些节点生成压缩摘要，
 * 再以 assemblePrompt 的 opts.distantSummaries 注入，替换折叠标记。
 *
 * 与 buildShortTermSection 内部使用同一份 calculateBudget + 同一贪心循环，
 * 保证"检测到要折叠的"与"实际被折叠的"完全一致。
 */
export function getDistantFloors(
  window: SlidingWindow,
  contextWindowSize: number
): DistantFloor[] {
  const maxTokens = calculateBudget(contextWindowSize).allocations.shortTermMemory;
  const nodes = window.shortTerm;
  if (nodes.length === 0) return [];

  const items = nodes.map((n) => ({
    id: n.id,
    title: n.title,
    body: `### ${n.title}\n${n.content || n.outline || ""}`,
  }));

  const folded: DistantFloor[] = [];
  let result = "";
  for (let i = items.length - 1; i >= 0; i--) {
    const candidate = items[i].body + (result ? "\n\n---\n\n" + result : "");
    if (countTokens(candidate) > maxTokens) {
      const node = nodes[i];
      folded.push({ id: node.id, title: node.title, content: node.content, outline: node.outline });
      break;
    }
    result = candidate;
  }
  return folded;
}

function buildMediumTermSection(
  window: SlidingWindow,
  maxTokens: number,
  currentCharacters?: string[]
): string {
  const allSummaries = window.mediumTerm;
  if (allSummaries.length === 0) return "";

  // 如果有角色信息，按角色重叠分数排序（取 Top-8 最相关 + 最近 1 章保底）
  let selected: typeof allSummaries;
  if (currentCharacters && currentCharacters.length > 0) {
    const scored = allSummaries.map(s => {
      const eventsText = (s.keyEvents || []).join(" ") + " " + s.summary;
      let overlap = 0;
      for (const char of currentCharacters) {
        if (eventsText.includes(char)) overlap++;
      }
      return { summary: s, score: overlap };
    });
    scored.sort((a, b) => b.score - a.score);

    // Top-8 最相关 + 确保最后一章在列（保证时间连续性）
    const top = scored.slice(0, 8).map(x => x.summary);
    const lastChapter = allSummaries[allSummaries.length - 1];
    if (lastChapter && !top.find(t => t.chapterId === lastChapter.chapterId)) {
      top.push(lastChapter);
    }
    selected = top;
  } else {
    // 无角色信息时，取最后 5 章（比之前的 3 章多）
    selected = allSummaries.slice(-5);
  }

  // 从 selected 列表中按原有 token 预算逻辑截断
  // 增强：提取 S/A/B 四级事件分层进行差异化注入
  const texts = selected.map((s) => {
    const events = s.keyEvents.map((e) => `  - ${e}`).join("\n");

    // 尝试提取蒸馏后的事件分层
    let tieredEvents = "";
    const rawImportances = (s as any).eventImportances as EventImportances | undefined;
    if (rawImportances && (rawImportances.sTier?.length > 0 || rawImportances.aTier?.length > 0)) {
      tieredEvents = "\n" + formatEventsForPrompt({
        sTier: rawImportances.sTier || [],
        aTier: rawImportances.aTier || [],
        bTier: rawImportances.bTier || [],
      });
    }

    return `[${s.chapterTitle}]\n${s.summary}${tieredEvents}`;
  });

  let result = "";
  let used = 0;
  for (let i = texts.length - 1; i >= 0; i--) {
    const candidate = texts[i] + (result ? "\n\n" + result : "");
    if (countTokens(candidate) > maxTokens) break;
    result = candidate;
    used++;
  }

  // 记忆清除治理：因预算被省略的较早/低相关章节摘要，显式标注而非静默丢弃
  const omitted = texts.length - used;
  const foldNote = omitted > 0 ? `（注：另有 ${omitted} 个较早/低相关章节摘要因预算省略）` : "";
  return result ? `【本章之前的故事摘要】${foldNote}\n${result}` : "";
}

function buildForeshadowingSection(
  commitments: any[] | undefined,
  maxTokens: number,
): string {
  if (!commitments || commitments.length === 0) return "";

  // 只取未回收的伏笔——区分紧迫度
  const unresolved = commitments.filter(
    (c: any) => c.status !== "resolved" && c.status !== "abandoned",
  );

  if (unresolved.length === 0) return "";

  // 排序：有 expiryChapter 的排前面（即将到期），然后按创建时间
  unresolved.sort((a: any, b: any) => {
    const aExp = a.expiryChapter || 999;
    const bExp = b.expiryChapter || 999;
    return aExp - bExp;
  });

  const lines: string[] = [];
  let used = 0;
  for (const c of unresolved) {
    let line = `⚠️ 待回收：${c.description}`;
    if (c.expiryChapter) line += `（预计第${c.expiryChapter}章回收）`;
    if (c.relatedCharacters?.length) line += ` [关联：${c.relatedCharacters.join("、")}]`;
    const t = countTokens(line);
    if (used + t > maxTokens) break;
    lines.push(line);
    used += t;
  }

  return lines.length > 0
    ? `【🔴 S级记忆——未回收的伏笔承诺（最高优先级，写了前面埋的必须圆）】\n${lines.map((l) => `- ${l}`).join("\n")}`
    : "";
}

function buildLongTermSection(
  window: SlidingWindow,
  maxTokens: number
): string {
  const beats = [...(window.longTerm || [])];
  if (beats.length === 0) return "";

  // 按 impact 排序：major 优先，同级别按章节倒序
  beats.sort((a, b) => {
    if (a.impact === "major" && b.impact !== "major") return -1;
    if (a.impact !== "major" && b.impact === "major") return 1;
    return b.chapterNumber - a.chapterNumber;
  });

  const texts = beats.map((b) => `[第${b.chapterNumber}章] ${b.description}`);

  let result = "";
  for (let i = texts.length - 1; i >= 0; i--) {
    const candidate = texts[i] + (result ? "\n" + result : "");
    if (countTokens(candidate) > maxTokens) break;
    result = candidate;
  }

  return result ? `【前文关键转折点——Major事件优先】\n${result}` : "";
}

function buildArcSection(characters: CharacterCard[] | undefined, maxTokens: number): string {
  if (!characters) return "";
  const withArc = characters.filter(c => c.arcProgress && c.arcProgress.trim());
  if (withArc.length === 0) return "";

  const lines = withArc.map(c => `- ${c.name}：${c.arcProgress}`);
  const section = `【角色弧光追踪】\n${lines.join("\n")}`;
  return truncateByTokens(section, maxTokens);
}

function buildStorylineSection(storylines: Storyline[] | undefined, maxTokens: number): string {
  const active = storylines?.filter(s => s.status === "active") || [];
  if (active.length === 0) return "";

  const typeLabel: Record<string, string> = { main: "📌 主线", side: "↳ 支线" };
  const lines = active.map(s => {
    const label = typeLabel[s.type] || s.type;
    const progress = [s.desire, s.obstacle, s.action, s.result, s.twist, s.turn, s.ending]
      .filter(Boolean).join(" → ");
    return `${label}·${s.title}：${progress || s.description || "暂无进度"}`;
  });
  const section = `【活跃故事线当前状态】\n${lines.join("\n")}`;
  return truncateByTokens(section, maxTokens);
}

function buildAuthorSection(authorNote: string, maxTokens: number): string {
  return `【⚠️ 作者特别指令——最高优先级】\n${truncateByTokens(authorNote, maxTokens)}`;
}

// ─── 预算计算 ───────────────────────────────────────────────

function calculateBudget(contextWindowSize: number): TokenBudget {
  const allocations = {
    systemPrompt: Math.floor(contextWindowSize * BUDGET_RATIOS.systemPrompt),
    globalMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.globalMemory),
    triggeredLore: Math.floor(contextWindowSize * BUDGET_RATIOS.triggeredLore),
    arcMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.arcMemory),
    storylineMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.storylineMemory),
    shortTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.shortTerm),
    mediumTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.mediumTerm),
    longTermMemory: Math.floor(contextWindowSize * BUDGET_RATIOS.longTerm),
    foreshadowing: Math.floor(contextWindowSize * BUDGET_RATIOS.foreshadowing),
    authorNote: Math.floor(contextWindowSize * BUDGET_RATIOS.authorNote),
    responseReserve: Math.floor(contextWindowSize * BUDGET_RATIOS.responseReserve),
  };

  return {
    total: contextWindowSize,
    used: 0,
    allocations,
  };
}

/**
 * 计算当前上下文组装后的实际 Token 用量（用于调试面板展示）
 */
export function calculateContextUsage(
  context: PromptContext,
  contextWindowSize: number
): TokenBudget {
  const budget = calculateBudget(contextWindowSize);

  // 弧光与故事线索
  const arcText = (context.characters || [])
    .filter(c => c.arcProgress?.trim())
    .map(c => `${c.name}:${c.arcProgress}`)
    .join(" ");
  const storylineText = (context.storylines || [])
    .filter(s => s.status === "active")
    .map(s => s.title).join(" ");

  budget.used = countTokens(
    [
      context.systemPrompt,
      context.globalMemory.projectSynopsis,
      context.globalMemory.currentProtagonist
        ? JSON.stringify(context.globalMemory.currentProtagonist)
        : "",
      context.globalMemory.toneKeywords.join(),
      context.globalMemory.characterRoster,
      context.globalMemory.scheduledCards,
      ...context.triggeredLore.map((t) => t.entry.content),
      ...context.slidingWindow.shortTerm.map(
        (n) => n.content || n.outline || ""
      ),
      ...context.slidingWindow.mediumTerm.map((s) => s.summary),
      ...context.slidingWindow.longTerm.map((b) => b.description),
      context.authorNote || "",
      arcText,
      storylineText,
    ].join(" ")
  );

  return budget;
}
