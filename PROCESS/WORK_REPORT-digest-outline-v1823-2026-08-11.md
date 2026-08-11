# 工作单元报告：摘要大纲——长期记忆融入世界卡与上下文（v1.8.23）

## 一、干了什么

给 novel-forge 加了一套「摘要大纲」长期记忆系统。

具体来说：
- 每写完一章，系统自动把「这一章大概发生了什么」和「主线大事件推进到哪了」聚合成一份项目级大纲。
- 这份大纲存进 Project 的两个新字段：`timelineDigest`（按时间线串起各章）和 `storylineDigest`（按主线串起大事件）。
- 它有两重身份：① 在写作页「更多▾ → 摘要大纲」里是一块**给人读**的面板；② 在 AI 写下一章 / 写章纲时，被**自动注入 prompt**，相当于 AI 的「长期记忆」。
- 用 Playwright 无头检测验证了「更多▾ → 摘要大纲」能点开、能渲染真实内容、「重新生成」按钮能用，全程零控制台报错。

## 二、为什么这么做

瑞宝宝提的核心诉求是：

> 「每一章都会摘要下来，知道每一章按照时间线大概发生了什么事情……自动摘要这也是世界卡里头的一部分，或者说你放在『更多』里头，它也是被读取的一个部分。」

也就是说，小说写到几十章之后，AI 不能只盯着「最近 3 章」写——它得知道「前面所有章大致发生了什么、主线推进到哪了」。这之前系统只有「最近 N 章」的滑动窗口，长线情节会越写越散。

把摘要大纲放在「更多」里、同时又是上下文的一部分，正好满足两点：
- 用户能在 UI 上直接看到「这本书到底讲了什么」（可读性）。
- AI 写新内容时「全部读取」此前文与主线大事件（可写性）。

## 三、方法、工具与效果

### 改动点
- **数据库**：`prisma/schema.prisma` 的 Project 模型新增 `timelineDigest` / `storylineDigest`（String 默认空）。因仓库历史迁移基线损坏（`migrate dev` 在 shadow 库报 P3006/P3018 缺 `StorylineEvent` 表），改用 `prisma db push` 增量加列同步，不删表、安全。
- **聚合核心**：新建 `src/core/pipeline/digest.ts`：
  - `rebuildProjectDigest(projectId)`：读全部 `ChapterSummary` + 主线(main) 的非 CLUE `StorylineEvent`（按 position 串联，标注 advance/probe/vote 角色）→ 落库两字段 → 返回 digest。
  - `formatDigest({timelineDigest, storylineDigest})`：两字段都空返回空串（调用方据此跳过注入）；否则产出「【时间线摘要大纲…】【故事线摘要大纲…】」块。
  - 时间线取最近 20 章，标题已含「第N章」则不加前缀（正则 `/^第\s*\d+\s*章/` 防重）。
- **自动触发**：`post-processor.ts`（写完一章落库摘要后）与 `summarize` 路由 mode 1（重新摘要确认落库后）都 `try { await rebuildProjectDigest(projectId) }`，幂等、失败不阻断主流程。
- **手动重建**：新建 `src/app/api/generate/digest/rebuild/route.ts`（POST 接收 `{projectId}` 返回 digest），供「重新生成」按钮调用。
- **注入链路**：`GenerationData` / `OutlineContextData` 携带两摘要；`write` / `refine` / `continue` 的 `writingInstruction` 与 `chapter-outline` 的 `outlinePrompt`，在「剧情线上下文」段之后经 `formatDigest` 注入；空摘要 `formatDigest` 返回空串 → 调用方不拼 → 不污染 prompt。
- **UI 入口**：`LeftPanel.tsx`「更多▾」下拉新增「摘要大纲」tab（scroll 图标），渲染新建的 `DigestPanel.tsx`（分段展示两摘要 + 「重新生成」按钮 + 空态提示）。

### 验证
- **类型门禁**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错误。
- **测试门禁**：`npx vitest run` → 47 文件 412/412 全绿（新增 `digest.test.ts` 4 个用例覆盖 `formatDigest` 空/仅时间线/仅故事线/两者顺序）。
- **无头检测**：脚本 `tmp_detect_digest.cjs` 在 `http://127.0.0.1:3001` 跑通：开 workspace → 点「更多▾」→ 点「摘要大纲」→ 断言面板渲染（hint + 时间线/故事线/空态）→ 点「重新生成」→ 截图 → 零 console 报错（PASS）。
- **rebuild API 实测**：curl 调 `/api/generate/digest/rebuild` 返回真实小说聚合摘要（各章摘要 + 主线「保守备份 vs 主动扩张」大事件串联），确认聚合逻辑对真实数据有效。

### 效果
- 用户从「更多▾ → 摘要大纲」一眼看到整本书的时间线 / 故事线脉络。
- AI 写下一章 / 续写 / 微调 / 写章纲时，自动带上「此前各章发生了什么 + 主线大事件」，不再只看最近 3 章。

## 四、关键取舍

1. **纯函数确定性聚合，不调 LLM 再做一次摘要**
   - 原因：逐章摘要本身就是用户写出来的「发生了什么」，直接拼接是对「长期记忆」最忠实的还原；再丢给 LLM 摘要会引入随机性、消耗 token，且可能改写原意。纯函数 → 零 token、幂等、可被无头测试断言。
2. **时间线只取最近 20 章，而非全量**
   - 原因：控制注入 prompt 的 token 长度，避免百章小说把上下文撑爆；20 章足够覆盖主线记忆，太老的章节对当下写作权重本就低。
3. **空摘要时 `formatDigest` 返回空串，调用方跳过注入**
   - 原因：新书或还没写过摘要时强行拼一个「【时间线摘要大纲】（空）」只会污染 prompt，让 AI 困惑。空就什么都不加，保持 prompt 干净。
4. **用 `prisma db push` 而非 `migrate dev`**
   - 原因：仓库历史迁移基线损坏（shadow 库缺表），`migrate dev` 必失败（P3006/P3018）；`db push` 只比对 schema 增量加列、绝不删表，是这类「迁移基线已坏」仓库的安全同步手段。
5. **注入位置放在既有「剧情线上下文」之后**
   - 原因：与 `outline-context` 既有链路并列，不破坏已稳定运行的上下文拼装顺序；摘要大纲是「此前记忆」，剧情线上下文是「当前线状态」，先后顺序语义合理。

## 五、可复现步骤

1. 同步 schema（迁移基线损坏，不可用 migrate dev）：
   ```bash
   cd C:/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
   npx prisma db push
   ```
2. 跑聚合单测：
   ```bash
   npx vitest run src/core/pipeline/digest.test.ts
   ```
3. 起干净 dev server（旧 `.next/dev` 可能被平台进程锁住，建议独立 distDir 或等平台自动重启）：
   ```bash
   npx next dev -p 3001
   ```
4. 无头检测「更多▾ → 摘要大纲」：
   ```bash
   node tmp_detect_digest.cjs
   ```
5. 实测 rebuild 接口（返回真实聚合摘要）：
   ```bash
   curl -s -X POST http://127.0.0.1:3001/api/generate/digest/rebuild \
     -H "Content-Type: application/json" -d '{"projectId":"<PID>"}'
   ```

## 六、遗留关联

- **aixiaoshuojia.cn 探索仍阻塞**（task #253）：需登录凭据 / cookie 才能进入远程浏览器操控，当前无法推进，已向瑞宝宝请求配合。
- v1.9 目标态里「推进 / 试探墙」「投票」仍未做，缺设计规格，不在本轮范围。
