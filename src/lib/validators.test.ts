/**
 * validators.ts 单元测试（ARCH-3 集中输入校验层）
 * 目标：锁死「脏数据在进入 prisma 前被拦下（防 500 / 防脏库）」的各分支行为。
 * 纯逻辑、无 DB 依赖。
 */
import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import {
  ValidationError,
  badRequest,
  asStr,
  asStrOrNull,
  asStrArray,
  asInt,
  asBool,
  readValidatedBody,
  optStr,
  optStrArray,
  optInt,
  optBool,
  optObj,
} from "./validators";

describe("ValidationError", () => {
  it("记录字段名与消息，且是 Error 子类", () => {
    const e = new ValidationError("name", "name 不能为空");
    expect(e).toBeInstanceOf(Error);
    expect(e).toBeInstanceOf(ValidationError);
    expect(e.name).toBe("ValidationError");
    expect(e.field).toBe("name");
    expect(e.message).toBe("name 不能为空");
  });
});

describe("badRequest", () => {
  it("返回 400 标准化响应（含 code 与 field）", async () => {
    const r = badRequest("坏数据", "fieldX");
    expect(r).toBeInstanceOf(NextResponse);
    expect(r.status).toBe(400);
    const body = await r.json();
    expect(body).toEqual({ error: "坏数据", code: "VALIDATION_ERROR", field: "fieldX" });
  });

  it("field 可省略", async () => {
    const r = badRequest("坏数据");
    const body = await r.json();
    expect(body.field).toBeUndefined();
  });
});

describe("asStr", () => {
  it("必填缺省（undefined / null）抛 ValidationError", () => {
    expect(() => asStr(undefined, "a", { required: true })).toThrow(ValidationError);
    expect(() => asStr(null, "a", { required: true })).toThrow(ValidationError);
  });

  it("可选缺省走 fallback（默认空串；显式 null fallback 仍归一为空串）", () => {
    expect(asStr(undefined, "a")).toBe("");
    expect(asStr(null, "a")).toBe("");
    expect(asStr(undefined, "a", { fallback: "x" })).toBe("x");
    expect(asStr(null, "a", { fallback: null })).toBe("");
  });

  it("非字符串抛错", () => {
    expect(() => asStr(123, "a")).toThrow(ValidationError);
    expect(() => asStr({}, "a")).toThrow(ValidationError);
  });

  it("超 max 抛错，未超则返回原串", () => {
    expect(() => asStr("abcdef", "a", { max: 5 })).toThrow(ValidationError);
    expect(asStr("abcdef", "a", { max: 10 })).toBe("abcdef");
  });
});

describe("asStrOrNull", () => {
  it("undefined / null 返回 null", () => {
    expect(asStrOrNull(undefined, "a")).toBeNull();
    expect(asStrOrNull(null, "a")).toBeNull();
  });

  it("非字符串抛错", () => {
    expect(() => asStrOrNull(123, "a")).toThrow(ValidationError);
  });

  it("超默认 max(20000) 抛错，正常返回", () => {
    expect(() => asStrOrNull("x".repeat(20001), "a")).toThrow(ValidationError);
    expect(asStrOrNull("hi", "a", 5)).toBe("hi");
  });
});

describe("asStrArray", () => {
  it("undefined / null 返回空数组", () => {
    expect(asStrArray(undefined, "a")).toEqual([]);
    expect(asStrArray(null, "a")).toEqual([]);
  });

  it("非数组抛错", () => {
    expect(() => asStrArray("x", "a")).toThrow(ValidationError);
  });

  it("数组只保留字符串元素（保持顺序）", () => {
    expect(asStrArray(["a", 1, "b", true, "c"], "a")).toEqual(["a", "b", "c"]);
  });
});

describe("asInt", () => {
  it("undefined / null 走 fallback（默认 0）", () => {
    expect(asInt(undefined, "a")).toBe(0);
    expect(asInt(null, "a")).toBe(0);
    expect(asInt(undefined, "a", 7)).toBe(7);
  });

  it("数字与数字字符串都截断为整数", () => {
    expect(asInt(3.9, "a")).toBe(3);
    expect(asInt("42", "a")).toBe(42);
    expect(asInt("-5.9", "a")).toBe(-5);
  });

  it("非有限数抛错", () => {
    expect(() => asInt("abc", "a")).toThrow(ValidationError);
    expect(() => asInt(NaN, "a")).toThrow(ValidationError);
  });
});

describe("asBool", () => {
  it("undefined / null 走 fallback（默认 false）", () => {
    expect(asBool(undefined)).toBe(false);
    expect(asBool(null)).toBe(false);
    expect(asBool(undefined, true)).toBe(true);
  });

  it("按 Boolean 语义转换", () => {
    expect(asBool(0)).toBe(false);
    expect(asBool(1)).toBe(true);
    expect(asBool("")).toBe(false);
    expect(asBool("x")).toBe(true);
    expect(asBool(true)).toBe(true);
  });
});

describe("readValidatedBody", () => {
  const makeReq = (body: string) =>
    new Request("https://x.test/", { method: "POST", body });

  it("非法 JSON 返回 400 且是 NextResponse", async () => {
    const r = await readValidatedBody(makeReq("{not json"), () => ({}));
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(400);
  });

  it("JSON 原始值（非对象，如字符串）返回 400", async () => {
    const r = await readValidatedBody(makeReq('"plain string"'), () => ({}));
    expect(r).toBeInstanceOf(NextResponse);
  });

  it("validate 抛 ValidationError → 400 透出 field 与消息", async () => {
    const r = await readValidatedBody(makeReq(JSON.stringify({})), () =>
      asStr(undefined, "projectId", { required: true })
    );
    expect(r).toBeInstanceOf(NextResponse);
    const body = await (r as NextResponse).json();
    expect(body.field).toBe("projectId");
    expect(body.code).toBe("VALIDATION_ERROR");
  });

  it("validate 抛其他 Error → 400 透出该消息", async () => {
    const r = await readValidatedBody(makeReq(JSON.stringify({})), () => {
      throw new Error("自定义失败");
    });
    expect(r).toBeInstanceOf(NextResponse);
    const body = await (r as NextResponse).json();
    expect(body.error).toBe("自定义失败");
  });

  it("校验成功返回对象（非 NextResponse）", async () => {
    const r = await readValidatedBody(makeReq(JSON.stringify({ name: "书" })), (raw) => ({
      name: asStr(raw.name, "name", { required: true, max: 100 }),
    }));
    expect(r).not.toBeInstanceOf(NextResponse);
    expect(r).toEqual({ name: "书" });
  });
});

describe("optStr", () => {
  it("未提供→undefined，显式 null→null", () => {
    expect(optStr(undefined, "a")).toBeUndefined();
    expect(optStr(null, "a")).toBeNull();
  });
  it("非字符串或超长抛错，正常返回", () => {
    expect(() => optStr(123, "a")).toThrow(ValidationError);
    expect(() => optStr("x".repeat(20001), "a")).toThrow(ValidationError);
    expect(optStr("hi", "a")).toBe("hi");
  });
});

describe("optStrArray", () => {
  it("未提供→undefined，显式 null→null，正常过滤", () => {
    expect(optStrArray(undefined, "a")).toBeUndefined();
    expect(optStrArray(null, "a")).toBeNull();
    expect(optStrArray(["a", 1, "b"], "a")).toEqual(["a", "b"]);
  });
  it("非数组抛错", () => {
    expect(() => optStrArray("x", "a")).toThrow(ValidationError);
  });
});

describe("optInt", () => {
  it("未提供→undefined，显式 null→null", () => {
    expect(optInt(undefined, "a")).toBeUndefined();
    expect(optInt(null, "a")).toBeNull();
  });
  it("数字/数字串截断，非法抛错", () => {
    expect(optInt(3.9, "a")).toBe(3);
    expect(optInt("42", "a")).toBe(42);
    expect(() => optInt("x", "a")).toThrow(ValidationError);
  });
});

describe("optBool", () => {
  it("未提供→undefined，显式 null→null，正常 Boolean 转换", () => {
    expect(optBool(undefined)).toBeUndefined();
    expect(optBool(null)).toBeNull();
    expect(optBool(1)).toBe(true);
    expect(optBool(0)).toBe(false);
  });
});

describe("optObj", () => {
  it("未提供→undefined，显式 null→null", () => {
    expect(optObj(undefined, "a")).toBeUndefined();
    expect(optObj(null, "a")).toBeNull();
  });
  it("数组或非对象抛错，对象返回", () => {
    expect(() => optObj([], "a")).toThrow(ValidationError);
    expect(() => optObj("x", "a")).toThrow(ValidationError);
    expect(optObj({ k: 1 }, "a")).toEqual({ k: 1 });
  });
});
