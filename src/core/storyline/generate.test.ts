import { describe, it, expect, vi } from "vitest";

vi.mock("@/core/llm/client", () => ({
  completeText: vi.fn(),
}));

import { completeText } from "@/core/llm/client";
import { storylineStyleDesc, generateStorylineSuggestions } from "./generate";

describe("storylineStyleDesc（#201 风格轴提示）", () => {
  it("simple 强调简约、主线三要素提纲", () => {
    const d = storylineStyleDesc("simple");
    expect(d).toContain("简约");
    expect(d).toContain("三要素");
  });

  it("normal 强调均衡常规", () => {
    expect(storylineStyleDesc("normal")).toContain("均衡");
  });

  it("creative（含缺省 undefined）强调大胆脑洞", () => {
    expect(storylineStyleDesc("creative")).toContain("大胆脑洞");
    expect(storylineStyleDesc(undefined)).toContain("大胆脑洞");
  });
});

describe("generateStorylineSuggestions thread 解析（#223）", () => {
  const baseInput = {
    project: { name: "测试作", genre: ["都市"], toneKeywords: [] },
    characters: [],
    loreEntries: [],
    existingStorylines: [{ type: "main", title: "主线", status: "active" }],
  } as any;

  it("AI 返回 type=thread 时正确解析为 thread，且七要素留空", async () => {
    (completeText as any).mockResolvedValue(
      JSON.stringify({
        lines: [
          {
            type: "side",
            title: "支线A",
            description: "一段情节",
            desire: "x",
            obstacle: "y",
            action: "z",
            result: "r",
            twist: "t",
            turn: "u",
            ending: "e",
          },
          {
            type: "thread",
            title: "掩埋之钥",
            description: "一个未解之谜",
            desire: "",
            obstacle: "",
            action: "",
            result: "",
            twist: "",
            turn: "",
            ending: "",
          },
        ],
      }),
    );
    const res = await generateStorylineSuggestions(baseInput);
    expect(res.map((r) => r.type)).toEqual(["side", "thread"]);
    const thread = res.find((r) => r.type === "thread")!;
    expect(thread.title).toBe("掩埋之钥");
    expect(thread.sevenElements.desire).toBe("");
  });

  it("无活跃主线时 thread 无法独立成树，降级为 side", async () => {
    (completeText as any).mockResolvedValue(
      JSON.stringify({ lines: [{ type: "thread", title: "孤立伏笔", description: "d" }] }),
    );
    const res = await generateStorylineSuggestions({
      ...baseInput,
      existingStorylines: [],
    });
    expect(res[0].type).toBe("side");
  });
});
