/**
 * AI 写回乐观并发校验（Round-29 FIX-4）。
 *
 * AI 生成（write / continue / refine / game 导出）在把内容写回 StoryNode 前，应先确认该节点
 * 自「生成开始读快照」以来没有被并发编辑（人类手动改、另一路生成、确认栏回填等）。
 * 若版本已变，则中止本次写回、抛出 OptimisticLockError，而不是盲目覆盖并发编辑。
 *
 * 版本信号优先级：
 *  1. revisionCount（StoryNode 上的轻量显式计数器，post-processor 每次写回都会 +1）——最可靠；
 *  2. 回退到 updatedAt 毫秒比较（没有 revisionCount 时）。
 *
 * 设计为「最小改动防覆盖」：只读取、只比较、只抛错，不重写任何写回逻辑。
 * 调用方捕获 OptimisticLockError 后自行决定中止/重试/降级。
 */

export class OptimisticLockError extends Error {
  constructor(message = "节点在生成期间被并发修改，已中止写回以避免覆盖你的编辑") {
    super(message);
    this.name = "OptimisticLockError";
  }
}

export interface NodeVersionBaseline {
  /** 生成开始读快照时的 revisionCount；提供则优先比对 */
  revisionCount?: number | null;
  /** 生成开始读快照时的 updatedAt（Date 或 ISO 字符串）；revisionCount 缺失时回退比对 */
  updatedAt?: Date | string | null;
}

/** 与 Prisma storyNode 最小接口对齐，便于用 mock client 做聚焦测试。 */
export interface StoryNodeReadonly {
  findUnique: (args: {
    where: { id: string };
    select: { revisionCount: boolean; updatedAt: boolean };
  }) => Promise<{ revisionCount: number | null; updatedAt: Date } | null>;
}

function toMs(v: Date | string | null | undefined): number | null {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(v);
  const ms = d.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/**
 * 乐观并发校验：重新读取 node 并比对版本。变了抛 OptimisticLockError；否则静默通过。
 * @param prisma 提供 storyNode.findUnique 的 client（真实 prisma 或 mock）
 * @param nodeId 目标节点
 * @param baseline 生成开始时的快照版本
 */
export async function assertNodeUnchanged(
  prisma: { storyNode: StoryNodeReadonly },
  nodeId: string,
  baseline: NodeVersionBaseline,
): Promise<void> {
  const fresh = await prisma.storyNode.findUnique({
    where: { id: nodeId },
    select: { revisionCount: true, updatedAt: true },
  });
  if (!fresh) {
    throw new OptimisticLockError("目标节点不存在，已中止写回");
  }
  // 优先 revisionCount：显式计数器，能区分「同毫秒内的并发写」
  if (typeof baseline.revisionCount === "number") {
    if (fresh.revisionCount !== baseline.revisionCount) {
      throw new OptimisticLockError();
    }
    return;
  }
  // 回退 updatedAt：仅在 revisionCount 不可用时的兜底
  const baseMs = toMs(baseline.updatedAt);
  if (baseMs != null) {
    const freshMs = toMs(fresh.updatedAt);
    if (freshMs != null && baseMs !== freshMs) {
      throw new OptimisticLockError();
    }
  }
}
