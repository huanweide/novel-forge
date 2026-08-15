import { describe, it, expect } from "vitest";
import { stripMarkdown } from "./stripMarkdown";

describe("stripMarkdown 朗读前清洗", () => {
  it("空串返回空串", () => {
    expect(stripMarkdown("")).toBe("");
  });

  it("纯文本不改动", () => {
    expect(stripMarkdown("他转身走进了雨里。")).toBe("他转身走进了雨里。");
  });

  it("粗体 **文字** → 文字", () => {
    expect(stripMarkdown("这是**重点**内容")).toBe("这是重点内容");
  });

  it("下划线粗体 __文字__ → 文字", () => {
    expect(stripMarkdown("__强调__一下")).toBe("强调一下");
  });

  it("斜体 *文字* → 文字", () => {
    expect(stripMarkdown("一段*轻声*呢喃")).toBe("一段轻声呢喃");
  });

  it("下划线斜体 _文字_ → 文字", () => {
    expect(stripMarkdown("他_low_地笑")).toBe("他low地笑");
  });

  it("行内代码 `code` → code（去反引号）", () => {
    expect(stripMarkdown("用 `npm run` 启动")).toBe("用 npm run 启动");
  });

  it("代码块 ```...``` → 空格（整块去除）", () => {
    const md = "前文\n```\nconst a = 1;\n```\n后文";
    expect(stripMarkdown(md)).toBe("前文\n \n后文");
  });

  it("链接 [文字](url) → 仅保留文字", () => {
    expect(stripMarkdown("见[官网](https://x.com)了解")).toBe("见官网了解");
  });

  it("图片 ![alt](url) → 空格（不念 alt）", () => {
    expect(stripMarkdown("图![示意图](a.png)片")).toBe("图 片");
  });

  it("标题 # 文字 → 去 # 保留文字", () => {
    expect(stripMarkdown("# 第一章 启程")).toBe("第一章 启程");
    expect(stripMarkdown("### 小节")).toBe("小节");
  });

  it("引用 > 文字 → 去 > 保留文字", () => {
    expect(stripMarkdown("> 他说过这句话")).toBe("他说过这句话");
  });

  it("无序列表 - 文字 → 去符号保留文字", () => {
    expect(stripMarkdown("- 苹果\n- 香蕉")).toBe("苹果\n香蕉");
  });

  it("有序列表 1. 文字 → 去编号保留文字", () => {
    expect(stripMarkdown("1. 第一步\n2. 第二步")).toBe("第一步\n第二步");
  });

  it("残余星号/井号等符号 → 空格（不念出）", () => {
    expect(stripMarkdown("***分隔线***")).toBe("分隔线");
    expect(stripMarkdown("###")).toBe("");
  });

  it("多余空行压缩为单换行 + 首尾 trim", () => {
    expect(stripMarkdown("\n\n  开头  \n\n\n中段\n\n")).toBe("开头 \n中段");
  });

  it("综合：真实章节正文清洗不残留 Markdown 符号", () => {
    const src = `# 龙陨之地

叶凌云望着**漆黑**的夜空，低声说：*快走*。

> 这是一句伏笔。

- 第一项
- 第二项

详见[设定集](https://x.com/s)与 \`code\`。`;
    const out = stripMarkdown(src);
    expect(out).not.toContain("#");
    expect(out).not.toContain("*");
    expect(out).not.toContain(">");
    expect(out).not.toContain("`");
    expect(out).toContain("龙陨之地");
    expect(out).toContain("漆黑");
    expect(out).toContain("快走");
    expect(out).toContain("伏笔");
    expect(out).toContain("第一项");
    expect(out).toContain("设定集");
  });
});
