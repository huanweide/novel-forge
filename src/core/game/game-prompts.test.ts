import { describe, it, expect } from "vitest";
import { parseGameOutput } from "./game-prompts";

// 验证游戏模式「背包物品归属」解析：CI| 格式带归属者字段。
describe("parseGameOutput —— 背包物品归属", () => {
  const raw = `樊斯瑞握紧龙髓石，目光扫过潮痕尽头。
===角色物品变动===
CI|获得|龙髓石|1|樊斯瑞
CI|获得|黑金怀表|2
CI|消耗|破损的地图|1
===新实体===
NE|周远征|公安局长|追寻龙陨真相
【情节进度：35%】
1. 追查怀表来源
2. 返回龙骨滩`;

  const r = parseGameOutput(raw);

  it("解析出三个物品变动且归属正确", () => {
    expect(r.itemChanges.length).toBe(3);
  });

  it("带归属者的物品记录 owner（operation 已归一化为英文枚举）", () => {
    const dragon = r.itemChanges.find((c) => c.name === "龙髓石");
    expect(dragon).toBeDefined();
    expect(dragon?.operation).toBe("gain");
    expect(dragon?.quantity).toBe(1);
    expect(dragon?.owner).toBe("樊斯瑞");
  });

  it("未填归属者时 owner 为 undefined（UI 默认显示「主角」）", () => {
    const watch = r.itemChanges.find((c) => c.name === "黑金怀表");
    expect(watch?.owner).toBeUndefined();
    expect(watch?.quantity).toBe(2);
  });

  it("消耗操作也被正确解析（operation 归一化为 consume）", () => {
    const consumed = r.itemChanges.find((c) => c.name === "破损的地图");
    expect(consumed?.operation).toBe("consume");
    expect(consumed?.quantity).toBe(1);
  });

  it("新实体与情节进度一并解析", () => {
    expect(r.newEntities.find((e) => e.name === "周远征")?.type).toBe("公安局长");
    expect(r.plotProgress).toBe(35);
  });
});

// 验证游戏模式「操作中文→英文归一化」：AI 产出中文操作，解析器统一映射为英文枚举，
// 使引擎/前端/开局路由的 gain/consume/equip/discard 比较全部生效（阿游 P0）。
describe("parseGameOutput —— 操作中文→英文归一化（阿游 P0）", () => {
  const cases: Array<{ ci: string; op: string; name: string }> = [
    { ci: "CI|获得|怀表|1", op: "gain", name: "怀表" },
    { ci: "CI|消耗|药水|2", op: "consume", name: "药水" },
    { ci: "CI|装备|长剑|1", op: "equip", name: "长剑" },
    { ci: "CI|丢弃|破盾|1", op: "discard", name: "破盾" },
  ];

  for (const { ci, op, name } of cases) {
    it(`解析 ${ci} → operation=${op}`, () => {
      const r = parseGameOutput(`叙事继续。\n===角色物品变动===\n${ci}\n===新实体===\n`);
      expect(r.itemChanges.length).toBe(1);
      expect(r.itemChanges[0].operation).toBe(op);
      expect(r.itemChanges[0].name).toBe(name);
    });
  }

  it("中文数量被解析为阿拉伯数字（CI|获得|怀表|二 → quantity=2）", () => {
    const r = parseGameOutput(`叙事。\n===角色物品变动===\nCI|获得|怀表|二\n===新实体===\n`);
    expect(r.itemChanges.length).toBe(1);
    expect(r.itemChanges[0].operation).toBe("gain");
    expect(r.itemChanges[0].quantity).toBe(2);
  });

  it("物品名为空时（CI|获得|）跳过空名，不落库空物品", () => {
    const r = parseGameOutput(`叙事。\n===角色物品变动===\nCI|获得|\n===新实体===\n`);
    expect(r.itemChanges.length).toBe(0);
  });

  it("未知操作保留原值（如 CI|出售|宝物|1 → operation=出售）", () => {
    const r = parseGameOutput(`叙事。\n===角色物品变动===\nCI|出售|宝物|1\n===新实体===\n`);
    expect(r.itemChanges.length).toBe(1);
    expect(r.itemChanges[0].operation).toBe("出售");
  });
});
