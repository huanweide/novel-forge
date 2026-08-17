/**
 * 按 nodeId 的内存互斥锁（无外部依赖）。
 *
 * 同一个 nodeId 的并发操作（如 /api/game/action 的游戏回合）会被严格串行化：
 * 前一个 fn 完成（或抛错）后，下一个才会开始执行；不同 nodeId 之间互不影响，可并行。
 *
 * 实现：模块级 `Map<nodeId, Promise<void>>` 把同 key 的「持锁期」promise 串成一条链。
 * 每个新请求在「上一个请求的持锁期」之后排队，自己持锁直到 fn 结束才释放。
 *
 * 设计取舍（Round-29 FIX-3）：
 *  - 仅进程内有效：同一 node 多实例（多 node 进程）之间不保证串行，需依赖 DB 事务/唯一约束兜底。
 *    但单进程内的「双并发请求读到旧状态、后者覆盖前者」丢状态问题被彻底消除，覆盖绝大多数场景。
 *  - 锁在链路空（无排队）时自动从 Map 摘除，避免内存无限增长。
 *  - withNodeLockGen 用于 async generator：锁在生成器开始产出前获取，在其迭代结束
 *    （正常完成 / break / 异常 / 调用方 .return()）后释放，故流式回合期间锁一直持有。
 */

const chains = new Map<string, Promise<void>>();

/**
 * 串行执行一个普通 async 函数 fn。
 * 同一个 nodeId 的调用严格按发起顺序排队；不同 nodeId 并行。
 * 返回 fn 的结果（或透传 fn 的异常）。
 */
export function withNodeLock<T>(nodeId: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(nodeId) ?? Promise.resolve();
  let release!: () => void;
  const releaseP = new Promise<void>((r) => { release = r; });
  // 持锁期：prev 结束后开始持锁，直到 release() 被调用（fn 跑完/抛错后的 finally）。
  const held = prev.then(() => releaseP);
  // 实际任务链：prev 结束后跑 fn。
  const run = prev.then(() => fn());
  chains.set(nodeId, held);
  // release 必须在 run 结束后调用（无论成败），并清理空链。
  // 该 cleanup promise 会继承 run 的拒绝，需自行吞掉，避免成为 unhandled rejection
  // （run 本身的拒绝交由调用方通过返回值捕获）。
  void run
    .finally(() => {
      release();
      if (chains.get(nodeId) === held) chains.delete(nodeId);
    })
    .catch(() => {});
  return run;
}

/**
 * 串行执行一个 async generator 工厂的整个迭代过程（针对流式产出，如游戏回合）。
 * 锁在生成器开始产出前获取，在其迭代结束（正常完成 / break / 异常）后释放，
 * 因此并发的同 node 回合会严格排队、互不打断。
 */
export async function* withNodeLockGen<T>(
  nodeId: string,
  factory: () => AsyncGenerator<T>,
): AsyncGenerator<T> {
  const release = await acquireLock(nodeId);
  try {
    yield* factory();
  } finally {
    release();
  }
}

/** 获取锁：返回释放函数；同 key 的请求按序在此排队，前一个释放后才轮到当前。 */
function acquireLock(nodeId: string): Promise<() => void> {
  const prev = chains.get(nodeId) ?? Promise.resolve();
  let release!: () => void;
  const releaseP = new Promise<void>((r) => { release = r; });
  const held = prev.then(() => releaseP);
  chains.set(nodeId, held);
  held.finally(() => {
    if (chains.get(nodeId) === held) chains.delete(nodeId);
  });
  return prev.then(() => release);
}
