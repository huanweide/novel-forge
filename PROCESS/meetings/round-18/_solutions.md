# round-18 flow-lens 子轮 · F1/F2/F3/F4 修复方案与留痕

- 日期：2026-08-12
- 范围：novel-forge 真身 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
- 升版：v2.0.12 → v2.0.13
- 门禁：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 0 错误；`npx vitest run` 60 文件 514/514 全绿
- 推送：SSH over 代理 TCP 隧道（connect.exe → ssh.github.com:443），临时 config 用完即删

---

## F1 续写截断保护（finish_reason=length 被静默丢弃）

### 诊断
`src/app/api/generate/continue/route.ts` 的流式循环只处理 `chunk.type==="content"`，完全丢弃 `chunk.type==="done"`。
当模型因 `max_tokens` 触发 `finish_reason="length"` 时，续写内容被截断，但路由仍把节点标记为
`completed` 并下发正常 done 事件——残缺章被当成完整章交付，用户无法感知「没写完」。

`src/core/write-generation.ts` 虽有内联 `if (finishReason === "length")` 判断，但续写路径走的是另一套
路由逻辑，两者判定与文案不统一，且续写路径根本没接这一判断。

### 方案
抽单一真相 `src/core/finish-reason.ts`：
```ts
export function classifyTruncation(
  finishReason: string | undefined,
  contentLength: number,
  targetWords: number,
): { truncated: boolean; warning?: string } {
  if (finishReason !== "length") return { truncated: false };
  const insufficient = contentLength < Math.ceil(targetWords * 0.6);
  return {
    truncated: true,
    warning: insufficient
      ? "⚠️ 生成被 max_tokens 截断（finish_reason=length）且字数明显不足，已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。"
      : "⚠️ 生成被 max_tokens 截断（finish_reason=length），已保留已生成部分作为草稿，请点击「继续生成」补全后再确认。",
  };
}
```

### 改动
- `continue/route.ts`：流式循环加 `else if (chunk.type === "done") { if (chunk.finishReason) finishReason = chunk.finishReason; }`；
  后处理前插入 length 保护块——`truncated` 时回退节点 `status="drafting"`、下发 `truncated:true` + 告警 + `nextAction` 引导「继续生成」，并 `controller.close()` 收流。
- `write-generation.ts`：原内联判断改为复用 `classifyTruncation`，warning 文案与续写一致。
- 新增 `finish-reason.test.ts`：非 length 不触发 / length 充足告警 / length 不足告警 / 60% 边界，4 用例全绿。

---

## F2 续写对齐确认门（续写绕过确认门无条件填表）

### 诊断
续写路由在 done 时无条件调用 `safeFillAfterWriting({ source: "continue" })`，等于续写顺手自动填 lorebook，
与「确认门 `applyConfirm` 统一填表」的设计冲突，造成 autoConfirm 双触发——用户还没确认章节，记忆库已经被续写填了。

### 方案
删掉续写路由的 `safeFillAfterWriting` 自动填表，填表统一归确认门 `applyConfirm`（与 write 路径一致）。
续写 done 事件 `nextAction` 改为「请确认后回填记忆库」，由用户在确认页主动触发填表。

### 改动
- `continue/route.ts`：删除 `safeFillAfterWriting` 调用及其 `isLatestChapter` 计算；done 事件不再自动填表。

---

## F3 草稿标记竞态（[PARTIAL_DRAFT] 串入正文）

### 诊断
`write-generation.ts` 与 `continue/route.ts` 的草稿保存都是 fire-and-forget 的 `.then(() => prisma.storyNode.update(...))`
（配 `let saving` 重入锁）。该落库与后处理落库（含正文 + 状态）存在竞态：草稿标记可能晚于后处理落库，
导致 `[PARTIAL_DRAFT]` 标记串入已交付正文，用户看到脏数据。

### 方案
草稿保存改 `await` 同步落库，删除 `saving` 重入锁变量，让草稿标记先于后续处理完成，消除竞态。

### 改动
- `write-generation.ts`：`await prisma.storyNode.update(...)` 同步落库，删 `let saving = false;`。
- `continue/route.ts`：草稿保存块由 fire-and-forget 改 `await` 同步，删 `let saving = false;` 残留声明。

---

## F4 服务端自调用 origin 硬编码死链

### 诊断
- `confirm-guard.ts` 的 `triggerForeshadowDetect` 用 `fetch(`${origin}/api/foreshadowing/...`)` 自回环，
  `origin = process.env.APP_ORIGIN || "http://localhost:3001"` 硬编码——非 localhost:3001 部署（如 Vercel）直接死链，
  且带 `sleep` 重试 + 去重锁，逻辑重。
- `storylines/[id]/route.ts` 主线缝合怪自动构造新主线时 `fetch(`${origin}/api/storylines/generate`)` 自调，同样死链。

### 方案
两个自调用都改为「进程内直调」——直接 import 并调用目标函数，不再经 HTTP 回环：
- 伏笔检测 → 进程内直调 `detectPayoffs(projectId)`（去重锁保留防并发雪崩）。
- 主线缝合 → 进程内直调 `runStorylineGeneration({ projectId, mode: "newMain" })`，
  为此把 `storylines/generate/route.ts` 的 POST 核心逻辑抽为可导出 `runStorylineGeneration(bodyJson)`，
  文件末尾留薄壳 `POST` 转发。

### 改动
- `confirm-guard.ts`：删 `origin`/`url`/`body`/`TIMEOUT_MS`/`sleep`/`fetch`/重试循环，改 `await detectPayoffs(projectId)`，`catch` 仅 `console.error`。
- `storylines/[id]/route.ts`：缝合怪处删 fetch 自调，改 `void runStorylineGeneration({ projectId: prev.projectId, mode: "newMain" }).catch(() => {});`。
- `storylines/generate/route.ts`：核心逻辑抽为 `export async function runStorylineGeneration(bodyJson: any)`，末尾 `export async function POST` 薄壳转发。
- `confirm-guard.test.ts`：`vi.mock("@/core/foreshadowing", () => ({ detectPayoffs: vi.fn() }))`；断言由 fetchMock 改 `detectPayoffs` mock（直调断言 / 抛错 console.error / 并发去重仅调一次）。

---

## 改动文件清单
- 新增：`src/core/finish-reason.ts`、`src/core/finish-reason.test.ts`
- 修改：`src/app/api/generate/continue/route.ts`、`src/core/write-generation.ts`、`src/core/confirm-guard.ts`、`src/core/confirm-guard.test.ts`、`src/app/api/storylines/[id]/route.ts`、`src/app/api/storylines/generate/route.ts`、`src/lib/changelog-data.ts`、`CHANGELOG.md`

## 验证
- tsc 0 错误；vitest 60 文件 514/514 全绿（基线 513 + 新增 4）。
- 无 Prisma schema 迁移、无新依赖。

## 后续待办（非本轮）
- ui-lens 其余：RefineDiffModal 无 focus-trap、虚拟滚动未接 WorldEntryList/CharacterList。
