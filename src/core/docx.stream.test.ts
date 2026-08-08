import { describe, it, expect } from "vitest";
import { PassThrough } from "stream";
import { buildDocx, buildDocxStream } from "@/core/docx";
import type { ChapterItem } from "@/core/epub";

/** 收集 PassThrough 的全部数据为 Buffer（模拟客户端下载）。 */
function collect(stream: PassThrough): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

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

/**
 * docProps/core.xml 内嵌 new Date().toISOString() 的 created/modified 时间戳，
 * 同步/流式各自生成必不同，比对时剔除这两行（dcterms:created / dcterms:modified）。
 */
function normalizeCoreXml(xml: Buffer): string {
  return xml
    .toString("utf8")
    .split("\n")
    .filter((l) => !l.includes("<dcterms:created") && !l.includes("<dcterms:modified"))
    .join("\n");
}

const sampleChapters: ChapterItem[] = [
  { title: "第一章 起始", depth: 1, content: "这是第一章的正文。\n\n第二段。", outline: "开篇" },
  { title: "第二章 发展", depth: 1, content: "这是第二章。", outline: "推进" },
  { title: "第三章 终局", depth: 1, content: "结局。", outline: "收束" },
];

describe("buildDocxStream（DOCX 流式导出）", () => {
  it("流式产物与同步 buildDocx 结构等价：entry 名顺序一致，内容逐条相等（仅 core.xml 时间戳行豁免）", async () => {
    const sync = buildDocx("测试书", sampleChapters, { author: "笔者" });
    const stream = new PassThrough();
    const p = collect(stream);
    await buildDocxStream(stream, "测试书", sampleChapters, { author: "笔者" });
    const streamed = await p;
    expect(streamed.length).toBeGreaterThan(0);

    const a = listZipEntries(sync);
    const b = listZipEntries(streamed);
    expect(b.map((e) => e.name)).toEqual(a.map((e) => e.name));

    for (let i = 0; i < a.length; i++) {
      if (a[i].name === "docProps/core.xml") {
        expect(normalizeCoreXml(b[i].data)).toBe(normalizeCoreXml(a[i].data));
      } else {
        expect(b[i].data.equals(a[i].data)).toBe(true);
      }
    }
  });

  it("DOCX 固定 7 个 part（OOXML 单文件限制）：大书 300 章仍是 7 个 entry，且 [Content_Types].xml 首条 stored", async () => {
    const big: ChapterItem[] = Array.from({ length: 300 }, (_, i) => ({
      title: `第${i}章`,
      depth: 1,
      content: "内容".repeat(2000), // 每章约 6000 字
      outline: "",
    }));
    const stream = new PassThrough();
    const p = collect(stream);
    await buildDocxStream(stream, "大书", big, { author: "笔者" });
    const buf = await p;

    // 尾部找 end record 签名 PK\x05\x06
    const endSig = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
    const idx = buf.lastIndexOf(endSig);
    expect(idx).toBeGreaterThan(0);
    const entryCount = buf.readUInt16LE(idx + 10);
    // DOCX 所有章节拼进单个 word/document.xml（OOXML 限制），故 entry 数恒为 7，不随章节增长
    expect(entryCount).toBe(7);

    // 首个 local header 必须是 [Content_Types].xml 且 stored（压缩方法 0）
    const localSig = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const m = buf.indexOf(localSig);
    expect(m).toBeGreaterThanOrEqual(0);
    const compMethod = buf.readUInt16LE(m + 8);
    expect(compMethod).toBe(0); // stored
    const nameLen = buf.readUInt16LE(m + 26);
    const firstName = buf.slice(m + 30, m + 30 + nameLen).toString("utf8");
    expect(firstName).toBe("[Content_Types].xml");
  });
});
