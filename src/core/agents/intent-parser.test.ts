/**
 * intent-parser 纯逻辑单测（魔王循环 v2.4.0）
 * 覆盖：自然语言→工具意图解析、参数提取、同工具去重、置信度排序、LLM 兜底判断。
 * 纯规则引擎，不调 LLM / prisma，直接 import 即可。
 */
import { describe, it, expect } from "vitest";
import { parseIntents, needsLLMFallback, type ParsedIntent } from "./intent-parser";

describe("parseIntents - 边界与空输入", () => {
  it("空字符串 → 空数组", () => {
    expect(parseIntents("")).toHaveLength(0);
  });

  it("单字符（<2） → 空数组", () => {
    expect(parseIntents("a")).toHaveLength(0);
  });

  it("无关键词的自然语言 → 空数组（交由 LLM 兜底）", () => {
    expect(parseIntents("今天天气真不错啊")).toHaveLength(0);
  });
});

describe("查询类意图", () => {
  it("查角色信息 → character_get，置信度 0.85", () => {
    const r = parseIntents("查一下主角信息");
    const hit = r.find((i) => i.tool === "character_get");
    expect(hit).toBeDefined();
    expect(hit!.confidence).toBe(0.85);
  });

  it("列出所有角色 → character_list", () => {
    expect(parseIntents("列出所有角色").some((i) => i.tool === "character_list")).toBe(true);
  });

  it("查看大纲 → outline_list", () => {
    expect(parseIntents("查看大纲").some((i) => i.tool === "outline_list")).toBe(true);
  });
});

describe("创建类意图 + 参数提取", () => {
  it("创建角色并提取名称「李雷」", () => {
    const r = parseIntents("新建角色叫李雷");
    const hit = r.find((i) => i.tool === "character_create");
    expect(hit).toBeDefined();
    expect((hit!.args as { name?: string }).name).toBe("李雷");
  });
});

describe("续写 / 写章节 + 字数参数", () => {
  it("继续写 → chapter_generate", () => {
    expect(parseIntents("继续写下一章").some((i) => i.tool === "chapter_generate")).toBe(true);
  });

  it("「写短的章节」 → targetWords=1500", () => {
    const hit = parseIntents("写短的章节").find((i) => i.tool === "chapter_generate");
    expect(hit).toBeDefined();
    expect((hit!.args as { targetWords: number }).targetWords).toBe(1500);
  });

  it("「写长一点的正文」 → targetWords=4000", () => {
    const hit = parseIntents("写长一点的正文").find((i) => i.tool === "chapter_generate");
    expect(hit).toBeDefined();
    expect((hit!.args as { targetWords: number }).targetWords).toBe(4000);
  });

  it("「写本章」（无长短提示） → targetWords 默认 2500", () => {
    const hit = parseIntents("写本章").find((i) => i.tool === "chapter_generate");
    expect(hit).toBeDefined();
    expect((hit!.args as { targetWords: number }).targetWords).toBe(2500);
  });
});

describe("同工具去重", () => {
  it("「写一章继续写」只保留一条 chapter_generate", () => {
    const r = parseIntents("写一章继续写");
    const cg = r.filter((i) => i.tool === "chapter_generate");
    expect(cg).toHaveLength(1);
  });
});

describe("多意图 + 置信度降序", () => {
  it("「列出所有角色查看大纲」返回两个工具", () => {
    const r = parseIntents("列出所有角色查看大纲");
    expect(r.some((i) => i.tool === "character_list")).toBe(true);
    expect(r.some((i) => i.tool === "outline_list")).toBe(true);
    // 两者置信度均 0.9，整体应按 confidence 降序排列（>=0.85 在前）
    expect(r.every((i, idx) => idx === 0 || r[idx - 1].confidence >= i.confidence)).toBe(true);
  });
});

describe("needsLLMFallback - 兜底判断", () => {
  it("空意图 → 需要 LLM 兜底", () => {
    expect(needsLLMFallback([])).toBe(true);
  });

  it("含高置信意图 → 不需要兜底", () => {
    const intents: ParsedIntent[] = [
      { tool: "chapter_generate", args: {}, confidence: 0.85, reason: "x" },
    ];
    expect(needsLLMFallback(intents)).toBe(false);
  });

  it("全部低置信（<0.6） → 需要兜底", () => {
    const intents: ParsedIntent[] = [
      { tool: "x", args: {}, confidence: 0.3, reason: "x" },
      { tool: "y", args: {}, confidence: 0.5, reason: "y" },
    ];
    expect(needsLLMFallback(intents)).toBe(true);
  });
});
