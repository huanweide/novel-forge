import { describe, it, expect } from "vitest";
import { parseConflictsFromLLM } from "./detectConflicts";

describe("parseConflictsFromLLM", () => {
  it("命中冲突：正常 JSON 数组解析出完整字段", () => {
    const text = JSON.stringify([
      {
        factId: "fact-123",
        category: "character",
        description: "正文说主角左眼是黑色，但基线记的是灰色",
        excerpt: "他的左眼漆黑如墨",
      },
    ]);
    const r = parseConflictsFromLLM(text);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      factId: "fact-123",
      category: "character",
      description: "正文说主角左眼是黑色，但基线记的是灰色",
      excerpt: "他的左眼漆黑如墨",
    });
  });

  it("无冲突：空数组返回空", () => {
    expect(parseConflictsFromLLM("[]")).toEqual([]);
    expect(parseConflictsFromLLM("无矛盾")).toEqual([]);
  });

  it("factId 可选：无 factId 的自由文本冲突也能解析，缺失 description 的无效项被过滤", () => {
    const text = JSON.stringify([
      { category: "plot", description: "正文说城破在第三章，但基线记的是第五章", excerpt: "城门在三月陷落" },
      { category: "world", excerpt: "这段没有说明" }, // 缺 description → 过滤
    ]);
    const r = parseConflictsFromLLM(text);
    expect(r).toHaveLength(1);
    expect(r[0].factId).toBeNull();
    expect(r[0].description).toBe("正文说城破在第三章，但基线记的是第五章");
  });

  it("容错：剥除 ```json 围栏与前后废话", () => {
    const text =
      "以下是检测到的冲突：\n```json\n[" +
      '{"description":"甲说乙已死，但基线记乙存活","excerpt":"乙早已命丧黄泉"}]' +
      "\n```\n以上。";
    const r = parseConflictsFromLLM(text);
    expect(r).toHaveLength(1);
    expect(r[0].description).toBe("甲说乙已死，但基线记乙存活");
  });

  it("容错：JSON 解析失败时整体返回空（不抛）", () => {
    expect(parseConflictsFromLLM("[{description: 坏 json")).toEqual([]);
    expect(parseConflictsFromLLM("没有任何括号的内容")).toEqual([]);
  });
});
