import { describe, it, expect } from "vitest";
import { describeStreamError, describeHttpError } from "./stream-error";

describe("describeStreamError —— 网络层异常转人话", () => {
  it("用户主动中止（AbortError）不提示", () => {
    const abortErr = new Error("The user aborted a request.");
    abortErr.name = "AbortError";
    expect(describeStreamError(abortErr)).toBeNull();
  });

  it("fetch 失败（TypeError）识别为连不上服务", () => {
    const r = describeStreamError(new TypeError("Failed to fetch"));
    expect(r).not.toBeNull();
    expect(r!.title).toBe("连不上服务");
    expect(r!.description).toContain("localhost:3001");
  });

  it("错误信息含 network 关键字也识别为连不上服务", () => {
    const r = describeStreamError(new Error("NetworkError when attempting to fetch resource."));
    expect(r!.title).toBe("连不上服务");
  });

  it("超时识别为生成超时", () => {
    const r = describeStreamError(new Error("request timeout"));
    expect(r!.title).toBe("生成超时");
    expect(r!.description).toContain("正文不会丢");
  });

  it("拿不到响应流时有专门提示", () => {
    const r = describeStreamError(new Error("无法获取响应流"));
    expect(r!.title).toBe("服务没返回内容");
  });

  it("普通异常兜底并带上原始信息", () => {
    const r = describeStreamError(new Error("boom"));
    expect(r!.title).toBe("生成失败");
    expect(r!.description).toContain("boom");
  });

  it("非 Error 输入（字符串 / undefined）也能兜底", () => {
    expect(describeStreamError(undefined)!.title).toBe("生成失败");
    expect(describeStreamError("炸了")!.description).toContain("炸了");
  });
});

describe("describeHttpError —— HTTP 非 2xx 转人话", () => {
  it("服务端给了 error + hint 时优先转述服务端原文", () => {
    const r = describeHttpError(500, { error: "模型调用失败", hint: "请检查 API Key 是否正确" });
    expect(r.title).toBe("生成失败");
    expect(r.description).toContain("模型调用失败");
    expect(r.description).toContain("请检查 API Key 是否正确");
  });

  it("服务端只给 error 时不拼接空 hint", () => {
    const r = describeHttpError(500, { error: "数据库连接失败" });
    expect(r.description).toBe("数据库连接失败");
  });

  it("服务端给的 error 是空串时按状态码兜底", () => {
    const r = describeHttpError(429, { error: "   " });
    expect(r.title).toBe("请求太频繁");
  });

  it("401 / 403 提示检查密钥", () => {
    expect(describeHttpError(401, null).title).toBe("接口密钥无效");
    expect(describeHttpError(403, null).title).toBe("接口密钥无效");
  });

  it("402 提示余额不足", () => {
    expect(describeHttpError(402, null).title).toBe("账户余额不足");
  });

  it("404 提示接口不存在", () => {
    expect(describeHttpError(404, null).title).toBe("接口不存在");
  });

  it("429 提示请求太频繁", () => {
    expect(describeHttpError(429, null).title).toBe("请求太频繁");
  });

  it("502 / 503 / 504 提示服务暂时不可用", () => {
    expect(describeHttpError(502, null).title).toBe("服务暂时不可用");
    expect(describeHttpError(503, null).title).toBe("服务暂时不可用");
    expect(describeHttpError(504, null).title).toBe("服务暂时不可用");
  });

  it("未知状态码兜底为可操作的人话（不暴露原始状态码）", () => {
    const r = describeHttpError(599, null);
    expect(r.title).toBe("生成失败");
    expect(r.description).not.toContain("599");
    expect(r.description).toContain("重试");
  });

  it("客户端兜底的裸状态码（HTTP 500）不算服务端消息，交给状态码分支翻译", () => {
    const r = describeHttpError(500, { error: "HTTP 500" });
    expect(r.description).not.toContain("HTTP 500");
    expect(r.description).toContain("重试");
  });

  it("带说明的裸状态码（HTTP 401）也被翻译成人话而非原样展示", () => {
    const r = describeHttpError(401, { error: "HTTP 401" });
    expect(r.title).toBe("接口密钥无效");
  });

  it("payload 是非法类型时不崩", () => {
    expect(() => describeHttpError(500, "not an object")).not.toThrow();
    expect(describeHttpError(400, 42).title).toBe("请求有误");
  });
});
