import { describe, it, expect } from "vitest";
import { countByModule } from "./worldPanelData";

const entries = [
  { category: "custom" },
  { category: "custom" },
  { category: "custom" },
  { category: "geography" },
  { category: "geography" },
  { category: "item" },
];

describe("countByModule", () => {
  it("custom（特殊设定）按 e.category === 'custom' 正确计数，不因在白名单而被排除", () => {
    // 回归：旧逻辑 !CATEGORY_TO_MODULE[e.category] 对 custom 恒为 false，会漏数 → 0
    expect(countByModule(entries, "custom")).toBe(3);
  });

  it("普通板块按 CATEGORY_TO_MODULE 映射计数", () => {
    expect(countByModule(entries, "geography")).toBe(2);
    expect(countByModule(entries, "item")).toBe(1);
  });

  it("无匹配返回 0", () => {
    expect(countByModule(entries, "faction")).toBe(0);
  });

  it("存在未映射的脏 category 时，custom 计数仍只统计真正的 custom", () => {
    const dirty = [...entries, { category: "economy" }, { category: "location" }];
    expect(countByModule(dirty, "custom")).toBe(3);
  });
});
