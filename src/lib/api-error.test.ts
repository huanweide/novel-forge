import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { classifyError, jsonError } from "./api-error";

// 抑制 classifyError 默认分支的 console.error 噪声（其行为本身由断言覆盖）
beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("classifyError - Prisma 已知错误码中文映射", () => {
  it("P1001 无法连接数据库 → 503 + docker 指引", () => {
    const e = Object.assign(new Error("connect ECONNREFUSED"), { code: "P1001" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P1001", error: "数据库无法连接" });
    expect(r.hint).toContain("docker compose");
  });

  it("P2021 表不存在 → 503 + prisma db push 指引", () => {
    const e = Object.assign(new Error("table does not exist"), { code: "P2021" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P2021", error: "数据库表不存在" });
    expect(r.hint).toContain("prisma db push");
  });

  it("P2002 唯一约束冲突 → 409", () => {
    const e = Object.assign(new Error("unique constraint failed"), { code: "P2002" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 409, code: "P2002", error: "数据已存在（唯一约束冲突）" });
  });

  it("P1000 登录失败 → 503", () => {
    const e = Object.assign(new Error("Authentication failed"), { code: "P1000" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P1000", error: "数据库登录失败" });
  });

  it("P1002 连接中断 → 503", () => {
    const e = Object.assign(new Error("Connection timed out"), { code: "P1002" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P1002", error: "数据库连接中断" });
  });

  it("P2024 连接池耗尽 → 503", () => {
    const e = Object.assign(new Error("Timed out fetching a connection"), { code: "P2024" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P2024", error: "数据库连接池耗尽" });
  });
});

describe("classifyError - Prisma 客户端与结构不匹配", () => {
  it("未知 Prisma code + message 含 Unknown arg → SCHEMA_MISMATCH 503", () => {
    const e = Object.assign(new Error("Invalid `prisma.xxx.findMany()`: Unknown arg `foo`"), {
      code: "PXXXX",
    });
    const r = classifyError(e);
    expect(r).toMatchObject({
      status: 503,
      code: "PXXXX",
      error: "Prisma 客户端与数据库结构不匹配",
    });
    expect(r.hint).toContain("prisma generate");
  });

  it("Prisma 命名但无 schema 不匹配特征 → 通用 503", () => {
    const e = Object.assign(new Error("PrismaClientKnownRequestError"), { code: "P9999" });
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 503, code: "P9999", error: "数据库访问出错" });
  });
});

describe("classifyError - 网络 / 外部服务", () => {
  it("TypeError fetch 不可达 → 502 NETWORK", () => {
    const e = new TypeError("Failed to fetch");
    const r = classifyError(e);
    expect(r).toMatchObject({ status: 502, code: "NETWORK", error: "无法连接外部服务（AI 接口）" });
  });
});

describe("classifyError - 配置类友好错误透传（自检 banner 黑话收敛）", () => {
  it("LLM API Key 未配置（llm.ts 环境变量兜底）→ CONFIG 400 且原样透传中文", () => {
    const msg = "LLM API Key 未配置——请在设置页面填入 Key，或在 .env 中设置 LLM_API_KEY";
    const r = classifyError(new Error(msg));
    expect(r).toMatchObject({ status: 400, code: "CONFIG", error: msg });
    expect(r.error).not.toBe("服务器内部错误，请查看日志");
    expect(r.hint).toContain("设置");
  });

  it("LLM 提供商未配置（llm.ts）→ CONFIG 400 透传", () => {
    const msg = "LLM 提供商未配置——请在设置页面选择提供商";
    const r = classifyError(new Error(msg));
    expect(r).toMatchObject({ status: 400, code: "CONFIG", error: msg });
  });

  it("本地推理需填写 Base URL（llm.ts local 分支）→ CONFIG 400 透传", () => {
    const msg = "本地推理需填写 Base URL（如 http://localhost:11434/v1）";
    const r = classifyError(new Error(msg));
    expect(r).toMatchObject({ status: 400, code: "CONFIG", error: msg });
  });
});

describe("classifyError - 默认分支不泄露内部错误 (L2-003 修复)", () => {
  it("普通 Error → 500 INTERNAL 且不明文透传 err.message", () => {
    const secret = "SECRET_SQL_FRAGMENT_leak_test_12345";
    const r = classifyError(new Error(secret));
    expect(r.status).toBe(500);
    expect(r.code).toBe("INTERNAL");
    expect(r.error).toBe("服务器内部错误，请查看日志");
    expect(r.error).not.toContain(secret);
  });

  it("字符串输入 → 转 Error 走默认 500", () => {
    const r = classifyError("some raw string");
    expect(r.status).toBe(500);
    expect(r.code).toBe("INTERNAL");
  });

  it("非 Error 对象 → 走默认 500 不抛", () => {
    const r = classifyError({ weird: true });
    expect(r.status).toBe(500);
    expect(r.code).toBe("INTERNAL");
  });
});

describe("jsonError - 标准化响应", () => {
  it("返回 NextResponse 且 status 与 body 一致、不泄露内部信息", async () => {
    const secret = "LEAK_BODY_TEST_9988";
    const res = jsonError(new Error(secret)) as unknown as Response;
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.code).toBe("INTERNAL");
    expect(body.error).toBe("服务器内部错误，请查看日志");
    expect(JSON.stringify(body)).not.toContain(secret);
  });
});
