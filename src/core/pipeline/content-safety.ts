/**
 * 内容安全审核 —— 纯函数（规则分类，零 LLM / 零 token / 确定性可复现）
 *
 * 对一段正文做本地规则扫描，识别暴力 / 血腥恐怖 / 色情低俗 / 违法违禁 / 仇恨歧视
 * 五类风险，给出风险点、严重度、命中词、上下文片段与修改建议。
 *
 * 设计取舍：
 *  - 用规则而非 LLM：可离线、确定性、不烧额度、可在写正文时实时跑；
 *  - 这是「辅助预警」而非「内容审核裁决」——高风险项提示作者自查，不自动删改；
 *  - 关键词为示意性最小集，后续可按题材在 UI 层扩展白名单（如武侠"剑法"不判暴力）。
 */

export type SafetyCategory = "violence" | "gore" | "sexual" | "illegal" | "hate";
export type Severity = "high" | "medium" | "low";

export interface SafetyIssue {
  category: SafetyCategory;
  categoryLabel: string;
  severity: Severity;
  matched: string;
  snippet: string;
  suggestion: string;
  /** 命中来源：baseline=内置默认基线；custom=用户增量黑名单 */
  source?: "baseline" | "custom";
}

export interface SafetyResult {
  passed: boolean;
  score: number;
  issues: SafetyIssue[];
  summary: string;
  /** 合并后的规则统计（用于 UI 展示基线/用户规则数量） */
  ruleStats?: { baseline: number; custom: number };
}

interface Rule {
  category: SafetyCategory;
  categoryLabel: string;
  severity: Severity;
  pattern: RegExp;
  suggestion: string;
}

/**
 * 用户可配置安全规则（可序列化，存于 Project.customSafetyRules）。
 * pattern 为字面关键词/短语（扫描时按字面转义匹配，避免正则注入），
 * 不替换内置基线，仅作为「增量黑名单」叠加。
 */
export interface CustomSafetyRule {
  id: string;
  pattern: string;
  category: SafetyCategory;
  severity: Severity;
  suggestion?: string;
}

/** UI 用分类选项（标签 + 值） */
export const CUSTOM_SAFETY_CATEGORY_OPTIONS: { value: SafetyCategory; label: string }[] = [
  { value: "violence", label: "暴力" },
  { value: "gore", label: "血腥恐怖" },
  { value: "sexual", label: "色情低俗" },
  { value: "illegal", label: "违法违禁" },
  { value: "hate", label: "仇恨歧视" },
];

/** UI 用严重度选项 */
export const CUSTOM_SAFETY_SEVERITY_OPTIONS: { value: Severity; label: string }[] = [
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const SEVERITY_PENALTY: Record<Severity, number> = { high: 40, medium: 20, low: 8 };

// 风险词库（最小示意集，按题材可扩展；命中即提示，不自动判定违规）
const RULES: Rule[] = [
  // 暴力
  { category: "violence", categoryLabel: "暴力", severity: "medium", pattern: /(殴打|暴打|拳打|脚踢|砍杀|厮杀|虐杀|毒打|痛殴|猛击|重击头部)/, suggestion: "含殴打/击打描写，确认是否为必要情节，可适度弱化具象动作。" },
  { category: "violence", categoryLabel: "暴力", severity: "high", pattern: /(屠城|灭门|灭族|屠杀平民|凌虐致死|活体解剖)/, suggestion: "含大规模/极端暴力描写，建议审慎处理或移至暗场，避免越线。" },
  // 血腥恐怖
  { category: "gore", categoryLabel: "血腥恐怖", severity: "medium", pattern: /(血肉模糊|残肢断臂|内脏|喷涌而出|鲜血淋漓|白骨嶙峋|皮开肉绽)/, suggestion: "含血腥/恐怖具象描写，确认尺度，可考虑以暗示替代直写。" },
  { category: "gore", categoryLabel: "血腥恐怖", severity: "low", pattern: /(血迹|渗血|殷红|伤口|血痕)/, suggestion: "含轻微血迹描写，一般可保留，留意上下文强度。" },
  // 色情低俗
  { category: "sexual", categoryLabel: "色情低俗", severity: "high", pattern: /(性交|性行为|性器官|春药|裸体交缠|强行发生关系|强暴)/, suggestion: "含明确性行为/性侵描写，属高风险，建议模糊处理或移暗场。" },
  { category: "sexual", categoryLabel: "色情低俗", severity: "medium", pattern: /(贴身|喘息|衣衫褪去|肌肤相亲|情欲|胴体|暧昧地贴近)/, suggestion: "含暧昧/情欲暗示，确认是否为必要情感铺垫，注意尺度。" },
  // 违法违禁
  { category: "illegal", categoryLabel: "违法违禁", severity: "high", pattern: /(制毒|贩毒|吸毒|毒品交易|走私军火|贩卖枪支|非法集资|洗钱)/, suggestion: "含违法活动具体描写，建议避免给出可操作细节，仅作情节背景。" },
  { category: "illegal", categoryLabel: "违法违禁", severity: "medium", pattern: /(赌博|高利贷|地下钱庄|传销)/, suggestion: "含灰色产业描写，确认是否必要，避免美化或提供操作细节。" },
  // 仇恨歧视
  { category: "hate", categoryLabel: "仇恨歧视", severity: "high", pattern: /(贱种|杂种|畜生(不如)?|该杀的(族|种)|种族灭绝)/, suggestion: "含针对群体的歧视/仇恨表述，建议改为角色偏见而非作者立场。" },
  { category: "hate", categoryLabel: "仇恨歧视", severity: "medium", pattern: /(鄙夷地看向|天生下等|血统低贱)/, suggestion: "含阶层/血统歧视暗示，确认是否服务于反派塑造，避免被读作作者态度。" },
];

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 16);
  const end = Math.min(text.length, index + length + 16);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

/** 内置默认基线规则（不可删，UI 只读展示）。 */
export const DEFAULT_SAFETY_RULES: Rule[] = RULES;

/** 转义正则特殊字符，把用户字面关键词当作纯文本匹配（防正则注入）。 */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 把一条用户规则编译成可扫描的 Rule（字面匹配 + 全局不区分大小写）。 */
function toRule(custom: CustomSafetyRule): Rule {
  const label = CUSTOM_SAFETY_CATEGORY_OPTIONS.find((c) => c.value === custom.category)?.label ?? custom.category;
  return {
    category: custom.category,
    categoryLabel: label,
    severity: custom.severity,
    pattern: new RegExp(escapeRegExp(custom.pattern), "gi"),
    suggestion: custom.suggestion?.trim() || "命中你自定义的黑名单词，确认是否适合本作。",
  };
}

/**
 * 从 Project.customSafetyRules（未知 JSON）安全解析出用户规则数组。
 * 丢弃非法项，保证零崩溃、可序列化回写。
 */
export function buildCustomSafetyRules(json: unknown): CustomSafetyRule[] {
  if (!Array.isArray(json)) return [];
  const validCats: SafetyCategory[] = ["violence", "gore", "sexual", "illegal", "hate"];
  const validSev: Severity[] = ["high", "medium", "low"];
  const out: CustomSafetyRule[] = [];
  for (const raw of json) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.pattern !== "string" || !r.pattern.trim()) continue;
    if (!validCats.includes(r.category as SafetyCategory)) continue;
    if (!validSev.includes(r.severity as Severity)) continue;
    out.push({
      id: typeof r.id === "string" && r.id ? r.id : `c_${Date.now()}_${out.length}`,
      pattern: r.pattern.trim(),
      category: r.category as SafetyCategory,
      severity: r.severity as Severity,
      suggestion: typeof r.suggestion === "string" ? r.suggestion : undefined,
    });
  }
  return out;
}

/**
 * 分析文本的内容安全风险。
 * @param text 待审文本
 * @param extraRules 用户增量黑名单（叠在默认基线上，不替换基线）
 * @returns 风险结果（passed 表示无高/中风险；score 0-100，越高越安全）
 */
export function analyzeContentSafety(text: string, extraRules?: CustomSafetyRule[]): SafetyResult {
  if (!text || !text.trim()) {
    return { passed: true, score: 100, issues: [], summary: "无内容可审。", ruleStats: { baseline: RULES.length, custom: extraRules?.length ?? 0 } };
  }

  const activeRules = extraRules && extraRules.length > 0 ? [...RULES, ...extraRules.map(toRule)] : RULES;
  const customSources = new Set(extraRules?.map((r) => escapeRegExp(r.pattern)) ?? []);

  const issues: SafetyIssue[] = [];
  for (const rule of activeRules) {
    // matchAll 要求全局正则；克隆并补 g 标志
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g");
    const matches = text.matchAll(re);
    for (const m of matches) {
      const idx = m.index ?? 0;
      issues.push({
        category: rule.category,
        categoryLabel: rule.categoryLabel,
        severity: rule.severity,
        matched: m[0],
        snippet: snippetAround(text, idx, m[0].length),
        suggestion: rule.suggestion,
        source: customSources.has(rule.pattern.source) ? "custom" : "baseline",
      });
    }
  }

  // 同「分类 + 命中词」去重（同一词在一章里反复出现只提示一次，避免刷屏）
  const seen = new Set<string>();
  const deduped = issues.filter((it) => {
    const key = `${it.category}|${it.matched}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const penalty = deduped.reduce((sum, it) => sum + SEVERITY_PENALTY[it.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const hasHigh = deduped.some((it) => it.severity === "high");
  const hasMedium = deduped.some((it) => it.severity === "medium");
  const passed = !hasHigh && !hasMedium;

  let summary: string;
  if (deduped.length === 0) {
    summary = "未检出明显内容风险（规则库覆盖有限，仅供辅助参考）。";
  } else if (hasHigh) {
    summary = `检出 ${deduped.length} 处风险点，含高风险项，建议重点自查后再发布。`;
  } else if (hasMedium) {
    summary = `检出 ${deduped.length} 处风险点（中/低），建议确认尺度是否合适。`;
  } else {
    summary = `检出 ${deduped.length} 处低风险提示，一般可保留。`;
  }

  return { passed, score, issues: deduped, summary, ruleStats: { baseline: RULES.length, custom: extraRules?.length ?? 0 } };
}

export const SAFETY_CATEGORIES: SafetyCategory[] = ["violence", "gore", "sexual", "illegal", "hate"];
