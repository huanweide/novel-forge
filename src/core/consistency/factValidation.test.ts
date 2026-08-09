import { describe, it, expect } from "vitest";
import { validateFactInput, FACT_CATEGORIES } from "./factValidation";

describe("validateFactInput", () => {
  it("新建：合法全字段通过", () => {
    const r = validateFactInput(
      {
        category: "character",
        subject: "林惊羽",
        attribute: "发色",
        value: "墨黑",
        source: "第3章",
        confidence: 0.9,
      },
      { allowPartial: false },
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      category: "character",
      subject: "林惊羽",
      attribute: "发色",
      value: "墨黑",
      source: "第3章",
      confidence: 0.9,
    });
  });

  it("新建：缺 subject 报错", () => {
    const r = validateFactInput({ category: "world", attribute: "x", value: "y" }, { allowPartial: false });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("subject");
  });

  it("新建：category 非法报错", () => {
    const r = validateFactInput(
      { category: "banana", subject: "s", attribute: "a", value: "v" },
      { allowPartial: false },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("category");
  });

  it("新建：confidence 越界报错", () => {
    const r = validateFactInput(
      { category: "plot", subject: "s", attribute: "a", value: "v", confidence: 1.5 },
      { allowPartial: false },
    );
    expect(r.ok).toBe(false);
    expect(r.error).toContain("confidence");
  });

  it("编辑：只传一个字段，其余沿用 current", () => {
    const r = validateFactInput(
      { value: "灰眸" },
      {
        allowPartial: true,
        current: { category: "character", subject: "林惊羽", attribute: "瞳色", value: "黑眸" },
      },
    );
    expect(r.ok).toBe(true);
    expect(r.data).toMatchObject({
      category: "character",
      subject: "林惊羽",
      attribute: "瞳色",
      value: "灰眸",
    });
  });

  it("编辑：把字段改成空串时回退到 current（不报错）", () => {
    const r = validateFactInput(
      { value: "   " },
      {
        allowPartial: true,
        current: { category: "character", subject: "林惊羽", attribute: "瞳色", value: "黑眸" },
      },
    );
    expect(r.ok).toBe(true);
    expect(r.data?.value).toBe("黑眸");
  });

  it("FACT_CATEGORIES 含四类", () => {
    expect(FACT_CATEGORIES).toEqual(["character", "world", "plot", "relationship"]);
  });
});
