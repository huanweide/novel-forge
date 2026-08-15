import { describe, it, expect } from "vitest";
import { missingFields, requireFields } from "./api-body";

describe("missingFields", () => {
  it("返回缺失字段", () => {
    expect(missingFields({ projectId: "x" }, ["projectId", "nodeId"])).toEqual(["nodeId"]);
  });
  it("空串视为缺失", () => {
    expect(missingFields({ projectId: "", nodeId: "y" }, ["projectId", "nodeId"])).toEqual(["projectId"]);
  });
  it("null / undefined 视为缺失", () => {
    expect(missingFields(null, ["a"])).toEqual(["a"]);
    expect(missingFields(undefined, ["a", "b"])).toEqual(["a", "b"]);
  });
  it("全部存在返回空", () => {
    expect(missingFields({ projectId: "x", nodeId: "y" }, ["projectId", "nodeId"])).toEqual([]);
  });
});

describe("requireFields", () => {
  it("齐全返回 ok", () => {
    expect(requireFields({ projectId: "x", nodeId: "y" }, ["projectId", "nodeId"]).ok).toBe(true);
  });
  it("缺失返回 400 响应且非 ok", () => {
    const r = requireFields({}, ["projectId"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.response.status).toBe(400);
  });
});
