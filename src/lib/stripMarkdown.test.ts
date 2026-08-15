import { describe, it, expect } from "vitest";
import { stripMarkdown, segmentText } from "./stripMarkdown";

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

describe("stripMarkdown preserveParagraphs 保留段落结构", () => {
  it("默认行为压缩多空行为单换行", () => {
    expect(stripMarkdown("第一段。\n\n\n第二段。")).toBe("第一段。\n第二段。");
  });

  it("preserveParagraphs 保留双换行段落断点", () => {
    expect(stripMarkdown("第一段。\n\n\n第二段。", { preserveParagraphs: true })).toBe(
      "第一段。\n\n第二段。",
    );
  });

  it("preserveParagraphs 不残留 Markdown 符号", () => {
    const out = stripMarkdown("# 标题\n\n这是**重点**，*轻声*说完。\n\n> 引语", {
      preserveParagraphs: true,
    });
    expect(out).not.toContain("#");
    expect(out).not.toContain("*");
    expect(out).not.toContain(">");
    expect(out).toBe("标题\n\n这是重点，轻声说完。\n\n引语");
  });
});

describe("segmentText 朗读切句分段", () => {
  it("空串/纯空白返回空数组", () => {
    expect(segmentText("")).toEqual([]);
    expect(segmentText("   \n  ")).toEqual([]);
  });

  it("按中文句末标点切分，标点保留在句尾", () => {
    const segs = segmentText("他转身走了。她没有回头。雨下起来了！");
    expect(segs).toEqual(["他转身走了。", "她没有回头。", "雨下起来了！"]);
  });

  it("英文标点也切分", () => {
    const segs = segmentText("Hello world. How are you? I'm fine!");
    expect(segs).toEqual(["Hello world.", "How are you?", "I'm fine!"]);
  });

  it("段落之间按双换行切分，段落停顿自然形成", () => {
    const segs = segmentText("第一段第一句。第一段第二句。\n\n第二段只有一句。");
    expect(segs).toEqual(["第一段第一句。", "第一段第二句。", "第二段只有一句。"]);
  });

  it("单换行也视为停顿点（拆成独立朗读单元）", () => {
    const segs = segmentText("第一行\n第二行");
    expect(segs).toEqual(["第一行", "第二行"]);
  });

  it("首尾空白与空段被清理", () => {
    const segs = segmentText("\n\n  他笑了。  \n\n  她也笑了。  \n");
    expect(segs).toEqual(["他笑了。", "她也笑了。"]);
  });
});
