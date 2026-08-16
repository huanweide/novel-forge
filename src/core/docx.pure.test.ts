import { describe, it, expect } from "vitest";
import { buildDocx } from "@/core/docx";
import type { ChapterItem } from "@/core/epub";

/**
 * DOCX 纯函数契约锁死（v2.50.4）。
 *
 * docx.ts 内部的 escapeXml / textRuns / para 是把正文/标题/作者塞进 OOXML 的纯函数，
 * 决定生成的 .docx 是否为合法 XML。一旦转义出错，用户导出的 Word 文件会静默损坏、
 * 且没有任何运行时报错。此前仅有 docx.stream.test.ts 的「结构等价」间接覆盖，
 * 转义逻辑本身零直接单测。本文件锁死该契约，防回归。
 *
 * 纯测试补全，零生产代码改动、零运行时影响（沿用 v2.32 proseToHtml / v2.50.3 epub.pure 路径）。
 */

/** 走本地文件头，逐 entry 取出 {name, data}（stored 压缩，data 即原文）。 */
interface ZipEntryOut {
  name: string;
  data: Buffer;
}
function listZipEntries(buf: Buffer): ZipEntryOut[] {
  const out: ZipEntryOut[] = [];
  const localSig = 0x04034b50;
  let pos = 0;
  while (pos + 30 <= buf.length) {
    const sig = buf.readUInt32LE(pos);
    if (sig !== localSig) break;
    const nameLen = buf.readUInt16LE(pos + 26);
    const extraLen = buf.readUInt16LE(pos + 28);
    const size = buf.readUInt32LE(pos + 22);
    const nameStart = pos + 30;
    const name = buf.slice(nameStart, nameStart + nameLen).toString("utf8");
    const dataStart = nameStart + nameLen + extraLen;
    const data = buf.slice(dataStart, dataStart + size);
    out.push({ name, data });
    pos = dataStart + size;
  }
  return out;
}

function getEntry(buf: Buffer, name: string): string {
  const e = listZipEntries(buf).find((x) => x.name === name);
  if (!e) throw new Error(`ZIP 缺少 entry: ${name}`);
  return e.data.toString("utf8");
}

describe("buildDocx · XML 转义契约（escapeXml 防护）", () => {
  it("正文危险字符 < > & \" ' 全部被转义为实体，绝不裸奔破坏 document.xml", () => {
    const chapters: ChapterItem[] = [
      { title: "测试章", depth: 1, content: "a&b<c>d\"e'f 中文保留", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");

    // 转义后形态必须出现（证明 escapeXml 生效）
    expect(doc).toContain("a&amp;b&lt;c&gt;d&quot;e&apos;f");
    // 裸奔危险形态必须不出现（证明不会破坏 XML 结构）
    expect(doc).not.toContain("a&b<c>d\"e'f");
    expect(doc).not.toContain("<c>");
    // 中文原样保留（escapeXml 不触碰 CJK）
    expect(doc).toContain("中文保留");
  });

  it("章节标题里的危险字符同样被转义（标题也走 escapeXml）", () => {
    const chapters: ChapterItem[] = [
      { title: "卷<一> & \"特\" '别'", depth: 0, content: "正文", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");

    expect(doc).toContain("卷&lt;一&gt; &amp; &quot;特&quot; &apos;别&apos;");
    expect(doc).not.toContain("卷<一>");
  });

  it("作者名危险字符在 docProps/core.xml 的 dc:creator 里被转义", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "x", outline: "" },
    ];
    const core = getEntry(buildDocx("书", chapters, { author: "作<者>" }), "docProps/core.xml");

    expect(core).toContain("<dc:creator>作&lt;者&gt;</dc:creator>");
    expect(core).not.toContain("<dc:creator>作<者>");
  });

  it("多行正文被拆成 <w:t> 并以 <w:br/> 衔接（textRuns 行为锁死）", () => {
    const chapters: ChapterItem[] = [
      { title: "章", depth: 1, content: "第一行\n第二行\n第三行", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");

    expect(doc).toContain("<w:br/>");
    expect(doc).toContain("第一行");
    expect(doc).toContain("第二行");
    expect(doc).toContain("第三行");
  });

  it("空正文且无大纲的章节回退提示语「（此节暂无内容）」", () => {
    const chapters: ChapterItem[] = [
      { title: "空章", depth: 1, content: "", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");

    expect(doc).toContain("（此节暂无内容）");
  });

  it("含 & 的章节标题在 document.xml 全文中整体合法（错误转义会留下裸 &）", () => {
    const chapters: ChapterItem[] = [
      { title: "特别篇 & 番外", depth: 1, content: "内容", outline: "" },
    ];
    const doc = getEntry(buildDocx("书", chapters), "word/document.xml");

    // 标题里整段裸 & 必不存在；应转为 &amp;
    expect(doc).not.toContain("特别篇 & 番外");
    expect(doc).toContain("特别篇 &amp; 番外");
  });
});
