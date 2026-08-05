# Novel Forge · Round-14 解决方案（阶段三）

## IMP-502 · markdown 角色关系键不一致（最高优先，纯契约对齐）

**问题**：`src/core/settings/parser.ts:367-372` 的 `toCharacterCreateParams` 把关系写成 `{ targetCharacterId: r.target, ... }`，但 `r.target` 实际是名字而非 id；而 `src/lib/relations.ts:13-21` 的 `normalizeRelationships`（被 `import/commit/route.ts:621`、`projects/import/route.ts`、关系图共用）只认 `targetName ?? target`，**不认 `targetCharacterId`**；`src/core/sync-global-prompt.ts:128` 读 `targetName` 缺失即渲染 `?(?)`。结果：markdown 批量导入的角色关系在世界书注入失效、经备份再导入灭失。

**修复**：将 `parser.ts:367-372` 改为与全系统契约一致：
```ts
relationships: char.relations.map((r) => ({
  targetName: r.target,
  relation: r.relation,
  dynamic: "",
  notes: "",
})),
```
这样 `normalizeRelationships` 能识别（`r.targetName` 命中），`sync-global-prompt` 能渲染，备份再导入也不丢。

**验证**：`PRISMA_DISABLE_SAFE_DELETE=1 npx tsc --noEmit` 零错误；`npm test` 全绿（relations 相关单测）；构造一个含关系的 markdown 角色卡走 parse → toCharacterCreateParams → normalizeRelationships 断言 `targetName` 存在。

## IMP-503 · import/commit 事务缺 timeout

**问题**：`src/app/api/import/commit/route.ts:571` `await prisma.$transaction(async (tx) => {...})` 缺第二参数；Prisma 交互式事务默认 5s 上限，大书（数百章串行 `tx.storyNode.create`）易超时 → 整段回滚、章节零写入。对照 `projects/import/route.ts:234` 已用 `{ timeout: 120000 }`。

**修复**：改为
```ts
await prisma.$transaction(async (tx) => {
  ...
}, { timeout: 120000 });
```
（与 projects/import 口径一致；该事务体在 :690 闭合，第二参数放闭合后。）

**验证**：tsc 零错误；`npm test` 全绿；用 round-4 端到端脚本或构造大 chapters 数组单测断言事务不超时（可单测 `prisma.$transaction` 调用签名，或靠现有 import 测试覆盖）。

## IMP-501 · 备份包静默丢数据（需用户告知）

**问题**：`backup/route.ts:7-16` INCLUDE 仅 8 类，确缺 6 类（ChapterSummary/StoryBeat/PendingCommitment/PendingItem/StoryNodeRevision/GameSession/GameState）。代码注释写明「匹配计划」属产品设计取舍，但前端 BackupDialog 未告知用户「记忆层/游戏进度不进备份包」，造成静默丢失错觉。

**修复（双端）**：
1. 后端 `backup/route.ts` 的 `bundle` 增 `excluded: ["ChapterSummary","StoryBeat","PendingCommitment","PendingItem","StoryNodeRevision","GameSession"]` 字段，让回执自描述。
2. `projects/import/route.ts` 还原分支若检测到 bundle 含 `excluded` 则 `console.warn` 提示（不阻断，因本来就不含）。
3. 前端 `BackupDialog`（定位 `src/components/` 下 BackupDialog）展示一行说明：「本次备份包含：章节/角色/世界书/规则/文风/分支/剧情线/文风卡/世界表；不含：游戏进度/版本历史/记忆摘要/伏笔追踪/待兑现事项（请用文本导出迁移设定）」。

**验证**：tsc 零错误；`npm test` 全绿；备份接口返回 JSON 含 `excluded` 字段（curl 验证）；前端 BackupDialog 文案存在。

## 风险与边界
- 三处均为非破坏性契约/护栏修复，不改 schema、不迁库。
- 沙箱无 Chromium：BackupDialog 文案属 UI 需本地目测，标注诚实边界。
- 双 changelog 升 v1.0.3：根 CHANGELOG.md + src/lib/changelog-data.ts（禁英文引号，中文强调用「」）。
