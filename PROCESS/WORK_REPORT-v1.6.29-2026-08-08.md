# 工作单元报告：v1.6.29 类型债总清（核心管线 project:any 收口 + Project.llmConfig 放宽）

> 费曼式 · 零基础可读 · 含四要素与诚实边界
> 日期：2026-08-08｜仓库：novel-forge（HEAD 推进至 v1.6.29）｜决策代理：马斯克执行 CEO（拍板 (1)+(2) 合并）

---

## 一、干了什么（一句话）

把 novel-forge 核心代码里残留的「`(project as any)` 绕过类型系统」彻底清零（共 7 处），并把 `Project.llmConfig` 字段的类型从理想的 `LLMConfig` 放宽为贴合运行时的 `Record<string, unknown> | null`，让类型真正反映现实、不再靠 `as any` 掩盖。

## 二、为什么这么做（第一性原理）

**背景类比**：类型系统像「合同的条款」。之前代码里大量写 `(project as any)`——相当于签合同时写「其他条款我瞎填，你别管」。字段名拼错、字段删了，编译器（合同审查员）一律放行，等到运行时才炸。这就是「静默坏味道」。

**根因**：`Project.llmConfig` 在类型定义里写的是 `LLMConfig`（一个漂亮的理想结构），但数据库里存的是 Prisma 的 `Json` 原始对象（一个松散的「任意 JSON」）。理想类型和现实数据对不上，导致所有读取 `llmConfig` 的代码被迫用 `as any` 或 `as unknown as Record` 硬塞。这是 v1.6.27/28 两轮「打补丁」留下的异味总源头。

**马斯克 CEO 拍板**：把 (1) `llmConfig` 类型彻底统一 + (2) 核心管线 `project:any` 收口合并一轮做掉——「诡异 bug 的根因是类型缺口，同源的债归一轮清，纯编译期改动、风险≈0」。

## 三、用了什么方法、效果如何

**检测（Trust but verify，不盲从）**
- 用 `Bash grep`（本仓库 Grep 工具在绝对路径下会假阴性，禁用）穷举全仓 `(project as any)`——揪出 7 处漏网：orchestrator 的 `genre`、refine/write 的 `postProcessingRules` 与 `contextKeepChapters`、presets apply 的 `llmConfig` 外层、context-loader 的 `project` 返回值、outline-context 的 `project` 接口。
- 实测验证马斯克拍板的「放宽到 JsonValue」是否可行：发现 `@prisma/client` **未导出** `JsonValue`（Prisma 版本/生成差异），且前端 `ProjectData` 根本不含 `llmConfig`（grep 空）——证明放宽到 `JsonValue` 既不可行也无收益。

**修复（9 处编辑 + 3 处 import）**
1. `types/index.ts`：`Project.llmConfig: LLMConfig` → `Record<string, unknown> | null`（与运行时 Json 对齐；不依赖 Prisma 导出）。
2. 7 处 `as any` 去除：
   - orchestrator `genre`（Project 已含 `string[]`，纯历史冗余，直接去掉 `as any`）；
   - refine/write 的 `postProcessingRules`/`contextKeepChapters`（Project 已含对应可选字段，直接 `data.project?.xxx`）；
   - presets apply 的 `llmConfig` 外层 `as any` 去掉，保留内层 `as unknown as Record` 桥接；
   - context-loader 的 `project` 返回值：`project as Project`（Prisma Project → 精简 Project 桥接）；
   - outline-context 的 `OutlineContextData.project` 接口 `any` → `Project`，return 处 `project as unknown as Project` 桥接 null。
3. 补 3 处类型 import（outline-context/context-loader 补 `import Project`；types 不需 JsonValue）。

**验证（双门禁）**
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → **0 错误**（过程中 tsc 真报错两次，反而帮我们抓出「JsonValue 未导出」和「null 不兼容非空字段」两个真问题，已修）。
- `npx vitest run` → **30 文件 307/307 全绿**。

## 四、关键取舍（诚实边界）

1. **修正马斯克拍板，不盲从**：原拍板「放宽到 JsonValue 并重构前端」——实测后未采纳。理由：(a) `@prisma/client` 未导出 `JsonValue`，硬用会编译失败；(b) 前端 `ProjectData` 不含 `llmConfig`，不存在「重构前端」的必要；(c) 即使放宽到 `JsonValue`，`JsonValue → Record` 仍需 `as unknown as Record` 桥接，无法消除异味。改用 `Record<string, unknown> | null` 反而最稳、与 core 层桥接范式完全对齐。**这是 Trust but verify 的实锤——CEO 拍板是决策，执行时仍用数据校验，发现有坑就如实标注并修正。**

2. **桥接保留，非绕过**：放宽后仍有 `as unknown as Record`——因为 Json 对象转 Record 在 TS 里必须经 `unknown` 中转（`Record` 不是 `JsonValue` 的子类型）。这是诚实的类型契约标注，不是「掩盖」，比模糊的 `any` 透明。

3. **前端关系字段 as any 合理保留**：`workspace/[projectId]/page.tsx` 里的 `(project as any).storyNodes/.characters/.lorebookEntries` 访问的是数据库关系字段，明确不该塞进精简的 `Project` interface，属于「关系加载」语义，保留正确。

4. **残留 as any 归零（project 维度）**：本次后，凡属「字段访问」的 `project as any` 已清零；剩余 `as any` 全是有意的关系/结构桥接，非缺陷。

5. **VERSIONS 历史错位**：24/26/25 顺序前序遗留，本次为控大块 Edit 风险未重排，如实标注。

## 五、怎么复现（照做即可）

```bash
cd /c/Users/Administrator/WorkBuddy/2026-07-25-14-19-44/novel-forge
# 1. 检测残留 as any
grep -rn "(project as any)" src --include=*.ts --include=*.tsx
# 2. 改类型 + 去绕过（见正文 9 处编辑）
# 3. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望 0 错误
npx vitest run                            # 期望 307/307 全绿
# 4. 升版双 changelog（changelog-data.ts 三处 + CHANGELOG.md 头条）
# 5. 提交 + 代理推送
git add ... && git commit -m "v1.6.29 ..."
GH_TOKEN=$("/c/Program Files/GitHub CLI/gh.exe" auth token) && \
  git -c http.proxy=http://127.0.0.1:7897 push \
  https://huanweide:${GH_TOKEN}@github.com/huanweide/novel-forge.git main
```
