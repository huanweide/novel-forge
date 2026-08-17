import { describe, it, expect } from "vitest";
import { escapeHtml, stripControlChars, buildChapterList } from "./epub";

describe("escapeHtml（HTML 实体转义，被 proseToHtml/导出文档复用）", () => {
  it("转义 & 符号", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });
  it("转义 < 和 > 成标签实体", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;");
  });
  it("转义双引号", () => {
    expect(escapeHtml('a "b"')).toBe("a &quot;b&quot;");
  });
  it("转义单引号", () => {
    expect(escapeHtml("a 'b'")).toBe("a &#39;b&#39;");
  });
  it("混合标签整体转义", () => {
    expect(escapeHtml('<a href="x">')).toBe("&lt;a href=&quot;x&quot;&gt;");
  });
  it("空串返回空串", () => {
    expect(escapeHtml("")).toBe("");
  });
  it("中文与正常字符原样保留，仅危险字符被转义", () => {
    expect(escapeHtml("你好<世界>&'\"")).toBe("你好&lt;世界&gt;&amp;&#39;&quot;");
  });
});

describe("stripControlChars（round-29 FIX-1：导出前清洗 XML 非法控制字符）", () => {
  it("剥离 C0 控制字符 \\x00-\\x08，避免生成非法 XML 文档", () => {
    expect(stripControlChars("a\x00b\x01c\x08d")).toBe("abcd");
  });
  it("剥离 \\x0B \\x0C \\x0E-\\x1F（垂直制表/换页/传输控制符）", () => {
    expect(stripControlChars("a\x0Bb\x0Cc\x1Ed")).toBe("abcd");
  });
  it("保留 XML 合法的空白控制字符 tab(#x9)/LF(#xA)/CR(#xD)", () => {
    expect(stripControlChars("a\tb\nc\rd")).toBe("a\tb\nc\rd");
  });
  it("空串与 undefined 安全返回空串（不抛错）", () => {
    expect(stripControlChars("")).toBe("");
    expect(stripControlChars(undefined as unknown as string)).toBe("");
  });
  it("正常中文与标点原样保留", () => {
    expect(stripControlChars("你好，世界！<>&'\"")).toBe("你好，世界！<>&'\"");
  });
  it("escapeHtml 先清洗再转义：含控制字符的正文不再生成非法 XML", () => {
    // 控制字符被剥离，危险字符被转义，最终是合法 XML 片段
    expect(escapeHtml("a\x00<b>&c")).toBe("a&lt;b&gt;&amp;c");
  });
});

describe("buildChapterList（EPUB/HTML 目录前序遍历排序）", () => {
  const make = (over: Record<string, unknown> = {}) => ({
    id: "a",
    title: "第一章",
    order: 1,
    outline: "概要",
    content: "正文",
    ...over,
  });

  it("单根无子节点返回 depth=1 的单条", () => {
    const list = buildChapterList([make()], [], false);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ title: "第一章", depth: 1, content: "正文" });
  });

  it("多根按 order 升序排列", () => {
    const r1 = make({ id: "b", title: "第二章", order: 2 });
    const r2 = make({ id: "a", title: "第一章", order: 1 });
    const list = buildChapterList([r1, r2], [], false);
    expect(list.map((i) => i.title)).toEqual(["第一章", "第二章"]);
  });

  it("前序遍历并按 order 排子节点，depth 逐层递增", () => {
    const root = make({ id: "r", title: "根", order: 1 });
    const c1 = make({ id: "c1", title: "子一", order: 1, parentId: "r" });
    const c2 = make({ id: "c2", title: "子二", order: 2, parentId: "r" });
    const list = buildChapterList([root], [c1, c2], false);
    expect(list.map((i) => i.title)).toEqual(["根", "子一", "子二"]);
    expect(list.map((i) => i.depth)).toEqual([1, 2, 2]);
  });

  it("嵌套两层子节点：孙节点 depth=3 且顺序正确", () => {
    const root = make({ id: "r", title: "根", order: 1 });
    const mid = make({ id: "m", title: "中", order: 1, parentId: "r" });
    const leaf = make({ id: "l", title: "叶", order: 1, parentId: "m" });
    const list = buildChapterList([root], [mid, leaf], false);
    expect(list.map((i) => i.title)).toEqual(["根", "中", "叶"]);
    expect(list.map((i) => i.depth)).toEqual([1, 2, 3]);
  });

  it("includeOutline=false 时 outline 强制为 null", () => {
    const list = buildChapterList([make({ outline: "概要" })], [], false);
    expect(list[0].outline).toBeNull();
  });

  it("includeOutline=true 时保留节点 outline", () => {
    const list = buildChapterList([make({ outline: "概要" })], [], true);
    expect(list[0].outline).toBe("概要");
  });

  it("缺 title 时回退未命名", () => {
    const list = buildChapterList([make({ title: undefined })], [], false);
    expect(list[0].title).toBe("未命名");
  });

  it("子节点 order 相同时按 createdAt 兜底排序", () => {
    const root = make({ id: "r", title: "根", order: 1 });
    const early = make({ id: "e", title: "早", order: 1, parentId: "r", createdAt: "2026-01-01" });
    const late = make({ id: "l", title: "晚", order: 1, parentId: "r", createdAt: "2026-02-01" });
    const list = buildChapterList([root], [early, late], false);
    expect(list.map((i) => i.title)).toEqual(["根", "早", "晚"]);
  });
});
