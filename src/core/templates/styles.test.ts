import { describe, it, expect } from "vitest";
import {
  getTemplate,
  applyTemplate,
  forbiddenPatternsToPrompt,
  STYLE_TEMPLATES,
} from "./styles";
import type { StyleTemplate } from "./styles";

// 最小可控模板，用于验证 applyTemplate / forbiddenPatternsToPrompt 的纯逻辑
function makeTemplate(overrides: Partial<StyleTemplate> = {}): StyleTemplate {
  return {
    id: "unit_test_tpl",
    name: "单元测试模板",
    description: "用于测试的模板",
    icon: "🧪",
    stylePrompt: "请保持冷峻克制的文风。",
    temperature: 0.7,
    topP: 0.9,
    targetWordsPerSection: 1500,
    forbiddenPatterns: ["他叹了口气", "心想"],
    pacingGuide: "平稳推进。",
    dialogueGuide: "对话干脆。",
    descriptionDensity: 4,
    ...overrides,
  };
}

describe("getTemplate", () => {
  it("按 id 返回真实存在的模板", () => {
    const first = STYLE_TEMPLATES[0];
    const found = getTemplate(first.id);
    expect(found).toBeDefined();
    expect(found?.id).toBe(first.id);
    expect(found?.name).toBe(first.name);
  });

  it("返回对象的字段完整（文风约束关键字段不丢）", () => {
    const found = getTemplate("hot_blooded");
    expect(found).toBeDefined();
    expect(found?.stylePrompt).toContain("热血");
    expect(Array.isArray(found?.forbiddenPatterns)).toBe(true);
    expect(typeof found?.temperature).toBe("number");
  });

  it("不存在的 id 返回 undefined（不抛错）", () => {
    expect(getTemplate("__definitely_not_exist__")).toBeUndefined();
  });

  it("空串 id 返回 undefined", () => {
    expect(getTemplate("")).toBeUndefined();
  });
});

describe("applyTemplate", () => {
  it("有 stylePrompt 时把文风约束合并到基础提示词尾部", () => {
    const base = "你是小说创作助手。";
    const result = applyTemplate(makeTemplate(), base);
    expect(result).toBe(
      `${base}\n\n【文风约束——最高优先级】\n请保持冷峻克制的文风。`,
    );
  });

  it("基础提示词原样保留，不丢失任何字符", () => {
    const base = "很长的基础系统提示词，包含【特殊符号】与「中文引号」。";
    const result = applyTemplate(makeTemplate(), base);
    expect(result.startsWith(base)).toBe(true);
  });

  it("stylePrompt 为空时直接返回基础提示词（不追加任何前缀）", () => {
    const base = "基础提示词";
    const tpl = makeTemplate({ stylePrompt: "" });
    expect(applyTemplate(tpl, base)).toBe(base);
  });

  it("stylePrompt 为 undefined 时直接返回基础提示词", () => {
    const base = "基础提示词";
    const tpl = makeTemplate({ stylePrompt: undefined as unknown as string });
    expect(applyTemplate(tpl, base)).toBe(base);
  });
});

describe("forbiddenPatternsToPrompt", () => {
  it("有禁用句式时生成【禁止以下表达】段落，每行一条", () => {
    const result = forbiddenPatternsToPrompt(makeTemplate());
    expect(result.startsWith("\n\n【禁止以下表达】\n")).toBe(true);
    expect(result).toContain("- 禁止使用：他叹了口气");
    expect(result).toContain("- 禁止使用：心想");
  });

  it("禁用句式数组为空时返回空串", () => {
    const tpl = makeTemplate({ forbiddenPatterns: [] });
    expect(forbiddenPatternsToPrompt(tpl)).toBe("");
  });

  it("禁用句式条目数与原数组一致", () => {
    const patterns = ["A", "B", "C", "D"];
    const result = forbiddenPatternsToPrompt(makeTemplate({ forbiddenPatterns: patterns }));
    const lines = result
      .split("\n")
      .filter((l) => l.startsWith("- 禁止使用："));
    expect(lines).toHaveLength(patterns.length);
  });
});
