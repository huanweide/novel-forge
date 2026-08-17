/**
 * 零依赖 DOCX（Word）导出 —— 复用 epub.ts 的 makeZip（stored ZIP）+ ChapterItem 章节结构。
 *
 * DOCX 本质是 OOXML ZIP 包，不引入 docx.js / jszip / archiver。
 * 中文靠 word/styles.xml 的 docDefaults 声明 eastAsia="宋体"，Word/WPS 打开不乱码。
 */

import { ChapterItem, makeZip, streamZip, stripControlChars } from "./epub";
import type { Writable } from "stream";

function escapeXml(s: string): string {
  return stripControlChars(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 把一段文本转成 w:r 运行，段内换行用 <w:br/> 保留。 */
function textRuns(text: string): string {
  return (text || "")
    .split("\n")
    .map((line, i) => `${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${escapeXml(line)}</w:t>`)
    .join("");
}

interface ParaOpts {
  bold?: boolean;
  /** 半磅字号（如 21 = 10.5pt） */
  sizeHalf?: number;
  /** 段前间距（二十分之一磅） */
  spacingBefore?: number;
}

function para(text: string, opts: ParaOpts = {}): string {
  const rpr: string[] = [];
  if (opts.bold) rpr.push("<w:b/>");
  if (opts.sizeHalf) rpr.push(`<w:sz w:val="${opts.sizeHalf}"/>`);
  const rprXml = rpr.length ? `<w:rPr>${rpr.join("")}</w:rPr>` : "";

  const ppr: string[] = [];
  if (opts.spacingBefore) ppr.push(`<w:spacing w:before="${opts.spacingBefore}"/>`);
  const pprXml = ppr.length ? `<w:pPr>${ppr.join("")}</w:pPr>` : "";

  return `<w:p>${pprXml}${rprXml}<w:r>${textRuns(text)}</w:r></w:p>`;
}

/**
 * 行内 Markdown 解析（仅作用于正文）：把 `**加粗**` / `*斜体*` 拆成带 rPr 的独立 run。
 * 文本一律先 escapeXml 再落 XML，绝不破坏结构；不含标记的纯文本保持原样。
 * 每个片段都自带 <w:r> 包裹（OOXML 要求 <w:t> 必须在 <w:r> 内）。
 */
function parseInline(text: string): string {
  let out = "";
  let plain = "";
  const flush = () => {
    if (plain) {
      out += `<w:r><w:t xml:space="preserve">${escapeXml(plain)}</w:t></w:r>`;
      plain = "";
    }
  };
  const n = text.length;
  let i = 0;
  while (i < n) {
    // 加粗 **...**（优先于单 *，避免误判）
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        flush();
        const inner = text.slice(i + 2, end);
        out += `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(inner)}</w:t></w:r>`;
        i = end + 2;
        continue;
      }
    }
    // 斜体 *...*
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end !== -1 && end > i + 1) {
        flush();
        const inner = text.slice(i + 1, end);
        out += `<w:r><w:rPr><w:i/></w:rPr><w:t xml:space="preserve">${escapeXml(inner)}</w:t></w:r>`;
        i = end + 1;
        continue;
      }
    }
    plain += text[i];
    i++;
  }
  flush();
  return out;
}

/**
 * 把一段正文（可能含内部 \n）转成 w:r 运行序列：
 * - 逐行处理，行间用 <w:r><w:br/></w:r> 衔接（保持 textRuns 的多行行为）
 * - 块级：`# 标题` → 加粗+大字号 run；`- ` 开头 → 前缀 `• ` 符号
 * - 其余行走 parseInline（行内粗体/斜体）
 */
function bodyRuns(block: string): string {
  const lines = (block || "").split("\n");
  const parts: string[] = [];
  lines.forEach((line, idx) => {
    if (idx > 0) parts.push("<w:r><w:br/></w:r>");
    const heading = /^#+\s+(.*)$/.exec(line);
    const list = /^-\s+(.*)$/.exec(line);
    if (heading) {
      const t = heading[1];
      parts.push(
        `<w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t xml:space="preserve">${escapeXml(t)}</w:t></w:r>`
      );
    } else if (list) {
      const t = list[1];
      parts.push(`<w:r><w:t xml:space="preserve">• </w:t></w:r>`);
      parts.push(parseInline(t));
    } else {
      parts.push(parseInline(line));
    }
  });
  return parts.join("");
}

/**
 * 正文段落：在 <w:pPr> 内加首行缩进 480 twips（≈2 中文字，中文段首缩进 2 字），
 * 正文内容走 Markdown 解析（bodyRuns）。字号沿用 styles.xml 的 docDefault(21=10.5pt)，
 * 故不再逐 run 显式设 sz。仅作用于正文，不影响标题/目录/页脚（那些走 para）。
 */
function bodyPara(text: string, opts: ParaOpts = {}): string {
  const ppr: string[] = [];
  if (opts.spacingBefore) ppr.push(`<w:spacing w:before="${opts.spacingBefore}"/>`);
  ppr.push(`<w:ind w:firstLine="480"/>`);
  const pprXml = `<w:pPr>${ppr.join("")}</w:pPr>`;
  return `<w:p>${pprXml}${bodyRuns(text)}</w:p>`;
}

/** 组装最小可用 DOCX，返回 ZIP Buffer。 */
export function buildDocx(
  projectName: string,
  chapters: ChapterItem[],
  opts: { includeOutline?: boolean; author?: string } = {}
): Buffer {
  const includeOutline = opts.includeOutline !== false;
  const author = opts.author;
  const body: string[] = [];

  body.push(para(projectName, { bold: true, sizeHalf: 36 }));
  if (author) body.push(para(`作者：${author}`, { sizeHalf: 24 }));

  // 目录域：标题段之后、正文之前插入 TOC 域，Word 打开提示更新即可。
  body.push(
    `<w:p><w:pPr><w:spacing w:before="240"/></w:pPr><w:fldSimple w:instr="TOC"><w:r><w:t xml:space="preserve">（右键「更新域」以生成目录）</w:t></w:r></w:fldSimple></w:p>`
  );

  for (const ch of chapters) {
    const titleSize = ch.depth <= 0 ? 30 : ch.depth === 1 ? 26 : 24;
    body.push(para(ch.title, { bold: true, sizeHalf: titleSize, spacingBefore: 240 }));

    if (includeOutline && ch.outline) {
      body.push(para(`大纲：${ch.outline}`, { sizeHalf: 20 }));
    }

    if (ch.content && ch.content.trim()) {
      const blocks = ch.content.replace(/\r\n/g, "\n").split(/\n{2,}/);
      for (const b of blocks) {
        const trimmed = b.trim();
        if (!trimmed) continue;
        body.push(bodyPara(trimmed));
      }
    } else if (!ch.outline) {
      body.push(para("（此节暂无内容）", { sizeHalf: 21 }));
    }
  }

  body.push(para("由 Novel Forge 生成", { sizeHalf: 18 }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>
</w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="宋体" w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:styles>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const now = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(projectName)}</dc:title>
<dc:creator>${escapeXml(author || "Novel Forge")}</dc:creator>
<cp:lastModifiedBy>Novel Forge</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Novel Forge</Application>
</Properties>`;

  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
    { name: "word/styles.xml", data: Buffer.from(stylesXml, "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
    { name: "docProps/core.xml", data: Buffer.from(coreXml, "utf8") },
    { name: "docProps/app.xml", data: Buffer.from(appXml, "utf8") },
  ];

  return makeZip(entries);
}

/**
 * 流式构建 DOCX（零依赖 OOXML ZIP）——与 buildDocx 同源 entries 构造，逐 part 写入目标流（带背压），
 * 末尾写中央目录 + end record，避免「所有 part Buffer 先 concat 成单 Buffer」的整本副本（大书 OOM 真根因，与 v1.6.30 epub 同源）。
 * 诚实边界：document.xml 因 OOXML 限制仍是单文件大 part（所有章节拼进一个 XML，不能像 epub 逐章拆 entry），
 * 故 document.xml 仍整块驻留内存，本函数仅去掉 ZIP 层整本 concat + 改为流式响应，不谎称「章节级真流式」。
 */
export async function buildDocxStream(
  dest: Writable,
  projectName: string,
  chapters: ChapterItem[],
  opts: { includeOutline?: boolean; author?: string } = {}
): Promise<void> {
  const includeOutline = opts.includeOutline !== false;
  const author = opts.author;
  const body: string[] = [];

  body.push(para(projectName, { bold: true, sizeHalf: 36 }));
  if (author) body.push(para(`作者：${author}`, { sizeHalf: 24 }));

  // 目录域：标题段之后、正文之前插入 TOC 域，Word 打开提示更新即可。
  body.push(
    `<w:p><w:pPr><w:spacing w:before="240"/></w:pPr><w:fldSimple w:instr="TOC"><w:r><w:t xml:space="preserve">（右键「更新域」以生成目录）</w:t></w:r></w:fldSimple></w:p>`
  );

  for (const ch of chapters) {
    const titleSize = ch.depth <= 0 ? 30 : ch.depth === 1 ? 26 : 24;
    body.push(para(ch.title, { bold: true, sizeHalf: titleSize, spacingBefore: 240 }));

    if (includeOutline && ch.outline) {
      body.push(para(`大纲：${ch.outline}`, { sizeHalf: 20 }));
    }

    if (ch.content && ch.content.trim()) {
      const blocks = ch.content.replace(/\r\n/g, "\n").split(/\n{2,}/);
      for (const b of blocks) {
        const trimmed = b.trim();
        if (!trimmed) continue;
        body.push(bodyPara(trimmed));
      }
    } else if (!ch.outline) {
      body.push(para("（此节暂无内容）", { sizeHalf: 21 }));
    }
  }

  body.push(para("由 Novel Forge 生成", { sizeHalf: 18 }));

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720"/></w:sectPr>
</w:body>
</w:document>`;

  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:eastAsia="宋体" w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="21"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:line="360" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:styles>`;

  const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const now = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(projectName)}</dc:title>
<dc:creator>${escapeXml(author || "Novel Forge")}</dc:creator>
<cp:lastModifiedBy>Novel Forge</cp:lastModifiedBy>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
<dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Novel Forge</Application>
</Properties>`;

  const entries = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
    { name: "word/styles.xml", data: Buffer.from(stylesXml, "utf8") },
    { name: "word/_rels/document.xml.rels", data: Buffer.from(docRels, "utf8") },
    { name: "docProps/core.xml", data: Buffer.from(coreXml, "utf8") },
    { name: "docProps/app.xml", data: Buffer.from(appXml, "utf8") },
  ];

  await streamZip(dest, entries);
}
