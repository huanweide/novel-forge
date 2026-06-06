// ============================================================
// 核心领域模型 —— 小说生成系统的全部类型定义
// ============================================================

// ─── 角色系统 (Character System) ────────────────────────────

/** 角色外貌的键值对 */
export interface CharacterAppearance {
  hair: string;       // 发色/发型
  eyes: string;       // 瞳色
  height: string;     // 身高
  build: string;      // 体型
  features: string;   // 其他特征（伤疤、纹身等）
  attire: string;     // 惯常穿着
}

/** 人物卡 v2 —— 结构化角色锚定 */
export interface CharacterCard {
  id: string;
  projectId: string;
  name: string;                   // 角色名
  aliases: string[];              // 别名/称号（用于触发词匹配）
  age: number | string;           // 年龄（可为"未知"）
  gender: string;                 // 性别
  role: CharacterRole;            // 剧情角色定位
  appearance: CharacterAppearance;
  personality: string[];          // 性格关键词（逗号分隔，如 ["傲慢","护短","嗜酒"]）
  dialogueStyle: DialogueStyle;   // 对话风格（防OOC关键）
  background: string;             // 背景故事摘要（≤200 Token）
  hiddenMotives: string[];        // 隐藏动机（决定行为逻辑）
  relationships: CharacterRelationship[];  // 与其他角色的关系
  currentStatus: CharacterStatus; // 当前状态（存活/死亡/失踪等）
  arcProgress: string;            // 角色弧光进展描述
  tags: string[];                 // 自定义标签
  createdAt: Date;
  updatedAt: Date;
}

export type CharacterRole =
  | "protagonist"      // 主角
  | "antagonist"       // 反派
  | "supporting"       // 配角
  | "mentor"           // 导师
  | "love_interest"    // 恋爱对象
  | "comic_relief"     // 喜剧担当
  | "catalyst"         // 剧情催化剂
  | "background";      // 背景角色

export interface DialogueStyle {
  description: string;            // 对话特征描述（如"话少，每句不超过15字"）
  examples: string[];             // 3-4句示例台词（锚定口癖和语气）
  vocabulary: string[];           // 常用词汇
  speechPatterns: string[];       // 句式特征（如"多用反问句""习惯性停顿"）
}

export interface CharacterRelationship {
  targetCharacterId: string;      // 关系对象ID
  relation: string;               // 关系（如"师徒""宿敌""暗恋"）
  dynamic: string;                // 关系动态（如"从敌对逐渐转为信任"）
  notes: string;                  // 备注
}

export type CharacterStatus =
  | "alive"
  | "dead"
  | "missing"
  | "incapacitated"
  | "presumed_dead"
  | "transformed";                // 变身/转世等

// ─── 世界书系统 (Lorebook / World Info) ────────────────────

/** 世界书词条 —— 按需注入的世界观设定 */
export interface LorebookEntry {
  id: string;
  projectId: string;
  title: string;                  // 词条标题
  category: LoreCategory;         // 分类
  keys: string[];                 // 触发关键词数组
  content: string;                // 设定内容（≤200 Token）
  insertionOrder: number;         // 插入优先级（越大越靠前，0-100）
  enabled: boolean;               // 是否启用
  parentId?: string;              // 父词条ID（形成层级）
  relatedEntryIds: string[];      // 关联词条ID
  embedding?: number[];           // 向量嵌入（pgvector存储）
  createdAt: Date;
  updatedAt: Date;
}

export type LoreCategory =
  | "geography"        // 地理
  | "faction"          // 势力/组织
  | "magic_system"     // 魔法/能力体系
  | "history"          // 历史事件
  | "culture"          // 文化/风俗
  | "creature"         // 生物/种族
  | "item"             // 关键物品
  | "law"              // 法则/规则
  | "custom";          // 自定义

// ─── 故事结构系统 (Story Structure) ────────────────────────

/** 故事节点 —— 章节树的原子单位 */
export interface StoryNode {
  id: string;
  projectId: string;
  parentId: string | null;        // 父节点ID（根节点为null）
  type: StoryNodeType;
  title: string;                  // 章节/小节标题
  order: number;                  // 同级排序
  status: ContentStatus;

  // 内容区
  outline: string | null;         // 本节点大纲
  content: string | null;         // 正文内容（通过AI生成）
  wordCount: number;              // 字数

  // 分支管理
  branchId: string | null;        // 所属分支ID
  isMainBranch: boolean;          // 是否为主线分支
  previousVersionId: string | null; // 重生成前的版本ID

  // 元数据
  activeCharacters: string[];     // 本节点出场角色ID
  activeLoreIds: string[];        // 本节点涉及的世界观词条ID
  coreConflict: string | null;    // 核心冲突描述
  settingDescription: string | null; // 场景描述
  notes: string | null;           // 作者备注

  // 审校
  reviewLogs: ReviewLog[];        // Agent D审校记录
  revisionCount: number;          // 修改次数

  createdAt: Date;
  updatedAt: Date;
}

export type StoryNodeType =
  | "volume"           // 卷
  | "chapter"          // 章
  | "section"          // 节（最小生成单元）
  | "scene";           // 场景（比节更小的叙事单元）

export type ContentStatus =
  | "outline_only"     // 仅有大纲
  | "drafting"         // 草稿中
  | "completed"        // 已完成
  | "reviewing"        // 审校中
  | "rejected"         // 审校未通过
  | "revised";         // 已修改

/** 故事分支 —— 类似Git的分支概念 */
export interface StoryBranch {
  id: string;
  projectId: string;
  name: string;                   // 分支名称
  description: string;            // 分支描述
  parentBranchId: string | null;  // 源分支ID
  forkPointNodeId: string;        // 从哪个节点分叉
  isActive: boolean;
  createdAt: Date;
}

// ─── 审校系统 (Review System) ──────────────────────────────

/** Agent D 审校记录 */
export interface ReviewLog {
  id: string;
  nodeId: string;
  timestamp: Date;
  passed: boolean;                // 是否通过
  issues: ReviewIssue[];          // 发现的问题
  summary: string;                // 审校总结
  suggestion: string | null;      // 修改建议
}

export interface ReviewIssue {
  type: ReviewIssueType;
  severity: "critical" | "major" | "minor";
  description: string;            // 问题描述
  location: string | null;        // 问题所在位置（引用正文片段）
  relatedCharacterId?: string;    // 涉及的角色
  relatedLoreId?: string;         // 涉及的世界观
}

export type ReviewIssueType =
  | "ooc"               // 角色崩坏
  | "logic_flaw"        // 逻辑漏洞
  | "lore_conflict"     // 世界观冲突
  | "timeline_error"    // 时间线错误
  | "character_resurrection" // 已死角色复活
  | "item_teleport"     // 物品凭空出现/消失
  | "continuity_error"; // 连续性问题

// ─── Prompt组装系统 (Context Assembly) ─────────────────────

/** 上下文组装时的完整请求体 */
export interface PromptContext {
  systemPrompt: string;           // 系统指令区
  globalMemory: GlobalMemory;     // 全局静态记忆
  triggeredLore: TriggeredLore[]; // 动态触发的世界书词条
  slidingWindow: SlidingWindow;   // 滑动窗口记忆
  authorNote: string | null;      // 作者强制介入指令
}

export interface GlobalMemory {
  projectSynopsis: string;        // 主线总纲（≤500 Token）
  currentProtagonist: CharacterBrief; // 当前视角主角极简卡
  toneKeywords: string[];         // 小说基调关键词
}

/** 角色极简卡（塞进Prompt顶部用） */
export interface CharacterBrief {
  name: string;
  personality: string[];          // 前5个核心性格特征
  goal: string;                   // 当前目标
  status: string;                 // 当前状态
}

export interface TriggeredLore {
  entry: LorebookEntry;
  triggerKeyword: string;         // 是哪个关键词触发了这个词条
  matchScore: number;             // 匹配分数（关键词=1.0，向量=余弦相似度）
}

export interface SlidingWindow {
  shortTerm: StoryNode[];         // 最近3-5个小节（完整内容）
  mediumTerm: ChapterSummary[];   // 本章之前的摘要压缩
  longTerm: StoryBeat[];          // 前几章关键转折点（索引检索）
}

export interface ChapterSummary {
  chapterId: string;
  chapterTitle: string;
  summary: string;                // AI压缩的摘要（≤200 Token）
  keyEvents: string[];            // 关键事件列表
  characterStates: CharacterStateSnapshot[]; // 章节结束时角色状态快照
}

export interface CharacterStateSnapshot {
  characterId: string;
  name: string;
  emotionalState: string;         // 情绪状态
  physicalState: string;          // 物理状态
  location: string;               // 所在位置
  keyDecisions: string[];         // 本章做出的关键决定
}

export interface StoryBeat {
  nodeId: string;
  description: string;            // 转折点描述
  chapterNumber: number;
  impact: "major" | "minor";     // 对主线的影响程度
}

// ─── 项目系统 ──────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;                   // 项目名称
  description: string;            // 项目描述
  genre: string[];                // 类型标签（如["奇幻","冒险","悬疑"]）
  targetWordCount: number;        // 目标字数
  synopsis: string;               // 主线总纲（浓缩版）
  toneKeywords: string[];         // 基调关键词
  povCharacterId: string | null;  // 当前视角主角
  llmConfig: LLMConfig;           // 模型配置
  createdAt: Date;
  updatedAt: Date;
}

// ─── LLM配置 ────────────────────────────────────────────────

export interface LLMConfig {
  architectModel: string;         // Agent A 大纲模型（推荐：deepseek-chat）
  writerModel: string;            // Agent C 主笔模型（推荐：deepseek-chat，长上下文）
  reviewerModel: string;          // Agent D 审校模型（推荐：deepseek-chat）
  summarizeModel: string;         // 摘要压缩模型（可用更便宜的）
  extractorModel: string;         // 三卡抽取模型（推荐非推理模型，快且稳）
  baseURL: string;                // API地址
  apiKey: string;                 // API密钥（运行时从环境变量读取）
  defaultTemperature: number;     // 默认温度 (0.6-1.0)
  defaultTopP: number;            // 默认Top-P (0.9-1.0)
  maxTokensPerRequest: number;    // 单次请求最大Token
  contextWindowSize: number;      // 模型上下文窗口大小
}

// ─── Agent通信协议 ──────────────────────────────────────────

/** Agent A → Agent B：大纲拆解指令 */
export interface OutlineToChapters {
  projectId: string;
  synopsis: string;
  totalChapters: number;
  chapterOutlines: ChapterOutline[];
}

export interface ChapterOutline {
  chapterNumber: number;
  title: string;
  summary: string;                // 本章大纲
  mainConflict: string;           // 核心冲突
  characters: string[];           // 本章出场角色ID
  scenes: SceneOutline[];         // 场景拆解
}

export interface SceneOutline {
  sceneNumber: number;
  setting: string;                // 场景地点
  time: string;                   // 时间
  characters: string[];           // 出场角色
  summary: string;                // 场景概要
  goal: string;                   // 本场景叙事目的
}

/** Agent B → Agent C：撰写指令 */
export interface WritingInstruction {
  sceneOutline: SceneOutline;
  previousContent: string;        // 前文末段（用于衔接）
  styleGuide: string;             // 风格指引
  targetWordCount: number;        // 目标字数
  forbiddenActions: string[];     // 禁止事项（如"不要让A和B和好"）
}

/** Agent D → Agent C：审校反馈 */
export interface ReviewFeedback {
  passed: boolean;
  issues: ReviewIssue[];
  rewriteInstruction: string | null; // 重写指令
}

// ─── SSE 流式事件 ───────────────────────────────────────────

export type SSEEventType =
  | "token"             // 正文token流
  | "thinking"          // AI思考过程
  | "review_start"      // 审校开始
  | "review_issue"      // 审校发现问题
  | "review_result"     // 审校结果
  | "done"              // 生成完成
  | "error";            // 错误

export interface SSEEvent {
  type: SSEEventType;
  data: string;
  metadata?: Record<string, unknown>;
}

// ─── 前端状态类型 ──────────────────────────────────────────

/** 写作界面当前状态 */
export interface WriterState {
  currentNode: StoryNode | null;
  isGenerating: boolean;
  generatedTokens: number;
  activeCharacters: CharacterCard[];
  activeLoreEntries: LorebookEntry[];
  reviewPanelOpen: boolean;
  authorNote: string;
}

// ─── Token预算 ─────────────────────────────────────────────

export interface TokenBudget {
  total: number;                  // 上下文窗口总大小
  used: number;                   // 已使用
  allocations: TokenAllocation;   // 各区域分配
}

export interface TokenAllocation {
  systemPrompt: number;
  globalMemory: number;
  triggeredLore: number;
  shortTermMemory: number;
  mediumTermMemory: number;
  longTermMemory: number;
  authorNote: number;
  responseReserve: number;        // 留给生成的Token
}
