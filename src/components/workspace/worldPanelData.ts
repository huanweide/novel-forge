import type { IconName } from "@/components/ui/icons";

// ─── 板块定义：每个板块独立的词汇、图标、描述 ──────────────

export const WORLD_MODULES = [
  { key: "geography",   label: "地理地图", icon: "globe" as IconName, desc: "大陆、国家、城市、宗门、秘境" },
  { key: "faction",     label: "势力阵营", icon: "sword" as IconName, desc: "宗门、家族、帝国、帮派、圣地" },
  { key: "item",        label: "物品列表", icon: "gem" as IconName, desc: "法宝、丹药、材料、法器、装备" },
  { key: "magic_system",label: "力量体系", icon: "sparkles" as IconName, desc: "修炼等级、能量规则、境界划分" },
  { key: "technique",   label: "功法体系", icon: "scroll" as IconName, desc: "攻击/防御/辅助/身法/阵法" },
  { key: "creature",    label: "生物种族", icon: "skull" as IconName, desc: "妖兽、神兽、异族、灵物" },
  { key: "culture",     label: "文化风俗", icon: "palette" as IconName, desc: "传统、习俗、节日、礼仪" },
  { key: "history",     label: "历史背景", icon: "book" as IconName, desc: "重大事件、纪元更迭、传说" },
  { key: "law",         label: "规则法则", icon: "shield" as IconName, desc: "天道规则、世界法则、禁忌" },
  { key: "currency",    label: "货币体系", icon: "gem" as IconName, desc: "灵石、金币、兑换比例" },
  { key: "custom",      label: "特殊设定", icon: "sparkles" as IconName, desc: "金手指、系统、血脉、漏洞" },
  { key: "fate_system",label: "命运体系", icon: "compass" as IconName, desc: "天命、命格、预言、因果线" },
  { key: "physics",    label: "物理列表", icon: "flask" as IconName, desc: "世界底层物理规则、时空法则、能量守恒" },
  { key: "public_system",label: "公开体系", icon: "landmark" as IconName, desc: "公开社会制度、阶级、律法执行、公共资源" },
  { key: "character_relationship", label: "角色关系", icon: "users" as IconName, desc: "角色间的互动关系——从正文自动提取，生成时必定读取" },
] as const;

export type ModuleKey = (typeof WORLD_MODULES)[number]["key"];

// ─── 世界书记忆注入方式标签（常驻记忆 / 触发记忆）───

export const DEPTH_LABEL: Record<number, string> = {
  0: "常驻·强效",
  1: "常驻·指令上",
  2: "常驻·系统",
  3: "触发·默认",
  4: "触发·深层",
};

// ─── category 中文 → DB key 映射 ────────────────────────

export const CATEGORY_TO_MODULE: Record<string, ModuleKey> = {
  geography: "geography",
  faction: "faction",
  item: "item",
  magic_system: "magic_system",
  technique: "technique",
  creature: "creature",
  culture: "culture",
  history: "history",
  law: "law",
  currency: "currency",
  character_relationship: "character_relationship",
  custom: "custom",
  fate_system: "fate_system",
  physics: "physics",
  public_system: "public_system",
};

// ─── 每个板块的新建字段模板 ──────────────────────────────

export interface WorldFieldDef {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea";
}

export const MODULE_FIELDS: Record<ModuleKey, WorldFieldDef[]> = {
  geography: [
    { key: "type", label: "类型", placeholder: "大陆/国家/城市/宗门/秘境/禁地", type: "text" },
    { key: "parent", label: "所属上层地域", placeholder: "如：东荒", type: "text" },
    { key: "description", label: "描述", placeholder: "环境特征、重要地标、法则特性...", type: "textarea" },
  ],
  faction: [
    { key: "type", label: "类型", placeholder: "宗门/家族/帝国/帮派/圣地", type: "text" },
    { key: "alignment", label: "阵营", placeholder: "正道/邪道/中立", type: "text" },
    { key: "leader", label: "首领", placeholder: "掌门/家主/帝王", type: "text" },
    { key: "territory", label: "领地", placeholder: "势力范围", type: "text" },
    { key: "description", label: "描述", placeholder: "核心目标、成员规模、特殊能力...", type: "textarea" },
  ],
  item: [
    { key: "type", label: "类型", placeholder: "武器/丹药/法宝/材料/法器", type: "text" },
    { key: "rarity", label: "稀有度", placeholder: "凡品/灵品/宝品/仙品/神品/禁忌", type: "text" },
    { key: "owner", label: "持有者", placeholder: "角色名", type: "text" },
    { key: "status", label: "状态", placeholder: "完好/损坏/遗失/封印中", type: "text" },
    { key: "description", label: "描述", placeholder: "外观、功能、来历...", type: "textarea" },
  ],
  magic_system: [
    { key: "levels", label: "等级序列", placeholder: "炼气→筑基→金丹→元婴→化神→渡劫→大乘→帝境", type: "text" },
    { key: "energySource", label: "能量来源", placeholder: "灵气/魔气/血脉/信仰", type: "text" },
    { key: "breakthrough", label: "突破条件", placeholder: "资源/心境/契机", type: "text" },
    { key: "description", label: "描述", placeholder: "各等级特征、末法时代影响...", type: "textarea" },
  ],
  technique: [
    { key: "type", label: "类型", placeholder: "攻击/防御/辅助/身法/阵法", type: "text" },
    { key: "grade", label: "品阶", placeholder: "凡/灵/宝/仙/神/禁忌", type: "text" },
    { key: "element", label: "属性", placeholder: "火/水/雷/木/土/无", type: "text" },
    { key: "inheritance", label: "传承方式", placeholder: "师徒/血脉/石碑/秘籍", type: "text" },
    { key: "description", label: "描述", placeholder: "核心效果、修炼要求、副作用...", type: "textarea" },
  ],
  creature: [
    { key: "type", label: "类型", placeholder: "妖兽/神兽/异族/灵物/古族", type: "text" },
    { key: "habitat", label: "栖息地", placeholder: "地点名", type: "text" },
    { key: "powerLevel", label: "实力等级", placeholder: "筑基级/金丹级...", type: "text" },
    { key: "description", label: "描述", placeholder: "外貌、习性、能力...", type: "textarea" },
  ],
  culture: [
    { key: "region", label: "所属区域", placeholder: "地域/势力", type: "text" },
    { key: "description", label: "描述", placeholder: "传统、习俗、节日、礼仪...", type: "textarea" },
  ],
  history: [
    { key: "era", label: "纪元/时代", placeholder: "上古纪元/末法时代/黄金纪元", type: "text" },
    { key: "date", label: "时间标记", placeholder: "X年前/X纪元", type: "text" },
    { key: "description", label: "描述", placeholder: "事件概述、影响、关联人物...", type: "textarea" },
  ],
  law: [
    { key: "scope", label: "作用范围", placeholder: "全大陆/某势力/某秘境", type: "text" },
    { key: "penalty", label: "违反后果", placeholder: "天劫/抹杀/放逐", type: "text" },
    { key: "description", label: "描述", placeholder: "规则内容、触发条件、例外...", type: "textarea" },
  ],
  currency: [
    { key: "material", label: "材质/形态", placeholder: "灵石/金币/玉简/晶石", type: "text" },
    { key: "tiers", label: "价值层级", placeholder: "下品→中品→上品→极品，100:1", type: "text" },
    { key: "circulation", label: "流通范围", placeholder: "全大陆/某势力", type: "text" },
    { key: "description", label: "描述", placeholder: "获取方式、特殊功能、通胀影响...", type: "textarea" },
  ],
  custom: [
    { key: "type", label: "类型", placeholder: "系统/金手指/天赋/血脉/世界漏洞", type: "text" },
    { key: "trigger", label: "触发条件", placeholder: "条件/代价", type: "text" },
    { key: "description", label: "描述", placeholder: "效果、限制、未解之谜...", type: "textarea" },
  ],
  fate_system: [
    { key: "type", label: "类型", placeholder: "天命/命格/预言/因果", type: "text" },
    { key: "bearer", label: "承载者", placeholder: "角色名/势力/世界", type: "text" },
    { key: "trigger", label: "触发条件", placeholder: "何种情形下显现", type: "text" },
    { key: "description", label: "描述", placeholder: "命运机制、预言内容、因果如何闭环...", type: "textarea" },
  ],
  physics: [
    { key: "domain", label: "作用域", placeholder: "时空/能量/物质/因果", type: "text" },
    { key: "rule", label: "基本定律", placeholder: "如：灵气守恒、光速上限", type: "text" },
    { key: "exception", label: "例外/破例", placeholder: "何种情况可被打破", type: "text" },
    { key: "description", label: "描述", placeholder: "底层物理规则、与力量体系的耦合...", type: "textarea" },
  ],
  public_system: [
    { key: "type", label: "类型", placeholder: "阶级/律法/税制/公共资源", type: "text" },
    { key: "authority", label: "执行主体", placeholder: "官府/教会/联盟", type: "text" },
    { key: "scope", label: "覆盖范围", placeholder: "全大陆/某国/某城", type: "text" },
    { key: "description", label: "描述", placeholder: "社会制度、阶级流动、公开规则...", type: "textarea" },
  ],
  character_relationship: [
    { key: "charA", label: "角色A", placeholder: "角色名（如：陈凡）", type: "text" },
    { key: "charB", label: "角色B", placeholder: "角色名（如：凌霜）", type: "text" },
    { key: "relation", label: "关系类型", placeholder: "师徒/敌对/暗恋/盟友/血亲/利用/守护/竞争", type: "text" },
    { key: "reason", label: "关系原因", placeholder: "为什么有这样的关系（从正文中提取）", type: "text" },
    { key: "dynamic", label: "关系动态", placeholder: "关系的变化趋势（升温/降温/稳定/反复）", type: "text" },
    { key: "evidence", label: "正文证据", placeholder: "摘录正文中体现此关系的句子", type: "textarea" },
  ],
};

// ─── 板块计数纯函数（组件与单测复用，避免分类映射误判）───
// 注意：custom（特殊设定）是合法 category，必须按 e.category === "custom" 直接统计。
// 不能用 !CATEGORY_TO_MODULE[e.category] —— 因为 custom 本身在白名单中，取反会把真条目排除。
export function countByModule(
  entries: ReadonlyArray<{ category: string }>,
  key: ModuleKey,
): number {
  if (key === "custom") {
    return entries.filter((e) => e.category === "custom").length;
  }
  return entries.filter((e) => CATEGORY_TO_MODULE[e.category] === key).length;
}
