import { describe, it, expect } from "vitest";
import {
  findEntitiesInText,
  buildEntityMapFromData,
  getCategoryColor,
} from "./entity-highlighter";

describe("findEntitiesInText —— Q3 2字尾边界校验（青览 B3）", () => {
  const charMap = new Map([
    ["王林", { name: "王林", color: "#5B9BD5", type: "character" as const }],
    ["青云剑", { name: "青云剑", color: "#D64545", type: "lorebook" as const, category: "item" }],
  ]);

  it("2字「王林」在「王林海」中不误亮（尾 CJK 非边界）", () => {
    const m = findEntitiesInText("王林海从远方走来", charMap);
    expect(m.find((x) => x.name === "王林")).toBeUndefined();
  });

  it("2字「王林」在句尾/标点处正常高亮（尾处非 CJK）", () => {
    const m1 = findEntitiesInText("王林。", charMap);
    expect(m1.some((x) => x.name === "王林")).toBe(true);
    const m2 = findEntitiesInText("，王林，", charMap);
    expect(m2.some((x) => x.name === "王林")).toBe(true);
  });

  it("3字「青云剑」放宽边界，常规行文命中", () => {
    const m = findEntitiesInText("他拔出青云剑出鞘", charMap);
    expect(m.some((x) => x.name === "青云剑")).toBe(true);
  });
});

describe("findEntitiesInText —— 最长名优先 + 重叠占用（高亮地基核心）", () => {
  const overlapMap = new Map<string, { name: string; color: string; type: "character" | "lorebook"; category?: string }>([
    ["李星云剑法", { name: "李星云剑法", color: "#D64545", type: "lorebook", category: "technique" }],
    ["星云剑法", { name: "星云剑法", color: "#D64545", type: "lorebook", category: "technique" }],
  ]);

  it("长名「李星云剑法」与短名「星云剑法」重叠时只取最长名", () => {
    const m = findEntitiesInText("他施展李星云剑法破敌", overlapMap);
    expect(m).toHaveLength(1);
    expect(m[0].name).toBe("李星云剑法");
    expect(m[0].start).toBe(3);
    expect(m[0].end).toBe(8);
  });

  it("两 3 字名左重叠时左优先（「九天雷」占区间后「天雷法」被跳过）", () => {
    const m2 = new Map<string, { name: string; color: string; type: "character" | "lorebook"; category?: string }>([
      ["九天雷", { name: "九天雷", color: "#5B9BD5", type: "lorebook", category: "technique" }],
      ["天雷法", { name: "天雷法", color: "#5B9BD5", type: "lorebook", category: "technique" }],
    ]);
    const m = findEntitiesInText("九天雷法展", m2);
    // 3 字名放宽边界；「天雷法」落在「九天雷」已占区间被跳过，仅左优先者命中
    expect(m.map((x) => x.name)).toEqual(["九天雷"]);
  });

  it("不重叠的多实体全部按出现顺序命中", () => {
    const m3 = new Map<string, { name: string; color: string; type: "character" | "lorebook" }>([
      ["萧炎帝", { name: "萧炎帝", color: "#F97316", type: "character" }],
      ["林动天", { name: "林动天", color: "#F97316", type: "character" }],
    ]);
    const m = findEntitiesInText("萧炎帝和林动天", m3);
    expect(m.map((x) => x.name)).toEqual(["萧炎帝", "林动天"]);
    // 输出依赖 start 升序
    expect(m[0].start).toBeLessThan(m[1].start);
  });
});

describe("findEntitiesInText —— 头边界（介词/标点/句首）", () => {
  const map = new Map<string, { name: string; color: string; type: "character" | "lorebook" }>([
    ["王林", { name: "王林", color: "#5B9BD5", type: "character" }],
  ]);

  it("2 字名前有介词「在」且尾接标点视为头边界，正常高亮", () => {
    const m = findEntitiesInText("在王林。", map);
    expect(m.some((x) => x.name === "王林")).toBe(true);
  });

  it("2 字名在句首且尾接标点视为头边界，正常高亮", () => {
    const m = findEntitiesInText("王林，随后", map);
    expect(m.some((x) => x.name === "王林")).toBe(true);
  });

  it("2 字名被夹在 CJK 词中间（前非边界）不误亮", () => {
    // 「小王林」中「王林」前为「小」(CJK 非边界集) → 不应匹配
    const m = findEntitiesInText("小王林站出来", map);
    expect(m.find((x) => x.name === "王林")).toBeUndefined();
  });
});

describe("findEntitiesInText —— 停用词过滤", () => {
  it("即使把泛化词注册成实体也不参与高亮", () => {
    const map = new Map<string, { name: string; color: string; type: "character" | "lorebook"; category?: string }>([
      ["什么", { name: "什么", color: "#999", type: "lorebook", category: "custom" }],
    ]);
    const m = findEntitiesInText("他问什么情况", map);
    expect(m).toHaveLength(0);
  });

  it("单字实体（<2字）直接忽略", () => {
    const map = new Map<string, { name: string; color: string; type: "character" | "lorebook" }>([
      ["他", { name: "他", color: "#999", type: "character" }],
    ]);
    const m = findEntitiesInText("他来了", map);
    expect(m).toHaveLength(0);
  });
});

describe("buildEntityMapFromData —— 角色/词条映射与覆盖规则", () => {
  it("角色卡的别名也入 map，别名文本可高亮", () => {
    const map = buildEntityMapFromData([
      { name: "萧炎", type: "character", color: "#F97316", id: "c1", aliases: ["萧大帝"] },
    ]);
    expect(map.has("萧炎")).toBe(true);
    expect(map.has("萧大帝")).toBe(true);
    expect(map.get("萧大帝")?.type).toBe("character");
    const m = findEntitiesInText("他是萧大帝", map);
    expect(m.some((x) => x.name === "萧大帝")).toBe(true);
  });

  it("词条 title 覆盖同名角色（同键后者生效）", () => {
    const map = buildEntityMapFromData([
      { name: "古帝", type: "character", color: "#F97316", id: "c1" },
      { name: "古帝", type: "lorebook", color: "#22C55E", id: "l1", category: "item" },
    ]);
    const e = map.get("古帝");
    expect(e?.type).toBe("lorebook");
    expect(e?.category).toBe("item");
  });

  it("别名冲突时首个注册者保留（不覆盖已有键）", () => {
    const map = buildEntityMapFromData([
      { name: "甲", type: "character", color: "#F97316", aliases: ["共用"] },
      { name: "乙", type: "character", color: "#22C55E", aliases: ["共用"] },
    ]);
    // 共用 被甲先占，归甲
    expect(map.get("共用")?.color).toBe("#F97316");
  });
});

describe("getCategoryColor —— 固定色与兜底", () => {
  it("已知分类返回固定色", () => {
    expect(getCategoryColor("item")).toBe("#FACC15");
  });

  it("未知分类返回灰色兜底（不报错）", () => {
    expect(getCategoryColor("不存在的分类")).toBe("#6b7280");
  });
});
