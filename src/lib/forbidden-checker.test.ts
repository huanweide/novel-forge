/**
 * forbidden-checker 纯逻辑单测（魔王循环 v2.3.0）
 * 覆盖：五类检测、边界、工具函数、兼容旧 API、ReDoS 防护。
 * 全部为纯函数，无 prisma / LLM / DOM 依赖，直接 import 即可。
 */
import { describe, it, expect } from "vitest";
import {
  scanForbiddenWordsEnhanced,
  scanForbiddenWords,
  collectForbiddenPatterns,
  groupMatchesByCategory,
  getBuiltinRuleCounts,
} from "./forbidden-checker";

describe("scanForbiddenWordsEnhanced - 边界与空文本", () => {
  it("空字符串：通过、长度为0、满分、无匹配", () => {
    const r = scanForbiddenWordsEnhanced("");
    expect(r.passed).toBe(true);
    expect(r.textLength).toBe(0);
    expect(r.matches).toHaveLength(0);
    expect(r.qualityScore).toBe(100);
  });

  it("纯正常文本：通过、满分、无任何匹配", () => {
    const r = scanForbiddenWordsEnhanced("他推开门，走进了昏暗的房间。");
    expect(r.passed).toBe(true);
    expect(r.matches).toHaveLength(0);
    expect(r.qualityScore).toBe(100);
  });
});

describe("1. 精确禁用词", () => {
  it("error 级内置词「此外」：命中1处、不通过、扣5分", () => {
    const r = scanForbiddenWordsEnhanced("此外，我们需要讨论下一步。");
    expect(r.byCategory.exact_word).toBe(1);
    expect(r.bySeverity.error).toBe(1);
    expect(r.passed).toBe(false);
    // 100 - 1*5 = 95
    expect(r.qualityScore).toBe(95);
    // 上下文应包含命中词
    expect(r.matches[0].pattern).toBe("此外");
    expect(r.matches[0].context).toContain("此外");
  });

  it("warning 级内置词「太棒了」：命中、仍通过、扣2分", () => {
    const r = scanForbiddenWordsEnhanced("他太棒了！");
    expect(r.byCategory.exact_word).toBe(1);
    expect(r.bySeverity.warning).toBe(1);
    expect(r.bySeverity.error).toBe(0);
    expect(r.passed).toBe(true);
    expect(r.qualityScore).toBe(98);
  });

  it("自定义精确词：命中自定义规则", () => {
    const r = scanForbiddenWordsEnhanced("这里有个绝密词出现", {
      customExactWords: ["绝密词"],
    });
    expect(r.byCategory.exact_word).toBe(1);
    expect(r.matches[0].pattern).toBe("绝密词");
    expect(r.passed).toBe(false);
  });

  it("disableBuiltin：仅用自定义词，内置词不被误判", () => {
    const r = scanForbiddenWordsEnhanced("此外是内置禁用词，但不应触发", {
      disableBuiltin: true,
      customExactWords: ["自定义违禁"],
    });
    expect(r.bySeverity.error).toBe(0);
    expect(r.passed).toBe(true);
  });
});

describe("2/3/5. 正则类检测（句式 / 身体模板 / AI高频词）", () => {
  it("句式模式「不是…而是」：error 级命中", () => {
    const r = scanForbiddenWordsEnhanced("他不是不说话，而是点了点头。");
    expect(r.byCategory.sentence_pattern).toBeGreaterThanOrEqual(1);
    expect(r.bySeverity.error).toBeGreaterThanOrEqual(1);
    expect(r.passed).toBe(false);
    expect(r.matches.some((m) => m.pattern.includes("不是"))).toBe(true);
  });

  it("身体模板「瞳孔一缩」：warning 级命中", () => {
    const r = scanForbiddenWordsEnhanced("瞳孔一缩，他警觉起来。");
    expect(r.byCategory.body_template).toBeGreaterThanOrEqual(1);
    expect(r.matches[0].severity).toBe("warning");
    expect(r.passed).toBe(true); // 无 error
  });

  it("AI高频词「至关重要」：warning 级命中", () => {
    const r = scanForbiddenWordsEnhanced("这一点至关重要。");
    expect(r.byCategory.ai_frequent).toBeGreaterThanOrEqual(1);
    expect(r.passed).toBe(true);
  });
});

describe("4. 模糊词密度", () => {
  it("高密度：超阈值触发 warning 并给出密度摘要", () => {
    // 6 个模糊词：totalFuzzyCount(6) > 示例上限(5)，会额外生成密度摘要
    const r = scanForbiddenWordsEnhanced("似乎也许大概仿佛好像隐约");
    expect(r.fuzzyDensity).toBeGreaterThan(3);
    expect(r.byCategory.fuzzy_word).toBeGreaterThanOrEqual(1);
    // totalFuzzyCount > 已列示例数，故应含一条“模糊词密度过高”的摘要匹配
    expect(r.matches.some((m) => m.pattern.includes("模糊词密度过高"))).toBe(true);
  });

  it("安全密度：无模糊词时不触发", () => {
    const r = scanForbiddenWordsEnhanced("他坚定地向前走去，没有回头。");
    expect(r.fuzzyDensity).toBe(0);
    expect(r.byCategory.fuzzy_word).toBe(0);
  });
});

describe("工具函数", () => {
  it("collectForbiddenPatterns：去重（含 trim）", () => {
    const result = collectForbiddenPatterns(["此外", "此外", " 此外 "], []);
    expect(result).toHaveLength(1);
  });

  it("groupMatchesByCategory：按类别正确分组", () => {
    const r = scanForbiddenWordsEnhanced("此外他太棒了，瞳孔一缩，这一点至关重要。");
    const groups = groupMatchesByCategory(r.matches);
    expect(groups.exact_word.length).toBe(r.byCategory.exact_word);
    expect(groups.body_template.length).toBe(r.byCategory.body_template);
    expect(groups.ai_frequent.length).toBe(r.byCategory.ai_frequent);
  });

  it("getBuiltinRuleCounts：内置规则总数 = 13+9+9+10+8 = 49", () => {
    const c = getBuiltinRuleCounts();
    expect(c.exactWords).toBe(13);
    expect(c.sentencePatterns).toBe(9);
    expect(c.bodyTemplates).toBe(9);
    expect(c.fuzzyWords).toBe(10);
    expect(c.aiFrequent).toBe(8);
    expect(c.total).toBe(49);
  });
});

describe("兼容旧 API：scanForbiddenWords", () => {
  it("空 patterns：直接通过", () => {
    const r = scanForbiddenWords("正常文本没有任何禁用词", []);
    expect(r.passed).toBe(true);
    expect(r.matches).toHaveLength(0);
  });

  it("命中旧 patterns（当精确词处理）", () => {
    const r = scanForbiddenWords("这里有此外词出现", ["此外"]);
    expect(r.byCategory.exact_word).toBeGreaterThanOrEqual(1);
    expect(r.passed).toBe(false);
  });
});

describe("ReDoS 防护（安全关键）", () => {
  it("用户传入嵌套量词正则被拒绝，不崩溃，记为 info 提示", () => {
    const r = scanForbiddenWordsEnhanced("测试文本无违禁内容。", {
      customSentencePatterns: ["/(a+)+/"],
    });
    // 内置规则 + 自定义均不命中正文，故无 error
    expect(r.passed).toBe(true);
    // 自定义 (a+)+ 触发 ReDoS 防护，生成 1 条 info 级拒绝匹配
    expect(r.bySeverity.info).toBeGreaterThanOrEqual(1);
    expect(r.matches.some((m) => (m.suggestion || "").includes("灾难性回溯"))).toBe(true);
  });
});

describe("qualityScore 边界", () => {
  it("多 error 严重扣分但不低于 0", () => {
    const r = scanForbiddenWordsEnhanced("此外".repeat(25));
    expect(r.bySeverity.error).toBe(25);
    expect(r.qualityScore).toBe(0); // max(0, 100-25*5)
  });

  it("分数恒在 [0,100] 区间", () => {
    const r = scanForbiddenWordsEnhanced("此外总而言之综上所述不可否认显而易见值得注意的是");
    expect(r.bySeverity.error).toBe(6);
    expect(r.qualityScore).toBe(70); // 100 - 6*5
    expect(r.qualityScore).toBeGreaterThanOrEqual(0);
    expect(r.qualityScore).toBeLessThanOrEqual(100);
  });
});
