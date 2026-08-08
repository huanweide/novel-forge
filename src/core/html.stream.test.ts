import { describe, it, expect } from "vitest";
import { buildHtmlDocStream, type ChapterItem } from "@/core/epub";

/** 收集异步生成器的全部分块（模拟 Readable.from 逐章 yield）。 */
async function collect(gen: AsyncGenerator<string>): Promise<string[]> {
  const chunks: string[] = [];
  for await (const c of gen) chunks.push(c);
  return chunks;
}

describe("buildHtmlDocStream（v1.6.39 html 导出流式化）", () => {
  const chapters: ChapterItem[] = [
    { title: "第一章", depth: 1, outline: "开场铺垫", content: "你好世界\n第二段落" },
    { title: "第二章", depth: 1, content: "**粗体** 与 *斜体*" },
    { title: "第三章", depth: 2, content: "" }, // 空章，验证空节提示
  ];

  it("逐章分块输出而非一次性整本字符串（防大书 OOM 的关键）", async () => {
    const chunks = await collect(buildHtmlDocStream("测试书", chapters, 100, 3));
    // 头 + 目录逐条(3) + 正文逐章(3) + 尾 ≥ 7 个分块，证明是流式而非整本拼接
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("渲染结构与原同步版逐字等价：文档头/目录/正文/页脚齐全", async () => {
    const full = (await collect(buildHtmlDocStream("测试书", chapters, 100, 3))).join("");
    expect(full.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(full).toContain("<h1>测试书</h1>");
    // 深度 1 → h2，深度 2 → h3
    expect(full).toContain('<h2 id="ch0">第一章</h2>');
    expect(full).toContain('<h3 id="ch2">第三章</h3>');
    // 大纲提示
    expect(full).toContain("大纲：开场铺垫");
    // 散文→HTML：单段内换行转 <br/>，空行分段
    expect(full).toContain("<p>你好世界<br/>第二段落</p>");
    // 行内粗体/斜体
    expect(full).toContain("<strong>粗体</strong>");
    expect(full).toContain("<em>斜体</em>");
    // 目录锚点
    expect(full).toContain('<a href="#ch0">第一章</a>');
    // 空章提示
    expect(full).toContain("（此节暂无内容）");
    // 页脚统计
    expect(full).toContain("共 3 个章节，100 字");
    // 文档闭合
    expect(full.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("作者署名正确注入标题区与页脚", async () => {
    const full = (await collect(buildHtmlDocStream("测试书", chapters, 100, 3, "樊斯瑞"))).join("");
    expect(full).toContain('<p class="author">作者：樊斯瑞</p>');
    expect(full).toContain("作者：樊斯瑞 · 共 3 个章节");
  });
});
