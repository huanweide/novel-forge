/**
 * 分层提示词构建器 —— 五层结构
 *
 * 把巨型 systemPrompt 拆成五层独立模块：
 *   第1层：身份定义（语气最正式，定义"我是谁"）
 *   第2层：硬规则（★★★ 标记，命令式：必须/禁止/严禁）
 *   第3层：中等规则（★ 标记，建议式：建议/可以/优先）
 *   第4层：动态上下文（项目名/章节号/角色花名册——每次生成时变化）
 *   第5层：工具说明（JSON Schema 格式，供 function calling 用）
 *
 * 每层可独立启用/禁用/替换，不互相污染。
 * 与 orchestrator.ts 的 buildPromptContext 协作——后者负责动态层(4)的构建。
 */

import type { ToolSchema } from "./tool-registry";

// ═══════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════

export type LayerLevel = 1 | 2 | 3 | 4 | 5;

export interface PromptLayer {
  level: LayerLevel;
  label: string;
  priority: "★★★" | "★" | "" | "system";
  content: string;
  /** 是否可被管理员关闭 */
  toggleable: boolean;
  /** 是否默认启用 */
  enabled: boolean;
}

export interface LayeredPromptConfig {
  /** 项目名 */
  projectName: string;
  /** 当前章节描述 */
  currentChapter: string;
  /** 角色花名册简表 */
  characterRoster: string;
  /** 可用工具 schema（第5层） */
  toolSchemas?: ToolSchema[];
  /** 动态额外规则 */
  extraRules?: string[];
}

// ═══════════════════════════════════════════
// 第1层：身份定义
// ═══════════════════════════════════════════

const LAYER_1_IDENTITY: PromptLayer = {
  level: 1,
  label: "身份定义",
  priority: "system",
  content: `你是一位资深玄幻修仙小说作家，运行着一个严密的修仙模拟引擎。
你同时兼顾【文学性】（文笔、剧情、逻辑性）与【游戏性】（修仙体系、好感度系统、行为检定）。

你的创作方法论——逍遥散仙流派：
  知北游的荒诞逻辑 × 都市重生流的现代内心 × 4K画质的环境身体描写
  × QCQC纯爱规则约束 × 每一步胜利都有代价的硬核平衡`,
  toggleable: false,
  enabled: true,
};

// ═══════════════════════════════════════════
// 第2层：硬规则（★★★）
// ═══════════════════════════════════════════

const LAYER_2_HARD_RULES: PromptLayer = {
  level: 2,
  label: "硬规则——必须遵守",
  priority: "★★★",
  content: `★★★ 严禁：时间/镜头跳跃——必须按秒/分推进剧情，实时描写移动路径，严禁瞬移
★★★ 严禁：物理失忆——上一段的环境细节必须由动作改变，严禁自动复原
★★★ 严禁：OOC——角色言行必须符合其性格特征和对话风格
★★★ 严禁：上帝视角——叙事严格限制在主角的感官范围内，禁止直接描写女主心理
★★★ 严禁：龙傲天开局——主角初始必须是修仙界的底层，资源匮乏
★★★ 严禁：NTR/送女/物理控制/恶堕——绝对纯爱护盾
★★★ 严禁：正文第一行写「第X章」「第X节」——章节标题由系统管理，正文直接切入场景
★★★ 必须：每章正文 ≥ 2500 字净字数
★★★ 必须：所有女主首次出现有细致外貌描写，换装也需描写
★★★ 必须：每步胜利有代价——法力/神识/寿命/肉身至少一个维度的透支要明确写出来`,
  toggleable: false,
  enabled: true,
};

// ═══════════════════════════════════════════
// 第3层：中等规则（★）
// ═══════════════════════════════════════════

const LAYER_3_SOFT_RULES: PromptLayer = {
  level: 3,
  label: "中等规则——建议遵循",
  priority: "★",
  content: `★ 建议：4K级画面感——拒绝"美女""绝美""漂亮"，写光影/发丝/衣摆/皮肤质感
★ 建议：五调料配方——现代词汇嫁接(~15%) + 古白话(~20%) + 口语/网络梗(~10%) + 降维化修辞(~10%) + 标准修仙叙事(~45%)
★ 建议：心电图节奏——慢→中→快→爆→冻→收尾，不允许两种连续段落用相同节奏
★ 建议：对话不做乒乓球——A说→B回→A接的机械循环。打断用破折号，沉默比说话有力
★ 优先：情绪用生理反应替代——不写"他很愤怒"，写"后槽牙咬紧，指关节发白"
★ 优先：悲剧底色掩埋法——喜剧人物有悲剧内核，在最不显眼的位置埋最深的伏笔`,
  toggleable: true,
  enabled: true,
};

// ═══════════════════════════════════════════
// 构建器
// ═══════════════════════════════════════════

/**
 * 构建动态上下文层（第4层）。
 * 每次生成时变化——项目名、当前章节、角色花名册、待兑现事项等。
 */
function buildDynamicLayer(config: LayeredPromptConfig): PromptLayer {
  return {
    level: 4,
    label: "动态上下文",
    priority: "system",
    content: `【当前作品】《${config.projectName}》
【当前进度】${config.currentChapter}
【角色花名册】
${config.characterRoster || "（暂无角色）"}
${config.extraRules && config.extraRules.length > 0 ? `\n【额外规则】\n${config.extraRules.join("\n")}` : ""}`,
    toggleable: false,
    enabled: true,
  };
}

/**
 * 构建工具说明层（第5层）。
 * 供 function calling 用——告诉 LLM 可以调哪些工具。
 */
function buildToolLayer(schemas: ToolSchema[]): PromptLayer {
  if (!schemas || schemas.length === 0) {
    return {
      level: 5,
      label: "工具说明",
      priority: "",
      content: "",
      toggleable: true,
      enabled: false,
    };
  }

  const toolList = schemas
    .map((s) => `- ${s.name}: ${s.description}`)
    .join("\n");

  return {
    level: 5,
    label: "工具说明",
    priority: "",
    content: `你可调用以下工具操作项目数据：
${toolList}

调用工具时使用 function calling 协议——在回复中指定要调用的函数名和参数。
工具执行结果会以 system 消息形式注入对话。`,
    toggleable: true,
    enabled: true,
  };
}

// ═══════════════════════════════════════════
// 公开 API
// ═══════════════════════════════════════════

const BASE_LAYERS: PromptLayer[] = [
  LAYER_1_IDENTITY,
  LAYER_2_HARD_RULES,
  LAYER_3_SOFT_RULES,
];

/**
 * 获取所有基础层（1-3，不含动态层和工具层）。
 * 用于展示给管理员编辑/禁用。
 */
export function getBaseLayers(): PromptLayer[] {
  return BASE_LAYERS.map((l) => ({ ...l }));
}

/**
 * 组装完整的分层 system prompt。
 *
 * @param config            动态上下文配置
 * @param disabledLayers    用户禁用的层级编号（如 [3] 表示关闭中等规则层）
 * @returns 组装后的完整 systemPrompt 文本
 */
export function assembleLayeredPrompt(
  config: LayeredPromptConfig,
  disabledLayers: number[] = [],
): string {
  const layers: PromptLayer[] = [
    ...BASE_LAYERS,
    buildDynamicLayer(config),
    buildToolLayer(config.toolSchemas || []),
  ];

  const enabled = layers.filter(
    (l) =>
      l.enabled &&
      !disabledLayers.includes(l.level) &&
      l.content.trim().length > 0,
  );

  return enabled
    .map((l) => {
      const prefix = l.priority ? `[${l.priority}] ` : "";
      return `# ${prefix}${l.label}\n${l.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * 获取单层内容（用于编辑面板）。
 */
export function getLayer(level: LayerLevel, config?: LayeredPromptConfig): PromptLayer | undefined {
  if (level === 4 && config) return buildDynamicLayer(config);
  if (level === 5 && config) return buildToolLayer(config.toolSchemas || []);
  return BASE_LAYERS.find((l) => l.level === level);
}

/**
 * 更新单层内容（管理员编辑后保存）。
 * 注意：基础层(1-3)的内容通过此函数修改后仅对当前会话有效。
 * 持久化需要在 AppSettings 中存储自定义规则。
 */
export function updateLayerContent(
  level: LayerLevel,
  newContent: string,
): PromptLayer | undefined {
  const layer = BASE_LAYERS.find((l) => l.level === level);
  if (!layer) return undefined;
  layer.content = newContent;
  return layer;
}
