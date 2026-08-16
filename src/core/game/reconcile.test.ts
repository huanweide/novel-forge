import { describe, expect, it } from "vitest";
import {
  applyFrontendItemChanges,
  reconcileFromSummary,
  type BackendGameSummary,
} from "./reconcile";
import type { GameItem } from "./types";

function item(p: Partial<GameItem> & { name: string; quantity: number }): GameItem {
  return {
    category: "other",
    source: "测试",
    acquiredRound: 1,
    ...p,
  } as GameItem;
}

describe("applyFrontendItemChanges —— 背包变动对账", () => {
  it("gain：新物品入包，带 round/owner/source", () => {
    const out = applyFrontendItemChanges([], [{ operation: "gain", name: "铁剑", quantity: 1 }], 3);
    expect(out).toEqual([
      item({ name: "铁剑", quantity: 1, source: "第3轮获得", acquiredRound: 3, owner: "主角" }),
    ]);
  });

  it("gain：已有同名同主物品累加数量", () => {
    const prev = [item({ name: "铁剑", quantity: 1, owner: "主角" })];
    const out = applyFrontendItemChanges(prev, [{ operation: "gain", name: "铁剑", quantity: 2 }], 3);
    expect(out).toHaveLength(1);
    expect(out[0].quantity).toBe(3);
    expect(out[0].owner).toBe("主角");
  });

  it("consume：数量递减，归零即从背包移除", () => {
    const prev = [item({ name: "药水", quantity: 2 })];
    expect(applyFrontendItemChanges(prev, [{ operation: "consume", name: "药水", quantity: 1 }], 3)[0].quantity).toBe(1);
    const empty = applyFrontendItemChanges(prev, [{ operation: "consume", name: "药水", quantity: 2 }], 3);
    expect(empty).toHaveLength(0);
  });

  it("discard：与 consume 同语义（递减/归零移除）", () => {
    const prev = [item({ name: "废纸", quantity: 1 })];
    expect(applyFrontendItemChanges(prev, [{ operation: "discard", name: "废纸", quantity: 1 }], 3)).toHaveLength(0);
  });

  it("equip：置 equipped=true，物品仍在包", () => {
    const prev = [item({ name: "铁剑", quantity: 1, equipped: false })];
    const out = applyFrontendItemChanges(prev, [{ operation: "equip", name: "铁剑" }], 3);
    expect(out[0].equipped).toBe(true);
    expect(out).toHaveLength(1);
  });

  it("unequip：清 equipped 标记，物品仍在包（不删）", () => {
    const prev = [item({ name: "铁剑", quantity: 1, equipped: true })];
    const out = applyFrontendItemChanges(prev, [{ operation: "unequip", name: "铁剑" }], 3);
    expect(out[0].equipped).toBe(false);
    expect(out).toHaveLength(1);
  });

  it("destroy：数量递减，归零即移除", () => {
    const prev = [item({ name: "盾牌", quantity: 3 })];
    expect(applyFrontendItemChanges(prev, [{ operation: "destroy", name: "盾牌", quantity: 2 }], 3)[0].quantity).toBe(1);
    const gone = applyFrontendItemChanges(prev, [{ operation: "destroy", name: "盾牌", quantity: 3 }], 3);
    expect(gone).toHaveLength(0);
  });

  it("skip：安全跳过，背包不变", () => {
    const prev = [item({ name: "铁剑", quantity: 1 })];
    const out = applyFrontendItemChanges(prev, [{ operation: "skip", name: "铁剑", quantity: 5 }], 3);
    expect(out).toEqual(prev);
  });

  it("默认 owner 为「主角」：未传 owner 时按主角隔离", () => {
    const out = applyFrontendItemChanges([], [{ operation: "gain", name: "金币", quantity: 10 }], 1);
    expect(out[0].owner).toBe("主角");
  });

  it("owner 隔离：同名物品不同 owner 互不干扰", () => {
    const prev = [item({ name: "戒指", quantity: 1, owner: "主角" })];
    const out = applyFrontendItemChanges(prev, [{ operation: "gain", name: "戒指", quantity: 1, owner: "队友A" }], 2);
    expect(out).toHaveLength(2);
    const hero = out.find((i) => i.owner === "主角");
    const mate = out.find((i) => i.owner === "队友A");
    expect(hero?.quantity).toBe(1);
    expect(mate?.quantity).toBe(1);
  });

  it("不可变：不原地改写入参数组与内部对象", () => {
    const prev: GameItem[] = [item({ name: "铁剑", quantity: 1, equipped: false })];
    const snapshot = JSON.parse(JSON.stringify(prev));
    applyFrontendItemChanges(prev, [{ operation: "equip", name: "铁剑" }], 3);
    expect(prev).toEqual(snapshot); // 入参原样未变
  });

  // ── 与后端 applyItemChanges 兜对齐（修复点）──
  it("OP_MAP 外的「获得类」近义词按 gain 入库（与后端一致，不再静默丢弃）", () => {
    const out = applyFrontendItemChanges([], [{ operation: "捞到", name: "秘宝", quantity: 1 }], 4);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("秘宝");
    expect(out[0].quantity).toBe(1);
  });

  it("OP_MAP 外的「获得类」近义词对已有物品累加", () => {
    const prev = [item({ name: "秘宝", quantity: 1 })];
    const out = applyFrontendItemChanges(prev, [{ operation: "赢取", name: "秘宝", quantity: 2 }], 4);
    expect(out[0].quantity).toBe(3);
  });

  it("流转类近义词（抵押）安全跳过，背包不变", () => {
    const prev = [item({ name: "铁剑", quantity: 1 })];
    const out = applyFrontendItemChanges(prev, [{ operation: "抵押", name: "铁剑" }], 3);
    expect(out).toEqual(prev);
  });

  it("真正未知动词：安全跳过不崩溃、不污染背包", () => {
    const prev = [item({ name: "铁剑", quantity: 1 })];
    const out = applyFrontendItemChanges(prev, [{ operation: "爆炸", name: "铁剑", quantity: 99 }], 3);
    expect(out).toEqual(prev);
  });

  it("多步连续变动按序累积", () => {
    let items: GameItem[] = [];
    items = applyFrontendItemChanges(items, [{ operation: "gain", name: "药草", quantity: 3 }], 1);
    items = applyFrontendItemChanges(items, [{ operation: "consume", name: "药草", quantity: 1 }], 2);
    items = applyFrontendItemChanges(items, [{ operation: "gain", name: "药草", quantity: 2 }], 3);
    expect(items[0].quantity).toBe(4);
  });
});

describe("reconcileFromSummary —— 断网/停止后回拉对账", () => {
  const base: BackendGameSummary = {
    currentRound: 5,
    totalWords: 1200,
    plotProgress: 60,
    allNarrative: "全文内容",
    items: [item({ name: "铁剑", quantity: 1 })],
    entities: [],
    lastOptions: [{ index: 1, text: "继续" }],
    turns: [{ round: 1, playerAction: "前进", narrative: "第一段" }],
  };

  it("优先用 allNarrative，回退 narrative，再回退空串", () => {
    expect(reconcileFromSummary(base).narrative).toBe("全文内容");
    const noAll = reconcileFromSummary({ ...base, allNarrative: undefined, narrative: "片段" });
    expect(noAll.narrative).toBe("片段");
    const none = reconcileFromSummary({ ...base, allNarrative: undefined, narrative: undefined });
    expect(none.narrative).toBe("");
  });

  it("options 优先 lastOptions，回退 options", () => {
    expect(reconcileFromSummary(base).options).toEqual([{ index: 1, text: "继续" }]);
    const noLast = reconcileFromSummary({ ...base, lastOptions: undefined, options: [{ index: 2, text: "撤退" }] });
    expect(noLast.options).toEqual([{ index: 2, text: "撤退" }]);
  });

  it("turns 映射时剥离 options 字段", () => {
    const withOpts = reconcileFromSummary({
      ...base,
      turns: [{ round: 1, playerAction: "前进", narrative: "第一段", options: [{ index: 1, text: "x" }] }],
    });
    expect(withOpts.turns[0]).toEqual({ round: 1, playerAction: "前进", narrative: "第一段" });
  });

  it("空摘要不崩溃，给出安全默认值", () => {
    const r = reconcileFromSummary({} as BackendGameSummary);
    expect(r.currentRound).toBeUndefined();
    expect(r.items).toEqual([]);
    expect(r.entities).toEqual([]);
    expect(r.options).toEqual([]);
    expect(r.turns).toEqual([]);
    expect(r.narrative).toBe("");
  });

  it("字段整体覆盖：round/words/progress 透传", () => {
    const r = reconcileFromSummary(base);
    expect(r.currentRound).toBe(5);
    expect(r.totalWords).toBe(1200);
    expect(r.plotProgress).toBe(60);
  });
});
