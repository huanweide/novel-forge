import { describe, it, expect } from "vitest";
import { findCharacterByName } from "./trigger";

// Round7 P1：OOC 已知名集合需并入同章节词条/技能/功法/地点等长名候选，
// 使 3字角色名在更长词条（如「李星云剑法」）内被吞并、不再误报 OOC。

describe("findCharacterByName —— OOC 词条吞并（Round7 P1）", () => {
  const 李星云 = { id: "c1", name: "李星云", aliases: [] as string[] };

  it("「李星云剑法」内「李星云」被词条吞并 → 不误报 OOC", () => {
    // 同章节存在词条「李星云剑法」，传入 extraKnownNames 后 3字名前缀被吞并。
    const found = findCharacterByName("他使出一招李星云剑法", [李星云], ["李星云剑法"]);
    expect(found).toEqual([]);
  });

  it("「李星云看见」常规行文仍正常命中 OOC", () => {
    // 紧后 CJK（看）但拼不出更长已知名 → 正常命中。
    const found = findCharacterByName("李星云看见远处的山", [李星云], ["李星云剑法"]);
    expect(found).toEqual(["c1"]);
  });

  it("紧后标点/文末的「李星云」仍正常命中（不受词条干扰）", () => {
    const found = findCharacterByName("李星云。", [李星云], ["李星云剑法"]);
    expect(found).toEqual(["c1"]);
    const found2 = findCharacterByName("李星云", [李星云], ["李星云剑法"]);
    expect(found2).toEqual(["c1"]);
  });

  it("未传入词条时（Round6 行为）仍会误报——确认修复依赖 extraKnownNames 传入", () => {
    // 这是回归基线：若调用方不传同章节长名候选，3字名前缀仍会被误命中。
    const found = findCharacterByName("他使出一招李星云剑法", [李星云]);
    expect(found).toEqual(["c1"]);
  });

  it("2字角色名在更长词条内仍直接命中（2字无吞并，行为不变）", () => {
    const 萧炎 = { id: "c2", name: "萧炎", aliases: [] as string[] };
    // 2字名走直接子串命中，不依赖 knownNames 吞并；「萧炎诀」中的「萧炎」仍视为出场。
    const found = findCharacterByName("他修炼萧炎诀", [萧炎], ["萧炎诀"]);
    expect(found).toEqual(["c2"]);
  });
});
