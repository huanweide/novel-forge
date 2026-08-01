/**
 * 导出构建工具：轻量 Markdown/散文 → HTML，以及零依赖 EPUB（stored ZIP）生成。
 *
 * 设计约束（PROCESS/06 P0-1）：零新增 npm 依赖。
 * - HTML：单文件完整文档，可直接浏览器打开 / 被 Word 导入。
 * - EPUB：手写 stored（不压缩）ZIP + CRC32，mimetype 置于首条且 stored，
 *   兼容所有主流阅读器；无需 archiver/jszip。
 */

// ---------- HTML 转义 ----------
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------- 散文/轻量 Markdown → HTML 块 ----------
/**
 * 把章节正文（散文或轻量 markdown）转成安全 HTML。
 * 处理：段落（空行分隔）、行内 **粗体** / *斜体*、--- 分割线、> 引用。
 * 不做完整 CommonMark 解析，足够覆盖小说正文。
 */
export function proseToHtml(content: string): string {
  if (!content || !content.trim()) return "";
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    if (buf.length === 0) return;
    const raw = buf.join("\n").trim();
    buf = [];
    if (!raw) return;

    // 引用块
    if (raw.startsWith(">")) {
      const inner = raw
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .map((l) => escapeHtml(l))
        .join("<br/>");
      blocks.push(`<blockquote>${inner}</blockquote>`);
      return;
    }
    // 行内格式
    const html = escapeHtml(raw)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\n/g, "<br/>");
    blocks.push(`<p>${html}</p>`);
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "") {
      flush();
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flush();
      blocks.push("<hr/>");
      continue;
    }
    buf.push(line);
  }
  flush();
  return blocks.join("\n");
}

// ---------- 章节有序列表 ----------
export interface ChapterItem {
  title: string;
  depth: number;
  outline?: string | null;
  content?: string | null;
}

/** 按树结构前序遍历，产出有序章节列表（复用导出路由的排序规则）。 */
export function buildChapterList(
  roots: any[],
  allNodes: any[],
  includeOutline: boolean
): ChapterItem[] {
  const out: ChapterItem[] = [];
  const walk = (node: any, depth: number) => {
    out.push({
      title: node.title || "未命名",
      depth,
      outline: includeOutline ? node.outline : null,
      content: node.content,
    });
    const children = allNodes
      .filter((n) => n.parentId === node.id)
      .sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt > b.createdAt ? 1 : -1));
    for (const c of children) walk(c, depth + 1);
  };
  const sortedRoots = [...roots].sort(
    (a: any, b: any) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt > b.createdAt ? 1 : -1)
  );
  for (const r of sortedRoots) walk(r, 1);
  return out;
}

// ---------- 完整 HTML 文档 ----------
export function buildHtmlDoc(
  projectName: string,
  chapters: ChapterItem[],
  totalWords: number,
  completedNodes: number
): string {
  const toc = chapters
    .map(
      (c, i) =>
        `<li style="margin-left:${(c.depth - 1) * 1.5}em"><a href="#ch${i}">${escapeHtml(
          c.title
        )}</a></li>`
    )
    .join("\n");

  const body = chapters
    .map((c, i) => {
      const h = Math.min(c.depth + 1, 6);
      let s = `<h${h} id="ch${i}">${escapeHtml(c.title)}</h${h}>\n`;
      if (c.outline) s += `<p class="outline"><em>大纲：${escapeHtml(c.outline)}</em></p>\n`;
      const html = proseToHtml(c.content || "");
      s += html || `<p class="empty">（此节暂无内容）</p>`;
      return s;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>${escapeHtml(projectName)}</title>
<style>
  body { max-width: 42em; margin: 2em auto; padding: 0 1em; font-family: "Noto Serif CJK SC", "Songti SC", serif; line-height: 1.9; color: #1a1a1a; }
  h1,h2,h3,h4 { line-height: 1.4; }
  .outline { color: #888; font-size: 0.92em; }
  .empty { color: #aaa; font-style: italic; }
  blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0.2em 1em; color: #555; }
  hr { border: none; border-top: 1px solid #ddd; margin: 1.5em 0; }
  nav.toc { background: #f7f7f7; padding: 1em 1.5em; border-radius: 8px; margin-bottom: 2em; }
  nav.toc ol { padding-left: 1.2em; }
  footer { margin-top: 3em; padding-top: 1em; border-top: 1px solid #eee; color: #999; font-size: 0.85em; }
</style>
</head>
<body>
<h1>${escapeHtml(projectName)}</h1>
<nav class="toc"><strong>目录</strong><ol>${toc}</ol></nav>
${body}
<footer>共 ${completedNodes} 个章节，${totalWords.toLocaleString()} 字 · 由 Novel Forge 生成</footer>
</body>
</html>`;
}

// ===================================================================
// 零依赖 stored ZIP（不压缩）+ CRC32 —— 用于 EPUB 打包
// ===================================================================
const CRC_TABLE: number[] = (() => {
  const t: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
}

/** 生成 stored（不压缩）ZIP 的 Buffer。 */
export function makeZip(entries: ZipEntry[]): Buffer {
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // 本地文件头
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // 签名
    local.writeUInt16LE(20, 4); // 版本
    local.writeUInt16LE(0, 6); // 标志
    local.writeUInt16LE(0, 8); // 压缩方法 0 = stored
    local.writeUInt16LE(0, 10); // 修改时间
    local.writeUInt16LE(0, 12); // 修改日期
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18); // 压缩后大小
    local.writeUInt32LE(size, 22); // 未压缩大小
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // 额外字段长度

    chunks.push(local, nameBuf, entry.data);

    // 中央目录头
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4); // 版本生成
    cd.writeUInt16LE(20, 6); // 版本需要
    cd.writeUInt16LE(0, 8);
    cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(size, 20);
    cd.writeUInt32LE(size, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // 额外
    cd.writeUInt16LE(0, 32); // 注释
    cd.writeUInt16LE(0, 34); // 磁盘号
    cd.writeUInt16LE(0, 36); // 内部属性
    cd.writeUInt32LE(0, 38); // 外部属性
    cd.writeUInt32LE(offset, 42); // 本地头偏移

    central.push(cd, nameBuf);

    offset += local.length + nameBuf.length + entry.data.length;
  }

  const centralBuf = Buffer.concat(central);
  const centralOffset = offset;

  // 结束记录
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(centralOffset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ===================================================================
// EPUB 3 组装
// ===================================================================
function epubContainerXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps+package+xml"/>
  </rootfiles>
</container>`;
}

function epubContentOpf(
  projectName: string,
  chapters: ChapterItem[]
): string {
  const uuid = `novelforge-${Date.now()}`;
  const manifestItems = chapters
    .map(
      (_, i) =>
        `    <item id="ch${i}" href="ch${i}.xhtml" media-type="application/xhtml+xml"/>`
    )
    .join("\n");
  const spineItems = chapters.map((_, i) => `    <itemref idref="ch${i}"/>`).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:${uuid}</dc:identifier>
    <dc:title>${escapeXml(projectName)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>Novel Forge</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, "Z")}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
${manifestItems}
  </manifest>
  <spine>
${spineItems}
  </spine>
</package>`;
}

function epubNavXhtml(projectName: string, chapters: ChapterItem[]): string {
  const lis = chapters
    .map((c, i) => `<li><a href="ch${i}.xhtml">${escapeXml(c.title)}</a></li>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="zh-CN">
<head><title>${escapeXml(projectName)}</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>${escapeXml(projectName)}</h1>
  <ol>${lis}</ol>
</nav>
</body>
</html>`;
}

function epubChapterXhtml(title: string, item: ChapterItem): string {
  const body = proseToHtml(item.content || "") || `<p>（此节暂无内容）</p>`;
  let inner = `<h1>${escapeXml(title)}</h1>\n`;
  if (item.outline) inner += `<p class="outline"><em>大纲：${escapeXml(item.outline)}</em></p>\n`;
  inner += body;
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>${escapeXml(title)}</title></head>
<body>${inner}</body>
</html>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 构建 EPUB（返回 ZIP Buffer）。 */
export function buildEpub(
  projectName: string,
  chapters: ChapterItem[],
  totalWords: number,
  completedNodes: number
): Buffer {
  const entries: ZipEntry[] = [
    { name: "mimetype", data: Buffer.from("application/epub+zip", "utf8") },
    {
      name: "META-INF/container.xml",
      data: Buffer.from(epubContainerXml(), "utf8"),
    },
    {
      name: "OEBPS/content.opf",
      data: Buffer.from(epubContentOpf(projectName, chapters), "utf8"),
    },
    {
      name: "OEBPS/nav.xhtml",
      data: Buffer.from(epubNavXhtml(projectName, chapters), "utf8"),
    },
  ];

  chapters.forEach((c, i) => {
    entries.push({
      name: `OEBPS/ch${i}.xhtml`,
      data: Buffer.from(epubChapterXhtml(c.title, c), "utf8"),
    });
  });

  // 结尾署名页（仅当无章节内容时也保证至少可读）
  const colophon = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head><title>版权信息</title></head>
<body><p>共 ${completedNodes} 个章节，${totalWords.toLocaleString()} 字。由 Novel Forge 生成。</p></body>
</html>`;
  entries.push({ name: "OEBPS/colophon.xhtml", data: Buffer.from(colophon, "utf8") });

  return makeZip(entries);
}
