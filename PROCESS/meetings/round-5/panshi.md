# 磐石·集成与联动只读诊断报告【Round 5 · 磐石-gp】

- 透镜：功能集成与联动的完整性（每项功能是否「设置开关 → Prisma 字段 → API 写入 → UI 生效」全链路闭环）
- HEAD：fd7f953（v1.1.1，2026-08-06）｜技术栈：Next.js 16 + React 19 + Tailwind v4 + Prisma 7 + PostgreSQL 17
- 方法：Read / Grep 源码三方追踪（schema / API route / UI 调用），未改动任何代码/测试/changelog/配置/数据库
- 对照基准：`PROCESS/meetings/round-5/yunix-reference-analysis.md`（云笔功能对照表）、`00-启动与反思.md`（铁律「改动必须联动写入、必须填集成表」）
- 说明：本文为磐石-gp 独立复核稿。已对既有 panshi.md（磐石-2）逐条核对，修正一处事实错误（见 P2-4 修正脚注）。

---

## ① 联动现状全景（闭环 / 缺口一览）

### 已闭环（开关 → 字段 → API → 生效，全链路打通）
| 功能 | Prisma 字段 | API 写入 | UI 入口 | 生成/行为生效点 |
|---|---|---|---|---|
| 全局 LLM 设置 | AppSettings（schema L424-431） | PUT /api/settings（route.ts L33-61） | settings/page.tsx L159-186 | clearLLMCache + 各生成路由读取（已闭环） |
| 正则后处理规则 | Project.postProcessingRules（schema L27） | PATCH /api/projects/[id]（route.ts L54）+ 预设 apply（presets/[id]/apply L165-199） | ProjectConfigPanel.saveRules（tsx L121-125） | **/api/generate/write/route.ts:247-249**、refine:160、continue:205 真执行 applyRegexRules + SSE 事件 |
| 分层故事回顾（上下文楼层） | Project.contextKeepChapters（L37） | PUT /api/projects/[id]/config（config/route.ts） | AutomationSettingsDialog（tsx L25,138） | generate 路由 keepChapters 限窗 |
| 探讨布置（情节/原创名/故事线） | Project.buildConfig（L29） | PATCH /api/projects/[id]/build-config | BuildConfigDialog（tsx L144-145） | buildGlobalPromptFromExplore → 注入提示词文字 |
| 全局写作视角 | StyleCard.povType | style GET/PUT + 预设 apply | StyleEditor | sync-global-prompt.ts 注入叙事视角区块 |
| 自动整本交付 | Project.autoDeliverEnabled（L49） | PATCH /api/projects/[id]（route.ts L58） | ChapterConfirmBar 开关（tsx L64,70-92） | confirm-guard.ts:180 maybeAutoDeliver + 既有 vitest 覆盖 |
| 蒸馏/摘要 | ChapterSummary / StoryBeat | 后处理管线 | 自动 | post-processor.ts 蒸馏段写入 |
| 世界时间（时间线，手动） | StoryNode.worldTime（L167） | PUT /api/story/nodes/[id] | workspace handleSaveWorldTime | OutlineTree 时间线视图 |

### 缺口（详见问题清单）
- **autoConfirmEnabled：后端有 API、有读、有默认（true），但全项目无 UI 开关可翻转 → 孤儿后端能力（P1）。**
- **autoDeliverEnabled 在确认栏可切换，但 autoConfirmEnabled 不可切换 → 两个高度对称的自动化总开关，一个暴露一个隐藏，跨面板不一致（P1 关联）。**
- 云笔「自动提取角色关系 / 启用时间线提取」：数据模型 + 手动/agent 抽取存在，但**未接入生成后处理流水线**（只检测不自动抽取）→ 软联动（P2）。
- autoGenerateStoryline / forceOriginalNames：仅作为 prompt 文本提示，非硬写入（P2）。
- 测试覆盖：除 autoDeliverEnabled（maybe-auto-deliver.test.ts / confirm-guard.test.ts）外，autoConfirmEnabled 切换、contextKeepChapters 限窗 缺 vitest（P2）。
- Agent 助手模式开关存 localStorage 不落库（P2）。

---

## ② 问题清单

### 【P1】autoConfirmEnabled 后端有 API 但 UI 无入口——不可达开关（孤儿后端）
- **Prisma（schema）**：`Project.autoConfirmEnabled Boolean @default(true)` — prisma/schema.prisma:47 字段存在。
- **API（route）**：PATCH /api/projects/[id] 接收并写入 `autoConfirmEnabled: body.autoConfirmEnabled` — src/app/api/projects/[id]/route.ts:56 可写。
- **行为生效（读）**：
  - post-processor.ts:222-224 `select:{autoConfirmEnabled:true}` 后 `if(proj?.autoConfirmEnabled)` 决定生成后是否自动确认；
  - game-engine.ts:648-650 读取同一字段；
  - ChapterConfirmBar.tsx:67 `isAutoMode = autoConfirmEnabled === true` 决定确认栏形态 —— 读取生效，默认 true 下功能正常。
- **UI（缺口）**：
  - ChapterConfirmBar.tsx:25,51,97 仅 props 接收，无任何 onChange / 本地 state 翻转该值；确认栏只对 autoDeliver 提供 Switch（L64,70-92）。
  - 设置页 src/app/settings/page.tsx 全文不含 autoConfirm。
  - 自动化弹窗 AutomationSettingsDialog.tsx 仅含 autoFillEnabled / fillFrequency / skipLatestChapter / contextKeepChapters（L22-25,106-138），不含 autoConfirm。
  - ProjectConfigPanel.tsx 仅写 postProcessingRules / llmConfig，不含 autoConfirm。
  - workspace 仅 page.tsx:1075 以 `project?.autoConfirmEnabled ?? true` 透传。
- **误导性文案（加重项）**：ChapterConfirmBar.tsx:101 的引导 toast 明确写「如需逐章人工把关，**可在设置中关闭**」——但设置页根本无此控件。用户被指向一个不存在的开关，体验上构成「假入口」。route.ts:55 注释「此前仅 DB/UI 可切」印证曾有 UI（疑精简确认栏时移除），现变为孤儿后端能力。
- **结论**：违反「跨面板同步」与「改动必须联动写入」——autoDeliver 有开关、autoConfirm 无；用户在任何面板都无法关闭「智能审阅」（只能靠 DB 直改或测试脚本 scripts/agent-auto-confirm-verify.cjs）。
- **修复建议**：在 AutomationSettingsDialog（或确认栏）增加 autoConfirm 开关，复用 autoDeliver 同款 Switch 形态，走 PATCH /api/projects/[id] 持久化；同时修正 L101 文案，使其与实际可达路径一致（或文案改为「可在自动化设置中关闭」）。

### 【P1】两个自动化总开关跨面板不一致（autoConfirm 隐藏 / autoDeliver 暴露）
- 关联 P1：autoDeliverEnabled 与 autoConfirmEnabled 同为「Project.Boolean @default(true)」+ PATCH 写入 + 后处理读取（confirm-guard.ts:180 / post-processor.ts:222），逻辑对称。
- 但 UI 仅暴露 autoDeliver（ChapterConfirmBar L64-92 有 Switch），autoConfirm 没有任何 Switch。两者应并排出现在同一面板，让作者统一掌控「自动确认」与「自动交付」两条自动化链路。

### 【P2】云笔「自动提取角色关系 / 启用时间线提取」未接入生成流水线（只检测、不自动写入）
- **数据模型已具备**：CharacterCard.relationships（schema）、StoryNode.worldTime（L167）、CharacterCard.timeline。
- **手动/agent 抽取存在**：/api/agent/analyze-relationships、/api/agent/extract-chapter（extract-chapter/route.ts → characterCard.timeline）、apply-extraction.ts 回写 timeline/relationships；CharacterDialog 可写。
- **但生成流水线未自动触发**：post-processor.ts:684-708 仅有**一致性检测**（`timeline_regression` 仅检查倒退、`relationship_sudden_change` 仅告警），没有在每章写完后自动抽取关系/时间线并 upsert 回 CharacterCard / StoryNode。对照 yunix-reference-analysis.md 2.2「自动提取角色关系（核对联动）」「启用时间线提取（核对联动）」——novel-forge 具备能力但未接成「写作时自动」常驻链路。
- **结论**：属「学了云笔功能但没接上（自动档）」：手动/agent 路径可用，自动化档缺位。关系图谱、时间线视图依赖用户手动维护或手动触发 agent，与参考站「生成即更新」体验落差。
- **修复建议**：在 runPostGenerationPipeline 增加可选 step（受开关或默认开启），对本章正文做关系/时间线增量抽取并 upsert 到对应字段；或把 analyze-relationships / extract-chapter 作为后处理可编排节点接入。

### 【P2】autoGenerateStoryline / forceOriginalNames 仅为软提示（prompt hint，非硬写入）
- **UI → API → 落库**：BuildConfigDialog.tsx:144-145 两个 Toggle → PATCH build-config → Project.buildConfig 写入闭环（链路本身 OK）。
- **但生效点只是文本**：build-prompt.ts:29-30 仅生成「原创人名：强制/不强制」「自动生成故事线：是/否」两段提示词文字；explore/chat 仅追加一行提示。
- **缺口**：autoGenerateStoryline 并不在写作时真正创建/维护 Storyline 事件流（无生成期 Storyline 自动构建代码）；forceOriginalNames 仅提示模型，无强制校验/回退。对照云笔「自动生成故事线=按剧情推进自动维护事件流」，此处是「软联动」而非「硬写入」。
- **结论**：开关文案表述与实际行为有落差，可能误导用户以为开启了自动维护。非阻断。
- **修复建议**：要么在写后处理中真正根据 autoGenerateStoryline 增量维护 Storyline 条目；要么在 UI 文案明确为「提示模型（非强制）」，避免与硬功能混淆。

### 【P2】关键开关测试覆盖缺口（部分，铁律第 6 条）
- 已覆盖：autoDeliverEnabled（src/core/maybe-auto-deliver.test.ts、confirm-guard.test.ts）、正则应用（src/core/post-process/regex.test.ts——含 applyRegexRules 基础替换 + ReDoS 防护）。
- **缺单测**：`autoConfirmEnabled` 开关切换（API 写入 + 后处理读取分支无回归）、`contextKeepChapters` 上下文限窗逻辑、buildConfig prompt 注入语义。
- 修正脚注：既有 panshi.md（磐石-2）称「postProcessingRules 应用逻辑无单测」——**与事实不符**，regex.test.ts:90-108 已覆盖 applyRegexRules，特此更正。
- **结论**：本轮审查涉及的部分开关/规则应用逻辑缺少 vitest 回归门，违反 round-5 铁律第 6 条「新增功能必须有对应测试」。
- **修复建议**：补 autoConfirmEnabled 切换单测、contextKeepChapters 限窗单测、buildConfig 注入单测。

### 【P2】「Agent 助手模式」开关存 localStorage 不落库（持久化分散）
- src/app/settings/page.tsx:35-37, 507-528：`nf-agent-mode` 仅存 localStorage，不在 AppSettings schema（schema L424-431 仅 llmProvider/apiKey/model/baseUrl）。
- **结论**：同属「助手行为开关」，其余走 DB，此项走浏览器本地；换设备/清缓存即丢失，且无法服务端统一。非阻断，但违背「全局设置可持久化」一致性。
- **修复建议**：评估是否纳入 AppSettings（新增 agentMode 字段）或项目级配置，统一持久化路径。

### 孤儿功能核对（补充）
- **后端有 API 但 UI 没暴露**：autoConfirmEnabled（见 P1）。其余开关（autoDeliver、postProcessingRules、buildConfig、contextKeepChapters、autoFillEnabled）均有 UI 入口。
- **UI 有入口但后端没接**：未发现明显项。设置页第 6 节「记忆衰减」描述「写作页底部记忆衰减按钮」，按钮实际位置需另行核对（标注观察，不影响主线闭环）。

---

## ③ 集成闭环建议（落地优先级）

1. **P1 优先**：给 autoConfirmEnabled 补 UI 开关（复用确认栏/自动化弹窗的 Switch，走 PATCH /api/projects/[id]），使其与 autoDeliverEnabled 并排可见、可同步，消除孤儿后端能力；并修正 ChapterConfirmBar.tsx:101 的指向性错误文案。
2. **P2**：将 analyze-relationships / extract-chapter 的抽取能力接入 runPostGenerationPipeline，实现云笔式「写后即自动抽取关系/时间线」常驻链路（受开关或默认开启）。
3. **P2**：厘清 autoGenerateStoryline / forceOriginalNames 软/硬语义，要么落地硬写入、要么修正 UI 文案，避免误导。
4. **P2（测试）**：补齐 autoConfirmEnabled 切换 / contextKeepChapters 限窗 / buildConfig 注入 的 vitest，满足铁律第 6 条（注：applyRegexRules 已有覆盖，无需补）。
5. **P2（一致性）**：将「Agent 助手模式」从 localStorage 收敛到 DB 持久化，统一全局设置落库路径。

---

### 集成表（本轮横向对照，遵循铁律第 5 条）
| 云笔参考项 | novel-forge 对应 | 处理建议(原表) | 本轮闭环判定 |
|---|---|---|---|
| 正则后处理/酒馆 regex | postProcessingRules | 合并 | **全闭环 + 已单测** |
| 自动提取角色关系 | CharacterCard.relationships | 核对联动 | 仅手动/agent，未入流水线（P2） |
| 启用时间线提取 | worldTime / timeline | 核对联动 | 仅手动/agent，未入流水线（P2） |
| 自动生成故事线 | buildConfig.autoGenerateStoryline | 合并 | 软提示非硬写（P2） |
| 全局写作视角 | StyleCard.povType | 合并统一 | 已注入 globalPrompt |
| 蒸馏/摘要 | 后处理蒸馏+摘要 | 合并 | 已闭环 |
| 分层故事回顾 | contextKeepChapters | 核对 | 已闭环（缺单测 P2） |
| 流式/自动润色/实时建议 | — | 核对/评估 | 不在本轮开关审查范围（观察） |

### 严重程度汇总
- **P0**：未发现（无数据损坏 / 写链路完全断裂级问题）。
- **P1**：autoConfirmEnabled 孤儿后端 + 跨面板不一致（1 项，含误导性文案加重）。
- **P2**：时间线/关系自动抽取未接入（1）、buildConfig 软提示（1）、测试缺口（1）、Agent 模式 localStorage（1）。
