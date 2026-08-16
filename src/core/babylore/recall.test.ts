// recall 召回纯函数测试锁
// 锁定「剧情推进 = 记忆召回」核心匹配契约：recallContext 按上下文命中世界书/结构化表格，
// 返回应注入正文 AI 的记忆片段；若匹配逻辑被改坏会令设定召回失效或污染 prompt。
import { describe, it, expect } from "vitest";
import { recallContext } from "./recall";

const lorebook = [
  { title: "苏苏设定", content: "苏苏是女主", keys: ["苏苏"], enabled: true },
  { title: "禁用条目", content: "不注入", keys: ["林府"], enabled: false },
];

const tables = [
  {
    name: "角色表",
    columns: [
      { key: "name", label: "名称" },
      { key: "status", label: "状态" },
    ],
    rows: [{ name: "林府", status: "已灭门" }],
  },
];

describe("recallContext - 入口与边界", () => {
  it("空上下文返回空", () => {
    expect(recallContext("", lorebook, tables)).toEqual([]);
  });

  it("关键词未命中返回空", () => {
    expect(recallContext("风和日丽", lorebook, tables)).toEqual([]);
  });
});

describe("recallContext - 世界书（lorebook）", () => {
  it("关键词命中返回 lorebook 项且 score>=2", () => {
    const items = recallContext("苏苏走进了房间", lorebook, tables);
    const hit = items.find((i) => i.source === "lorebook");
    expect(hit).toBeDefined();
    expect(hit!.title).toBe("苏苏设定");
    expect(hit!.content).toBe("苏苏是女主");
    expect(hit!.score).toBeGreaterThanOrEqual(2);
  });

  it("enabled=false 的世界书不召回", () => {
    const items = recallContext("林府大门紧闭", lorebook, tables);
    const lore = items.filter((i) => i.source === "lorebook");
    expect(lore.find((i) => i.title === "禁用条目")).toBeUndefined();
  });

  it("多个 lorebook 命中均返回", () => {
    const lb = [
      { title: "A", content: "a", keys: ["苏苏"], enabled: true },
      { title: "B", content: "b", keys: ["林府"], enabled: true },
    ];
    const items = recallContext("苏苏与林府", lb, []);
    expect(items.filter((i) => i.source === "lorebook").length).toBe(2);
  });
});

describe("recallContext - 结构化表格（table）", () => {
  it("行关键列值命中返回 table 项，content 含 列label:值", () => {
    const items = recallContext("林府化作灰烬", lorebook, tables);
    const t = items.find((i) => i.source === "table");
    expect(t).toBeDefined();
    expect(t!.title).toBe("角色表");
    expect(t!.content).toContain("名称:林府");
    expect(t!.content).toContain("状态:已灭门");
  });
});

describe("recallContext - 最长匹配优先去重", () => {
  it("「青龙」被「青龙镇」包含时剔除短词，score 取长词长度 3", () => {
    const lb = [{ title: "镇", content: "青龙镇", keys: ["青龙", "青龙镇"], enabled: true }];
    const items = recallContext("青龙镇灯火通明", lb, []);
    const hit = items.find((i) => i.source === "lorebook");
    expect(hit).toBeDefined();
    expect(hit!.score).toBe(3);
  });
});
