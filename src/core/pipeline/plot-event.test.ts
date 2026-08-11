import { describe, it, expect } from "vitest";
import { computePlotEventAdoptions } from "./plot-event";

describe("computePlotEventAdoptions", () => {
  it("空输入返回空清单", () => {
    const r = computePlotEventAdoptions({ plotEvents: [], existingEvents: [], nodeId: "n1", startPosition: 0 });
    expect(r.toCreate).toEqual([]);
    expect(r.adoptedCount).toBe(0);
  });

  it("全部为全新事件，按序分配 position 1,2,3", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["A 觉醒", "B 出走", "C 归来"],
      existingEvents: [],
      nodeId: "n1",
      startPosition: 0,
    });
    expect(r.adoptedCount).toBe(3);
    expect(r.toCreate.map((e) => e.position)).toEqual([1, 2, 3]);
    expect(r.toCreate[0].title).toBe("A 觉醒");
    expect(r.toCreate[0].sourceRefs).toEqual([{ type: "chapter", ref: "n1" }]);
  });

  it("跳过空串", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["   ", "", "有效事件", "  "],
      existingEvents: [],
      nodeId: "n1",
      startPosition: 5,
    });
    expect(r.adoptedCount).toBe(1);
    expect(r.toCreate[0].position).toBe(6);
    expect(r.toCreate[0].title).toBe("有效事件");
  });

  it("本批次内重复标题只建一次", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["重复", "重复", "唯一"],
      existingEvents: [],
      nodeId: "n1",
      startPosition: 0,
    });
    expect(r.adoptedCount).toBe(2);
    expect(r.toCreate.map((e) => e.title)).toEqual(["重复", "唯一"]);
    expect(r.toCreate.map((e) => e.position)).toEqual([1, 2]);
  });

  it("去重：同一章节已采纳的同标题不重复新建（数组形态 sourceRefs）", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["已存在", "新事件"],
      existingEvents: [
        { title: "已存在", sourceRefs: [{ type: "chapter", ref: "n1" }] },
        { title: "其它章节的", sourceRefs: [{ type: "chapter", ref: "n2" }] },
      ],
      nodeId: "n1",
      startPosition: 3,
    });
    expect(r.adoptedCount).toBe(1);
    expect(r.toCreate[0].title).toBe("新事件");
    expect(r.toCreate[0].position).toBe(4);
  });

  it("去重：兼容 JSON 字符串形态 sourceRefs（plan-chapter 旧写法）", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["旧串已存在", "全新"],
      existingEvents: [
        { title: "旧串已存在", sourceRefs: JSON.stringify([{ type: "chapter", ref: "n1" }]) },
      ],
      nodeId: "n1",
      startPosition: 0,
    });
    expect(r.adoptedCount).toBe(1);
    expect(r.toCreate[0].title).toBe("全新");
  });

  it("去重：同标题但来自不同章节仍可采纳", () => {
    const r = computePlotEventAdoptions({
      plotEvents: ["跨章节同标题"],
      existingEvents: [
        { title: "跨章节同标题", sourceRefs: [{ type: "chapter", ref: "n9" }] },
      ],
      nodeId: "n1",
      startPosition: 0,
    });
    expect(r.adoptedCount).toBe(1);
  });
});
