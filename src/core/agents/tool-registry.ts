/**
 * Agent 工具注册表 —— 让 LLM 接管所有页面按钮的功能
 *
 * 用户对 AI 说一句话 → LLM 自动选工具 → 操作数据库 → 返回结果。
 * 覆盖：角色 / 世界书 / 大纲 / 正文 / 伏笔 / 实体检测 / 项目信息。
 *
 * 总共 21 个工具，覆盖全部 CRUD 操作。
 */

import type { CharacterCard, LorebookEntry, PendingCommitment } from "@/core/types";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

/** OpenAI 兼容的 function schema */
export interface ToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, {
      type: string;
      description: string;
      enum?: string[];
    }>;
    required: string[];
  };
}

/** 工具执行上下文——注入所有依赖（服务端运行时提供） */
export interface ToolContext {
  projectId: string;
  /** Prisma 客户端实例（用于所有数据库操作） */
  prisma: any;
  /** 按名称模糊查角色 */
  findCharacters: (query: string) => Promise<CharacterCard[]>;
  /** 按关键词查世界书 */
  findLore: (keywords: string[]) => Promise<LorebookEntry[]>;
  /** 查伏笔 */
  findForeshadowing: (description: string) => Promise<PendingCommitment[]>;
  /** 扫描正文实体 */
  detectEntities: (text: string) => Promise<Array<{ name: string; type: string; confidence: number }>>;
}

/** 工具执行结果 */
export interface ToolResult {
  toolName: string;
  success: boolean;
  data: unknown;
  error?: string;
  /** 特殊标记：需要前端触发的动作（如 chapter_generate → 弹出写作面板） */
  frontendAction?: { type: string; payload: unknown };
}

/** 工具定义：schema + 执行函数 */
export interface ToolDefinition {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
}

// ═══════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════

/** 快速成功返回 */
function ok(toolName: string, data: unknown, frontendAction?: ToolResult["frontendAction"]): ToolResult {
  return { toolName, success: true, data, frontendAction };
}

/** 快速失败返回 */
function fail(toolName: string, error: string): ToolResult {
  return { toolName, success: false, data: null, error };
}

/** 安全字符串截断 */
function clip(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

// ═══════════════════════════════════════════
// 注册表
// ═══════════════════════════════════════════

class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(def: ToolDefinition) {
    this.tools.set(def.schema.name, def);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  getAllSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  async execute(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) return fail(name, `未知工具: ${name}`);
    try {
      return await tool.execute(args, ctx);
    } catch (err) {
      return fail(name, String(err));
    }
  }
}

export const toolRegistry = new ToolRegistry();

// ═══════════════════════════════════════════
// ── 1. 角色管理 (5 tools) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "character_list",
    description: "列出当前项目的全部角色（可按角色类型筛选）。返回角色名、定位、状态等基本信息。",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", description: "角色类型筛选（protagonist/antagonist/mentor/supporting/love_interest/catalyst/background），不传则返回全部", enum: ["protagonist", "antagonist", "mentor", "supporting", "love_interest", "catalyst", "background"] },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const role = args.role as string | undefined;
    const where: any = { projectId: ctx.projectId };
    if (role) where.role = role;
    const chars = await ctx.prisma.characterCard.findMany({ where, orderBy: { updatedAt: "desc" } });
    const list = chars.map((c: any) => ({
      id: c.id, name: c.name, role: c.role, aliases: c.aliases,
      currentStatus: c.currentStatus, arcProgress: clip(c.arcProgress || "", 80),
    }));
    return ok("character_list", { total: list.length, characters: list });
  },
});

toolRegistry.register({
  schema: {
    name: "character_get",
    description: "查询单个角色的完整信息——性格、外貌、对话风格、关系网、时间线、弧光进度等。",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "角色名或别名（支持模糊匹配，返回最匹配的一个）" },
      },
      required: ["query"],
    },
  },
  execute: async (args, ctx) => {
    const query = String(args.query || "").trim().toLowerCase();
    if (!query) return fail("character_get", "查询为空");
    const chars = await ctx.prisma.characterCard.findMany({ where: { projectId: ctx.projectId } });
    // 精确匹配优先，然后模糊
    let found = chars.find((c: any) => c.name.toLowerCase() === query);
    if (!found) found = chars.find((c: any) => c.name.toLowerCase().includes(query));
    if (!found) found = chars.find((c: any) => (c.aliases || []).some((a: string) => a.toLowerCase().includes(query)));
    if (!found) return ok("character_get", { found: false, message: `未找到匹配"${query}"的角色` });
    const c = found;
    return ok("character_get", {
      found: true,
      character: {
        id: c.id, name: c.name, role: c.role, aliases: c.aliases,
        age: c.age, gender: c.gender,
        appearance: c.appearance,
        personality: c.personality,
        dialogueStyle: c.dialogueStyle,
        background: clip(c.background || "", 300),
        hiddenMotives: c.hiddenMotives,
        currentStatus: c.currentStatus,
        arcProgress: c.arcProgress,
        abilities: c.abilities,
        relationships: (c.relationships || []).map((r: any) => ({
          target: r.targetCharacterId || r.targetName, relation: r.relation, dynamic: r.dynamic,
        })),
        timeline: (c.timeline || []).slice(-10),
        tags: c.tags,
      },
    });
  },
});

toolRegistry.register({
  schema: {
    name: "character_create",
    description: "创建新角色。至少需要提供姓名，其他字段可选。支持快速导入（一段原文描述自动提取信息）。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "角色名（必填）" },
        role: { type: "string", description: "角色定位", enum: ["protagonist", "antagonist", "mentor", "supporting", "love_interest", "catalyst", "background"] },
        age: { type: "string", description: "年龄（可写范围如'16-18'或'未知'）" },
        gender: { type: "string", description: "性别" },
        personality: { type: "string", description: "性格关键词，逗号分隔" },
        background: { type: "string", description: "背景故事摘要" },
        currentStatus: { type: "string", description: "当前状态", enum: ["alive", "dead", "missing", "incapacitated", "presumed_dead", "transformed"] },
        aliases: { type: "string", description: "别名/称号，逗号分隔" },
        abilities: { type: "string", description: "能力/技能，逗号分隔" },
        quickImportContent: { type: "string", description: "快速导入原文——AI 从一段描述中提取角色信息" },
      },
      required: ["name"],
    },
  },
  execute: async (args, ctx) => {
    const name = String(args.name || "").trim();
    if (!name) return fail("character_create", "角色名不能为空");

    // 检查重名
    const existing = await ctx.prisma.characterCard.findFirst({
      where: { projectId: ctx.projectId, name: { equals: name, mode: "insensitive" } },
    });
    if (existing) return fail("character_create", `角色"${name}"已存在（ID: ${existing.id}），请用 character_update 修改`);

    const personalityArr = args.personality ? String(args.personality).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [];
    const aliasesArr = args.aliases ? String(args.aliases).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [];
    const abilitiesArr = args.abilities ? String(args.abilities).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [];

    const created = await ctx.prisma.characterCard.create({
      data: {
        projectId: ctx.projectId,
        name,
        role: (args.role as string) || "supporting",
        age: (args.age as string) || "未知",
        gender: (args.gender as string) || "未知",
        personality: personalityArr.length > 0 ? personalityArr : ["待完善"],
        background: (args.background as string) || "",
        currentStatus: (args.currentStatus as string) || "alive",
        aliases: aliasesArr,
        abilities: abilitiesArr,
        quickImportContent: (args.quickImportContent as string) || "",
        hiddenMotives: [],
        relationships: [],
        tags: ["🆕 Agent创建"],
        timeline: [],
        reviewStatus: "pending",
      },
    });
    return ok("character_create", {
      created: { id: created.id, name: created.name, role: created.role },
      message: `角色"${name}"创建成功，ID: ${created.id}`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "character_update",
    description: "修改已有角色的属性。只传需要修改的字段，未传字段保持不变。",
    parameters: {
      type: "object",
      properties: {
        characterId: { type: "string", description: "角色ID（从 character_list 或 character_get 获取）" },
        name: { type: "string", description: "新角色名" },
        role: { type: "string", description: "角色定位", enum: ["protagonist", "antagonist", "mentor", "supporting", "love_interest", "catalyst", "background"] },
        personality: { type: "string", description: "性格关键词，逗号分隔（会替换原性格）" },
        background: { type: "string", description: "背景故事" },
        currentStatus: { type: "string", description: "当前状态", enum: ["alive", "dead", "missing", "incapacitated", "presumed_dead", "transformed"] },
        arcProgress: { type: "string", description: "弧光进展描述" },
        aliases: { type: "string", description: "别名/称号，逗号分隔（会替换原别名）" },
        abilities: { type: "string", description: "能力/技能，逗号分隔（会替换原能力）" },
      },
      required: ["characterId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.characterId || "");
    const existing = await ctx.prisma.characterCard.findUnique({ where: { id } });
    if (!existing) return fail("character_update", `角色不存在（ID: ${id}）`);

    const data: any = {};
    if (args.name) data.name = String(args.name);
    if (args.role) data.role = String(args.role);
    if (args.personality) data.personality = String(args.personality).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
    if (args.background) data.background = String(args.background);
    if (args.currentStatus) data.currentStatus = String(args.currentStatus);
    if (args.arcProgress) data.arcProgress = String(args.arcProgress);
    if (args.aliases) data.aliases = String(args.aliases).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
    if (args.abilities) data.abilities = String(args.abilities).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);

    if (Object.keys(data).length === 0) return fail("character_update", "没有要修改的字段");

    await ctx.prisma.characterCard.update({ where: { id }, data });
    return ok("character_update", {
      updated: { id, name: data.name || existing.name, changedFields: Object.keys(data) },
      message: `角色"${existing.name}"已更新（${Object.keys(data).join("、")}）`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "character_delete",
    description: "删除角色（不可逆）。会同时清除该角色与其他角色的关系引用。",
    parameters: {
      type: "object",
      properties: {
        characterId: { type: "string", description: "要删除的角色ID" },
      },
      required: ["characterId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.characterId || "");
    const existing = await ctx.prisma.characterCard.findUnique({ where: { id } });
    if (!existing) return fail("character_delete", `角色不存在（ID: ${id}）`);
    await ctx.prisma.characterCard.delete({ where: { id } });
    return ok("character_delete", { deleted: { id, name: existing.name }, message: `角色"${existing.name}"已删除` });
  },
});

// ═══════════════════════════════════════════
// ── 2. 世界书 (5 tools) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "lore_list",
    description: "列出世界书设定条目，可按分类筛选。分类包括：geography(地理)、faction(势力)、item(物品)、magic_system(力量体系)、technique(功法)、creature(生物)、culture(文化)、history(历史)、law(法则)、custom(自定义)。",
    parameters: {
      type: "object",
      properties: {
        category: { type: "string", description: "分类筛选", enum: ["geography", "faction", "item", "magic_system", "technique", "creature", "culture", "history", "law", "currency", "character_relationship", "fate_system", "physics", "public_system", "custom"] },
        enabled: { type: "boolean", description: "只显示启用的词条（默认 true）" },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const where: any = { projectId: ctx.projectId };
    if (args.category) where.category = String(args.category);
    if (args.enabled !== false) where.enabled = true;
    const entries = await ctx.prisma.lorebookEntry.findMany({ where, orderBy: { updatedAt: "desc" } });
    const list = entries.map((e: any) => ({
      id: e.id, title: e.title, category: e.category, keys: e.keys,
      content: clip(e.content || "", 150), enabled: e.enabled, insertionOrder: e.insertionOrder,
    }));
    return ok("lore_list", { total: list.length, entries: list });
  },
});

toolRegistry.register({
  schema: {
    name: "lore_get",
    description: "按关键词查询世界书设定条目，返回完整内容。用于 AI 写作前了解世界观。",
    parameters: {
      type: "object",
      properties: {
        keywords: { type: "string", description: "查询关键词，多个用逗号分隔" },
        category: { type: "string", description: "可选：限定分类", enum: ["geography", "faction", "item", "magic_system", "technique", "creature", "culture", "history", "law", "currency", "character_relationship", "fate_system", "physics", "public_system", "custom"] },
      },
      required: ["keywords"],
    },
  },
  execute: async (args, ctx) => {
    const raw = String(args.keywords || "");
    const keywords = raw.split(/[,，]/).map((k: string) => k.trim()).filter(Boolean);
    if (keywords.length === 0) return fail("lore_get", "关键词为空");
    const entries = await ctx.findLore(keywords);
    if (args.category) {
      const cat = String(args.category);
      return ok("lore_get", { entries: entries.filter((e: any) => e.category === cat).map((e: any) => ({
        id: e.id, title: e.title, category: e.category, content: e.content, keys: e.keys,
      })) });
    }
    return ok("lore_get", { entries: entries.map((e: any) => ({
      id: e.id, title: e.title, category: e.category, content: e.content, keys: e.keys,
    })) });
  },
});

toolRegistry.register({
  schema: {
    name: "lore_create",
    description: "创建新的世界书设定条目。用于添加世界观设定、势力、物品、功法等。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "词条标题（必填）" },
        category: { type: "string", description: "分类", enum: ["geography", "faction", "item", "magic_system", "technique", "creature", "culture", "history", "law", "currency", "character_relationship", "fate_system", "physics", "public_system", "custom"] },
        content: { type: "string", description: "设定内容" },
        keys: { type: "string", description: "触发关键词，逗号分隔（正文出现这些词时自动注入该设定）" },
        insertionOrder: { type: "number", description: "插入优先级 0-100，越大越靠前" },
      },
      required: ["title"],
    },
  },
  execute: async (args, ctx) => {
    const title = String(args.title || "").trim();
    if (!title) return fail("lore_create", "标题不能为空");
    const existing = await ctx.prisma.lorebookEntry.findFirst({
      where: { projectId: ctx.projectId, title: { equals: title, mode: "insensitive" } },
    });
    if (existing) return fail("lore_create", `词条"${title}"已存在（ID: ${existing.id}）`);
    const keysArr = args.keys ? String(args.keys).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [];
    // 中英文分类映射
    const CATEGORY_MAP: Record<string, string> = {
      "势力": "faction", "宗门": "faction", "组织": "faction", "帮派": "faction", "家族": "faction",
      "地理": "geography", "地点": "geography", "城市": "geography", "大陆": "geography",
      "物品": "item", "法宝": "item", "丹药": "item", "武器": "item",
      "魔法": "magic_system", "力量体系": "magic_system", "修炼体系": "magic_system",
      "功法": "technique", "技能": "technique", "武技": "technique",
      "生物": "creature", "种族": "creature", "妖兽": "creature",
      "文化": "culture", "风俗": "culture",
      "历史": "history", "事件": "history",
      "法则": "law", "规则": "law",
      "货币": "currency", "灵石": "currency", "经济": "currency",
      "命运": "fate_system", "天命": "fate_system", "因果": "fate_system", "预言": "fate_system",
      "物理": "physics", "物理规则": "physics", "时空": "physics",
      "公开": "public_system", "制度": "public_system", "律法": "public_system", "阶级": "public_system",
      "角色关系": "character_relationship", "关系": "character_relationship",
    };
    const rawCategory = (args.category as string) || "custom";
    const mappedCategory = CATEGORY_MAP[rawCategory] || rawCategory;

    const created = await ctx.prisma.lorebookEntry.create({
      data: {
        projectId: ctx.projectId,
        title,
        category: mappedCategory,
        content: (args.content as string) || "",
        keys: keysArr,
        insertionOrder: (args.insertionOrder as number) || 50,
        enabled: true,
        relatedEntryIds: [],
        reviewStatus: "pending",
      },
    });
    return ok("lore_create", {
      created: { id: created.id, title: created.title, category: created.category },
      message: `词条"${title}"创建成功`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "lore_update",
    description: "修改已有世界书条目的标题、内容、分类或关键词。",
    parameters: {
      type: "object",
      properties: {
        entryId: { type: "string", description: "词条ID" },
        title: { type: "string", description: "新标题" },
        category: { type: "string", description: "新分类", enum: ["geography", "faction", "item", "magic_system", "technique", "creature", "culture", "history", "law", "currency", "character_relationship", "fate_system", "physics", "public_system", "custom"] },
        content: { type: "string", description: "新内容" },
        keys: { type: "string", description: "触发关键词，逗号分隔（会替换原关键词）" },
      },
      required: ["entryId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.entryId || "");
    const existing = await ctx.prisma.lorebookEntry.findUnique({ where: { id } });
    if (!existing) return fail("lore_update", `词条不存在（ID: ${id}）`);
    const data: any = {};
    if (args.title) data.title = String(args.title);
    if (args.category) {
      const rawCat = String(args.category);
      const CAT_MAP: Record<string, string> = {
        "势力": "faction", "宗门": "faction", "组织": "faction", "帮派": "faction", "家族": "faction",
        "地理": "geography", "地点": "geography", "物品": "item", "功法": "technique", "技能": "technique",
        "魔法": "magic_system", "力量体系": "magic_system", "生物": "creature", "种族": "creature",
        "文化": "culture", "历史": "history", "法则": "law",
        "货币": "currency", "灵石": "currency",
        "命运": "fate_system", "天命": "fate_system", "因果": "fate_system", "预言": "fate_system",
        "物理": "physics", "物理规则": "physics", "时空": "physics",
        "公开": "public_system", "制度": "public_system", "律法": "public_system", "阶级": "public_system",
        "角色关系": "character_relationship", "关系": "character_relationship",
      };
      data.category = CAT_MAP[rawCat] || rawCat;
    }
    if (args.content !== undefined) data.content = String(args.content);
    if (args.keys) data.keys = String(args.keys).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean);
    if (Object.keys(data).length === 0) return fail("lore_update", "没有要修改的字段");
    await ctx.prisma.lorebookEntry.update({ where: { id }, data });
    return ok("lore_update", {
      updated: { id, title: data.title || existing.title, changedFields: Object.keys(data) },
      message: `词条"${existing.title}"已更新`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "lore_delete",
    description: "删除世界书条目（不可逆）。",
    parameters: {
      type: "object",
      properties: { entryId: { type: "string", description: "要删除的词条ID" } },
      required: ["entryId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.entryId || "");
    const existing = await ctx.prisma.lorebookEntry.findUnique({ where: { id } });
    if (!existing) return fail("lore_delete", `词条不存在（ID: ${id}）`);
    await ctx.prisma.lorebookEntry.delete({ where: { id } });
    return ok("lore_delete", { deleted: { id, title: existing.title }, message: `词条"${existing.title}"已删除` });
  },
});

// ═══════════════════════════════════════════
// ── 3. 大纲 (4 tools) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "outline_list",
    description: "查看项目的大纲树结构——卷→章→节层级，含标题、状态、字数。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const nodes = await ctx.prisma.storyNode.findMany({
      where: { projectId: ctx.projectId, deletedAt: null },
      orderBy: { order: "asc" },
    });
    // 构建树形结构
    const roots = nodes.filter((n: any) => !n.parentId);
    const buildTree = (parent: any): any => ({
      id: parent.id, title: parent.title, type: parent.type, order: parent.order,
      status: parent.status, wordCount: parent.wordCount,
      outline: clip(parent.outline || "", 100),
      children: nodes.filter((n: any) => n.parentId === parent.id).map(buildTree),
    });
    const tree = roots.map(buildTree);
    return ok("outline_list", { total: nodes.length, outline: tree });
  },
});

toolRegistry.register({
  schema: {
    name: "outline_create",
    description: "在大纲树中创建新节点（卷/章/节）。可指定父节点。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "节点标题（必填）" },
        type: { type: "string", description: "节点类型", enum: ["volume", "chapter", "section", "scene"] },
        parentId: { type: "string", description: "父节点ID（不传则创建为根节点/卷）" },
        outline: { type: "string", description: "节点大纲/摘要" },
        order: { type: "number", description: "排序序号（默认自动追加到末尾）" },
      },
      required: ["title"],
    },
  },
  execute: async (args, ctx) => {
    const title = String(args.title || "").trim();
    if (!title) return fail("outline_create", "标题不能为空");
    const nodeType = (args.type as string) || "chapter";

    // 自动计算 order
    let order = args.order as number | undefined;
    if (order === undefined) {
      const siblings = await ctx.prisma.storyNode.findMany({
        where: { projectId: ctx.projectId, parentId: (args.parentId as string) || null, deletedAt: null },
        orderBy: { order: "desc" }, take: 1,
      });
      order = siblings.length > 0 ? siblings[0].order + 1 : 1;
    }

    const created = await ctx.prisma.storyNode.create({
      data: {
        projectId: ctx.projectId,
        parentId: (args.parentId as string) || null,
        title, type: nodeType, order: order || 1,
        outline: (args.outline as string) || "",
        status: "outline_only",
        wordCount: 0, revisionCount: 0,
        isMainBranch: true,
        activeCharacters: [], activeLoreIds: [],
      },
    });
    return ok("outline_create", {
      created: { id: created.id, title, type: nodeType, order: created.order },
      message: `大纲节点"${title}"创建成功`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "outline_update",
    description: "修改大纲节点的标题、大纲内容或状态。",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "节点ID" },
        title: { type: "string", description: "新标题" },
        outline: { type: "string", description: "新大纲/摘要文本" },
        status: { type: "string", description: "新状态", enum: ["outline_only", "drafting", "completed", "reviewing", "rejected", "revised"] },
      },
      required: ["nodeId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.nodeId || "");
    const existing = await ctx.prisma.storyNode.findUnique({ where: { id } });
    if (!existing) return fail("outline_update", `节点不存在（ID: ${id}）`);
    // #123 软删防复活：已移入回收站的节点不允许更新，避免污染 tombstone
    if (existing.deletedAt) return fail("outline_update", "节点已被删除（回收站），无法更新。如需操作请先从回收站恢复");
    const data: any = {};
    if (args.title) data.title = String(args.title);
    if (args.outline !== undefined) data.outline = String(args.outline);
    if (args.status) data.status = String(args.status);
    if (Object.keys(data).length === 0) return fail("outline_update", "没有要修改的字段");
    await ctx.prisma.storyNode.update({ where: { id }, data });
    return ok("outline_update", {
      updated: { id, title: data.title || existing.title, changedFields: Object.keys(data) },
      message: `节点"${existing.title}"已更新`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "outline_delete",
    description: "删除大纲节点（不可逆）。如果节点有子节点，会一并删除。",
    parameters: {
      type: "object",
      properties: { nodeId: { type: "string", description: "要删除的节点ID" } },
      required: ["nodeId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.nodeId || "");
    const existing = await ctx.prisma.storyNode.findUnique({ where: { id } });
    if (!existing) return fail("outline_delete", `节点不存在（ID: ${id}）`);
    // 递归软删子节点（与前端/API DELETE 一致，不绕过回收站）
    const softDeleteChildren = async (parentId: string) => {
      const children = await ctx.prisma.storyNode.findMany({ where: { parentId } });
      for (const child of children) {
        await softDeleteChildren(child.id);
        await ctx.prisma.storyNode.updateMany({ where: { id: child.id }, data: { deletedAt: new Date() } });
      }
    };
    await softDeleteChildren(id);
    await ctx.prisma.storyNode.updateMany({ where: { id }, data: { deletedAt: new Date() } });
    return ok("outline_delete", { deleted: { id, title: existing.title }, message: `节点"${existing.title}"及其子节点已删除` });
  },
});

// ═══════════════════════════════════════════
// ── 4. 伏笔 (3 tools) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "foreshadowing_list",
    description: "列出项目的全部伏笔/承诺，按状态分组。用于追踪哪些伏笔待回收、哪些已兑现。",
    parameters: {
      type: "object",
      properties: {
        status: { type: "string", description: "按状态筛选", enum: ["pending", "detected", "partially_fulfilled", "fulfilled", "voided"] },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const where: any = { projectId: ctx.projectId };
    if (args.status) where.status = String(args.status);
    const items = await ctx.prisma.pendingCommitment.findMany({ where, orderBy: { createdAt: "desc" } });
    const list = items.map((f: any) => ({
      id: f.id, description: f.description, status: f.status, priority: f.priority,
      source: f.source, fulfillmentRatio: f.fulfillmentRatio,
      fulfilledChapterId: f.fulfilledChapterId,
      createdAt: f.createdAt,
    }));
    return ok("foreshadowing_list", { total: list.length, foreshadowings: list });
  },
});

// IMP-009：从伏笔描述抽取候选闭环关键词（连续中文片段 ≥2 字），供 detectPayoffs 的
// closureConditions 精准命中使用，避免 closureConditions 恒为 [] 导致检测退化。
function deriveClosureConditions(description: string): string[] {
  if (!description) return [];
  const segments = description.match(/[一-鿿]{2,}/g) || [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of segments) {
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= 8) break; // 限度数，避免噪声
  }
  return out;
}

toolRegistry.register({
  schema: {
    name: "foreshadowing_create",
    description: "创建新伏笔/承诺。用于记录需要在后续章节回收的剧情线索。",
    parameters: {
      type: "object",
      properties: {
        description: { type: "string", description: "伏笔描述（必填）——埋了什么线？预期什么时候回收？" },
        priority: { type: "string", description: "重要程度", enum: ["high", "medium", "low"] },
        entityIds: { type: "string", description: "关联角色ID，逗号分隔" },
      },
      required: ["description"],
    },
  },
  execute: async (args, ctx) => {
    const description = String(args.description || "").trim();
    if (!description) return fail("foreshadowing_create", "描述不能为空");
    const entityIds = args.entityIds ? String(args.entityIds).split(/[,，]/).map((s: string) => s.trim()).filter(Boolean) : [];
    const created = await ctx.prisma.pendingCommitment.create({
      data: {
        projectId: ctx.projectId,
        source: "user_intent", priority: (args.priority as string) || "medium",
        description, entityIds, closureConditions: deriveClosureConditions(description),
        status: "pending", fulfillmentRatio: 0, statusHistory: [],
        partiallyFulfilledIds: [],
      },
    });
    return ok("foreshadowing_create", {
      created: { id: created.id, description: clip(description, 100), priority: created.priority },
      message: `伏笔创建成功`,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "foreshadowing_update",
    description: "修改伏笔状态（如标记为已回收、废弃等）或更新描述。",
    parameters: {
      type: "object",
      properties: {
        foreshadowId: { type: "string", description: "伏笔ID" },
        status: { type: "string", description: "新状态", enum: ["pending", "detected", "partially_fulfilled", "fulfilled", "voided"] },
        description: { type: "string", description: "更新描述" },
        fulfillmentRatio: { type: "number", description: "兑现比例 0.0~1.0" },
      },
      required: ["foreshadowId"],
    },
  },
  execute: async (args, ctx) => {
    const id = String(args.foreshadowId || "");
    const existing = await ctx.prisma.pendingCommitment.findUnique({ where: { id } });
    if (!existing) return fail("foreshadowing_update", `伏笔不存在（ID: ${id}）`);
    const data: any = {};
    if (args.status) {
      data.status = String(args.status);
      if (args.status === "fulfilled") { data.fulfillmentRatio = 1.0; data.fulfilledAt = new Date(); }
      if (args.status === "voided") data.voidedAt = new Date();
    }
    if (args.description) data.description = String(args.description);
    if (args.fulfillmentRatio !== undefined) data.fulfillmentRatio = Number(args.fulfillmentRatio);
    if (Object.keys(data).length === 0) return fail("foreshadowing_update", "没有要修改的字段");
    await ctx.prisma.pendingCommitment.update({ where: { id }, data });
    return ok("foreshadowing_update", {
      updated: { id, changedFields: Object.keys(data) },
      message: `伏笔已更新（${Object.keys(data).join("、")}）`,
    });
  },
});

// ═══════════════════════════════════════════
// ── 5. 正文 (2 tools) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "chapter_get",
    description: "查询指定章节的已写正文内容。如果章节尚未生成，返回大纲信息。",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "章节节点ID（不传则返回最新一章）" },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    let node;
    if (args.nodeId) {
      node = await ctx.prisma.storyNode.findUnique({ where: { id: String(args.nodeId) } });
    } else {
      const nodes = await ctx.prisma.storyNode.findMany({
        where: { projectId: ctx.projectId, type: "chapter", deletedAt: null },
        orderBy: { order: "desc" }, take: 1,
      });
      node = nodes[0] || null;
    }
    if (!node) return fail("chapter_get", "未找到章节");
    return ok("chapter_get", {
      id: node.id, title: node.title, type: node.type, order: node.order,
      status: node.status, wordCount: node.wordCount,
      outline: node.outline,
      content: node.content ? clip(node.content, 2000) : null,
      hasContent: !!node.content,
    });
  },
});

toolRegistry.register({
  schema: {
    name: "chapter_generate",
    description: "触发 AI 写作面板，为指定章节生成正文。这个工具会通知前端弹出写作面板——AI 不会直接返回正文，而是让用户在专用面板中查看和采纳。",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "要生成正文的章节节点ID" },
        instruction: { type: "string", description: "写作指令——告诉 AI 本章要写什么、重点是什么" },
        targetWords: { type: "number", description: "目标字数（默认 2500）" },
      },
      required: ["nodeId"],
    },
  },
  execute: async (args, ctx) => {
    const nodeId = String(args.nodeId || "");
    const node = await ctx.prisma.storyNode.findUnique({ where: { id: nodeId } });
    if (!node) return fail("chapter_generate", `节点不存在（ID: ${nodeId}）`);
    return ok("chapter_generate", {
      nodeId, title: node.title,
      instruction: (args.instruction as string) || "按大纲撰写正文",
      targetWords: (args.targetWords as number) || 2500,
      message: `写作面板已就绪——为「${node.title}」生成正文`,
    }, {
      type: "open_write_panel",
      payload: { nodeId, instruction: args.instruction, targetWords: args.targetWords },
    });
  },
});

// ═══════════════════════════════════════════
// ── 6. 实体检测 (保留原工具) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "detect_entities",
    description: "扫描正文片段，检测其中引用的角色名、地名、物品名等实体。返回实体名、类型和置信度。",
    parameters: {
      type: "object",
      properties: {
        text: { type: "string", description: "要扫描的正文片段" },
      },
      required: ["text"],
    },
  },
  execute: async (args, ctx) => {
    const text = String(args.text || "");
    if (!text.trim()) return fail("detect_entities", "文本为空");
    const entities = await ctx.detectEntities(text);
    return ok("detect_entities", { entities });
  },
});

// ═══════════════════════════════════════════
// ── 7. 项目信息 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "project_info",
    description: "查看当前项目的基本信息——名称、类型、总纲、字数统计、角色/词条/章节数量。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const [project, charCount, loreCount, nodeCount] = await Promise.all([
      ctx.prisma.project.findUnique({ where: { id: ctx.projectId } }),
      ctx.prisma.characterCard.count({ where: { projectId: ctx.projectId } }),
      ctx.prisma.lorebookEntry.count({ where: { projectId: ctx.projectId, enabled: true } }),
      ctx.prisma.storyNode.count({ where: { projectId: ctx.projectId, deletedAt: null } }),
    ]);
    if (!project) return fail("project_info", "项目不存在");
    const totalWords = await ctx.prisma.storyNode.aggregate({
      where: { projectId: ctx.projectId, deletedAt: null },
      _sum: { wordCount: true },
    });
    return ok("project_info", {
      name: project.name, genre: project.genre, synopsis: clip(project.synopsis || "", 300),
      toneKeywords: project.toneKeywords, targetWordCount: project.targetWordCount,
      stats: {
        characters: charCount, loreEntries: loreCount, storyNodes: nodeCount,
        totalWords: totalWords._sum.wordCount || 0,
      },
    });
  },
});

// ═══════════════════════════════════════════
// ── 8. 故事线 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "storyline_list",
    description: "列出项目的全部故事线（主线+支线），含进度、欲望/阻碍/行动/结果/转折/反转/结局。用于了解剧情脉络。",
    parameters: {
      type: "object",
      properties: {
        // F6 修复（Round-7）：移除 "paused"（Storyline.status 无此合法值，属死枚举，会误导 LLM 传入）。
        status: { type: "string", description: "按状态筛选", enum: ["active", "completed", "abandoned"] },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const where: any = { projectId: ctx.projectId };
    if (args.status) where.status = String(args.status);
    const storylines = await ctx.prisma.storyline.findMany({ where, orderBy: { order: "asc" } });
    const list = storylines.map((s: any) => ({
      id: s.id, title: s.title, type: s.type, status: s.status, order: s.order,
      description: s.description,
      progress: { desire: s.desire, obstacle: s.obstacle, action: s.action, result: s.result, twist: s.twist, turn: s.turn, ending: s.ending },
    }));
    return ok("storyline_list", { total: list.length, storylines: list });
  },
});

// ═══════════════════════════════════════════
// ── 9. 写作规则 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "rule_list",
    description: "列出项目的写作规则——禁用词、禁用句式、强制要求等。用于回答'有哪些规则限制'类问题。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const rules = await ctx.prisma.rule.findMany({
      where: { projectId: ctx.projectId },
      orderBy: { updatedAt: "desc" },
    });
    const list = rules.map((r: any) => ({
      id: r.id, name: r.name, type: r.type, category: r.category,
      pattern: r.pattern, description: r.description,
      severity: r.severity, enabled: r.enabled,
    }));
    return ok("rule_list", { total: list.length, rules: list });
  },
});

// ═══════════════════════════════════════════
// ── 10. 风格卡 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "style_get",
    description: "获取当前项目的文风模板设置——风格描述、禁用句式列表、节奏指引、对话指引。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const card = await ctx.prisma.styleCard.findFirst({
      where: { projectId: ctx.projectId },
      orderBy: { updatedAt: "desc" },
    });
    if (!card) return ok("style_get", { found: false, message: "未设置文风模板" });
    return ok("style_get", {
      id: card.id, name: card.name,
      stylePrompt: clip(card.stylePrompt || "", 500),
      forbiddenPatterns: card.forbiddenPatterns || [],
      pacingGuide: card.pacingGuide || "",
      dialogueGuide: card.dialogueGuide || "",
      temperature: card.temperature, topP: card.topP,
    });
  },
});

// ═══════════════════════════════════════════
// ── 11. 章节分析 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "analyze_chapter",
    description: "扫描刚写完的章节，对比角色卡数据，找出正文出现了但角色卡上缺失的信息（新能力、情绪变化、关系互动、新外号、状态变更）。返回 frontendAction 让前端调分析 API。",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "要分析的章节节点ID，不传则分析最新一章" },
        instruction: { type: "string", description: "可选的额外分析指令，如「重点看能力变化」" },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    let chapter: any = null;
    if (args.nodeId) {
      chapter = await ctx.prisma.storyNode.findFirst({
        where: { id: args.nodeId as string, projectId: ctx.projectId },
        select: { id: true, title: true, content: true, wordCount: true },
      });
    } else {
      chapter = await ctx.prisma.storyNode.findFirst({
        where: { projectId: ctx.projectId, type: "chapter", content: { not: null }, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, content: true, wordCount: true },
      });
    }
    if (!chapter || !chapter.content) {
      return fail("analyze_chapter", "没有可分析的章节内容");
    }
    // 只返回元信息，实际分析由前端调 /api/agent/analyze-chapter 完成
    return ok("analyze_chapter", {
      nodeId: chapter.id,
      title: chapter.title,
      wordCount: chapter.wordCount,
      contentPreview: clip(chapter.content, 200),
      ready: true,
    }, {
      type: "analyze_chapter",
      payload: {
        nodeId: chapter.id,
        nodeTitle: chapter.title,
        chapterContent: chapter.content,
      },
    });
  },
});

// ═══════════════════════════════════════════
// ── 12. 关系分析 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "analyze_relationships",
    description: "Agent 读取全部章节正文，从实际互动中提取角色间的关系网。不是读角色卡——是从正文中理解谁和谁在什么场景下发生了什么互动。返回 frontendAction 让前端调分析 API 并渲染关系图。",
    parameters: {
      type: "object",
      properties: {
        scope: { type: "string", description: "分析范围：all（全部章节，最多8章）| latest（最近2章）| first（前2章）" },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    const chapters = await ctx.prisma.storyNode.findMany({
      where: { projectId: ctx.projectId, type: "chapter", content: { not: null }, deletedAt: null },
      select: { id: true, title: true },
      orderBy: { order: "asc" },
    });
    if (chapters.length === 0) {
      return fail("analyze_relationships", "项目还没有章节内容");
    }
    return ok("analyze_relationships", {
      chapterCount: chapters.length,
      scope: args.scope || "all",
      ready: true,
    }, {
      type: "analyze_relationships",
      payload: { projectId: ctx.projectId, scope: args.scope || "all" },
    });
  },
});

// ═══════════════════════════════════════════
// ── 13. 关系同步 (1 tool) ──
// ═══════════════════════════════════════════

toolRegistry.register({
  schema: {
    name: "relation_sync",
    description: "从章节正文中提取角色互动关系，自动创建/更新世界书中的角色关系条目（category=character_relationship）。已有关系则融合替代，没有则自动新建。同步后的关系条目将在后续正文生成时必定被读取。",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "要分析的章节节点ID，不传则用最新一章" },
        autoApply: { type: "boolean", description: "是否自动应用到世界书，默认 true" },
      },
      required: [],
    },
  },
  execute: async (args, ctx) => {
    let chapter: any = null;
    if (args.nodeId) {
      chapter = await ctx.prisma.storyNode.findFirst({
        where: { id: args.nodeId as string, projectId: ctx.projectId },
        select: { id: true, title: true, content: true, wordCount: true },
      });
    } else {
      chapter = await ctx.prisma.storyNode.findFirst({
        where: { projectId: ctx.projectId, type: "chapter", content: { not: null }, deletedAt: null },
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, content: true, wordCount: true },
      });
    }
    if (!chapter || !chapter.content) {
      return fail("relation_sync", "没有可分析的章节内容");
    }
    return ok("relation_sync", {
      nodeId: chapter.id,
      title: chapter.title,
      wordCount: chapter.wordCount,
      ready: true,
    }, {
      type: "relation_sync",
      payload: {
        chapterContent: chapter.content,
        chapterTitle: chapter.title,
        autoApply: args.autoApply !== false,
      },
    });
  },
});
