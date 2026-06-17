import { prisma } from "@/lib/prisma";

// ─── 类型 ──────────────────────────────────────────────────

/** 作用域类型（决定特异性基础权重） */
export type ScopeType =
  | "global"           // 全项目生效 → 权重 1
  | "volume"           // 指定卷 → 权重 2
  | "chapter_range"    // 指定章节范围 → 权重 3
  | "event_type"       // 特定事件类型 → 权重 4
  | "character_scene"  // 特定角色出场场景 → 权重 5
  | "conditional";     // 条件触发 → 权重 6

/** 规则记录（含冲突裁决字段） */
export interface RuleRecord {
  id: string;
  name: string;
  content: string;
  category: string;
  enabled: boolean;
  priority: number;
  scope: string;
  scopeType?: ScopeType;
  specificityScore?: number;
  scopeConfig?: Record<string, unknown>;
  createdAt?: Date;
}

/** 规则冲突对 */
export interface RuleConflict {
  ruleA: RuleRecord;
  ruleB: RuleRecord;
  reason: string;               // 为什么冲突
  resolution: "keep_higher_priority" | "keep_higher_specificity" | "keep_older" | "merge" | "manual";
  winner: RuleRecord;           // 裁决胜出的规则
  explanation: string;          // 裁决说明
}

// ─── 作用域权重表 ────────────────────────────────────────

const SCOPE_BASE_WEIGHTS: Record<ScopeType, number> = {
  global: 1,
  volume: 2,
  chapter_range: 3,
  event_type: 4,
  character_scene: 5,
  conditional: 6,
};

// ─── 动态系数调整 ────────────────────────────────────────

/**
 * 计算特异性分数
 *
 * specificity_score = base_weight × dynamic_coefficient
 *
 * dynamic_coefficient 调整规则：
 *   - 涉及多个实体 +0.5
 *   - 条件数量每多一个 +0.2
 *   - 含时间限制 +0.3
 */
function calculateSpecificity(rule: RuleRecord): number {
  const baseWeight = SCOPE_BASE_WEIGHTS[rule.scopeType || "global"] || 1;
  let coefficient = 1.0;

  if (rule.scopeConfig) {
    const config = rule.scopeConfig;
    // 条件数量加成
    if (config.conditions && Array.isArray(config.conditions)) {
      coefficient += config.conditions.length * 0.2;
    }
    // 时间限制加成
    if (config.hasTimeLimit) coefficient += 0.3;
    // 多实体加成
    if (config.entityIds && Array.isArray(config.entityIds) && config.entityIds.length > 1) {
      coefficient += 0.5;
    }
  }

  return Math.round(baseWeight * coefficient * 100) / 100;
}

// ─── 核心 API ────────────────────────────────────────────

/**
 * 获取项目中所有启用的规则，按优先级降序排列
 */
export async function getActiveRules(projectId: string, scope?: string): Promise<RuleRecord[]> {
  const where: any = { projectId, enabled: true };
  if (scope) {
    where.OR = [{ scope: "all" }, { scope }];
  }
  const rules = await prisma.rule.findMany({
    where,
    orderBy: { priority: "desc" },
  });

  // 补充特异性分
  return rules.map((r: any) => ({
    ...r,
    specificityScore: calculateSpecificity(r as any),
  }));
}

/**
 * 检测规则冲突
 *
 * 冲突判定：两条规则在同一 category 下，语义相反或目标互斥
 *
 * 当前用启发式规则检测（未来可接入 embedding 相似度）：
 *   1. 关键词互斥检测（"禁止" vs "必须"、"不能" vs "一定要"）
 *   2. 目标实体重叠检测
 */
export function detectConflicts(rules: RuleRecord[]): RuleConflict[] {
  const conflicts: RuleConflict[] = [];

  for (let i = 0; i < rules.length; i++) {
    for (let j = i + 1; j < rules.length; j++) {
      const a = rules[i];
      const b = rules[j];

      // 只在同分类下检测
      if (a.category !== b.category) continue;

      // 启发式互斥关键词检测
      const aNegative = /禁止|不能|不得|绝不|严禁|不许/.test(a.content);
      const aPositive = /必须|一定要|务必|须要|应当/.test(a.content);
      const bNegative = /禁止|不能|不得|绝不|严禁|不许/.test(b.content);
      const bPositive = /必须|一定要|务必|须要|应当/.test(b.content);

      const isOpposite = (aNegative && bPositive) || (aPositive && bNegative);

      // 提取目标关键词（简单取前10个有意义的词）
      const aKeywords = a.content.replace(/[，。！？、\s]/g, "").slice(0, 20);
      const bKeywords = b.content.replace(/[，。！？、\s]/g, "").slice(0, 20);

      // 实体重叠：提取引号中的内容
      const aEntities = (a.content.match(/「(.+?)」|"(.+?)"|【(.+?)】/g) || []).map(s => s.slice(1, -1));
      const bEntities = (b.content.match(/「(.+?)」|"(.+?)"|【(.+?)】/g) || []).map(s => s.slice(1, -1));
      const hasEntityOverlap = aEntities.some(ae => bEntities.includes(ae));

      // 判定冲突
      if (isOpposite || (hasEntityOverlap && aKeywords !== bKeywords)) {
        // 三阶段裁决
        const winner = resolveConflict(a, b);
        const loser = winner.id === a.id ? b : a;

        conflicts.push({
          ruleA: a,
          ruleB: b,
          reason: isOpposite
            ? `指令冲突：${a.content.slice(0, 30)}… vs ${b.content.slice(0, 30)}…`
            : `目标重叠：共同涉及 ${aEntities.filter(ae => bEntities.includes(ae)).join("、")}`,
          resolution: winner.id === a.id
            ? (a.priority > b.priority ? "keep_higher_priority"
              : (a.specificityScore || 0) > (b.specificityScore || 0) ? "keep_higher_specificity"
              : "keep_older")
            : (b.priority > a.priority ? "keep_higher_priority"
              : (b.specificityScore || 0) > (a.specificityScore || 0) ? "keep_higher_specificity"
              : "keep_older"),
          winner,
          explanation: explainResolution(a, b, winner),
        });
      }
    }
  }

  return conflicts;
}

/**
 * 三阶段冲突裁决
 *
 * 阶段1：优先级（priority 数值越大越优先）
 * 阶段2：特异性（specificity_score 越高越优先）
 * 阶段3：创建时间（created_at 越早越优先，先到先得）
 */
function resolveConflict(a: RuleRecord, b: RuleRecord): RuleRecord {
  // 阶段1：优先级
  if (a.priority !== b.priority) {
    return a.priority > b.priority ? a : b;
  }

  // 阶段2：特异性
  const specA = a.specificityScore || calculateSpecificity(a);
  const specB = b.specificityScore || calculateSpecificity(b);
  if (specA !== specB) {
    return specA > specB ? a : b;
  }

  // 阶段3：创建时间（先到先得）
  const timeA = a.createdAt?.getTime() || 0;
  const timeB = b.createdAt?.getTime() || 0;
  return timeA <= timeB ? a : b;
}

/**
 * 生成裁决说明
 */
function explainResolution(a: RuleRecord, b: RuleRecord, winner: RuleRecord): string {
  if (a.priority !== b.priority) {
    return `优先级裁决：「${a.name}」(P${a.priority}) vs「${b.name}」(P${b.priority}) →「${winner.name}」胜出`;
  }
  const specA = a.specificityScore || calculateSpecificity(a);
  const specB = b.specificityScore || calculateSpecificity(b);
  if (specA !== specB) {
    return `特异性裁决：「${a.name}」(特异度${specA}) vs「${b.name}」(特异度${specB}) →「${winner.name}」胜出`;
  }
  return `时间裁决：先到先得 →「${winner.name}」胜出`;
}

/**
 * 将启用的规则注入到 authorNote 中
 *
 * 增强版：先检测冲突，只注入胜出的规则 + 标记被否决的规则
 */
export function injectRules(authorNote: string, rules: RuleRecord[]): string {
  if (rules.length === 0) return authorNote;

  // 冲突检测
  const conflicts = detectConflicts(rules);
  const overriddenIds = new Set<string>();
  for (const c of conflicts) {
    const loser = c.winner.id === c.ruleA.id ? c.ruleB : c.ruleA;
    overriddenIds.add(loser.id);
  }

  // 标记被否决的规则
  const effectiveRules = rules.map(r => ({
    ...r,
    isOverridden: overriddenIds.has(r.id),
  }));

  // 按 category 分组
  const groups: Record<string, typeof effectiveRules> = {};
  for (const r of effectiveRules) {
    if (!groups[r.category]) groups[r.category] = [];
    groups[r.category].push(r);
  }

  const lines: string[] = [];
  lines.push("## ⚠️ 创作规则——铁律（必须严格遵守，优先级高于章纲和角色设定）");

  const categoryLabel: Record<string, string> = {
    writing: "写作规则", world: "世界观规则", character: "角色规则",
    style: "风格规则", custom: "自定义规则",
  };

  for (const [cat, catRules] of Object.entries(groups)) {
    lines.push(`\n### ${categoryLabel[cat] || cat}`);
    for (const r of catRules) {
      const marker = r.isOverridden ? " ⚠️[已被更高优先级规则覆盖]" : "";
      lines.push(`- 【${r.name}】${r.content}${marker}`);
    }
  }

  // 附上冲突摘要
  if (conflicts.length > 0) {
    lines.push("\n### 🔍 冲突裁决记录（仅供作者参考，AI 已按裁决结果执行）");
    for (const c of conflicts) {
      lines.push(`- ${c.reason} → ${c.explanation}`);
    }
  }

  const ruleBlock = lines.join("\n");
  if (!authorNote.trim()) return ruleBlock;
  return `${ruleBlock}\n\n---\n\n## 📝 作者指令\n${authorNote}`;
}
