import { describe, it, expect } from "vitest";
import { buildDocx } from "@/core/docx";
import type { ChapterItem } from "@/core/epub";

/**
 * DOCX 排版增强特性锁（Round-29 FIX-6）：
 * 首行缩进（w:ind firstLine）+ 基础 Markdown 解析（加粗、斜体、井号标题、减号列表）+ 目录域（TOC）。
 * 与 docx.pure.test.ts 的转义契约互不冲突——本文件只验证新增排版能力。
 */

function getEntry(buf: Buffer, name: string): string {
  const localSig = 0x04034b50;
  const out: { name: string; data: Buffer }[] = [];
  let pos = 0;
  while (pos + 30 <= buf.length) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== localSig) break;
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const size = buf.readUInt32LE(pos + 22);
    const nameStart = pos + 30;
    const nameStr = buf.slice(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    out.push({ name: nameStr, data: buf.slice(dataStart, dataStart + size) });
    pos = dataStart + size;
  }
  const e = out.find((x) => x.name === name);
  if (!e) throw new Error(`ZIP 缺少 entry: ${name}`);
  return e.data.toString("utf8");
}

describe("buildDocx · 首行缩进", () => {
  it("正文段落含 <w:ind w:firstLine=480（段首缩进 2 字）", () => {
    const chapters: ChapterItem[] = [
      { title: "第一章", depth: 1, content: "这是一段正文，应当首行缩进。", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain(`<w:ind w:firstLine="480"/>`);
  });

  it("标题段落不应带首行缩进（仅在正文）", () => {
    const chapters: ChapterItem[] = [
      { title: "第一章", depth: 1, content: "正文", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    // 拆分每个 <w:p> 段落，标题段（含 第一章）不应含 firstLine
    const paras = doc.split("<w:p>");
    const titlePara = paras.find((p) => p.includes("第一章"));
    expect(titlePara).toBeDefined();
    expect(titlePara).not.toContain(`w:firstLine`);
  });
});

describe("buildDocx · 基础 Markdown 解析", () => {
  it("正文 **粗** 解析为 <w:b/> 加粗 run（标记本身不残留）", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "这是**粗体**示例", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain("<w:b/>");
    expect(doc).toContain("粗体");
    // 字面星号标记不应残留
    expect(doc).not.toContain("**");
  });

  it("正文 *斜体* 解析为 <w:i/>", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "这是*斜体*文字", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain("<w:i/>");
    expect(doc).toContain("斜体");
    expect(doc).not.toContain("*斜体*");
  });

  it("# 标题 行解析为加粗大字号 run", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "# 小节标题\n正文内容", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain(`<w:sz w:val="32"/>`);
    expect(doc).toContain("小节标题");
    expect(doc).not.toContain("# 小节标题");
  });

  it("- 列表 行前缀插入项目符号 •", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "- 第一项\n- 第二项", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain("• ");
    expect(doc).toContain("第一项");
    expect(doc).toContain("第二项");
    expect(doc).not.toContain("- 第一项");
  });

  it("不含任何 Markdown 标记的正文保持原样（正文段无额外 run 标记）", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "普通段落，没有标记。", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    // 文档级标题本身走 para 会加粗（预期），故只校验正文段落自身
    const bodyPara = doc.split("<w:p>").find((p) => p.includes("普通段落，没有标记。"));
    expect(bodyPara).toBeDefined();
    // 正文段落不应出现嵌套 rPr（加粗/斜体/大字号均未注入）
    expect(bodyPara).not.toContain("<w:rPr>");
    expect(doc).toContain("普通段落，没有标记。");
  });
});

describe("buildDocx · 目录域", () => {
  it("document.xml 含 TOC 域指令", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "正文", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");
    expect(doc).toContain("TOC");
    expect(doc).toContain(`w:instr="TOC"`);
  });
});
