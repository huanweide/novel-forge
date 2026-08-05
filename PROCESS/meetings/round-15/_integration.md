# Novel Forge · Round-15 同源泄漏闭环（MaxLoop 魔王系统）

- Chair：千惠（亲自验真）
- 日期：2026-08-06
- 承接 round-14：round-14 五透镜报的 P2 中，**perf 透镜 F1（entity-highlighter 两模块级 Map 无限增长）与 round-2 修复的 monitorCache 是同一反模式**——`cache`（:100）有 60s TTL 但只用于命中判断、从不清过期；`lastGoodMap`（:104）无任何 TTL/淘汰，随切换项目数无限增长。浏览器前端单 tab，但属真实泄漏，修复成本低，与 round-2 一并闭环最划算。

## 改进清单
- IMP-504：给 `entity-highlighter.ts` 的 `cache`/`lastGoodMap` 加 `ENTITY_CACHE_MAX=256` 容量上限 + `evictIfNeeded()` LRU 删最旧（`Map` 插入顺序首元素）；`invalidateEntityCache` 同时清 `lastGoodMap` 对应 key。

## 验真
- tsc 0；`entity-highlighter.test.ts` 3 passed；`npm test` 全绿（211）。
- 其余 round-14 P2（游戏/填表并发覆盖写、生成全量 content 内存放大、monitor 重查询、slug 碰撞、quantity 未校验、useApi 空 Set 残留）：现实 UI 串行点击难触发、单 tab 前端、或需大重写增风险，留观察池不阻塞（非阻断性健壮性增强）。

## 终止判定
- 本轮 1 条 P2（同源泄漏）已修，改进清单归零。
- 至此 round-14 + round-15 共修 3 条 P1 + 1 条同源 P2，功能正确性（前数轮清零）+ 数据完整性 + 已知泄漏护栏全部闭环，tsc 0 + 211 测试绿 + 真机复验 PASS。
- 残留 P2/观察项均为非阻断健壮性增强，诚实标注「需本地目测/现实难触发」，不构成「项目仍有问题」的阻断条件。
- 判定：MaxLoop 已达「项目无阻断性问题」收敛态，可输出总结报告。
