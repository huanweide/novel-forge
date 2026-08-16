import { describe, it, expect } from "vitest";
import { makeZip } from "./epub";
import JSZip from "jszip";

// makeZip 手搓 stored ZIP 容器字节，是「读者能否打开导出的 EPUB」的生死线，此前零直接单测。
// 本文件锁死 ZIP 格式契约：签名、crc32、文件名、数据完整、偏移、条目数、可被真实阅读器(zip 库)解压。

interface ZipEntry {
  name: string;
  data: Buffer;
}

const LOCAL_SIG = 0x04034b50; // PK\x03\x04
const CENTRAL_SIG = 0x02014b50; // PK\x01\x02
const END_SIG = 0x06054b50; // PK\x05\x06

function findAll(buf: Buffer, sig: number): number[] {
  const out: number[] = [];
  let i = 0;
  while (i + 4 <= buf.length) {
    if (buf.readUInt32LE(i) === sig) out.push(i);
    i++;
  }
  return out;
}

describe("makeZip（EPUB 容器字节级构建 · 格式契约防护）", () => {
  it("输出非空且以 local file header 签名开头", () => {
    const buf = makeZip([{ name: "a.txt", data: Buffer.from("hello") }]);
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.readUInt32LE(0)).toBe(LOCAL_SIG);
  });

  it("以 end of central directory 签名结尾", () => {
    const buf = makeZip([{ name: "a.txt", data: Buffer.from("hello") }]);
    expect(buf.readUInt32LE(buf.length - 22)).toBe(END_SIG);
  });

  it("crc32 实现正确（标准校验值 CRC-32/ISO-HDLC: '123456789' => 0xCBF43926）", () => {
    const buf = makeZip([{ name: "x", data: Buffer.from("123456789") }]);
    // local header 的 crc 字段在 offset 14（4 字节小端）
    expect(buf.readUInt32LE(14)).toBe(0xcbf43926);
  });

  it("单条目：文件名与数据按 local header 顺序原样落盘", () => {
    const data = Buffer.from("chapter one content");
    const buf = makeZip([{ name: "chap1.html", data }]);
    const nameLen = buf.readUInt16LE(26);
    const name = buf.subarray(30, 30 + nameLen).toString("utf8");
    expect(name).toBe("chap1.html");
    const body = buf.subarray(30 + nameLen, 30 + nameLen + data.length);
    expect(Buffer.from(body)).toEqual(data);
  });

  it("单条目：stored 不压缩，压缩大小==未压缩大小==数据长度", () => {
    const data = Buffer.from("abc");
    const buf = makeZip([{ name: "f", data }]);
    expect(buf.readUInt32LE(18)).toBe(data.length);
    expect(buf.readUInt32LE(22)).toBe(data.length);
  });

  it("多条目：end record 的条目数等于输入条目数", () => {
    const buf = makeZip([
      { name: "a", data: Buffer.from("1") },
      { name: "b", data: Buffer.from("22") },
    ]);
    expect(buf.readUInt16LE(buf.length - 22 + 10)).toBe(2);
  });

  it("多条目：中央目录含与条目数一致的 central record 签名", () => {
    const buf = makeZip([
      { name: "a", data: Buffer.from("1") },
      { name: "b", data: Buffer.from("22") },
    ]);
    expect(findAll(buf, CENTRAL_SIG).length).toBe(2);
  });

  it("多条目：第二条目的 central record 指向正确的本地头偏移", () => {
    const a = Buffer.from("111");
    const b = Buffer.from("2222");
    const buf = makeZip([
      { name: "a", data: a },
      { name: "b", data: b },
    ]);
    const centrals = findAll(buf, CENTRAL_SIG);
    const secondCd = centrals[1];
    const declaredOffset = buf.readUInt32LE(secondCd + 42);
    // 第一个条目段长 = 30(local头) + nameLen(a=1) + dataLen(a=3) = 34
    expect(declaredOffset).toBe(34);
    // 该偏移处确实是一个 local header 且文件名是第二个条目 'b'
    expect(buf.readUInt32LE(declaredOffset)).toBe(LOCAL_SIG);
    const secondNameLen = buf.readUInt16LE(declaredOffset + 26);
    expect(buf.subarray(declaredOffset + 30, declaredOffset + 30 + secondNameLen).toString("utf8")).toBe("b");
  });

  it("中文文件名按 UTF-8 正确写入（字节级）", () => {
    const name = "第一章.html";
    const buf = makeZip([{ name, data: Buffer.from("内容") }]);
    const nameLen = buf.readUInt16LE(26);
    const written = buf.subarray(30, 30 + nameLen).toString("utf8");
    expect(written).toBe(name);
    // 进入该 UTF-8 字节序列
    expect(buf.subarray(30, 30 + nameLen)).toEqual(Buffer.from(name, "utf8"));
  });

  it("空数据条目也能生成合法 ZIP", () => {
    const buf = makeZip([{ name: "empty.txt", data: Buffer.from("") }]);
    expect(buf.readUInt32LE(18)).toBe(0);
    expect(buf.readUInt32LE(22)).toBe(0);
    expect(buf.readUInt32LE(14)).toBe(0); // crc32(空) == 0
  });

  it("端到端：JSZip 能解压并还原全部条目数据（真实阅读器可打开）", async () => {
    const entries: ZipEntry[] = [
      { name: "mimetype", data: Buffer.from("application/epub+zip") },
      { name: "chapter1.html", data: Buffer.from("<h1>第一章</h1>") },
      { name: "chapter2.html", data: Buffer.from("<h1>第二章</h1>") },
    ];
    const buf = makeZip(entries);
    const zip = await JSZip.loadAsync(buf);
    for (const e of entries) {
      const file = zip.file(e.name);
      expect(file, `应有条目 ${e.name}`).toBeTruthy();
      const got = await file!.async("nodebuffer");
      expect(Buffer.from(got)).toEqual(e.data);
    }
  });
});
