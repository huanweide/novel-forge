import { describe, it, expect } from "vitest";
import { matchLoreEntries } from "./trigger";
import type { LorebookEntry } from "@/core/types";

// Round8 P0：matchLoreEntries 的 knownNames 需补入表格关键列值，
// 使 3字 lorebook key 在更长表值（如「李星云剑法」）内被吞并、不误触发召回。

function entry(id: string, keys: string[], enabled = true): LorebookEntry {
  return {
    id,
    keys,
    enabled,
    title: id,
    content: "",
    category: "misc",
    depth: 3,
    insertionOrder: 0,
  } as unknown as LorebookEntry;
}

const tableWithSkill = [
  {
    name: "功法表",
    columns: [{ key: "name" }],
    rows: [{ name: "李星云剑法" }],
  },
];

describe("matchLoreEntries —— 表格关键列值吞并3字 lorebook key（Round8 P0）", () => {
  it("「李星云剑法」内「李星云」被表值吞并 → lorebook「李星云」不误召回", () => {
    const triggered = matchLoreEntries(
      "他使出一招李星云剑法",
      [entry("李星云", ["李星云"])],
      8,
      tableWithSkill,
    );
    expect(triggered.map((t) => t.entry.id)).not.toContain("李星云");
  });

  it("「李星云看见」常规行文仍正常命中 lorebook「李星云」", () => {
    const triggered = matchLoreEntries(
      "李星云看见远处的山",
      [entry("李星云", ["李星云"])],
      8,
      tableWithSkill,
    );
    expect(triggered.map((t) => t.entry.id)).toContain("李星云");
  });

  it("「李星云。」紧后标点的常规行文仍命中", () => {
    const triggered = matchLoreEntries(
      "李星云。",
      [entry("李星云", ["李星云"])],
      8,
      tableWithSkill,
    );
    expect(triggered.map((t) => t.entry.id)).toContain("李星云");
  });

  it("未传表格时（Round6 行为）3字 key 前缀仍被误命中——确认修复依赖 tables 传入", () => {
    // 回归基线：若不传入同章节表值，3字 key 在更长词内仍会被误召回。
    const triggered = matchLoreEntries(
      "他使出一招李星云剑法",
      [entry("李星云", ["李星云"])],
      8,
    );
    expect(triggered.map((t) => t.entry.id)).toContain("李星云");
  });

  it("2字 lorebook key 在更长表值内仍直接命中（2字无吞并，行为不变）", () => {
    const tables = [{ name: "功法表", columns: [{ key: "name" }], rows: [{ name: "萧炎诀" }] }];
    const triggered = matchLoreEntries(
      "他修炼萧炎诀",
      [entry("萧炎", ["萧炎"])],
      8,
      tables,
    );
    expect(triggered.map((t) => t.entry.id)).toContain("萧炎");
  });
});
