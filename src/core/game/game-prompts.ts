/**
 * 游戏模式 —— 提示词组装
 *
 * 为游戏模式组装系统提示词和用户消息。
 * 提示词分为三部分：
 *   1. 基础层：世界观 + 章纲 + 角色
 *   2. 交互层：当前状态（轮次/字数/进度/背包）
 *   3. 反馈层：输出格式要求（NE| CI| PROGRESS| 选项）
 */

import type { GameSessionContext, GameActionInput } from "./types";
import { ACTION_LABELS } from "./types";

// ─── 操作归一化（阿游 P0：唯一归一化点）────────────────────────────
// AI 产出中文操作（CI|获得|…/CI|消耗|/CI|装备|/CI|丢弃|），而引擎(game-engine.ts)、
// 前端(page.tsx)、开局路由(start/route.ts) 全部用英文枚举 gain/consume/equip/discard
// 比较。此处统一把中文操作映射为英文枚举，是唯一需要改动的地方（无需四处改比较逻辑）。
const OP_MAP: Record<string, string> = {
  // 基础操作（与引擎 game-engine.ts / 前端 page.tsx 的英文枚举一致）
  "获得": "gain",
  "消耗": "consume",
  "装备": "equip",
  "丢弃": "discard",
  // 同义词覆盖（阿游 N3 / P1-1）：避免模型用同义动词导致透传到 applyItemChanges 后静默丢物或反向加物
  // 获得类
  "拾取": "gain",
  "捡到": "gain",
  "取得": "gain",
  "获取": "gain",
  "拾起": "gain",
  "拿": "gain",
  "得到": "gain",
  "收下": "gain",
  "赢得": "gain",
  "缴获": "gain",
  "收到": "gain",
  "得手": "gain",
  "到手": "gain",
  // 消耗类
  "使用": "consume",
  "服用": "consume",
  "吃掉": "consume",
  "饮用": "consume",
  "吞": "consume",
  "吞下": "consume",
  "服下": "consume",
  "咽下": "consume",
  // 消耗类同义词扩展（Round12 A4：消告警噪音且不污染数据）
  "吃": "consume",
  "喝": "consume",
  "食": "consume",
  "进食": "consume",
  "吸": "consume",
  "饮": "consume",
  // 装备类
  "佩戴": "equip",
  "穿上": "equip",
  "戴": "equip",
  // 丢弃类
  "丢掉": "discard",
  "扔掉": "discard",
  "弃置": "discard",
  "抛": "discard",
  "舍弃": "discard",
  "抛弃": "discard",
  "遗弃": "discard",
  "遗失": "discard",
  "失落": "discard",
  "丢失": "discard",
  // 卸下类（阿游 P1-1：引擎新增 unequip 分支，仅清 equipped 标记，不删物品）
  "解下": "unequip",
  "卸下": "unequip",
  "脱下": "unequip",
  "褪下": "unequip",
  // 卸下类同义词扩展（Round12 A4）
  "摘下": "unequip",
  "摘掉": "unequip",
  "除下": "unequip",
  // 流转/出售类（阿游 P1-1：safe skip，不改动背包，引擎直接 no-op 跳过）
  "典当": "skip",
  "抵押": "skip",
  "典押": "skip",
  // 流转/出售类同义词扩展（Round12 A4：归入 SAFE_SKIP 兜底，不写背包）
  "出售": "skip",
  "售卖": "skip",
  "卖出": "skip",
  "交换": "skip",
  "交易": "skip",
  // 损毁类（阿游 P1-1：引擎新增 destroy 分支，从背包移除该物品）
  "损毁": "destroy",
  "摧毁": "destroy",
  "弄坏": "destroy",
  "毁坏": "destroy",
  "粉碎": "destroy",
  // 损毁类同义词扩展（Round12 A4）
  "破坏": "destroy",
  "砸碎": "destroy",
  "摔碎": "destroy",
  "烧毁": "destroy",
  "焚毁": "destroy",
  "炸毁": "destroy",
};

// 中文数字表（与选项解析共用）——用于物品数量「二/三」等中文数字解析。
const CN_NUM: Record<string, number> = {
  "零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5,
  "六": 6, "七": 7, "八": 8, "九": 9, "十": 10,
};

// 解析复合中文数字（十/百进位，支持零占位）：十二=12、二十=20、一百零五=105。
// 仅由 零~九、十、百 组成才识别，其余字符视为非法返回 null（交由上层默认 1）。
function parseCnCompound(s: string): number | null {
  if (!s) return null;
  const d: Record<string, number> = {
    零: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
    六: 6, 七: 7, 八: 8, 九: 9,
  };
  let section = 0; // 已结算的百位/十位累计
  let current = 0; // 当前待乘的单位数字
  let hasAny = false;
  for (const ch of s) {
    if (d[ch] != null) {
      current = d[ch];
      hasAny = true;
    } else if (ch === "十") {
      // 十/二十/十二：十前无数字视为 1（"十"=10）
      section += (current === 0 && !hasAny ? 1 : current) * 10;
      current = 0;
      hasAny = true;
    } else if (ch === "百") {
      section += (current === 0 && !hasAny ? 1 : current) * 100;
      current = 0;
      hasAny = true;
    } else {
      return null; // 含非法字符，不入复合解析
    }
  }
  return hasAny ? section + current : null;
}

// 解析物品数量：支持阿拉伯数字、单字中文数字与复合中文数字；无法解析给默认 1 并告警（阿游 P1）。
function parseGameQuantity(raw?: string): number {
  if (!raw) return 1;
  const s = raw.trim();
  if (s === "") return 1;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  if (CN_NUM[s] != null) return CN_NUM[s];
  const cn = parseCnCompound(s);
  if (cn != null) return cn;
  console.warn(`[parseGameOutput] 无法解析物品数量「${s}」，默认按 1 处理`);
  return 1;
}

// ─── 系统提示词模板 ─────────────────────────────────────────────

const GAME_SYSTEM_PROMPT = `你是一位资深互动小说大师，正在与用户共同创作一章小说。你的文笔兼具网络文学的爽感和传统文学的画面感。

## 当前创作背景
- 书名：《{bookName}》
- 章节：{chapterTitle}
{outlineSection}
{existingSection}
{worldSection}
{characterSection}

## 当前状态
- 轮次：第 {round} 轮
- 累计字数：{totalWords} / {maxWords}（{progressPercent}%）
- 情节进度：{plotProgress}%
{itemsSection}

## 互动规则
1. 用户会描述主角的下一步行动，你据此生成 1-3 段紧凑叙事（共 300-600 字），保持文笔流畅、描写有画面感
2. 叙事必须严格遵循章纲规划，不偏离主线情节方向
3. 叙事结束后单独一行给出 3-4 个编号选项，格式：
   1. 选项一
   2. 选项二
   3. 选项三
   4. 选项四
4. 选项要求：多样化（方向性/策略性/互动性），贴合当前剧情，推动情节前进
5. 选项避免：重复历史行动、废话选项、偏离主线太远的支线
6. 如果本轮出现新实体（新角色/新地点/新物品/新势力），在选项后单独一段输出：
   ===新实体===
   NE|实体名|类型|简要描述
   类型可选：角色、地点、物品、势力、功法、生物、其他
  7. 如果主角获得/消耗/装备/丢弃物品，输出：
   ===角色物品变动===
   CI|获得|物品名|数量|归属者（可选，留空默认主角）
   CI|消耗|物品名|数量
   CI|装备|物品名|数量
   CI|丢弃|物品名|数量
   说明：归属者填「主角」或具体角色名（如「李尘」），用于区分背包里谁的物品；装备/丢弃同样通过 CI| 标记，引擎会真实改变背包状态（阿游 P0-3）。
8. 每轮更新情节进度（选项之前输出）：
   【情节进度：X%】
9. 如果累计字数接近或超过 {maxWords} 字的限制，应该开始收束剧情，给出"走向章节结尾"的选项

## 写作风格要求
- 每段叙事有明确的推进感，不做无效重复描写
- 对话有潜台词，角色说话方式符合其性格
- 动作描写干净利落，环境描写嵌入叙事而非单独成段
- 新信息（实体/物品）自然融入叙事，不生硬介绍

{memorySection}
{historySection}`;

// ─── 用户行动提示词模板 ────────────────────────────────────────

const ACTION_PROMPTS: Record<string, string> = {
  observe:
    "【观察】仔细环顾四周，观察当前所在之处的环境细节、在场人物的神态与微表情，以及任何不寻常的蛛丝马迹。",
  dialogue:
    "【对话】与当前场景中的人物交谈，推进对话线，获取信息或推动关系发展。",
  combat:
    "【战斗】进入战斗状态，与面前的敌人交锋。描写战斗动作、招式施展和双方攻防。",
  explore:
    "【探索】主动移动位置，探索新的区域，寻找隐藏的地点、物品或线索。",
  use_item:
    "【使用物品】使用背包中的物品。{itemHint}",
  rest:
    "【休息】找一个安全的地方休息恢复。时间推进，状态恢复，可能会有突发事件或梦境预兆。",
  custom: "{customText}",
};

// ─── 公开 API ───────────────────────────────────────────────────

/**
 * IMP-022：跨轮次记忆摘要（P1）
 *
 * 现象：historySection 仅取最近 6 轮且每轮截断 150 字，长游戏（>6 轮）早期实体/伏笔/关键决策
 * 在 prompt 中丢失，AI 后续不记得开头设定。
 *
 * 修法：从已持久化的上下文中提取一段紧凑「记忆摘要」，注入到 historySection 之前。
 * 数据来源（均为跨全部轮次持久、已由引擎合并去重，诚实可提取）：
 *   - ctx.entities：全部轮次出现过的实体（角色/地点/势力/功法/生物…），正是掉出 historySection 的早期设定
 *   - ctx.items：当前背包（持久物品，常承载伏笔/线索）
 *   - ctx.previousTurns 中掉出「最近 6 轮」的早期玩家行动：作为「早期关键决策」回填，避免开头选择被遗忘
 *
 * 纯字符串处理，不引网络调用；不改变 historySection 的截断逻辑。
 */
export function buildMemorySummary(ctx: GameSessionContext): string {
  const parts: string[] = [];

  // 1. 持久实体（上下文已跨全部轮次合并去重，名称唯一）
  const entities = ctx.entities.filter((e) => e && e.name);
  if (entities.length > 0) {
    const listed = entities
      .map((e) => `${e.name}(${e.type || "其他"})`)
      .join("、");
    parts.push(`- 已出现实体：${listed}`);
  }

  // 2. 当前背包（持久物品，承载伏笔/线索）
  if (ctx.items.length > 0) {
    const listed = ctx.items
      .map(
        (i) =>
          `${i.name} ×${i.quantity}（${i.category}）${i.owner && i.owner !== "主角" ? `【归属：${i.owner}】` : ""}`
      )
      .join("、");
    parts.push(`- 关键物品：${listed}`);
  }

  // 3. 掉出最近 6 轮的早期玩家关键决策（避免开头选择被遗忘）
  const HISTORY_KEEP = 6; // 与 historySection 的 .slice(-6) 保持一致
  const early = ctx.previousTurns.slice(
    0,
    Math.max(0, ctx.previousTurns.length - HISTORY_KEEP)
  );
  if (early.length > 0) {
    const listed = early
      .map((t) => `第${t.round}轮：${t.playerAction.slice(0, 40)}`)
      .join("；");
    parts.push(`- 早期关键决策：${listed}`);
  }

  if (parts.length === 0) return "";
  return `\n## 跨轮次记忆摘要（持久记住开头设定与伏笔，长局不丢）\n${parts.join("\n")}`;
}

/**
 * 组装游戏模式的系统提示词
 */
export function buildGameSystemPrompt(ctx: GameSessionContext): string {
  const outlineSection = ctx.outline
    ? `\n## 本章章纲（必须遵循的情节规划）\n${ctx.outline}`
    : "\n（本章暂无章纲，请根据世界观和角色自由展开剧情，但需要逐渐收束到有意义的情节方向）";

  // v0.46.58：本章已有正文——游戏从已有内容之后继续（含原字数），不推翻已写情节
  const existingSection = ctx.existingContent
    ? `\n## 本章已有正文（${ctx.existingContent.length} 字——游戏从这段内容之后续接，不得重复或推翻）\n${ctx.existingContent.slice(0, 3000)}`
    : "";

  const worldSection =
    ctx.worldLore.length > 0
      ? `\n## 世界观设定\n${ctx.worldLore
          .slice(0, 8)
          .map((l) => `- **${l.title}**：${l.content.slice(0, 150)}`)
          .join("\n")}`
      : "";

  const characterSection =
    ctx.characters.length > 0
      ? `\n## 本章涉及角色\n${ctx.characters
          .map(
            (c) =>
              `- **${c.name}**（${c.role}）${c.currentStatus !== "alive" ? `[状态：${c.currentStatus}]` : ""}：${c.briefDescription || "暂无简介"}`
          )
          .join("\n")}`
      : "";

  const itemsStr =
    ctx.items.length > 0
      ? ctx.items
          .map((i) => `- ${i.name} ×${i.quantity}（${i.category}）【归属：${i.owner || "主角"}】`)
          .join("\n")
      : "（背包空空如也）";

  const itemsSection = `\n## 背包物品\n${itemsStr}`;

  const historySection =
    ctx.previousTurns.length > 0
      ? `\n## 历史互动记录\n${ctx.previousTurns
          .slice(-6) // 只保留最近 6 轮
          .map(
            (t) =>
              `第${t.round}轮——玩家行动：${t.playerAction.slice(0, 80)}\nAI叙事：${t.narrative.slice(0, 150)}...`
          )
          .join("\n\n")}`
      : "\n## 历史互动记录\n（游戏开始，等待第一轮玩家行动）";

  const progressPercent =
    ctx.maxWords > 0 ? Math.round((ctx.totalWords / ctx.maxWords) * 100) : 0;

  return GAME_SYSTEM_PROMPT.replace("{bookName}", ctx.bookName)
    .replace("{chapterTitle}", ctx.chapterTitle)
    .replace("{outlineSection}", outlineSection)
    .replace("{existingSection}", existingSection)
    .replace("{worldSection}", worldSection)
    .replace("{characterSection}", characterSection)
    .replace("{round}", String(ctx.currentRound + 1))
    .replace("{totalWords}", String(ctx.totalWords))
    .replace("{maxWords}", String(ctx.maxWords))
    .replace("{progressPercent}", String(progressPercent))
    .replace("{plotProgress}", String(ctx.plotProgress))
    .replace("{itemsSection}", itemsSection)
    .replace("{memorySection}", buildMemorySummary(ctx))
    .replace("{historySection}", historySection);
}

/**
 * 根据行动类型组装用户消息
 */
export function buildActionPrompt(input: GameActionInput): string {
  const template =
    ACTION_PROMPTS[input.actionType] ?? ACTION_PROMPTS.custom;

  let prompt = template
    .replace("{customText}", input.actionText)
    .replace("{itemHint}", input.targetItem ? `使用：${input.targetItem}` : "请列出可以使用的物品");

  // 阿游 P1-1：显式承接上一轮玩家选择的选项，让 AI 知道从哪个分支继续推进。
  if (input.selectedOption != null && input.selectedOptionText) {
    prompt = `（承接上一轮，玩家选择了选项 ${input.selectedOption}：${input.selectedOptionText}）\n` + prompt;
  } else if (input.selectedOption != null) {
    prompt = `（承接上一轮，玩家选择了选项 ${input.selectedOption}）\n` + prompt;
  }

  return prompt;
}

/**
 * 解析 AI 输出，提取结构化数据
 */
export function parseGameOutput(rawOutput: string): {
  narrative: string;
  options: Array<{ index: number; text: string }>;
  newEntities: Array<{ name: string; type: string; description: string }>;
  itemChanges: Array<{ operation: string; name: string; quantity: number; owner?: string; category?: string }>;
  plotProgress: number;
} {
  let narrative = rawOutput;
  const options: Array<{ index: number; text: string }> = [];
  const newEntities: Array<{ name: string; type: string; description: string }> = [];
  const itemChanges: Array<{ operation: string; name: string; quantity: number; owner?: string; category?: string }> = [];
  let plotProgress = -1;

  // ── 提取选项（阿游 P1-1 重写）──
  // 基于「连续编号行块」判定选项区：避免把正文里的编号列表（如"1. 首先…"）误当选项；
  // 编号放宽 1–6；超界编号直接丢弃不残留；同一编号只取首次出现。
  const lines = narrative.split("\n");
  // 兼容阿拉伯数字与中文数字（一~六）编号，灭「模型用中文数字列选项却被当空、退回通用选项」的体验退化（阿游 Round4）
  const candidatePattern = /^([0-9]{1,2}|[一二三四五六])[\.、\s]+(.+)$/;
  const cnNum = CN_NUM;
  const candidates: Array<{ idx: number; text: string; lineNo: number }> = [];
  lines.forEach((line, i) => {
    const m = candidatePattern.exec(line);
    if (m) {
      const raw = m[1];
      const idx = /^\d+$/.test(raw) ? parseInt(raw, 10) : (cnNum[raw] ?? -1);
      if (idx > 0) candidates.push({ idx, text: m[2].trim(), lineNo: i });
    }
  });

  // 取最靠后的连续候选块（选项通常位于文末）
  let lastRun: typeof candidates = [];
  let cur: typeof candidates = [];
  for (let i = 0; i < candidates.length; i++) {
    if (cur.length === 0 || candidates[i].lineNo === candidates[i - 1].lineNo + 1) {
      cur.push(candidates[i]);
    } else {
      if (cur.length) lastRun = cur;
      cur = [candidates[i]];
    }
  }
  if (cur.length) lastRun = cur;

  const seenIdx = new Set<number>();
  for (const c of lastRun) {
    if (c.idx >= 1 && c.idx <= 6 && !seenIdx.has(c.idx)) {
      seenIdx.add(c.idx);
      options.push({ index: c.idx, text: c.text });
    }
  }
  options.sort((a, b) => a.index - b.index);

  // 若有选项块，截断 narrative 到该块首行之前
  if (lastRun.length > 0) {
    let firstLineStart = 0;
    const startLine = lastRun[0].lineNo;
    for (let i = 0; i < startLine; i++) firstLineStart += lines[i].length + 1;
    narrative = narrative.slice(0, firstLineStart).trim();
  }

  // ── 提取新实体（NE|格式）──
  const neSection = rawOutput.match(/===新实体===\s*\n([\s\S]*?)(?=\n\n|\n*$|===)/);
  if (neSection) {
    const neLines = neSection[1].split("\n").filter((l) => l.startsWith("NE|"));
    for (const line of neLines) {
      const parts = line.replace("NE|", "").split("|").map((s) => s.trim());
      if (parts.length >= 2) {
        newEntities.push({
          name: parts[0],
          type: parts[1] || "其他",
          description: parts[2] || "",
        });
      }
    }
    // 从 narrative 中移除 NE 部分
    narrative = narrative.replace(neSection[0], "").trim();
  }

  // ── 提取物品变动（CI|格式）──
  const ciSection = rawOutput.match(
    /===角色物品变动===\s*\n([\s\S]*?)(?=\n\n|\n*$|===)/
  );
  if (ciSection) {
    const ciLines = ciSection[1].split("\n").filter((l) => l.startsWith("CI|"));
    for (const line of ciLines) {
      const parts = line.replace("CI|", "").split("|").map((s) => s.trim());
      // P2：物品名缺失（如 CI|获得|）直接跳过空名，避免落库空物品
      if (parts.length < 2 || !parts[1]) {
        if (parts[0]) {
          console.warn(`[parseGameOutput] 跳过物品名为空的物品变动：${line}`);
        }
        continue;
      }
      const rawOp = parts[0];
      // P0 唯一归一化点：中文操作 → 英文枚举
      const op = OP_MAP[rawOp] ?? rawOp;
      if (!(rawOp in OP_MAP)) {
        console.warn(`[parseGameOutput] 未知操作「${rawOp}」，保留原值（引擎比较分支将不命中）：${line}`);
      }
      itemChanges.push({
        operation: op,
        name: parts[1],
        quantity: parseGameQuantity(parts[2]),
        owner: parts[3] ? parts[3] : undefined,
      });
    }
    narrative = narrative.replace(ciSection[0], "").trim();
  }

  // ── 提取情节进度 ──
  const progressMatch = rawOutput.match(/【情节进度[：:]\s*(\d+)%?】/);
  if (progressMatch) {
    plotProgress = parseInt(progressMatch[1]);
    narrative = narrative.replace(progressMatch[0], "").trim();
  }

  // 清理多余空行
  narrative = narrative.replace(/\n{3,}/g, "\n\n").trim();

  return { narrative, options, newEntities, itemChanges, plotProgress };
}

/**
 * 导出给 API 路由使用——缩减最近轮次的 narrative 用于 token 控制
 */
export function summarizeTurnsForContext(
  turns: Array<{ round: number; playerAction: string; narrative: string }>,
  maxTurns: number = 6
): string {
  if (turns.length === 0) return "";

  const recent = turns.slice(-maxTurns);
  return recent
    .map(
      (t) =>
        `【第${t.round}轮】玩家：${t.playerAction.slice(0, 60)} → AI：${t.narrative.slice(0, 200)}`
    )
    .join("\n");
}
