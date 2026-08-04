# Round 6 L1 整合（Chair 视角）

> 日期：2026-08-04 ｜ 基于 6 份只读诊断报告（round-6/{qingyan,ayou,mobai,panshi,qinglan,gongfang}.md）

## 一、Round 5 复验结论（全员）
Round 5 六股东修复**全部真实生效、无功能回退**：
- 青砚：2字召回直接子串 / 短名繁简去重 / 连词头边界高亮 —— 均生效。
- 阿游：OP_MAP 中文操作归一化 / 空名跳过 / 未知操作 warn / round<1 拦截 / 全量 summary / 前端整体覆盖 —— 均生效。
- 墨白：伪行守卫 / 空内容守卫 / 跨表判定 `distinct.length>=2` / warnings 回传展示 —— 均生效。
- 磐石：worldFailed 真实影响 importStatus(→partial) 落库 / recordLlmCall 每次尝试落库 —— 均生效（仅前端未消费）。
- 清览：Modal bare 固化 / 四 Dialog 滚动 / select option 双主题可读 / 网格 min-[360px]:grid-cols-2+truncate —— 均生效。
- 工坊：include 键名对齐 / maxDuration=300 / character 去重 insensitive / failedRules 告警 —— 均生效。

## 二、P0（功能错误/数据错，本轮回填必修）

### P0-1 青砚 · 3字+名前缀守卫误伤常规行文
- 位置：`src/core/text/match.ts:120-131`（matchNameStrict 的 3字+ 分支）
- 现象：3字+ 名要求紧后非CJK；但中文正文里3字名后几乎总接 CJK 字（如「李星云看见」「碎玉轩内」），致常规行文全漏检，波及 `recall.ts:37/54` 世界书召回与 `trigger.ts:69` OOC 检测，世界书注入断裂。
- 修复方向：**最长匹配优先**——3字+ 名仍走直接子串命中（保留 line 93 `includes` 闸门），但增加可选 `knownNames?: string[]` 形参：当在位置 p 命中 needle 且紧后 CJK 字能拼出 knownNames 中更长的名，则跳过该短匹配（灭「李星云剑法」误命中「李星云」）。recall/trigger 调用处传入候选实体名集合。须单测覆盖「李星云剑法 vs 李星云看见」两类。

### P0-2 阿游 · 流式中断前后端轮次/背包永久错位
- 位置：`src/core/game/game-engine.ts:299-324` + `src/app/workspace/[projectId]/game/[nodeId]/page.tsx:206-242`
- 现象：后端在 `game_done` 事件到达前已 `$transaction` 提交 `currentRound+1` 与背包变动；用户点「停止」/断网时前端 `doneData` 为 null，前后端轮次与背包永久错位，无法自愈。
- 修复方向：abort/停止后，前端复用回退对账逻辑 `GET game/state summary` 回拉后端权威态整体覆盖（与 Round5 回退对账一致）；后端确保 `currentRound+1` 与背包变动仅在 `game_done` 成功提交。最小改动优先，加单测覆盖 abort 后对账。

### P0-3 墨白 · 空 ops 章节永久标记「已填」静默丢数据
- 位置：`src/core/babylore/fill.ts:225-240,489` + `src/core/babylore/loop.ts:181`
- 现象：以 `r.ok` 为唯一门槛，空 ops / 全失效 ops 的章节被永久标记「已填」→ 静默数据缺口，`lastErr` 被吞，防重复机制反噬。
- 修复方向：`r.ok` 改为 `r.ok && r.applied>0`（applied 来自 Round5 补的 warnings 同返回结构）；空 ops/全失效时返回 ok:false 让章节可重试。加单测。

## 三、P1（明显缺陷，本轮回填高价值 + 其余排期）

| 股东 | 位置 | 问题 | 本轮回填？ |
|---|---|---|---|
| 青砚 | entity-highlighter.ts:189 | 2字名头边界连词集缺介词（在/于/为/从/到/让/使/叫…），「在萧炎」不高亮 | ✅ |
| 阿游 | game-prompts.ts:26-29 | 中文复合数字（十二/二十）未解析落默认1 | ✅ |
| 阿游 | game-engine.ts:235,250 + page.tsx:261 | 变动按 name 匹配忽略 owner，同名物品互扣 | ✅ |
| 墨白 | fill.ts:302-307 | update 未命中时静默 upsert 不校验身份列唯一性 | ✅ |
| 墨白 | fill.ts:559-574 | 跨表校验只能发现同名跨表，唯一名写错表全漏报 | ✅（加唯一名归表校验告警） |
| 磐石 | import/parse/route.ts:160-164 | callFlash 无超时无重试绕过 client.ts | ✅ |
| 磐石 | ImportWizard.tsx:364-380 | 收到 done 硬编码「✅完成」，从不读 status/worldFailed | ✅ |
| 磐石 | commit/route.ts:443,552 | 并发 commit 无幂等锁；分块只看编号行数 | ✅（幂等锁） |
| 清览 | Modal.tsx:110-112 | bare 弹窗 role=dialog 无 aria-label/labelledby，WCAG 4.1.2 | ✅ |
| 工坊 | import/route.ts:18-151 | 导入无事务回滚且非幂等，失败留孤儿/重复复制 | ✅（事务回滚+去重） |
| 工坊 | regex.ts:20-21 | 用户可控正则无 ReDoS 防护，跑在生成热路径 | ✅（超时/安全封装） |

## 四、P2（排期，本轮不强制）
- 青砚：长名分支未繁简归一、TRAD_TO_SIMP 覆盖不全。
- 清览：--nv-text-muted 暗色约 3.6:1 低于 AA；基类 overflow 规则与弹窗 flex 冲突取决于编译顺序。
- 工坊：backup 导出缺 maxDuration；character 重套只 skip 不更新；api_config 浅合并。

## 五、L2 派发
6 股东 Agent 并行，各自负责本透镜内 P0+P1（见上表 ✅），限定文件、加单测、禁改版本/changelog/MEMORY。Chair 在 L3 前 git diff 审阅（Trust but verify）。
