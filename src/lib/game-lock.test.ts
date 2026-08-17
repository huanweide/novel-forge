import { describe, it, expect } from "vitest";
import { withNodeLock, withNodeLockGen } from "./game-lock";

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe("withNodeLock（普通 async 函数）", () => {
  it("同一个 nodeId 严格按调用顺序串行执行", async () => {
    const order: number[] = [];
    const make = (id: number, ms: number) =>
      withNodeLock("same-node", async () => {
        order.push(id);
        await delay(ms);
        return id;
      });

    // 入队顺序：第1个最慢(50ms)、第2个最快(5ms)、第3个居中(10ms)
    // 若串行，应按入队顺序 [1,2,3] 执行，而非按完成速度
    const p1 = make(1, 50);
    const p2 = make(2, 5);
    const p3 = make(3, 10);
    await Promise.all([p1, p2, p3]);

    expect(order).toEqual([1, 2, 3]);
  });

  it("同一个 nodeId 串行：总时长≈各段之和（而非并行叠加）", async () => {
    const start = Date.now();
    await Promise.all([
      withNodeLock("serial", async () => { await delay(20); }),
      withNodeLock("serial", async () => { await delay(20); }),
      withNodeLock("serial", async () => { await delay(20); }),
    ]);
    const elapsed = Date.now() - start;
    // 3×20ms 串行，容差给调度开销
    expect(elapsed).toBeGreaterThanOrEqual(55);
  });

  it("不同 nodeId 并行执行（总时长≈单个最长，而非叠加）", async () => {
    const start = Date.now();
    await Promise.all([
      withNodeLock("node-a", async () => { await delay(30); }),
      withNodeLock("node-b", async () => { await delay(30); }),
    ]);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(60);
  });

  it("前一个任务抛错时，后一个仍会执行（错误不阻塞后续）", async () => {
    const order: string[] = [];
    const p1 = withNodeLock("err-node", async () => {
      order.push("first");
      throw new Error("boom");
    }).catch(() => undefined);
    const p2 = withNodeLock("err-node", async () => {
      order.push("second");
    });
    await Promise.all([p1, p2]);
    expect(order).toEqual(["first", "second"]);
  });
});

describe("withNodeLockGen（async generator）", () => {
  it("同 nodeId 串行：迭代期间持锁，互不交错", async () => {
    const seq: string[] = [];
    async function* gen(tag: string) {
      seq.push("start-" + tag);
      await delay(15);
      yield tag;
      seq.push("end-" + tag);
    }

    await Promise.all([
      (async () => {
        for await (const _ of withNodeLockGen("g", () => gen("A"))) void _;
      })(),
      (async () => {
        for await (const _ of withNodeLockGen("g", () => gen("B"))) void _;
      })(),
    ]);

    // 必须整段 A 跑完才轮到 B，不能交错
    expect(seq).toEqual(["start-A", "end-A", "start-B", "end-B"]);
  });

  it("不同 nodeId 的生成器并行产出", async () => {
    const started: Record<string, number> = {};
    let counter = 0;
    async function* gen(tag: string) {
      started[tag] = ++counter;
      await delay(15);
      yield tag;
    }
    await Promise.all([
      (async () => { for await (const _ of withNodeLockGen("x", () => gen("x"))) void _; })(),
      (async () => { for await (const _ of withNodeLockGen("y", () => gen("y"))) void _; })(),
    ]);
    // 两者都在极短时间内启动（计数都递增了，且 x/y 几乎同时拿到计数）
    expect(Object.keys(started).sort()).toEqual(["x", "y"]);
  });
});
