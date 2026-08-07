/**
 * 意图解析器 —— 自然语言 → 工具调用序列
 *
 * 纯规则引擎，不调 LLM，零 Token 消耗。
 * 用关键词 + 组合规则把用户消息拆成工具名 + 参数。
 *
 * 设计原则：
 *   - 优先精确匹配（角色名/章节号直接在消息中提取）
 *   - 关键词组合决定工具类型（查/改/删/创/写/分析）
 *   - 一条消息可以映射到 1-5 个工具调用
 *   - 未识别的意图返回空数组，由上游 LLM 兜底
 */

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export interface ParsedIntent {
  /** 工具名 */
  tool: string;
  /** 工具参数 */
  args: Record<string, unknown>;
  /** 置信度 0-1 */
  confidence: number;
  /** 匹配理由（调试用） */
  reason: string;
}

// ═══════════════════════════════════════════
// 关键词 → 工具映射表
// ═══════════════════════════════════════════

interface IntentRule {
  /** 触发关键词（任一命中即触发） */
  keywords: RegExp[];
  /** 对应的工具名 */
  tool: string;
  /** 参数提取函数：从消息中提取工具参数 */
  extractArgs: (message: string) => Record<string, unknown>;
  /** 基础置信度 */
  confidence: number;
}

/**
 * 意图规则库。
 * 按优先级排序——越靠前越优先匹配。
 * 一条消息可能匹配多条规则，全部返回。
 */
const INTENT_RULES: IntentRule[] = [
  // ── 查询类 ──
  {
    keywords: [
      /查[看询]?.{0,5}(角色|人物|主角|反派|导师)/,
      /(角色|人物|主角|反派|导师).{0,5}(信息|详情|完整|怎么|什么样)/,
      /(是谁|什么人|什么身份)/,
    ],
    tool: "character_get",
    extractArgs: (msg) => ({ query: extractNameAfter(msg, /查[看询]?|人物|角色|信息/) }),
    confidence: 0.85,
  },
  {
    keywords: [
      /(列出|所有|全部).{0,3}(角色|人物)/,
      /(角色|人物).{0,3}(列表|一览|全|都有谁)/,
      /有哪些.*角色/,
    ],
    tool: "character_list",
    extractArgs: (msg) => {
      const roleMatch = msg.match(/(主角|反派|导师|配角|恋人|背景)/);
      return roleMatch ? { role: roleMap(roleMatch[1]) } : {};
    },
    confidence: 0.9,
  },
  {
    keywords: [
      /(世界书|设定|世界观|lore|词条).{0,5}(查询|查看|搜索|找)/,
      /查.{0,5}(设定|世界书|词条|世界观)/,
      /有什么(设定|世界书)/,
    ],
    tool: "lore_get",
    extractArgs: (msg) => ({ keywords: extractKeywords(msg) }),
    confidence: 0.8,
  },
  {
    keywords: [
      /(列出|所有|全部).{0,3}(世界书|设定|词条)/,
      /(世界书|设定|词条).{0,3}(列表|一览)/,
    ],
    tool: "lore_list",
    extractArgs: (msg) => {
      const catMatch = msg.match(/(地理|势力|物品|功法|魔法|生物|文化|历史|法则)/);
      return catMatch ? { category: catMatch[1] } : {};
    },
    confidence: 0.9,
  },
  {
    keywords: [
      /(大纲|章节|结构|故事线|剧情).{0,5}(查看|列表|树|结构|怎样)/,
      /(看|查).{0,3}(大纲|章节结构|故事线)/,
    ],
    tool: "outline_list",
    extractArgs: () => ({}),
    confidence: 0.9,
  },
  {
    keywords: [
      /(伏笔|铺垫|悬念|埋线).{0,5}(查询|列表|查看|追踪|有哪些)/,
      /(有哪些|查|所有).{0,3}(伏笔|铺垫)/,
    ],
    tool: "foreshadowing_list",
    extractArgs: (msg) => {
      const statusMatch = msg.match(/(待回收|已回收|已兑现|废弃|逾期)/);
      if (statusMatch) {
        const map: Record<string, string> = { "待回收": "pending", "已回收": "fulfilled", "已兑现": "fulfilled", "废弃": "voided", "逾期": "pending" };
        return { status: map[statusMatch[1]] || "pending" };
      }
      return {};
    },
    confidence: 0.85,
  },
  {
    keywords: [
      /(正文|章节|内容|写到|写了).{0,5}(查看|读取|看|在哪|什么|怎样)/,
      /(看|读).{0,3}(正文|章节|上一章|最新)/,
      /上一章|最新章|最近.*章/,
    ],
    tool: "chapter_get",
    extractArgs: () => ({}),
    confidence: 0.8,
  },
  {
    keywords: [
      /(项目|作品).{0,3}(信息|概况|统计|进度|字数)/,
      /(统计|进度|字数|多少角色|多少章)/,
    ],
    tool: "project_info",
    extractArgs: () => ({}),
    confidence: 0.85,
  },
  {
    keywords: [
      /(规则|禁用词|限制).{0,3}(有哪些|列表|查看|查询)/,
    ],
    tool: "rule_list",
    extractArgs: () => ({}),
    confidence: 0.85,
  },
  {
    keywords: [
      /(文风|风格|文笔).{0,3}(设置|怎样|查看)/,
      /当前.*(文风|风格)/,
    ],
    tool: "style_get",
    extractArgs: () => ({}),
    confidence: 0.8,
  },
  {
    keywords: [
      /故事线.*列表|有哪些.*故事线/,
    ],
    tool: "storyline_list",
    extractArgs: (msg) => {
      const statusMatch = msg.match(/(进行中|已完成|暂停|放弃)/);
      // F6 修复（Round-7）：Storyline.status 合法值仅 active|completed|abandoned，
      // 原 "暂停"→"paused" 是无对应 DB 值的死枚举，会导致 storyline_list 查询永远空。
      // 收敛为 "abandoned"（业务上「暂停/放弃」同属非活跃终态），使查询命中合法值。
      const map: Record<string, string> = { "进行中": "active", "已完成": "completed", "暂停": "abandoned", "放弃": "abandoned" };
      return statusMatch ? { status: map[statusMatch[1]] } : {};
    },
    confidence: 0.8,
  },

  // ── 创建类 ──
  {
    keywords: [
      /(创建|新建|添加|加一个).{0,5}(角色|人物|新角色)/,
      /加一个.*角色|创建.*角色/,
    ],
    tool: "character_create",
    extractArgs: (msg) => {
      const nameMatch = msg.match(/(?:叫|名叫|名字是|名为)(.{1,10})(?:的|，|。|$)/);
      return { name: nameMatch ? nameMatch[1].trim() : extractNameAfter(msg, /创建|新建|添加|叫/) };
    },
    confidence: 0.85,
  },
  {
    keywords: [
      /(创建|新建|添加|加).{0,5}(世界书|设定|词条|条目)/,
    ],
    tool: "lore_create",
    extractArgs: (msg) => {
      const titleMatch = msg.match(/(?:叫|标题|名).{0,2}(.{1,15})(?:的|，|。|$)/);
      return { title: titleMatch ? titleMatch[1].trim() : extractNameAfter(msg, /创建|新建|添加/) };
    },
    confidence: 0.8,
  },
  {
    keywords: [
      /(创建|新建|添加|加).{0,5}(大纲|章节|节点)/,
    ],
    tool: "outline_create",
    extractArgs: (msg) => {
      const titleMatch = msg.match(/(?:叫|标题).{0,2}(.{1,20})(?:的|，|。|$)/);
      return { title: titleMatch ? titleMatch[1].trim() : extractNameAfter(msg, /创建|新建|添加/) };
    },
    confidence: 0.8,
  },
  {
    keywords: [
      /(创建|新建|添加|加|埋).{0,5}(伏笔|铺垫|悬念)/,
      /埋个.*(伏笔|铺垫)/,
    ],
    tool: "foreshadowing_create",
    extractArgs: (msg) => ({
      description: extractContentAfter(msg, /伏笔|铺垫|悬念/).slice(0, 200),
    }),
    confidence: 0.75,
  },

  // ── 修改类 ──
  {
    keywords: [
      /(修改|更新|改|调整).{0,5}(角色|人物)/,
      /把.{0,5}(角色|人物).{0,5}(改|修改|更新)/,
    ],
    tool: "character_update",
    extractArgs: (msg) => ({ characterId: extractIdFromMessage(msg) || "" }),
    confidence: 0.8,
  },
  {
    keywords: [
      /(修改|更新|改).{0,5}(世界书|设定|词条)/,
    ],
    tool: "lore_update",
    extractArgs: (msg) => ({ entryId: extractIdFromMessage(msg) || "" }),
    confidence: 0.8,
  },
  {
    keywords: [
      /(修改|更新|改).{0,5}(大纲|章节)/,
      /调整.*(大纲|章节)/,
    ],
    tool: "outline_update",
    extractArgs: (msg) => ({ nodeId: extractIdFromMessage(msg) || "" }),
    confidence: 0.8,
  },
  {
    keywords: [
      /(修改|更新|改|标记).{0,5}(伏笔)/,
      /(回收|兑现|废弃).{0,5}(伏笔)/,
    ],
    tool: "foreshadowing_update",
    extractArgs: (msg) => {
      const args: Record<string, unknown> = { foreshadowId: extractIdFromMessage(msg) || "" };
      if (msg.includes("回收") || msg.includes("兑现")) args.status = "fulfilled";
      if (msg.includes("废弃")) args.status = "voided";
      return args;
    },
    confidence: 0.75,
  },

  // ── 删除类 ──
  {
    keywords: [
      /(删除|删掉|移除).{0,5}(角色|人物)/,
    ],
    tool: "character_delete",
    extractArgs: (msg) => ({ characterId: extractIdFromMessage(msg) || "" }),
    confidence: 0.9,
  },
  {
    keywords: [
      /(删除|删掉|移除).{0,5}(世界书|设定|词条)/,
    ],
    tool: "lore_delete",
    extractArgs: (msg) => ({ entryId: extractIdFromMessage(msg) || "" }),
    confidence: 0.9,
  },
  {
    keywords: [
      /(删除|删掉|移除).{0,5}(大纲|章节|节点)/,
    ],
    tool: "outline_delete",
    extractArgs: (msg) => ({ nodeId: extractIdFromMessage(msg) || "" }),
    confidence: 0.9,
  },

  // ── 分析类 ──
  {
    keywords: [
      /(分析|检查|审核).{0,5}(章节|本章|正文)/,
      /检查.*(角色|能力|状态).*(变化|更新|遗漏)/,
    ],
    tool: "analyze_chapter",
    extractArgs: (msg) => {
      const instructionMatch = msg.match(/(?:重点|特别|主要).{0,5}(看|检查|分析)(.{1,20})/);
      return instructionMatch ? { instruction: instructionMatch[0] } : {};
    },
    confidence: 0.8,
  },
  {
    keywords: [
      /(分析|梳理|看).{0,5}(关系|关系网|角色关系|互动)/,
      /角色.*关系.*(分析|梳理)/,
    ],
    tool: "analyze_relationships",
    extractArgs: () => ({}),
    confidence: 0.8,
  },
  {
    keywords: [
      /同步.*关系|关系.*同步|(提取|导入).*关系/,
    ],
    tool: "relation_sync",
    extractArgs: () => ({ autoApply: true }),
    confidence: 0.75,
  },

  // ── 写作类 ──
  {
    keywords: [
      /(写|生成|开始写|创作).{0,5}(章节|正文|这一章|本章)/,
      /继续写|接着写|往下写/,
      /(写|生成).{0,10}(第.{1,3}章)/,
    ],
    tool: "chapter_generate",
    extractArgs: (msg) => ({
      instruction: extractContentAfter(msg, /写|生成|创作/).slice(0, 300),
      targetWords: msg.includes("短") ? 1500 : msg.includes("长") ? 4000 : 2500,
    }),
    confidence: 0.85,
  },
];

// ═══════════════════════════════════════════
// 主入口
// ═══════════════════════════════════════════

/**
 * 解析用户自然语言消息，返回工具调用序列。
 *
 * @param message  用户输入的自然语言
 * @returns 解析出的工具调用列表（可能为空——表示需要 LLM 兜底）
 */
export function parseIntents(message: string): ParsedIntent[] {
  if (!message || message.trim().length < 2) return [];

  const results: ParsedIntent[] = [];

  for (const rule of INTENT_RULES) {
    const matched = rule.keywords.some((re) => re.test(message));
    if (!matched) continue;

    const args = rule.extractArgs(message);
    results.push({
      tool: rule.tool,
      args,
      confidence: rule.confidence,
      reason: `关键词匹配: ${rule.tool}`,
    });
  }

  // 去重：同一工具只保留置信度最高的一条
  const bestByTool = new Map<string, ParsedIntent>();
  for (const r of results) {
    const existing = bestByTool.get(r.tool);
    if (!existing || r.confidence > existing.confidence) {
      bestByTool.set(r.tool, r);
    }
  }

  return [...bestByTool.values()].sort((a, b) => b.confidence - a.confidence);
}

/**
 * 判断是否完全无法解析——需要 LLM 兜底。
 */
export function needsLLMFallback(intents: ParsedIntent[]): boolean {
  return intents.length === 0 || intents.every((i) => i.confidence < 0.6);
}

// ═══════════════════════════════════════════
// 辅助：从消息中提取参数
// ═══════════════════════════════════════════

/** 提取 ID 模式（UUID 或 cuid） */
function extractIdFromMessage(msg: string): string | null {
  const match = msg.match(/[a-z0-9]{20,}/i);
  return match ? match[0] : null;
}

/** 提取"叫XX"/"名为XX"中的名称 */
function extractNameAfter(msg: string, after: RegExp): string {
  // 尝试匹配"叫XXX"
  const callMatch = msg.match(/(?:叫|名叫|名字是|名为)(.{1,10})(?:的|，|。|,|$)/);
  if (callMatch) return callMatch[1].trim();

  // 尝试匹配引号中的内容
  const quoteMatch = msg.match(/[「「](.{1,10})[」」]/);
  if (quoteMatch) return quoteMatch[1].trim();

  // 取 after 后的非标点文本
  const parts = msg.split(after);
  if (parts.length > 1) {
    const rest = parts[parts.length - 1].trim();
    const end = rest.search(/[，。！？,\.!\?\n]/);
    return end > 0 ? rest.slice(0, end).trim() : rest.slice(0, 15).trim();
  }

  return "";
}

/** 提取内容描述（用于伏笔/大纲等） */
function extractContentAfter(msg: string, marker: RegExp): string {
  const parts = msg.split(marker);
  if (parts.length > 1) {
    return parts[parts.length - 1].trim().slice(0, 300);
  }
  return msg.slice(0, 300);
}

/** 提取关键词（逗号分隔或自然语言） */
function extractKeywords(msg: string): string {
  // 提取引号中的内容
  const quotes = msg.match(/[「「]([^」」]+)[」」]/g);
  if (quotes && quotes.length > 0) {
    return quotes.map((q) => q.replace(/[「「」」]/g, "").trim()).join(",");
  }
  // 取"查"后面的内容，截断到标点
  const parts = msg.split(/[查找搜索]\s*/);
  return parts.length > 1 ? parts[parts.length - 1].split(/[，。！？]/)[0].trim().slice(0, 50) : "";
}

/** 中文角色类型 → 英文枚举 */
function roleMap(cn: string): string {
  const map: Record<string, string> = {
    "主角": "protagonist", "反派": "antagonist", "导师": "mentor",
    "配角": "supporting", "恋人": "love_interest",
    "催化剂": "catalyst", "背景": "background",
  };
  return map[cn] || cn;
}
