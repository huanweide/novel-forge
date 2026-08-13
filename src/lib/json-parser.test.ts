import { describe, it, expect } from "vitest";
import { parseAIJson, safeParseAIJson } from "./json-parser";

describe("parseAIJson —— AI 容错 JSON 解析", () => {
  it("解析标准 JSON", () => {
    expect(parseAIJson('{"a":1,"b":"x"}')).toEqual({ a: 1, b: "x" });
  });

  it("去掉 BOM 前缀", () => {
    expect(parseAIJson("\uFEFF" + '{"a":1}')).toEqual({ a: 1 });
  });

  it("从 ```json 代码块提取", () => {
    expect(parseAIJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("从无语言标记的代码块提取", () => {
    expect(parseAIJson('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("修复尾逗号", () => {
    expect(parseAIJson('{"a":1,}')).toEqual({ a: 1 });
    expect(parseAIJson('{"a":[1,2,]}')).toEqual({ a: [1, 2] });
  });

  it("修复字符串内真实换行（控制字符）", () => {
    const raw = '{"content":"第一行\n第二行"}';
    expect(parseAIJson(raw)).toEqual({ content: "第一行\n第二行" });
  });

  it("修复字符串内未转义引号", () => {
    const raw = '{"quote":"他说"你好""}';
    expect(parseAIJson(raw)).toEqual({ quote: '他说"你好"' });
  });

  it("多个粘连对象只取第一个", () => {
    const raw = '{"a":1} {"b":2}';
    expect(parseAIJson(raw)).toEqual({ a: 1 });
  });

  it("补全未闭合括号（缺外层 } 或缺 ]）", () => {
    expect(parseAIJson('{"a":1')).toEqual({ a: 1 });
    expect(parseAIJson("[1,2")).toEqual([1, 2]);
  });

  it("双重未闭合（数组与对象均未闭）超出修复能力时抛错", () => {
    expect(() => parseAIJson('{"a":[1,2}')).toThrow();
  });

  it("数组根也能解析", () => {
    expect(parseAIJson("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("完全无法解析时抛错", () => {
    expect(() => parseAIJson("这根本不是 json")).toThrow();
  });

  it("repairBrackets=false 时未闭合括号直接抛错", () => {
    expect(() => parseAIJson('{"a":1', false)).toThrow();
  });
});

describe("safeParseAIJson —— 不抛错的封装", () => {
  it("合法输入返回对象", () => {
    expect(safeParseAIJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("非法输入返回 null", () => {
    expect(safeParseAIJson("乱码")).toBeNull();
  });
});
