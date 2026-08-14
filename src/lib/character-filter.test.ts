import { describe, it, expect } from "vitest";
import { filterCharacters, isUserTag } from "./character-filter";
import type { CharacterData } from "@/components/workspace/types";

const make = (over: Partial<CharacterData>): CharacterData => ({
  id: "x",
  name: "n",
  role: "supporting",
  age: "",
  gender: "",
  personality: [],
  currentStatus: "alive",
  tags: [],
  ...over,
});

describe("isUserTag", () => {
  it("用户标签返回 true，系统标签与软删标记返回 false", () => {
    expect(isUserTag("朋友")).toBe(true);
    expect(isUserTag("📥系统导入")).toBe(false);
    expect(isUserTag("📝备注")).toBe(false);
    expect(isUserTag("🗂 已合并")).toBe(false);
  });
});

describe("filterCharacters（v2.17 过滤逻辑抽纯函数）", () => {
  const list: CharacterData[] = [
    make({ id: "1", name: "韩先生", role: "supporting", tags: ["🗂 已合并"] }),
    make({ id: "2", name: "迭戈", role: "protagonist", tags: ["朋友"], aliases: ["Diego"] }),
    make({ id: "3", name: "配角A", role: "supporting", currentStatus: "dead", tags: [] }),
    make({ id: "4", name: "配角B", role: "mentor", currentStatus: "missing", tags: ["敌人"] }),
  ];
  const all = { search: "", roleFilter: "all", tagFilter: "all", statusFilter: "all" };

  it("默认即隐藏已合并（🗂 已合并）软删卡，只返回 3 张有效卡", () => {
    expect(filterCharacters(list, all)).toHaveLength(3);
  });

  it("隐藏已合并（🗂 已合并）软删卡", () => {
    const r = filterCharacters(list, all);
    expect(r.map((c) => c.id)).not.toContain("1");
    expect(r).toHaveLength(3);
  });

  it("roleFilter 只保留指定角色", () => {
    const r = filterCharacters(list, { ...all, roleFilter: "protagonist" });
    expect(r.map((c) => c.id)).toEqual(["2"]);
  });

  it("tagFilter=has-tags 只保留有用户标签", () => {
    const r = filterCharacters(list, { ...all, tagFilter: "has-tags" });
    expect(r.map((c) => c.id).sort()).toEqual(["2", "4"]);
  });

  it("tagFilter=no-tags 只保留无用户标签", () => {
    const r = filterCharacters(list, { ...all, tagFilter: "no-tags" });
    expect(r.map((c) => c.id).sort()).toEqual(["3"]);
  });

  it("tagFilter=具体标签 只保留含该标签", () => {
    const r = filterCharacters(list, { ...all, tagFilter: "敌人" });
    expect(r.map((c) => c.id)).toEqual(["4"]);
  });

  it("statusFilter=alive 排除死亡/失踪", () => {
    const r = filterCharacters(list, { ...all, statusFilter: "alive" });
    expect(r.map((c) => c.id)).toEqual(["2"]);
  });

  it("statusFilter=dead 包含 dead/missing/presumed_dead", () => {
    const r = filterCharacters(list, { ...all, statusFilter: "dead" });
    expect(r.map((c) => c.id).sort()).toEqual(["3", "4"]);
  });

  it("search 命中 name 或 alias 子串（含中文名与英文别名）", () => {
    expect(filterCharacters(list, { ...all, search: "Diego" }).map((c) => c.id)).toEqual(["2"]);
    expect(filterCharacters(list, { ...all, search: "迭戈" }).map((c) => c.id)).toEqual(["2"]);
  });

  it("多条件叠加（role + status）", () => {
    const r = filterCharacters(list, { ...all, roleFilter: "supporting", statusFilter: "dead" });
    expect(r.map((c) => c.id)).toEqual(["3"]);
  });
});
