/**
 * prompt 评测集（#320 / P2 #10「prompt 当代码」第三要素）
 *
 * 背景：历史上 sync 重写 globalPrompt 曾多次「静默丢要素」——
 *   - Round-3 复检 PIT-1：世界书 7 类（technique/law/currency/...）被硬编码 catOrder 漏掉，生成侧丢弃；
 *   - v1.6.41：buildConfig 双漏口（explore 建项目 + build-config PATCH）导致探讨布置被丢弃。
 * 根因都是「改了构建逻辑，却没有一组固定基线守护『关键要素不丢』」。
 *
 * 本模块提供「评测集」：
 *   - PROMPT_EVAL_FIXTURE：一组固定基准设定（作品/角色/世界书/风格），代表我们期望
 *     globalPrompt 永远包含的关键要素（expectedTokens）。
 *   - buildBaselinePrompt()：用 buildGlobalPrompt 基于 fixture 构建确定性基线文本。
 *   - evaluatePromptVersions(current, baseline?)：把任意 globalPrompt 与基线对比，
 *     检出「丢失的要素 / 字数与 hash 漂移」，输出可机器判读的报告。
 *
 * 零 LLM、确定性、可进 vitest 双门禁；亦可由 CLI 脚本遍历某项目所有版本做回归评测。
 */

import { buildGlobalPrompt } from "@/core/sync-global-prompt";

// ─── 评测集固定基线（fixture）──────────────────────────────

export const PROMPT_EVAL_FIXTURE = {
  project: {
    name: "基准小说",
    genre: ["玄幻"],
    synopsis: "评测集基准总纲",
    toneKeywords: ["热血"],
    authorNote: "",
    llmConfig: null,
    buildConfig: null,
  },
  characters: [
    {
      name: "测主角",
      aliases: [],
      role: "protagonist",
      currentStatus: "存活",
      age: "18",
      gender: "男",
      appearance: { hair: "黑发", eyes: "黑瞳", height: "178", build: "匀称", distinguishing: "眉心红痣", attire: "青衫" },
      personality: { dominant: "坚毅", drive: "复仇", contradiction: "仁慈与杀意" },
      background: "出身被灭门的家族",
      abilities: ["剑术"],
      hiddenMotives: ["寻真相"],
      relationships: [{ targetName: "测反派", relation: "宿敌", dynamic: "对立" }],
      timeline: [{ age: "10", event: "家门生变" }],
      dialogueStyle: { description: "沉稳简短" },
      tags: ["主角"],
    },
    {
      name: "测反派",
      aliases: [],
      role: "antagonist",
      currentStatus: "存活",
      age: "40",
      gender: "男",
      appearance: { hair: "灰发" },
      personality: { dominant: "冷酷" },
      background: "幕后黑手",
      abilities: [],
      hiddenMotives: [],
      relationships: [],
      timeline: [],
      dialogueStyle: { description: "阴冷" },
      tags: ["反派"],
    },
  ],
  loreEntries: [
    {
      category: "law",
      title: "基准世界法则",
      keys: ["法则"],
      content: "灵气来源于天地",
    },
    {
      category: "technique",
      title: "基准功法",
      keys: ["功法"],
      content: "以气御剑",
    },
  ],
  styleCard: {
    styleDescription: "干净利落",
    povType: "third_person_limited",
    narrativeDistance: "近",
    avgSentenceLength: 20,
    dialogueRatio: 0.3,
    descriptionRatio: 0.3,
    actionRatio: 0.3,
    innerThoughtRatio: 0.1,
    tonalMarkers: { 冷峻: 0.6 },
    lexicalFeatures: { 短句: 0.5 },
    sampleText: "剑光一闪。",
  },
  // 我们期望 baseline 永远包含的关键要素 token（守护四大块不丢）
  expectedTokens: [
    "《基准小说》", // 作品信息
    "测主角", // 角色卡
    "测反派",
    "# 角色卡",
    "**基准世界法则**", // 世界书
    "**基准功法**",
    "# 世界书",
    "# 文风设定", // 风格卡
  ],
};

// ─── 评测纯函数 ───────────────────────────────────────────

/**
 * 用 fixture 构建确定性基线 globalPrompt。
 * 同一份 fixture → 同一份文本，是评测集的「单一真相源」。
 */
export function buildBaselinePrompt(): string {
  const f = PROMPT_EVAL_FIXTURE;
  return buildGlobalPrompt(
    f.project as any,
    f.characters as any,
    f.loreEntries as any,
    f.styleCard as any,
  );
}

export interface PromptEvalReport {
  /** 基线要素总数 */
  total: number;
  /** 当前版本命中基线的要素数 */
  matched: number;
  /** 当前版本丢失的要素（基线有、当前没有） */
  missing: string[];
  /** 当前版本相对基线的字数 */
  wordCountCurrent: number;
  /** 基线字数 */
  wordCountBaseline: number;
  /** 当前版本内容指纹 */
  hashCurrent: string;
  /** 基线内容指纹 */
  hashBaseline: string;
  /** 是否稳定：所有要素命中 && hash 一致 */
  stable: boolean;
}

function hashContent(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * 把任意 globalPrompt 与基线对比，输出要素守护报告。
 * @param current 待评测的 globalPrompt 全文
 * @param baseline 可选，默认用 buildBaselinePrompt() 的 fixture 基线
 */
export function evaluatePromptVersions(current: string, baseline?: string): PromptEvalReport {
  const base = baseline ?? buildBaselinePrompt();
  const tokens = PROMPT_EVAL_FIXTURE.expectedTokens;
  const missing = tokens.filter((t) => !current.includes(t));
  const hashCurrent = hashContent(current);
  const hashBaseline = hashContent(base);
  return {
    total: tokens.length,
    matched: tokens.length - missing.length,
    missing,
    wordCountCurrent: current.length,
    wordCountBaseline: base.length,
    hashCurrent,
    hashBaseline,
    stable: missing.length === 0 && hashCurrent === hashBaseline,
  };
}

/** 便捷方法：直接用内容对比 fixture 基线。 */
export function evaluatePromptVersionAgainstBaseline(content: string): PromptEvalReport {
  return evaluatePromptVersions(content);
}
