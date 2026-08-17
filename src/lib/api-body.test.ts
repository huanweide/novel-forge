import { describe, it, expect } from "vitest";
import { missingFields, requireFields, safeJson } from "./api-body";

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

describe("safeJson", () => {
  it("合法 JSON → ok:true 且正确解析", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ projectId: "abc", nodeId: "n1" }),
      headers: { "Content-Type": "application/json" },
    });
    const r = await safeJson(req);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body).toEqual({ projectId: "abc", nodeId: "n1" });
    }
  });

  it("畸形 JSON → ok:false 且返回 400 + BAD_REQUEST", async () => {
    const req = new Request("http://x", {
      method: "POST",
      body: "{bad",
      headers: { "Content-Type": "application/json" },
    });
    const r = await safeJson(req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.response.status).toBe(400);
      const parsed = await r.response.json();
      expect(parsed).toEqual({ error: "请求体不是合法 JSON", code: "BAD_REQUEST" });
    }
  });
});
