import { describe, it, expect } from "vitest";
import { parseFactsFromLLM } from "./extractFacts";

describe("parseFactsFromLLM", () => {
  it("解析干净 JSON 数组", () => {
    const text = JSON.stringify([
      { category: "character", subject: "沈星河", attribute: "修为", value: "金丹", source: "第1章" },
      { category: "world", subject: "星辰宗", attribute: "层级", value: "七大宗门之一" },
    ]);
    const facts = parseFactsFromLLM(text);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({
      category: "character",
      subject: "沈星河",
      attribute: "修为",
      value: "金丹",
      source: "第1章",
      confidence: 1,
    });
  });

  it("剥离 ```json 代码围栏", () => {
    const text = "好的，这是事实清单：\n```json\n" +
      JSON.stringify([{ category: "plot", subject: "主线", attribute: "目标", value: "复仇" }]) +
      "\n```";
    const facts = parseFactsFromLLM(text);
    expect(facts).toHaveLength(1);
    expect(facts[0].category).toBe("plot");
  });

  it("容忍 JSON 前后的废话", () => {
    const arr = JSON.stringify([{ category: "relationship", subject: "A", attribute: "与B", value: "师徒" }]);
    const text = `以下是抽取结果：\n${arr}\n以上为全部事实，请遵守。`;
    const facts = parseFactsFromLLM(text);
    expect(facts).toHaveLength(1);
  });

  it("非法 JSON 整体返回空（不抛）", () => {
    expect(parseFactsFromLLM("完全不是 json 的乱码 [abc")).toEqual([]);
    expect(parseFactsFromLLM("")).toEqual([]);
  });

  it("过滤缺字段的条目", () => {
    const text = JSON.stringify([
      { category: "character", subject: "沈星河", attribute: "修为", value: "金丹" },
      { category: "world", subject: "", attribute: "层级", value: "x" }, // 缺 subject
      { subject: "only-subject" }, // 缺 attribute/value
    ]);
    const facts = parseFactsFromLLM(text);
    expect(facts).toHaveLength(1);
    expect(facts[0].subject).toBe("沈星河");
  });

  it("非法 category 回退 world，confidence 夹紧到 [0,1]", () => {
    const text = JSON.stringify([
      { category: "unknown", subject: "X", attribute: "y", value: "z", confidence: 5 },
      { category: "character", subject: "Y", attribute: "a", value: "b", confidence: -1 },
    ]);
    const facts = parseFactsFromLLM(text);
    expect(facts[0].category).toBe("world");
    expect(facts[0].confidence).toBe(1);
    expect(facts[1].confidence).toBe(0);
  });

  it("支持 subject/name、attribute/key、value/fact 别名", () => {
    const text = JSON.stringify([
      { name: "沈星河", key: "发色", fact: "墨黑", category: "character" },
    ]);
    const facts = parseFactsFromLLM(text);
    expect(facts[0]).toMatchObject({
      subject: "沈星河",
      attribute: "发色",
      value: "墨黑",
    });
  });
});
