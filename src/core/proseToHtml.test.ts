import { describe, it, expect } from "vitest";
import { proseToHtml } from "@/core/epub";

// 核心散文→HTML 转换（被 HTML / EPUB / DOCX 导出复用），此前无单测覆盖。
// 本测试既钉死既有行为、也作为「用 node 实锤真实缺陷」的探针。
describe("proseToHtml", () => {
  it("空内容返回空串", () => {
    expect(proseToHtml("")).toBe("");
    expect(proseToHtml("   ")).toBe("");
    expect(proseToHtml(null as unknown as string)).toBe("");
  });

  it("单行段落包成 <p>", () => {
    expect(proseToHtml("你好世界")).toBe("<p>你好世界</p>");
  });

  it("空行分隔多段落", () => {
    const out = proseToHtml("第一段\n\n第二段");
    expect(out).toBe("<p>第一段</p>\n<p>第二段</p>");
  });

  it("**粗体** 转 <strong>", () => {
    expect(proseToHtml("这是**粗体**文字")).toBe("<p>这是<strong>粗体</strong>文字</p>");
  });

  it("*斜体* 转 <em>", () => {
    expect(proseToHtml("这是*斜体*文字")).toBe("<p>这是<em>斜体</em>文字</p>");
  });

  it("粗体与斜体先后共存均正确", () => {
    expect(proseToHtml("**粗** 后 *斜*")).toBe("<p><strong>粗</strong> 后 <em>斜</em></p>");
  });

  it("--- 转 <hr/>", () => {
    expect(proseToHtml("上文\n\n---\n\n下文")).toBe("<p>上文</p>\n<hr/>\n<p>下文</p>");
  });

  it("> 引用块转 <blockquote>", () => {
    const out = proseToHtml("> 引用一行\n> 引用二行");
    expect(out).toBe("<blockquote>引用一行<br/>引用二行</blockquote>");
  });

  it("HTML 特殊字符被转义（防 XSS / 渲染错乱）", () => {
    expect(proseToHtml("<script>&\"'")).toBe("<p>&lt;script&gt;&amp;&quot;&#39;</p>");
  });

  it("段落内换行转 <br/>", () => {
    expect(proseToHtml("行一\n行二")).toBe("<p>行一<br/>行二</p>");
  });

  it("多行引用块尾部无残留空段落", () => {
    const out = proseToHtml("> 只有引用");
    expect(out).toBe("<blockquote>只有引用</blockquote>");
  });
});
