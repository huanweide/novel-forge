/**
 * banned-words.ts 单元测试（内容安全预检 / FE-N7）
 * 覆盖：默认词库、node 环境自定义词库回退、扫描匹配语义
 * （大小写不敏感 / CJK 子串 / 拉丁短词词边界避免误伤 / extra 合并 / maxHits 限制 / context 结构）。
 */
import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_BANNED_WORDS,
  loadCustomBannedWords,
  saveCustomBannedWords,
  getAllBannedWords,
  scanBannedWords,
} from "./banned-words";

describe("DEFAULT_BANNED_WORDS", () => {
  it("内置 34 个引流/广告/联系方式词（真身实际数量）", () => {
    expect(DEFAULT_BANNED_WORDS).toHaveLength(34);
    expect(DEFAULT_BANNED_WORDS).toContain("微信");
    expect(DEFAULT_BANNED_WORDS).toContain("vx");
    expect(DEFAULT_BANNED_WORDS).toContain("V信");
  });
});

describe("loadCustomBannedWords", () => {
  it("node 环境（无 window）返回空数组", () => {
    // 测试运行于 node 环境，typeof window === "undefined" 分支应返回 []
    expect(loadCustomBannedWords()).toEqual([]);
  });
});

describe("getAllBannedWords", () => {
  it("合并默认词库且无重复（自定义为空时长度等于默认）", () => {
    const all = getAllBannedWords();
    expect(all.length).toBe(DEFAULT_BANNED_WORDS.length);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("scanBannedWords", () => {
  it("空文本 / 纯空白返回空数组", () => {
    expect(scanBannedWords("")).toEqual([]);
    expect(scanBannedWords("   ")).toEqual([]);
  });

  it("中文走子串匹配", () => {
    const hits = scanBannedWords("快加微信领福利");
    expect(hits.some((h) => h.word === "微信")).toBe(true);
  });

  it("大小写不敏感（VX / 微信 均命中）", () => {
    expect(scanBannedWords("加 VX 联系").some((h) => h.word.toLowerCase() === "vx")).toBe(true);
    expect(scanBannedWords("加 微信 联系").some((h) => h.word === "微信")).toBe(true);
  });

  it("拉丁短词词边界：vx 不误命中 avx", () => {
    const hits = scanBannedWords("用avx芯片控制");
    expect(hits.some((h) => h.word.toLowerCase() === "vx")).toBe(false);
  });

  it("拉丁短词独立出现命中（前后非字母数字）", () => {
    expect(scanBannedWords("my vx please").some((h) => h.word.toLowerCase() === "vx")).toBe(true);
  });

  it("V信 走边界判定（中文夹杂英文短词仍可命中）", () => {
    expect(scanBannedWords("请V信我").some((h) => h.word === "V信")).toBe(true);
  });

  it("extra 词库被合并进扫描", () => {
    const hits = scanBannedWords("联系 mysecretword 哦", ["mysecretword"]);
    expect(hits.some((h) => h.word === "mysecretword")).toBe(true);
  });

  it("maxHits 限制返回数量上限", () => {
    const text = "微信 ".repeat(8).trim();
    const hits = scanBannedWords(text, undefined, 3);
    expect(hits.length).toBeLessThanOrEqual(3);
    expect(hits.length).toBe(3);
  });

  it("返回命中结构 index / end / context，且 context 含命中词", () => {
    const text = "请加微信好友";
    const hits = scanBannedWords(text);
    const hit = hits.find((h) => h.word === "微信");
    expect(hit).toBeDefined();
    expect(hit!.index).toBeGreaterThanOrEqual(0);
    expect(hit!.end).toBe(hit!.index + "微信".length);
    expect(hit!.context).toContain("微信");
  });

  it("context 中连续空白被压缩为单空格", () => {
    const text = "a".repeat(60) + "微信" + "b".repeat(60);
    const hit = scanBannedWords(text)[0];
    expect(hit.context).not.toMatch(/\s{2,}/);
  });

  it("同一文本多次出现均被命中（from 推进）", () => {
    const hits = scanBannedWords("加微信 再加微信 还加微信");
    expect(hits.filter((h) => h.word === "微信").length).toBe(3);
  });
});

describe("自定义词库读写（browser 分支，vi.stubGlobal 模拟 localStorage）", () => {
  const buildMockStorage = () => {
    const store: Record<string, string> = {};
    return {
      store,
      ls: {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = v;
        },
      },
    };
  };

  it("saveCustomBannedWords 去空去重写入；loadCustomBannedWords 读回", () => {
    const { store, ls } = buildMockStorage();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    try {
      saveCustomBannedWords(["  A ", "", "B", "B"]);
      const loaded = loadCustomBannedWords();
      expect(loaded).toEqual(["A", "B"]);
      expect(store["nf-banned-words"]).toBe("A\nB");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("getAllBannedWords 合并默认 + 自定义词库", () => {
    const { store, ls } = buildMockStorage();
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", ls);
    try {
      saveCustomBannedWords(["customword"]);
      const all = getAllBannedWords();
      expect(all).toContain("customword");
      expect(all).toContain("微信");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
