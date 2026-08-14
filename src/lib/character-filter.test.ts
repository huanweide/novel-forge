import { describe, it, expect } from "vitest";
import { filterCharacters, isUserTag, type CharacterFilterCriteria } from "./character-filter";
import type { CharacterData } from "@/components/workspace/types";

// 构造测试夹具：补全 CharacterData 必需字段，其余按需覆盖
function mk(
  c: Pick<CharacterData, "id" | "name" | "role" | "currentStatus"> & Partial<CharacterData>,
): CharacterData {
  return { age: "", gender: "", ...c } as CharacterData;
}

const ALL: CharacterFilterCriteria = {
  search: "",
  roleFilter: "all",
  tagFilter: "all",
  statusFilter: "all",
};

describe("isUserTag（用户标签判定）", () => {
  it("系统标签（导入/备注）与软删标记不算用户标签", () => {
    expect(isUserTag("📥 导入 3 章")).toBe(false);
    expect(isUserTag("📝 备注")).toBe(false);
    expect(isUserTag("🗂 已合并")).toBe(false);
  });
  it("普通自建标签算用户标签", () => {
    expect(isUserTag("龙陨卫")).toBe(true);
  });
});

describe("filterCharacters（角色列表过滤，v2.17 引入 / v2.18 抽纯函数）", () => {
  // id=2 韩梅梅 带「🗂 已合并」软删标记，默认应从列表隐藏
  const chars: CharacterData[] = [
    mk({ id: "1", name: "李雷", role: "protagonist", currentStatus: "alive", aliases: ["小明"], tags: ["龙陨卫", "📥 导入"] }),
    mk({ id: "2", name: "韩梅梅", role: "supporting", currentStatus: "dead", tags: ["🗂 已合并"] }),
    mk({ id: "3", name: "王芳", role: "antagonist", currentStatus: "missing", tags: [] }),
    mk({ id: "4", name: "赵敏", role: "supporting", currentStatus: "presumed_dead", tags: ["药人"] }),
  ];

  it("无任何过滤 → 返回全部可见者（已合并默认隐藏）", () => {
    expect(filterCharacters(chars, ALL).map((c) => c.id)).toEqual(["1", "3", "4"]);
  });

  it("roleFilter 精确匹配", () => {
    expect(filterCharacters(chars, { ...ALL, roleFilter: "antagonist" }).map((c) => c.id)).toEqual(["3"]);
  });

  it("tagFilter=no-tags → 仅无用户标签者", () => {
    // id1 有龙陨卫（用户标签）、id4 有药人；id2 已合并隐藏；仅 id3 无标签
    expect(filterCharacters(chars, { ...ALL, tagFilter: "no-tags" }).map((c) => c.id)).toEqual(["3"]);
  });

  it("tagFilter=has-tags → 含任一用户标签", () => {
    expect(filterCharacters(chars, { ...ALL, tagFilter: "has-tags" }).map((c) => c.id).sort()).toEqual(["1", "4"]);
  });

  it("tagFilter=具体用户标签", () => {
    expect(filterCharacters(chars, { ...ALL, tagFilter: "药人" }).map((c) => c.id)).toEqual(["4"]);
  });

  it("tagFilter=系统标签不算用户标签 → 匹配不到", () => {
    expect(filterCharacters(chars, { ...ALL, tagFilter: "📥 导入" })).toHaveLength(0);
  });

  it("statusFilter=alive", () => {
    expect(filterCharacters(chars, { ...ALL, statusFilter: "alive" }).map((c) => c.id)).toEqual(["1"]);
  });

  it("statusFilter=dead 覆盖 dead/missing/presumed_dead", () => {
    // id2 已合并隐藏不计入；id3 missing、id4 presumed_dead 命中
    expect(filterCharacters(chars, { ...ALL, statusFilter: "dead" }).map((c) => c.id).sort()).toEqual(["3", "4"]);
  });

  it("search 命中 name 子串", () => {
    expect(filterCharacters(chars, { ...ALL, search: "李" }).map((c) => c.id)).toEqual(["1"]);
  });

  it("search 命中 aliases 子串", () => {
    expect(filterCharacters(chars, { ...ALL, search: "小明" }).map((c) => c.id)).toEqual(["1"]);
  });

  it("search 无匹配 → 空", () => {
    expect(filterCharacters(chars, { ...ALL, search: "zzz" })).toHaveLength(0);
  });

  it("组合过滤：role=supporting + has-tags → 仅 id4", () => {
    const r = filterCharacters(chars, { search: "", roleFilter: "supporting", tagFilter: "has-tags", statusFilter: "all" });
    expect(r.map((c) => c.id)).toEqual(["4"]);
  });
});
