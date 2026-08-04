# Round 11 整合（Chair）

复验对象：HEAD = v0.46.73（Round 10 收尾，commit 899a480 + 记忆回写 b5901aa）。
复验方式：6 股东 Agent 并行只读诊断（round-11/*.md），Chair 读报告整合。

## 总判定
- **零 P0**。
- **11 P1**（墨白2 + 青砚2 + 阿游2 + 清览1 + 磐石4，工坊0）。
- 工坊 0 P1，但有 2 项纵深防御 P2（ReDoS 防护前移），一并纳入 L2 修。
- 结论：**未达「全员无 P0/P1」终止条件**，进入 L2 闭环修复。

## P1 清单与文件归属（避免并行冲突）

### 墨白（数据完整性）— 2 P1
- **P1-① 溯源主链路断线**：`src/core/babylore/loop.ts` 调 `babyloreFill` 漏传已解构的 `nodeOrder` → 自动填表写入的 `_src` 恒为 `ch?:batchmanual`，灭掉 P1-F 章节溯源，并使 P1-E 同名异源弱告警因解析不到 `ch{order}` 永不触发。改法：`loop.ts` 透传 `chapterOrder: nodeOrder`（fill.ts 已支持）。
- **P1-② 干净态误判「误标」诱导破坏性重填**：`fill.ts` `all_skipped_mislabeled` 判定过宽（processed===0 && skipped>0 一律判 mislabeled），UI 弹「清理脏标记并重填」对**已校验章节**重跑 LLM。`fill.ops.test.ts` 还把此行为断言为正确。改法：仅当跳过节点含 DB 中找不到正文章节的幽灵 id 才判 mislabeled 并展示按钮；同步修测试断言。
- 文件：src/core/babylore/fill.ts、loop.ts、src/app/workspace/[projectId]/tables/page.tsx、src/core/babylore/fill.ops.test.ts

### 青砚（检索与召回）— 2 P1
- **P1-1 别名漏去重**：`findExactDuplicate`/`isVariantDuplicate`/`autoCreateEntities` 只比对主名，从不管 `aliases`。已有「炎帝」(alias 萧炎) 时再建「萧炎」成双卡。改法：查重与建卡前补充 aliases 归一比对。
- **P1-2 变体阈值过松**：`isSimilarName` 长名 `levenshtein<=1` 把「青云宗/青云山」类语义不同实体误并，合法新实体被跳过。改法：收紧长名阈值（如仅在同类型+长度接近+编辑距离0 才并），注意不可回流历史 Round8/9/10 的 OOC/召回修复。
- 文件：src/app/api/agent/apply-extraction/route.ts、src/core/text/entity-auto-creator.ts、isSimilarName 所在文件（Agent 先 Grep 定位）

### 阿游（游戏系统）— 2 P1
- **P1-1 OP_MAP 反向坑**：Round 10 的 `else→gain` 安全网把未覆盖动词（吞下/服下、舍弃/抛弃/遗弃/遗失/失落、解下/卸下/脱下、典当/抵押、损毁/摧毁/弄坏）静默 +1 污染背包；引擎无 `unequip`/`destroy` 概念。改法：补 OP_MAP 同义词（吞下/服下→consume；舍弃/抛弃/遗弃/遗失/失落→discard；解下/卸下/脱下→unequip；典当/抵押→safe skip；损毁/摧毁/弄坏→destroy）+ game-engine 增 unequip/destroy 分支。
- **P1-2 GameState 缺唯一约束**：`@@unique([sessionId, round])` 缺失，并发/重试可写重复轮次快照致对账歧义。改法：schema.prisma 加约束 + `npx prisma db push` + `PRISMA_DISABLE_SAFE_DELETE=1 npx prisma generate`。
- 文件：src/core/game/game-prompts.ts、game-engine.ts、prisma/schema.prisma

### 清览（UI/无障碍）— 1 P1
- **P1-1 顶栏焦点逃逸**：三页抽屉的 `inert` 仅覆盖中栏，`<header>`/`<Toolbar>` 顶栏在 inert 作用域外，窄屏 `aria-modal=true` 打开时顶栏按钮仍可被 Tab/读屏访问。改法：把 `inert` 上移到页面根容器（或给顶栏单独加 inert）。
- 文件：src/app/explore/page.tsx、src/app/workspace/[projectId]/**/page.tsx（Agent 先 Grep 三页 inert 应用点）、src/app/workspace/[projectId]/game/[nodeId]/page.tsx（仅改 inert，与阿游逻辑层不冲突）

### 磐石（性能/可观测性）— 4 P1
- **P1-1 commit 并发放飞无封顶**：`commit/route.ts` `Promise.all(charBatches.map(...))` 并发数=批数无信号量，超大导入打爆 LLM 提供方。改法：加限流池（复用 parse 的 4 路思路）。
- **P1-2 parse 无全局 deadline**：4 路池只压平均耗时，无全局超时；超大书仍超 300s 被强杀丢结果。改法：加全局 deadline（如 280s）优雅中断并如实上链 partial。
- **P1-3 B 路世界提取单路串行**：`parse/route.ts` B 路世界提取独自吃数十~180s 加剧超时。改法：并入并发池或独立并发。
- **P1-4 totalTokens 口径不一致**：commit `mergeOneBatch` 在 provider 不返 `total_tokens` 时回退 0，parse 回退 prompt+completion 求和。改法：统一回退为 prompt+completion 求和。
- 文件：src/app/api/import/commit/route.ts、parse/route.ts

### 工坊（工程稳健性）— 0 P1，纳入 2 P2 纵深防御
- **P2-① forbidden-checker ReDoS 防护缺口**：`forbidden-checker.ts` `parseRegexPattern` 仅 try/catch 编译错误、未复用 `isLikelyUnsafeRegex`；当前调用方均过滤用户输入正则故非活跃。改法：编译后复用 isLikelyUnsafeRegex 做 ReDoS 预判，拦则抛友好错误。
- **P2-② 预设 regex apply 前移校验**：`applyRegexRules` 执行期兜底，建议前移为 422 拦截。
- 文件：src/core/text/forbidden-checker.ts、相关调用方、预设 regex apply 路径

## 并行冲突规避
- game page.tsx：清览只改 inert（结构层），阿游只改 game-prompts/game-engine/schema（逻辑层），不冲突。
- schema.prisma：仅阿游改（需 db push + generate），其余 Agent 不动。
- 其余文件各 Agent 独占。

## 终止条件（L2 后）
L2 收尾后 Chair 统一 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 门禁 + 读 diff 验证授权范围；升 v0.46.74 双 changelog + commit + 代理 push + 记忆三件套。Round 12 复验若确认本轮 11 P1 无回流且零新 P0/P1，即达终止。
