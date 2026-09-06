/**
 * 发布管线单测（M4 · 导出即上站）
 *
 * 重点锁死：
 *   1. 排版切分：短段原样保留（不破坏作者节奏），长段按句切开
 *   2. 字数诊断：短/达标/超长三态判定与可执行建议
 *   3. 平台差异：番茄带章节编号、公众号不带
 *   4. 署名页转义（标题里的尖括号不能变成可执行 HTML）
 */
import { describe, it, expect } from "vitest";
import {
  countWords,
  formatParagraphs,
  formatForPlatform,
  formatChapterTitle,
  buildPublishReport,
  buildAttributionHtml,
  PLATFORM_PRESETS,
  type PublishNode,
} from "./pipeline";

function node(order: number, words: number, title?: string): PublishNode {
  return { id: `n${order}`, order, title: title ?? `第${order + 1}章`, content: "字".repeat(words) };
}

describe("countWords", () => {
  it("排除空白后计数（中文按字算，符合平台惯例）", () => {
    expect(countWords("你好 世界\n\nagain")).toBe(9); // 你好世界again = 4+5
    expect(countWords("")).toBe(0);
    expect(countWords(null as unknown as string)).toBe(0);
  });
});

describe("formatParagraphs —— 排版切分", () => {
  it("短段原样保留，不为了整齐破坏作者节奏", () => {
    const src = "这是一段很短的话。\n\n这是第二段。";
    expect(formatParagraphs(src, 120)).toBe(src);
  });

  it("长段按句切开，且切口落在句末标点后", () => {
    // 5 句，每句约 30 字，阈值 40 → 应被切成多段
    const sentence = "这是一个用来测试排版切分功能的句子内容。";
    const src = sentence.repeat(5);
    const out = formatParagraphs(src, 40);
    const paras = out.split("\n\n");
    expect(paras.length).toBeGreaterThan(1);
    for (const p of paras) {
      expect(p.length).toBeLessThanOrEqual(45); // 允许单句略超
      expect(p.endsWith("。")).toBe(true); // 切口在句末
    }
  });

  it("按平台预设排版：番茄段落比起点更短", () => {
    const sentence = "这是一个用来测试不同平台排版差异的句子内容。";
    const src = sentence.repeat(6);
    const fanqie = formatForPlatform(src, "fanqie");
    const qidian = formatForPlatform(src, "qidian");
    const maxPara = (s: string) => Math.max(...s.split("\n\n").map((p) => p.length));
    expect(maxPara(fanqie)).toBeLessThanOrEqual(maxPara(qidian));
  });

  it("空内容不炸", () => {
    expect(formatParagraphs("", 100)).toBe("");
    expect(formatForPlatform(null as unknown as string, "fanqie")).toBe("");
  });
});

describe("formatChapterTitle —— 平台标题格式", () => {
  it("番茄 / 起点带章节编号", () => {
    expect(formatChapterTitle("初见", 0, "fanqie")).toBe("第1章 初见");
    expect(formatChapterTitle("初见", 4, "qidian")).toBe("第5章 初见");
  });

  it("公众号不带编号，直接用章节名", () => {
    expect(formatChapterTitle("初见", 0, "wechat")).toBe("初见");
  });

  it("章节名为空时给占位，不留空标题", () => {
    expect(formatChapterTitle(null, 2, "fanqie")).toBe("第3章 未命名");
    expect(formatChapterTitle("   ", 2, "fanqie")).toBe("第3章 未命名");
  });
});

describe("buildPublishReport —— 字数诊断", () => {
  it("字数不足判为偏短，并给出补字/合并的可执行建议", () => {
    const r = buildPublishReport([node(0, 1000)], "fanqie");
    expect(r.chapters[0].status).toBe("short");
    expect(r.chapters[0].advice).toContain("偏短");
    expect(r.chapters[0].advice).toMatch(/补一段|合并/);
  });

  it("字数达标判为 ok", () => {
    const r = buildPublishReport([node(0, 2000)], "fanqie");
    expect(r.chapters[0].status).toBe("ok");
  });

  it("字数超标判为偏长，并建议断章", () => {
    const r = buildPublishReport([node(0, 3000)], "fanqie");
    expect(r.chapters[0].status).toBe("long");
    expect(r.chapters[0].advice).toContain("偏长");
    expect(r.chapters[0].advice).toContain("断成两章");
  });

  it("同一份稿子在番茄偏长、在起点却达标（平台差异真实生效）", () => {
    const nodes = [node(0, 3000)];
    const fanqie = buildPublishReport(nodes, "fanqie");
    const qidian = buildPublishReport(nodes, "qidian");
    expect(fanqie.chapters[0].status).toBe("long");
    expect(qidian.chapters[0].status).toBe("ok");
  });

  it("汇总统计与实际清单一致", () => {
    const r = buildPublishReport(
      [node(0, 1000), node(1, 2000), node(2, 3000)],
      "fanqie",
    );
    expect(r.summary.total).toBe(3);
    expect(r.summary.short).toBe(1);
    expect(r.summary.ok).toBe(1);
    expect(r.summary.long).toBe(1);
    expect(r.summary.totalWords).toBe(6000);
    expect(r.summary.okRate).toBe(33);
  });

  it("空章节（无正文）不进诊断，不刷屏", () => {
    const r = buildPublishReport([{ id: "empty", order: 0, title: "空章", content: "   " }], "fanqie");
    expect(r.chapters).toHaveLength(0);
    expect(r.summary.total).toBe(0);
    expect(r.summary.okRate).toBe(0);
  });

  it("按章节顺序输出", () => {
    const r = buildPublishReport([node(2, 2000), node(0, 2000), node(1, 2000)], "fanqie");
    expect(r.chapters.map((c) => c.order)).toEqual([0, 1, 2]);
  });
});

describe("buildAttributionHtml —— 署名页", () => {
  it("包含作品名、作者与 novel-smith 署名链接", () => {
    const html = buildAttributionHtml({ projectTitle: "新城龙陨", authorName: "瑞宝宝", platform: "fanqie" });
    expect(html).toContain("新城龙陨");
    expect(html).toContain("瑞宝宝");
    expect(html).toContain("huanweide/novel-smith");
    expect(html).toContain("番茄小说");
  });

  it("标题里的尖括号被转义，不会变成可执行 HTML（防 XSS）", () => {
    const html = buildAttributionHtml({
      projectTitle: '<script>alert("x")</script>',
      authorName: "<img onerror=alert(1)>",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("缺字段时用占位，不留空", () => {
    const html = buildAttributionHtml({});
    expect(html).toContain("未命名作品");
    expect(html).toContain("佚名");
  });
});

describe("PLATFORM_PRESETS —— 预设自洽", () => {
  it("每个平台的字数区间上下限合理", () => {
    for (const p of Object.values(PLATFORM_PRESETS)) {
      expect(p.targetWords.min).toBeGreaterThan(0);
      expect(p.targetWords.max).toBeGreaterThan(p.targetWords.min);
      expect(p.maxParagraphChars).toBeGreaterThan(0);
      expect(p.note.length).toBeGreaterThan(10);
    }
  });
});
