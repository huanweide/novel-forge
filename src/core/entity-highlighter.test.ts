import { describe, it, expect } from "vitest";
import { findEntitiesInText } from "./entity-highlighter";

describe("findEntitiesInText —— Q3 2字尾边界校验（青览 B3）", () => {
  const charMap = new Map([
    ["王林", { name: "王林", color: "#5B9BD5", type: "character" as const }],
    ["青云剑", { name: "青云剑", color: "#D64545", type: "lorebook" as const, category: "item" }],
  ]);

  it("2字「王林」在「王林海」中不误亮（尾 CJK 非边界）", () => {
    const m = findEntitiesInText("王林海从远方走来", charMap);
    expect(m.find((x) => x.name === "王林")).toBeUndefined();
  });

  it("2字「王林」在句尾/标点处正常高亮（尾处非 CJK）", () => {
    const m1 = findEntitiesInText("王林。", charMap);
    expect(m1.some((x) => x.name === "王林")).toBe(true);
    const m2 = findEntitiesInText("，王林，", charMap);
    expect(m2.some((x) => x.name === "王林")).toBe(true);
  });

  it("3字「青云剑」放宽边界，常规行文命中", () => {
    const m = findEntitiesInText("他拔出青云剑出鞘", charMap);
    expect(m.some((x) => x.name === "青云剑")).toBe(true);
  });
});
