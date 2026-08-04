# Round 9 整合报告（v0.46.71 复验 → L2 实施清单）

> Chair 整合 6 份 L1 只读复验报告（青砚/阿游/墨白/磐石/清览/工坊）。
> 结论：**Round 8 的 P0 已闭合，本轮零 P0**；挖出真实 P1 共 10 项（含 2 个 R8 回归）。
> 执行纪律：6 个 L2 Agent 各自限定文件实现 + vitest/tsc 自测；**禁止**改 version/changelog/MEMORY；Chair 等全部写入后统一跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 门禁（避免并行 tsc 竞态假象）。

## 一、L1 复验总判定
| 透镜 | P0 | P1 | 关键 P1 | 是否 R8 回归 |
|---|---|---|---|---|
| 青砚 | 无 | 1 | F1 含数字≥3字关键词走直命中无边界（"2049年"误命中"12049年"） | 否 |
| 阿游 | 无 | 1 | N1 readStream 未接 AbortError，abort 被 game-engine 当「LLM 调用失败」 | 否 |
| 墨白 | 无 | 2(取A/D) | P1-A 全跳过 error 无法区分真无脏/误标(R8过冲)；P1-D 脏标记无清除出口成死循环 | A=是 |
| 磐石 | 无 | 3 | N1 流式未设 stream_options→token恒0；N2 默认模型不在 MODEL_PRICING→成本全$0；N3 DB锁崩溃永久孤儿锁 | 否 |
| 清览 | 无 | 1 | N1 移动抽屉 aside 无 role=dialog/焦点陷阱/ESC/背景inert | 否 |
| 工坊 | 无 | 2 | N1 `?`列入 repeated 误杀合法可选组(R8回归)；N2 导入并发幂等仅靠应用层无DB唯一约束 | N1=是 |

## 二、L2 实施清单（Chair 已核实根因+精确改法）

### 青砚 F1（match.ts）
- 现状 `matchKeyword` line54-55：`len>=3 && !isPureDigit → return true` 直命中，但「2049年」「第3章」含数字非纯数字→绕过边界→误命中"12049年"。
- 改法：关键词含数字时，若首字符是数字且紧前也是数字、或末字符是数字且紧后也是数字 → 视为数字串被延长，跳过该匹配位置（数字边界守卫）。纯数字与无数字关键词行为不变。补 match.test.ts 用例（"2049年" 不命中 "12049年"、命中 "到了2049年"）。

### 阿游 N1（game-engine.ts + client.ts）
- 现状 readStream 对 reader.read() 抛 AbortError 无 catch，冒泡到 game-engine:289 catch 当失败；:283 的 `if(signal?.aborted) return` 因先抛错不可达。
- 改法：game-engine.ts 的 catch 区分 `err?.name==="AbortError" || signal?.aborted` → 优雅 return（不发 error 事件，不污染回放）；保留 :283 防御。client.ts 不改逻辑（信号已正确透传），仅确保 readStream 在 abort 时不再冒泡为未分类失败。

### 墨白 P1-A + P1-D（fill.ts）
- P1-A：babyloreFillAll 全跳过分支 error 为单一模板，无法区分「真无脏数据」vs「疑似旧版误标」。改法：error 携带 {processed, applied, skipped, failed, nodeIds} 元数据；区分两种语义文案。
- P1-D：脏标记无清除出口→重复 fill 死循环。改法：每个 node 评估后（无论 applied/clean）清除其脏标记；全跳过且确为 clean 时明确标注「无待填数据」而非「疑似误标」。补 fill.ops.test.ts 用例（全 clean→ok:false 且脏标记被清；不触发二次重填）。

### 磐石 N1+N2+N3（client.ts + llm.ts + schema + import/commit/route.ts）
- N1：establishStream body 加 `stream_options:{ include_usage:true }`（DeepSeek/兼容返回真实 usage；readStream 已读 data.usage）。灭流式 token 恒 0。
- N2：llm.ts MODEL_PRICING 增加 `{ match:"deepseek-v4-flash", input:0.14, output:0.28, label:"DeepSeek V4 Flash" }`（估算价，注释以官方为准），使默认硅基流动模型成本可见而非全 $0。
- N3：ImportCommitLock 加 `createdAt DateTime @default(now())`；commit/route.ts 获取锁前先删 (projectId,nodeId) 早于 15 分钟的陈旧锁，灭崩溃孤儿锁永久阻塞。

### 清览 N1（workspace/explore/game 三页 aside）
- 窄屏以模态出现的 left/right <aside> 补 role="dialog" + aria-modal="true" + aria-labelledby（关联标题 id）+ 焦点陷阱（复用既有 use-focus-trap）+ ESC 全局关 + 背景 inert。复用 toast.tsx 既有模式。

### 工坊 N1+N2（regex.ts + schema + projects/import/route.ts）
- N1：regex.ts:76 `repeated` 移除 `next==="?"`（内层 `?` 仍经 hasQuantInside 捕获 `(a?)+` 类真 ReDoS）。补 regex.test.ts 用例：(https?://)?、(a+)?、(a?)? 期望安全（null）；(a?)+、(a?)* 仍拦截。
- N2：Project 模型加 `importSource String? @unique`（Postgres 多 null 不冲突，安全）；import/route.ts 设 importSource 并在 P2002 时返回已有 project（幂等）；prisma db push 建约束。

## 三、显式下一轮 backlog（非本轮截断，诚实留痕）
- 墨白 P1-B（单章填表不跑跨表/归属校验）、P1-C（单 op 失败软静默丢数据）、P1-E（行级同名静默合并）：填表可靠性/完整性，下轮必修。
- 青砚 F2/F3/F4/F5、阿游 N2-N8、磐石 N4-N9、清览 N2-N5、工坊 N3-N9：P2，按排期。
- 真机验收（abort 真中断/chatStream 透传/锁跨实例并发/弹窗读屏/正则 ReDoS 实测）仍待用户本地确认。

## 四、终止条件判定
本轮仍为 P1 > 0，**未达「全员无 P0/P1」终止条件**，继续 Round 10（优先清上述 backlog + 回归本轮修复）。
