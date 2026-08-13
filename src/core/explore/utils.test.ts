/**
 * explore/utils.ts 单元测试（探讨模式共享工具 / 消除 adopt·chat·create 路由重复）
 * 锁死：步骤→世界书分类、中文关键词提取、LLM 文本稳健提取 JSON、卡片直提结构化、
 * 角色触发词提取。纯逻辑、零依赖（仅 import type）。
 */
import { describe, it, expect } from "vitest";
import type { ExploreStep } from "./types";
import {
  stepToCategory,
  extractKeysFromText,
  extractJson,
  tryExtractStructured,
  extractCharacterKeys,
} from "./utils";

describe("stepToCategory", () => {
  it("opening / worldview → worldview", () => {
    expect(stepToCategory("opening")).toBe("worldview");
    expect(stepToCategory("worldview")).toBe("worldview");
  });
  it("protagonist / golden_finger / free_talk → custom", () => {
    expect(stepToCategory("protagonist")).toBe("custom");
    expect(stepToCategory("golden_finger")).toBe("custom");
    expect(stepToCategory("free_talk")).toBe("custom");
  });
  it("core_conflict / plot_thread → plot", () => {
    expect(stepToCategory("core_conflict")).toBe("plot");
    expect(stepToCategory("plot_thread")).toBe("plot");
  });
  it("factions → faction", () => {
    expect(stepToCategory("factions")).toBe("faction");
  });
  it("power_system → magic_system", () => {
    expect(stepToCategory("power_system")).toBe("magic_system");
  });
  it("currency → economy", () => {
    expect(stepToCategory("currency")).toBe("economy");
  });
  it("map → geography", () => {
    expect(stepToCategory("map")).toBe("geography");
  });
  it("未知 step → 默认 custom（map 兜底防越界）", () => {
    expect(stepToCategory("anything_else" as ExploreStep)).toBe("custom");
  });
});

describe("extractKeysFromText", () => {
  it("空文本 → 空数组", () => {
    expect(extractKeysFromText("")).toEqual([]);
  });
  it("提取中文 2-6 字词并按频降序、截断前 6", () => {
    const text = "魔法 魔法 剑士 剑士 剑士 王国 王国 骑士 预言。";
    const keys = extractKeysFromText(text);
    expect(keys[0]).toBe("剑士"); // 出现 3 次最高频
    expect(keys).toContain("魔法");
    expect(keys).toContain("王国");
    expect(keys.length).toBeLessThanOrEqual(6);
  });
  it("过滤停用词", () => {
    const text = "本文 作者 内容 魔法 剑士。";
    const keys = extractKeysFromText(text);
    expect(keys).not.toContain("本文");
    expect(keys).not.toContain("作者");
    expect(keys).not.toContain("内容");
    expect(keys).toContain("魔法");
    expect(keys).toContain("剑士");
  });
  it("英文与单字不提取（仅中文 2-6 字）", () => {
    const text = "a 魔法 sword 剑。";
    const keys = extractKeysFromText(text);
    expect(keys).toContain("魔法");
    expect(keys).not.toContain("剑"); // 单字不提取
  });
});

describe("extractJson", () => {
  it("裸 JSON → 解析", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it("markdown 代码块包裹 → 提取", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it("含前缀文本 + JSON → 提取对象", () => {
    expect(extractJson('好的，这是结果：{"a":1} 完毕')).toEqual({ a: 1 });
  });
  it("无效 JSON → null（不抛）", () => {
    expect(extractJson("这不是json")).toBeNull();
    expect(extractJson("```json\nnot json\n```")).toBeNull();
  });
  it("匹配到花括号但非合法 JSON → null（走 catch 兜底）", () => {
    expect(extractJson("前缀 {broken: json} 后缀")).toBeNull();
  });
});

describe("tryExtractStructured", () => {
  it("content 是 JSON 且含 name → 返回对象", () => {
    expect(
      tryExtractStructured({ title: "t", content: '{"name":"张三","age":20}' }),
    ).toEqual({ name: "张三", age: 20 });
  });
  it("content 是 JSON 且 content 字段 >20 字 → 返回", () => {
    const r = tryExtractStructured({
      title: "t",
      content: '{"content":"这是一段足够长的角色描述内容用于测试提取逻辑是否生效"}',
    });
    expect(r).not.toBeNull();
  });
  it("content 非 JSON → null", () => {
    expect(tryExtractStructured({ title: "t", content: "纯文本无结构" })).toBeNull();
  });
  it("JSON 既无 name 也无 content → null", () => {
    expect(tryExtractStructured({ title: "t", content: '{"foo":1}' })).toBeNull();
  });
});

describe("extractCharacterKeys", () => {
  it("name + aliases + abilities 合并，非字符串 abilities 过滤", () => {
    const keys = extractCharacterKeys("张三", {
      aliases: ["三郎", "小张"],
      abilities: ["火球", "冰封", 123 as any],
    });
    expect(keys).toContain("张三");
    expect(keys).toContain("三郎");
    expect(keys).toContain("小张");
    expect(keys).toContain("火球");
    expect(keys).toContain("冰封");
    expect(keys).not.toContain(123);
  });
  it("截断到 8 个", () => {
    const char = { aliases: Array.from({ length: 10 }, (_, i) => `a${i}`), abilities: [] };
    const keys = extractCharacterKeys("name", char);
    expect(keys.length).toBeLessThanOrEqual(8);
  });
  it("无 aliases / abilities → 仅 name", () => {
    expect(extractCharacterKeys("李四", {})).toEqual(["李四"]);
  });
});
