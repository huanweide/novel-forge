import { describe, it, expect } from "vitest";
import {
  parseManifest,
  parseSpine,
  stripHtml,
  docxToText,
} from "./manuscript-parse";

describe("parseManifest —— EPUB OPF manifest 解析", () => {
  it("顺序无关：id 在 href 前后都能匹配（修复前 href 在前会被漏掉）", () => {
    const opf =
      '<manifest><item href="ch1.xhtml" id="ch1" media-type="application/xhtml+xml"/><item id="ch2" href="ch2.xhtml"/></manifest>';
    const map = parseManifest(opf);
    expect(map).toEqual({ ch1: "ch1.xhtml", ch2: "ch2.xhtml" });
  });

  it("id/href 之间夹其他属性也能匹配", () => {
    const opf = '<item id="x" media-type="image/png" href="x.png"/>';
    expect(parseManifest(opf)).toEqual({ x: "x.png" });
  });

  it("缺少 id 或 href 的 <item> 不计入", () => {
    const opf = '<item id="only"/><item href="onlyhref.xhtml"/>';
    expect(parseManifest(opf)).toEqual({});
  });
});

describe("parseSpine —— EPUB OPF spine 解析", () => {
  it("按出现顺序提取 itemref 的 idref", () => {
    const opf =
      "<spine><itemref idref=\"c1\"/><itemref idref=\"c2\" linear=\"no\"/></spine>";
    expect(parseSpine(opf)).toEqual(["c1", "c2"]);
  });

  it("无 spine 标签返回空数组", () => {
    expect(parseSpine("<package></package>")).toEqual([]);
  });
});

describe("stripHtml —— XHTML 文本提纯", () => {
  it("剥离标签并保留文本", () => {
    expect(stripHtml("<p>你好<strong>世界</strong></p>")).toBe("你好 世界");
  });

  it("解码常用命名实体", () => {
    expect(stripHtml("A&amp;B&lt;C&gt;D&quot;E&quot;")).toBe('A&B<C>D"E"');
  });

  it("解码数字实体（&#160; 不间断空格 / &#8211; 短破折号）", () => {
    expect(stripHtml("a&#160;A&#8211;B")).toBe("a A–B");
  });

  it("script/style 内容被清除", () => {
    expect(stripHtml("<p>正文</p><script>alert(1)</script>")).toBe("正文");
  });
});

describe("docxToText —— OOXML 段落切分", () => {
  it("兼容命名空间闭合标签 </w:p>（修复前只识别裸 </p>，整篇被当一段）", () => {
    const xml =
      "<w:document><w:body><w:p><w:r><w:t>第一段</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>";
    const text = docxToText(xml);
    expect(text).toBe("第一段\n\n第二段");
  });

  it("带属性的 <w:p w:rsidR=...> 也能正常切分", () => {
    const xml =
      '<w:p w:rsidR="00AA"><w:r><w:t>甲</w:t></w:r></w:p><w:p><w:r><w:t>乙</w:t></w:r></w:p>';
    expect(docxToText(xml)).toBe("甲\n\n乙");
  });

  it("空段落被过滤", () => {
    const xml =
      "<w:p><w:r><w:t>有内容</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>也有</w:t></w:r></w:p>";
    expect(docxToText(xml)).toBe("有内容\n\n也有");
  });
});
