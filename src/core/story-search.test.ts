import { describe, it, expect } from "vitest";
import {
  buildSnippet,
  scanHits,
  searchStoryNodes,
  SEARCH_CONTEXT_CHARS,
  MAX_HITS_PER_CHAPTER,
  MAX_CHAPTERS,
} from "./story-search";

describe("buildSnippet（上下文片段提取）", () => {
  it("开头命中不加前省略号，结尾命中不加后省略号", () => {
    const text = "铜钥匙在旧仓库的木箱里"; // 12 字
    expect(buildSnippet(text, 0, 3, 60)).toBe("铜钥匙在旧仓库的木箱里"); // 全文都放得下
    expect(buildSnippet(text, 9, 2, 60)).toBe("铜钥匙在旧仓库的木箱里"); // 末尾命中同样放得下
  });

  it("中间命中前后各取 ctx 字符并加省略号", () => {
    const text = "aaaaa铜钥匙bbbbb";
    const s = buildSnippet(text, 5, 3, 3); // 命中在 index5，前后各 3
    expect(s).toBe("…aaa铜钥匙bbb…");
  });

  it("边界：命中词比 ctx 长也能正确切片（命中词居中必带省略号）", () => {
    const text = "xx关键词yy";
    const s = buildSnippet(text, 2, 3, 1);
    expect(s).toBe("…x关键词y…");
  });
});

describe("scanHits（单字段扫描）", () => {
  it("空关键词返回空", () => {
    expect(scanHits("任意正文", "").hits).toEqual([]);
  });

  it("中文子串命中，返回正确位置", () => {
    const r = scanHits("主角捡到铜钥匙，铜钥匙闪着光", "铜钥匙");
    expect(r.positions).toEqual([4, 8]);
    expect(r.hits.length).toBe(2);
  });

  it("英文大小写不敏感", () => {
    const r = scanHits("The KEY is here, key again", "key");
    expect(r.positions.length).toBe(2);
  });

  it("受 maxHits 截断（防爆）", () => {
    const text = "aa ".repeat(20); // 多个 "aa"
    const r = scanHits(text, "aa", { maxHits: 3 });
    expect(r.hits.length).toBe(3);
  });

  it("字段缺失安全（undefined / null 不炸）", () => {
    expect(() => scanHits(null, "x")).not.toThrow();
    expect(scanHits(undefined, "x").hits).toEqual([]);
  });
});

describe("searchStoryNodes（全章检索编排）", () => {
  const nodes = [
    { id: "c1", title: "第一章 起点", type: "chapter", order: 1, content: "主角捡到铜钥匙", outline: "开局" },
    { id: "c2", title: "第二章 旧仓库", type: "chapter", order: 2, content: "仓库里又出现铜钥匙，还有铁锁", outline: "" },
    { id: "c3", title: "第三章 收束", type: "chapter", order: 3, content: "完全不同的内容", outline: "铜钥匙埋线" },
    { id: "v1", title: "卷一", type: "volume", order: 0, content: null, outline: "" },
  ];

  it("空关键词返回空结果", () => {
    const s = searchStoryNodes(nodes, "   ");
    expect(s.chapterCount).toBe(0);
    expect(s.results).toEqual([]);
  });

  it("正文命中：跨章聚合，按 order 升序", () => {
    const s = searchStoryNodes(nodes, "铜钥匙");
    expect(s.chapterCount).toBe(3); // c1 正文 + c2 正文 + c3 大纲
    expect(s.results.map((r) => r.nodeId)).toEqual(["c1", "c2", "c3"]);
    // c3 的命中来自 outline，field 应为 outline
    const c3 = s.results.find((r) => r.nodeId === "c3")!;
    expect(c3.hits[0].field).toBe("outline");
  });

  it("仅标题命中也算命中该章（field=title）", () => {
    const only = [{ id: "x", title: "铁锁的秘密", type: "chapter", order: 1, content: "无关", outline: "" }];
    const s = searchStoryNodes(only, "铁锁");
    expect(s.chapterCount).toBe(1);
    expect(s.results[0].hits[0].field).toBe("title");
  });

  it("单章命中数受 MAX_HITS_PER_CHAPTER 截断", () => {
    const many = {
      id: "m",
      title: "多命中章",
      type: "chapter",
      order: 1,
      content: Array.from({ length: 20 }, (_, i) => `第${i}个铜钥匙`).join("。"),
      outline: "",
    };
    const s = searchStoryNodes([many], "铜钥匙");
    expect(s.results[0].hitCount).toBe(MAX_HITS_PER_CHAPTER);
    expect(s.totalHits).toBe(MAX_HITS_PER_CHAPTER);
  });

  it("章节数受 MAX_CHAPTERS 截断并标记 truncated", () => {
    const big = Array.from({ length: 80 }, (_, i) => ({
      id: `n${i}`,
      title: `章${i}`,
      type: "chapter",
      order: i,
      content: `命中词`,
      outline: "",
    }));
    const s = searchStoryNodes(big, "命中词");
    expect(s.chapterCount).toBe(MAX_CHAPTERS);
    expect(s.truncated).toBe(true);
  });

  it("无命中返回空", () => {
    const s = searchStoryNodes(nodes, "不存在的东西");
    expect(s.chapterCount).toBe(0);
    expect(s.totalHits).toBe(0);
  });

  it("默认上下文长度常量合理", () => {
    expect(SEARCH_CONTEXT_CHARS).toBe(60);
  });
});
