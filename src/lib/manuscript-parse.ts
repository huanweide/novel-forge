import JSZip from "jszip";

/**
 * 把已有书稿（epub / docx / txt / md）解析为纯文本，喂给 /api/import/parse 的角色+世界提取流程。
 * epub/docx 在浏览器端用 jszip 解压提取文本，无需后端感知格式。
 */
export async function parseManuscriptToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".epub")) {
    const buf = await file.arrayBuffer();
    return parseEpub(buf);
  }
  if (name.endsWith(".docx")) {
    const buf = await file.arrayBuffer();
    return parseDocx(buf);
  }
  // .txt / .md 直接读文本
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("读取文件失败"));
    reader.readAsText(file);
  });
}

async function parseEpub(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const container = zip.file("META-INF/container.xml");
  if (!container) throw new Error("无效的 EPUB：缺少 META-INF/container.xml");
  const cxml = await container.async("string");
  const opfPath = (cxml.match(/full-path="([^"]+)"/) || [])[1];
  if (!opfPath) throw new Error("无效的 EPUB：找不到 OPF 路径");
  const opf = zip.file(opfPath);
  if (!opf) throw new Error("无效的 EPUB：找不到 OPF 文件");
  const oxml = await opf.async("string");
  const manifest = parseManifest(oxml);
  const spine = parseSpine(oxml);
  const baseDir = opfPath.includes("/") ? opfPath.slice(0, opfPath.lastIndexOf("/") + 1) : "";
  const parts: string[] = [];
  for (const id of spine) {
    const href = manifest[id];
    if (!href) continue;
    const full = baseDir + href;
    const f = zip.file(full) || zip.file(decodeURIComponent(full));
    if (!f) continue;
    const xhtml = await f.async("string");
    const text = stripHtml(xhtml);
    if (text.trim()) parts.push(text);
  }
  return parts.join("\n\n").trim();
}

async function parseDocx(buf: ArrayBuffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("无效的 DOCX：缺少 word/document.xml");
  const xml = await doc.async("string");
  return docxToText(xml);
}

export function parseManifest(opf: string): Record<string, string> {
  const map: Record<string, string> = {};
  // 顺序无关：分别提取每个 <item> 的 id 与 href，
  // 兼容「href 在前、id 在后」的真实 EPUB（旧正则要求 id 在前会漏掉这类 item 导致导入缺章）。
  const itemRe = /<item\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = itemRe.exec(opf)) !== null) {
    const tag = m[0];
    const idM = tag.match(/\bid="([^"]+)"/);
    const hrefM = tag.match(/\bhref="([^"]+)"/);
    if (idM && hrefM) map[idM[1]] = hrefM[1];
  }
  return map;
}

export function parseSpine(opf: string): string[] {
  const ids: string[] = [];
  const spineMatch = opf.match(/<spine\b[^>]*>([\s\S]*?)<\/spine>/);
  if (!spineMatch) return ids;
  const re = /<itemref\b[^>]*\bidref="([^"]+)"[^>]*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(spineMatch[1])) !== null) ids.push(m[1]);
  return ids;
}

export function stripHtml(html: string): string {
  let s = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<\s*(br|\/p|\/div|\/h[1-6]|\/li|\/tr)\s*>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      const n = parseInt(d, 10);
      // &#160; 不间断空格与命名实体 &nbsp; 一致归一为普通空格，避免混入 U+00A0 破坏下游分词/显示
      return n === 160 ? " " : String.fromCharCode(n);
    });
  return s.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function docxToText(xml: string): string {
  // 兼容 OOXML 真实闭合标签 </w:p>（带 w: 命名空间前缀）；旧正则只匹配裸 </p>，
  // 导致整篇 docx 被当成一整段、导入长文档糊成一坨。
  const paras = xml.split(/<\/\s*(?:w:)?p\s*>/gi);
  const lines: string[] = [];
  for (const p of paras) {
    const textParts: string[] = [];
    const re = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(p)) !== null) {
      let t = m[1];
      t = t
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'");
      textParts.push(t);
    }
    const line = textParts.join("").trim();
    if (line) lines.push(line);
  }
  return lines.join("\n\n").trim();
}
