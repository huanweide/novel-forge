import { describe, it, expect } from "vitest";
import { assertNodeUnchanged, OptimisticLockError, type StoryNodeReadonly } from "./optimistic-lock";

/** 构造一个仅实现 storyNode.findUnique 的 mock prisma（无需真库）。 */
function makePrisma(current: { revisionCount: number | null; updatedAt: Date } | null): {
  storyNode: StoryNodeReadonly;
} {
  return {
    storyNode: {
      findUnique: async () => current,
    },
  };
}

const baseDate = new Date("2026-08-17T00:00:00.000Z");

describe("assertNodeUnchanged（乐观并发校验）", () => {
  it("revisionCount 未变 → 通过（不抛错）", async () => {
    const prisma = makePrisma({ revisionCount: 3, updatedAt: baseDate });
    await expect(
      assertNodeUnchanged(prisma, "n1", { revisionCount: 3, updatedAt: baseDate }),
    ).resolves.toBeUndefined();
  });

  it("revisionCount 变化 → 抛 OptimisticLockError（中止覆盖）", async () => {
    const prisma = makePrisma({ revisionCount: 4, updatedAt: baseDate });
    await expect(
      assertNodeUnchanged(prisma, "n1", { revisionCount: 3, updatedAt: baseDate }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it("节点不存在 → 抛 OptimisticLockError", async () => {
    const prisma = makePrisma(null);
    await expect(
      assertNodeUnchanged(prisma, "missing", { revisionCount: 0 }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it("revisionCount 缺失时回退到 updatedAt 毫秒比较", async () => {
    const prismaOld = makePrisma({ revisionCount: null, updatedAt: new Date("2026-08-17T00:00:00.000Z") });
    // updatedAt 相同 → 通过
    await expect(
      assertNodeUnchanged(prismaOld, "n1", {
        revisionCount: null,
        updatedAt: "2026-08-17T00:00:00.000Z",
      }),
    ).resolves.toBeUndefined();

    const prismaNew = makePrisma({ revisionCount: null, updatedAt: new Date("2026-08-17T00:00:01.000Z") });
    // updatedAt 不同 → 抛错
    await expect(
      assertNodeUnchanged(prismaNew, "n1", {
        revisionCount: null,
        updatedAt: "2026-08-17T00:00:00.000Z",
      }),
    ).rejects.toBeInstanceOf(OptimisticLockError);
  });

  it("两者都缺（无基线）→ 直接通过，不阻断正常写回", async () => {
    const prisma = makePrisma({ revisionCount: 0, updatedAt: baseDate });
    await expect(
      assertNodeUnchanged(prisma, "n1", {}),
    ).resolves.toBeUndefined();
  });
});
