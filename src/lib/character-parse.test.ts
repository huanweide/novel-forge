import { describe, it, expect } from "vitest";
import {
  fromText,
  toText,
  timelineToText,
  textToTimeline,
  CHARACTER_ROLE_LABEL,
} from "./character-parse";
import type { CharacterRole } from "@/core/types";

describe("fromText / toText —— 性格文本互逆", () => {
  const SPEC = "主导：冷静\n驱动：复仇\n矛盾：本性善良\n习惯：抽烟、喝酒\n面具：冷漠";

  it("解析规范性格文本", () => {
    const p = fromText(SPEC);
    expect(p.dominant).toBe("冷静");
    expect(p.drive).toBe("复仇");
    expect(p.contradiction).toBe("本性善良");
    expect(p.habits).toEqual(["抽烟", "喝酒"]);
    expect(p.socialMask).toBe("冷漠");
  });

  it("与 toText 互逆（字段顺序一致）", () => {
    expect(toText(fromText(SPEC))).toBe(SPEC);
  });

  it("空文本返回全空结构", () => {
    expect(fromText("")).toEqual({
      dominant: "",
      drive: "",
      contradiction: "",
      habits: [],
      socialMask: "",
    });
  });

  it("toText 接受数组", () => {
    expect(toText(["a", "b"])).toBe("a、b");
  });

  it("toText 接受普通字符串", () => {
    expect(toText("x")).toBe("x");
  });
});

describe("时间线解析", () => {
  it("timelineToText 生成中文", () => {
    expect(timelineToText([{ age: 18, event: "觉醒", era: "新城" }])).toBe("18岁：觉醒（新城）");
  });

  it("timelineToText 空/未定义返回空串", () => {
    expect(timelineToText()).toBe("");
    expect(timelineToText([])).toBe("");
  });

  it("textToTimeline 解析带 era", () => {
    expect(textToTimeline("18岁：觉醒（新城）")).toEqual([
      { age: 18, event: "觉醒", era: "新城" },
    ]);
  });

  it("textToTimeline 无 era 括号", () => {
    expect(textToTimeline("18岁：觉醒")).toEqual([{ age: 18, event: "觉醒", era: "" }]);
  });

  it("textToTimeline 普通文本落入 event", () => {
    expect(textToTimeline("一段平凡经历")).toEqual([
      { age: 0, event: "一段平凡经历", era: "" },
    ]);
  });
});

describe("CHARACTER_ROLE_LABEL —— 角色类型权威映射", () => {
  it("覆盖所有角色类型的标签", () => {
    const roles: CharacterRole[] = [
      "protagonist",
      "antagonist",
      "supporting",
      "mentor",
      "love_interest",
      "catalyst",
      "comic_relief",
      "background",
    ];
    for (const r of roles) {
      expect(CHARACTER_ROLE_LABEL[r]).toBeTruthy();
    }
  });
});
