/**
 * api.ts 单元测试（API 响应统一封装）
 * 锁死 jsonError / jsonOk 的默认状态、可选 status、可选 code、body 结构。
 * 仅依赖 next/server 的 NextResponse（测试环境已验证可导入），无 DB 无 IO。
 */
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { jsonError, jsonOk } from "./api";

describe("jsonError", () => {
  it("默认 500，body 仅 error", async () => {
    const r = jsonError("出错");
    expect(r).toBeInstanceOf(NextResponse);
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: "出错" });
  });

  it("可指定 status", async () => {
    const r = jsonError("未找到", 404);
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "未找到" });
  });

  it("可指定 code（透出到 body）", async () => {
    const r = jsonError("非法", 400, "BAD_REQUEST");
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ error: "非法", code: "BAD_REQUEST" });
  });
});

describe("jsonOk", () => {
  it("默认 200，body 为原数据", async () => {
    const r = jsonOk({ id: 1 });
    expect(r).toBeInstanceOf(NextResponse);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ id: 1 });
  });

  it("可指定 status", async () => {
    const r = jsonOk({ ok: true }, 201);
    expect(r.status).toBe(201);
    expect(await r.json()).toEqual({ ok: true });
  });
});
