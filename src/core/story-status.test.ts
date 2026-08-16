import { describe, it, expect } from "vitest";
import { withStorylineLock } from "@/core/story-status";

// 关键路径：每条故事线 chapterBindings 的「读出→改写→回写」非原子，
// 同 storylineId 必须串行，否则并发写不同章会彼此覆盖丢失更新。
// withStorylineLock 是进程内 per-id 互斥原语，此前零单测，竞态逻辑一旦退化难察觉。
// 本测试钉死「同 id 严格串行 / 异 id 互不阻塞 / 前任务抛错不破坏后续调度 / FIFO 保序」四条契约。

describe("withStorylineLock", () => {
  it("同 storylineId 的调用严格串行（后者在前者的 settle 之后才执行）", async () => {
    const order: string[] = [];
    const mk = (label: string, ms: number) =>
      withStorylineLock("s1", async () => {
        order.push(`start-${label}`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`end-${label}`);
        return label;
      });

    // B 自身更快(5ms)，但因排在 A(30ms) 之后，必须等 A 完成才能开始
    const [a, b] = await Promise.all([mk("A", 30), mk("B", 5)]);
    expect(a).toBe("A");
    expect(b).toBe("B");
    expect(order).toEqual(["start-A", "end-A", "start-B", "end-B"]);
  });

  it("不同 storylineId 互不阻塞（可并发执行）", async () => {
    const started: string[] = [];
    const mk = (id: string, ms: number) =>
      withStorylineLock(id, async () => {
        started.push(id);
        await new Promise((r) => setTimeout(r, ms));
        return id;
      });
    await Promise.all([mk("x", 20), mk("y", 20)]);
    // 两个不同 id 都立即开始，证明未跨 id 串行等待
    expect(started.sort()).toEqual(["x", "y"]);
  });

  it("前一个任务抛错不影响后续同 id 任务调度，且错误向上传播给调用者", async () => {
    const results: string[] = [];
    const failing = withStorylineLock("s2", async () => {
      throw new Error("boom");
    });
    const next = withStorylineLock("s2", async () => {
      results.push("ran");
      return "ok";
    });
    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("ok");
    expect(results).toEqual(["ran"]);
  });

  it("多次串行调用保持 FIFO 顺序", async () => {
    const seen: number[] = [];
    const tasks = [0, 1, 2, 3].map((i) =>
      withStorylineLock("s3", async () => {
        seen.push(i);
        return i;
      }),
    );
    const out = await Promise.all(tasks);
    expect(out).toEqual([0, 1, 2, 3]);
    expect(seen).toEqual([0, 1, 2, 3]);
  });
});
