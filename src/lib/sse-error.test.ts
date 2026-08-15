import { describe, it, expect } from "vitest";
import { sseError } from "./sse-error";

describe("sseError", () => {
  it("字符串输入 -> GENERATION code，原样 content + hint", () => {
    const e = sseError("续写内容为空");
    expect(e.type).toBe("error");
    expect(e.content).toBe("续写内容为空");
    expect(e.code).toBe("GENERATION");
    expect(e.hint).toBeTruthy();
  });

  it("Prisma P2021 -> 数据库表不存在 + 修复 hint", () => {
    const err = Object.assign(new Error("Table does not exist"), { code: "P2021" });
    const e = sseError(err);
    expect(e.code).toBe("P2021");
    expect(e.content).toContain("表");
    expect(e.hint).toBeTruthy();
  });

  it("网络 TypeError -> NETWORK code", () => {
    const err = new TypeError("Failed to fetch");
    const e = sseError(err);
    expect(e.code).toBe("NETWORK");
    expect(e.content).toContain("外部服务");
  });

  it("未知错误 -> INTERNAL code，且不回显原始 message", () => {
    const e = sseError(new Error("secret: /home/app/.env leaked"));
    expect(e.code).toBe("INTERNAL");
    expect(e.content).toBe("服务器内部错误，请查看日志");
    expect(e.content).not.toContain("secret");
  });

  it("非 Error 原始值 -> INTERNAL code", () => {
    const e = sseError({ foo: "bar" });
    expect(e.code).toBe("INTERNAL");
    expect(e.type).toBe("error");
  });
});
