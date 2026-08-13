/**
 * relations.ts 单元测试（角色关系字段归一化 / 工坊 P1）
 * 锁死：旧备份/外部导入的 {target,type} 归一化为 {targetName,relation}，
 * 防关系图断裂；非数组/缺目标/空白项被过滤。纯逻辑、无 DB。
 */
import { describe, it, expect } from "vitest";
import { normalizeRelationships } from "./relations";

describe("normalizeRelationships", () => {
  it("非数组输入返回空数组", () => {
    expect(normalizeRelationships(null)).toEqual([]);
    expect(normalizeRelationships(undefined)).toEqual([]);
    expect(normalizeRelationships("x")).toEqual([]);
    expect(normalizeRelationships({})).toEqual([]);
  });

  it("空数组返回空数组", () => {
    expect(normalizeRelationships([])).toEqual([]);
  });

  it("旧格式 {target, type} 归一化为 {targetName, relation}", () => {
    expect(normalizeRelationships([{ target: "张三", type: "朋友" }])).toEqual([
      { targetName: "张三", relation: "朋友" },
    ]);
  });

  it("新格式 {targetName, relation} 保持原样", () => {
    expect(normalizeRelationships([{ targetName: "李四", relation: "敌人" }])).toEqual([
      { targetName: "李四", relation: "敌人" },
    ]);
  });

  it("空白被 trim", () => {
    expect(
      normalizeRelationships([{ targetName: "  王五  ", relation: "  师徒 " }])
    ).toEqual([{ targetName: "王五", relation: "师徒" }]);
  });

  it("缺少 target/targetName 的项被过滤", () => {
    expect(normalizeRelationships([{ relation: "朋友" }, { type: "敌人" }])).toEqual([]);
  });

  it("targetName trim 后为空的项被过滤", () => {
    expect(normalizeRelationships([{ targetName: "   ", relation: "x" }])).toEqual([]);
    expect(normalizeRelationships([{ target: "  ", relation: "x" }])).toEqual([]);
  });

  it("非对象元素被过滤，仅留有效项", () => {
    expect(
      normalizeRelationships(["str", 1, null, { target: "a", type: "b" }])
    ).toEqual([{ targetName: "a", relation: "b" }]);
  });

  it("targetName 优先于 target", () => {
    expect(
      normalizeRelationships([{ targetName: "新", target: "旧", relation: "r" }])
    ).toEqual([{ targetName: "新", relation: "r" }]);
  });

  it("混合有效与无效项，仅保留有效", () => {
    const raw = [
      { target: "甲", type: "友" },
      { relation: "无目标" },
      { targetName: "乙", relation: "敌" },
      "垃圾",
    ];
    expect(normalizeRelationships(raw)).toEqual([
      { targetName: "甲", relation: "友" },
      { targetName: "乙", relation: "敌" },
    ]);
  });
});
