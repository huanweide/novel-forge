# 继续优化测试（之二）：补齐输入校验层与内容安全扫描单测

> 日期：2026-08-13 ｜ 项目：novel-forge（本地小说创作平台，Next.js 16 + React 19 + Prisma 7）
> 上接 `CONTINUE_OPTIMIZE_2026-08-13.md`（补 api-error / rate-limit 单测，覆盖率 33.76%→36.53%）

## 一、干了什么（一句话）

在上一轮补安全模块单测之后，继续啃测试盲区里两个纯逻辑模块：`src/lib/validators.ts`（输入校验层）和 `src/lib/banned-words.ts`（违禁词预检），各写一份单测把这两个此前 0% 覆盖的模块锁死。

新增文件：
- `src/lib/validators.test.ts` —— **32 例**
- `src/lib/banned-words.test.ts` —— **16 例**

## 二、为什么这么做（底层原理，不堆术语）

之前"三轮诊断核查"点明的核心短板是「输入校验缺失」：写操作裸信任 `request.json()`，脏数据直接进数据库，要么服务器 500、要么库里塞进脏数据。

`validators.ts` 正是为堵这个口子而写的集中校验层——它是一组手写的"类型守卫"小函数（判断一个值是不是字符串、是不是数字、缺了要不要报错），目的就是「脏数据在进入数据库之前先被拦下来」。但它自己没有测试，等于"防 500 的墙"自己没验收。本轮把它和同属安全侧的内容预检一起补测，闭合回归护栏。

（为什么不用现成库 zod？因为这项目是本地单用户工具，"轻"是核心诉求，手写几个守卫零依赖就能达成目标。）

## 三、覆盖什么 / 效果如何

**validators.ts —— 100% stmts / 100% lines / 100% funcs（branch 98.8%，近乎满覆盖）**
- `ValidationError` 正确带出字段名和消息；`badRequest` 返回 400 标准化响应（含 `code: VALIDATION_ERROR`）。
- 必填守卫 `asStr`：缺了报错、可选时走默认值、不是字符串报错、超长报错。
- `asStrOrNull / asStrArray / asInt / asBool` 各分支（含数字截断取整、数组里只留字符串）。
- 可选字段系列 `optStr/optStrArray/optInt/optBool/optObj`：没传→undefined（不更新该字段）、显式传 null→清空、类型非法→抛错（脏数据在进库前被拦）。
- `readValidatedBody`（统一入口）：非法 JSON→400、JSON 原始值（字符串/数字，非对象）→400、校验抛错→400 并透出字段、成功返回对象。

**banned-words.ts —— 92.3% stmts / 100% funcs（branch 84.8%）**
- `DEFAULT_BANNED_WORDS` 真身 **34 个**词（平台普遍禁止的引流/广告/联系方式类，可安全内置）。
- `scanBannedWords` 全匹配语义：中文走子串、大小写不敏感、`vx` 这种短英文词走"词边界"判定（不会误伤 `avx`）、`V信` 边界命中、自定义词库合并、最多返回条数限制、返回命中位置与上下文（空白压缩）。
- 自定义词库读写：`loadCustomBannedWords` 在 node 环境安全回退返回空；用 `vi.stubGlobal` 模拟浏览器 localStorage，锁死 `saveCustomBannedWords` 去空去重写入 + `getAllBannedWords` 合并默认与自定义。

**门禁（全绿，已验证）**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错。
- `npx vitest run` → **69 文件 / 631 测试全通过**（基线 583 + 本轮 48 例）。
- 全量覆盖率：All files **37.56% stmts**（上一轮 36.53% → +1.03pp）；validators 与 api-error 均已达 100% stmts 满覆盖。

## 四、关键取舍 / 踩坑（反自欺，实测记录）

1. **测试断言必须贴真身、不贴记忆**：最初按上一轮 summary 记的 `DEFAULT_BANNED_WORDS` 长度写 29，真身源码实际是 **34**——直接修正为 34。再次印证：summary 的个别数字会偏高，一切以真身源码 `Read` 为准。
2. **`readValidatedBody` 对 JSON 数组的真实行为**：因为 `typeof [] === "object"`，源码的 `typeof raw !== "object"` 检查**不会拦数组**，数组会照常进入校验函数。我原以为"数组返回 400"是错判；真正触发 400 的是 JSON 原始值（字符串/数字/布尔/null）。用例已改成传 JSON 字符串并断言 400。这是源码真实边界，测试如实锁定，不强行"纠正"源码。
3. **node 环境测不了浏览器 localStorage 分支**：这两个函数在 node 下 `typeof window === "undefined"` 直接回退。用 `vi.stubGlobal("window", {})` + `vi.stubGlobal("localStorage", mock)` 模拟浏览器环境，把持久化读写分支也锁死（funcs 提到 100%）。

## 五、下一步可切入（剩余 0% 纯逻辑盲区盘点）

- `confirm-guard`、`entity-detector`、`entity-auto-creator`（已有部分测试，可加深）。
- `sync-global-prompt`、`storyline/execute-task` 等纯逻辑模块。
- 大模块（pipeline / agents / babylore / dissect）需 mock LLM+数据库，成本高，建议按业务风险单点推进，不为刷覆盖率而补。
- 前端组件（`components/app`）需 jsdom + RTL，本轮未覆盖，另行规划测试环境。

## 六、提交范围（干净，不混入历史遗留）

本轮仅提交：
- `src/lib/validators.test.ts`（新增）
- `src/lib/banned-words.test.ts`（新增）
- 本报告 `CONTINUE_OPTIMIZE_2_2026-08-13.md`
- 当日 memory 追加段落

刻意**未混入**：`PROCESS/` 历史报告、`tmp_*.cjs`、`_*.cjs`、截图等历史遗留未跟踪文件。推送走直连 SSH（origin 保持 https），临时 ghssh remote 用完即删。
