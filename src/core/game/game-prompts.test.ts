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

  it("带归属者的物品记录 owner", () => {
    const dragon = r.itemChanges.find((c) => c.name === "龙髓石");
    expect(dragon).toBeDefined();
    expect(dragon?.operation).toBe("获得");
    expect(dragon?.quantity).toBe(1);
    expect(dragon?.owner).toBe("樊斯瑞");
  });

  it("未填归属者时 owner 为 undefined（UI 默认显示「主角」）", () => {
    const watch = r.itemChanges.find((c) => c.name === "黑金怀表");
    expect(watch?.owner).toBeUndefined();
    expect(watch?.quantity).toBe(2);
  });

  it("消耗操作也被正确解析", () => {
    const consumed = r.itemChanges.find((c) => c.name === "破损的地图");
    expect(consumed?.operation).toBe("消耗");
    expect(consumed?.quantity).toBe(1);
  });

  it("新实体与情节进度一并解析", () => {
    expect(r.newEntities.find((e) => e.name === "周远征")?.type).toBe("公安局长");
    expect(r.plotProgress).toBe(35);
  });
});
