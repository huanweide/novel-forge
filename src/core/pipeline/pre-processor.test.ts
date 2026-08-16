import { describe, it, expect } from "vitest";
import {
  extractLLMConfig,
  filterByConfirmedCards,
  buildCardNotesText,
} from "./pre-processor";

// ── extractLLMConfig：温度/topP 优先级解析（项目自定义 > 文风模板 > 硬编码兜底）──
// 该函数被 refine 路由与批量 write-generation 主路径复用，是生成风格控制的总闸门。
// 一旦优先级或兜底值被静默改坏，全站生成都会跑偏，故锁死契约。

const BASE_DATA = (llmConfig: Record<string, unknown>) =>
  ({ project: { llmConfig } }) as any;

describe("extractLLMConfig · 温度优先级", () => {
  it("项目自定义 temperature 覆盖模板默认与硬编码兜底", () => {
    const { effectiveTemperature } = extractLLMConfig(
      BASE_DATA({ temperature: 0.5, styleTemplateId: "hot_blooded" }),
    );
    // hot_blooded 模板 temperature=0.9，兜底 0.85，项目 0.5 必须胜出
    expect(effectiveTemperature).toBe(0.5);
  });

  it("无项目 temperature 时回退到文风模板默认", () => {
    const { effectiveTemperature, template } = extractLLMConfig(
      BASE_DATA({ styleTemplateId: "hot_blooded" }),
    );
    expect(template?.id).toBe("hot_blooded");
    expect(effectiveTemperature).toBe(0.9);
  });

  it("无项目温度且无模板时回退硬编码兜底 0.85", () => {
    const { effectiveTemperature } = extractLLMConfig(BASE_DATA({}));
    expect(effectiveTemperature).toBe(0.85);
  });

  it("项目 temperature 为 0 是合法值，必须保留而非被兜底吞掉（?? 语义）", () => {
    const { effectiveTemperature } = extractLLMConfig(
      BASE_DATA({ temperature: 0, styleTemplateId: "hot_blooded" }),
    );
    expect(effectiveTemperature).toBe(0);
  });
});

describe("extractLLMConfig · TopP 优先级", () => {
  it("项目自定义 topP 覆盖模板默认与兜底", () => {
    const { effectiveTopP } = extractLLMConfig(
      BASE_DATA({ topP: 0.5, styleTemplateId: "mystery" }),
    );
    // mystery 模板 topP=0.9，兜底 0.95，项目 0.5 必须胜出
    expect(effectiveTopP).toBe(0.5);
  });

  it("无项目 topP 时回退到模板默认", () => {
    const { effectiveTopP, template } = extractLLMConfig(
      BASE_DATA({ styleTemplateId: "mystery" }),
    );
    expect(template?.id).toBe("mystery");
    expect(effectiveTopP).toBe(0.9);
  });

  it("无项目 topP 且无模板时回退硬编码兜底 0.95", () => {
    const { effectiveTopP } = extractLLMConfig(BASE_DATA({}));
    expect(effectiveTopP).toBe(0.95);
  });
});

describe("extractLLMConfig · 模板解析与自定义禁用词", () => {
  it("styleTemplateId 空串时 template 为 undefined（仅用兜底）", () => {
    const { template, effectiveTemperature } = extractLLMConfig(
      BASE_DATA({ styleTemplateId: "" }),
    );
    expect(template).toBeUndefined();
    expect(effectiveTemperature).toBe(0.85);
  });

  it("styleTemplateId 指向不存在模板时也回退兜底", () => {
    const { template, effectiveTopP } = extractLLMConfig(
      BASE_DATA({ styleTemplateId: "no_such_template" }),
    );
    expect(template).toBeUndefined();
    expect(effectiveTopP).toBe(0.95);
  });

  it("customForbiddenPatterns 原样透传（空数组也保留，不替换为 undefined）", () => {
    const { customForbidden } = extractLLMConfig(
      BASE_DATA({ customForbiddenPatterns: ["不许用A", "不许用B"] }),
    );
    expect(customForbidden).toEqual(["不许用A", "不许用B"]);
  });

  it("无 customForbiddenPatterns 时回退为空数组", () => {
    const { customForbidden } = extractLLMConfig(BASE_DATA({}));
    expect(customForbidden).toEqual([]);
  });
});

// ── filterByConfirmedCards：确认卡过滤（write/refine/continue 三路由共用）──

const CHARS = (ids: string[]) =>
  ids.map((id) => ({ id, name: `角色${id}` }) as any);

describe("filterByConfirmedCards", () => {
  it("confirmedCardIds 为 undefined 时原样返回全部", () => {
    const chars = CHARS(["a", "b", "c"]);
    expect(filterByConfirmedCards(chars, undefined)).toBe(chars);
  });

  it("confirmedCardIds 为空数组时返回全部", () => {
    const chars = CHARS(["a", "b"]);
    expect(filterByConfirmedCards(chars, []).length).toBe(2);
  });

  it("按 id 集合过滤，只保留已确认角色", () => {
    const chars = CHARS(["a", "b", "c"]);
    const out = filterByConfirmedCards(chars, ["a", "c"]);
    expect(out.map((c: any) => c.id)).toEqual(["a", "c"]);
  });

  it("确认列表含不存在的 id 不会凭空补角色", () => {
    const chars = CHARS(["a", "b"]);
    const out = filterByConfirmedCards(chars, ["a", "x"]);
    expect(out.map((c: any) => c.id)).toEqual(["a"]);
  });

  it("重复确认 id 不会重复计数", () => {
    const chars = CHARS(["a", "b"]);
    const out = filterByConfirmedCards(chars, ["a", "a", "b"]);
    expect(out.map((c: any) => c.id)).toEqual(["a", "b"]);
  });
});

// ── buildCardNotesText：角色备注拼文本（注入 authorNote 最高优先级块）──

describe("buildCardNotesText", () => {
  const chars = [
    { id: "a", name: "李尘" },
    { id: "b", name: "苏沐" },
  ] as any;

  it("cardNotes 为 undefined 时返回空串", () => {
    expect(buildCardNotesText(undefined, chars)).toBe("");
  });

  it("cardNotes 为空对象时返回空串", () => {
    expect(buildCardNotesText({}, chars)).toBe("");
  });

  it("全是空/空白备注时返回空串（不产出头部）", () => {
    const out = buildCardNotesText({ a: "   ", b: "" }, chars);
    expect(out).toBe("");
  });

  it("指向不存在角色的备注被跳过", () => {
    const out = buildCardNotesText({ z: "幽灵备注" }, chars);
    expect(out).toBe("");
  });

  it("有效备注拼成「[角色名] 备注」并加最高优先级头部", () => {
    const out = buildCardNotesText({ a: "怕水" }, chars);
    expect(out).toContain("【用户角色备注——最高优先级】");
    expect(out).toContain("[李尘] 怕水");
  });

  it("多条有效备注按 key 顺序拼接，角色名取实卡", () => {
    const out = buildCardNotesText({ a: "怕水", b: "擅剑" }, chars);
    expect(out).toContain("[李尘] 怕水");
    expect(out).toContain("[苏沐] 擅剑");
    // 同一换行分隔，且头部只出现一次
    expect(out.indexOf("【用户角色备注")).toBe(
      out.lastIndexOf("【用户角色备注"),
    );
  });
});
