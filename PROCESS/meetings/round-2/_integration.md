# MaxLoop 魔王系统 · round-2 阶段二整合评审报告

- **轮次**：round-2
- **日期**：2026-08-07
- **基线版本**：v1.6.4（HEAD = 2b88e09）
- **参与透镜**：8（写章主流程 / 世界卡15类与填表闭环 / 故事线量化联动 / 设定自动建档entity-sync / 导入导出迁移 / UI无障碍文案 / 监控性能API断链 / 游戏模式）
- **方法**：Chair（千惠/tri）共识模拟（去重归类 → 共识度判定 → 改进清单 + 观察池）；关键 P0 由 Chair 亲自 `grep`/读源码复核（Trust but verify）
- **原始发现总数**：写章 13 + 世界卡 11 + 故事线 10 + entity-sync 13 + 导入导出 17 + UI 12 + 监控 8 + 游戏 12 ≈ **96 条**

> 共识门槛依据 `review-protocol.md`：P0 直接入清单；P1 满足「根因确定性高(实测可证) / 个例通道论证充分」即入清单；P2 仅当「≥2 透镜交叉」或「个例高价值可用性硬伤」入清单，其余进观察池下轮复核。

---

## 一、改进清单 IMP（阶段三/四输入）

### P0 · 阻断级（2 条，Chair 已亲自验证）

**R2-001 ｜ 世界卡确定性分类器 `world-category-classifier.ts` 未被任何自动填表代码接线（声明与实现背离）**
- 提出透镜：世界卡
- 文件:行号：`src/lib/world-category-classifier.ts`（整体）；Chair 亲自 `grep -rn "world-category-classifier\|classifyWorldCategory" src` 确认引用方仅 3 处（自身 + 其单测 + `changelog-data.ts:83-84` 文案）；`src/core/babylore/entity-sync.ts`、`src/core/babylore/fill.ts`、`src/app/api/generate/pre-write-cards/route.ts` 均未 import。
- 现象：CHANGELOG v1.6.3 称「自动填表路由更准」「14 类自动填表闭环验证完成」，但分类器是孤立参考实现，运行时零参与；自动填表路由完全由 LLM 自由文本枚举决定。
- 根因：v1.6.3 写出分类器并通过单测，漏做「在 entity-sync / pre-write-cards 调用 `classifyWorldCategory` 做路由/兜底」接线。
- 建议修法：在 `syncChapterEntities` 写入 `lorebookEntry` 前用 `classifyWorldCategory(summary+description)` 做确定性兜底路由（LLM type 不可信时以分类器为准）；或在 pre-write-cards 用分类器校验已建条目分类自洽；如实修正 CHANGELOG「14 类闭环」措辞。

**R2-002 ｜ 自动填表 LLM 枚举 + TYPE_TO_CATEGORY 仅覆盖 9/15 类，5 类世界卡不可达（数据缺失 + 静默错分）**
- 提出透镜：世界卡（Chair 已亲自读 `entity-sync.ts:34/42-52/218` 验证）
- 文件:行号：`src/core/babylore/entity-sync.ts:34`（type 枚举 `character|location|item|technique|organization|creature|fate|physics|public|other`）；`:42-52`（`TYPE_TO_CATEGORY` 仅 9 映射）；`:218`（`category = TYPE_TO_CATEGORY[type] || "custom"`）。
- 现象：`magic_system / culture / history / law / currency` 五类世界卡自动填表**永远建不出来**（LLM 无对应 type，全塌 custom 或错归 item/organization）。如「灵石」被归 item、「天道戒律」归 custom、「上古灭世之战」归 custom。与 CHANGELOG「14 类自动填表闭环验证完成」直接冲突。
- 根因：v1.6.3 只把 technique/currency 的想法写进 UI 与文案，但 entity-sync 的 LLM 枚举与映射表漏加 5 个 type 与映射。
- 建议修法：在 `ENTITY_SYSTEM_PROMPT` type 枚举补 `magic_system|culture|history|law|currency`，在 `TYPE_TO_CATEGORY` 补对应映射；补集成单测「喂货币/历史/法则/文化/力量体系正文，断言落库 `lorebookEntry.category` 命中对应类」。

### P1 · 重要级（13 条，确定性高 / 实测可证）

**写章主流程族**
- **R2-003 ｜ refine/continue 绕过 confirm 闸门即时填表 + 确认双填（填表原则不一致）** — 写章；`src/app/api/story/nodes/[id]/refine/route.ts`、`continue/route.ts` 调 `safeFillAfterWriting` 未走 confirm 闸门即填表，且 confirm 路径又填一次 → 未审视即污染 + 双填；建议两路径统一透传 `isLatestChapter` 与确认态，避免绕过闸门。
- **R2-004 ｜ 批量角色卡持久化断链（读取端在、写入端缺）** — 写章；`page.tsx` 批量生成读 `localStorage["pregen-conf-..."]` 取角色卡参数，但无任何写入端写该键 → 批量角色卡约束主路径实际无效；建议批量生成前 `drawSelectedCardIds` 或新写端落盘，或改为从项目级活跃卡取默认。

**故事线族**
- **R2-005 ｜ 缝合怪 newMain 流支线误挂已完结旧主线** — 故事线；`generate/route.ts:123-124,154` 的 `mainId` 不接管已存在主线，新建主线时支线被挂到旧的已完结主线；建议 generate 解析现有主线（status!=completed 优先）并显式接管 `mainId`。
- **R2-006 ｜ 融入写作未注入「支线→主线」隶属关系** — 故事线；`outline-context.ts` 的 `formatStorylines` 只给扁平七要素，AI 写章时不知支线隶属哪条主线；建议在注入文本补「支线 X 隶属于主线 Y」层级说明。

**设定自动建档族**
- **R2-007 ｜ 伏笔检测在 auto-confirm / 批量确认路径缺失（IMP-007 部分失效）** — entity-sync；`confirm-guard.ts:100-167` 的 `applyConfirm` 根本不触发 detect，仅手动单章 confirm（`[id]/route.ts:218`）触发 → 默认开启自动确认/批量确认下伏笔面板基本不随写章更新；建议 `applyConfirm` 内 fire-and-forget 调 `/api/foreshadowing/detect`，并解决「摘要晚于确认生成」时序盲点。

**导入导出族**
- **R2-008 ｜ 选章仅选子节点静默空导出** — 导入导出；导出勾选仅选中卷/父节点时，子章节未级联选中，导出内容为空且零提示（IO-11，实机验证）；建议导出前递归展开选中节点的子章节，或对空导出给非阻塞提示。
- **R2-009 ｜ IO-03 仍存的 P1（导入错误提示粒度不足）** — 导入导出；round-1 观察池遗留，复验仍存（代码验证）；建议细化大导入失败时的错误原因回传。

**UI / 无障碍族**
- **R2-010 ｜ IMP-017 深色主题 `--nv-text-muted` 落卡片/弹窗未达 WCAG AA（P2 升 P1）** — UI；对比度计算坐实深色 surface 上 muted 文字约 4.0–4.1:1 < 4.5:1；建议深色主题 muted 令牌再调亮或改卡片背景。

**监控 / 性能族**
- **R2-011 ｜ API 巡检脚本 100% 误报（让「0 断链」宣称失真）** — 监控；`scripts/audit-api-refs.cjs` 报 20 个 MISS 但真实断链 0 条（6 模板字面量截断 + 13 changelog 文档性 + 1 清单滞后）；建议修正脚本匹配逻辑（区分模板变量/文档字符串/真实路由引用）。
- **R2-012 ｜ 每章生成无界全量加载章节树/角色/世界书/表格，长项目 O(n) 浪费** — 监控；`src/lib/context-loader.ts` 每次生成拉全部节点/角色/世界书，长项目白拉 10–20MB；建议按需分页或仅加载触发/常驻项。

**游戏模式族**
- **R2-013 ｜ originalContentSnapshot 永不刷新致手动编辑被覆盖** — 游戏；`game-engine.ts:162-165`（快照仅首次入游写入）、`:708`（reset 不回读 node.content）；作者在工作区润色游戏导出章节后重开游戏，手动编辑被无声覆盖 + 两局语境错位；建议每次开局重拍当前 `node.content` 为快照。

**世界卡收口族（P1，配合 R2-001/002）**
- **R2-014 ｜ lorebookEntry.category 为 String 且无枚举白名单，拼错分类被静默持久化** — 世界卡；`prisma/schema.prisma:113`（`category String @default("custom")`）+ `src/app/api/lorebook/route.ts:20`（仅长度校验）；`currnecy` 之类错字被静默存、WorldPanel 兜底成 custom，数据错乱零报错；建议 `z.enum([...ALL_WORLD_CATEGORIES])` 校验 + DB 加 `enum LoreCategory`。
- **R2-015 ｜ 15 类无单一来源，字符串散落 13~36 文件** — 世界卡；`world-category-classifier.ts` 的 `WorldCategory`/`ALL_WORLD_CATEGORIES` 未被下游消费，`pre-write-cards`/`entity-sync`/`LorebookEditDialog` 各自硬编码；建议 `worldPanelData.ts` re-export 常量，下游全部派生（下拉/校验/映射统一）。

---

## 二、观察池（P2，下轮复验；因单次未达交叉门槛或需本地目测，不阻塞）

- **世界卡 P2**：F-06（两套分类体系割裂）、F-07（分类器圣地/宗门同词误路由）、F-08（天劫注释与关键词不一致）、F-09（pre-write-cards 仅查13类硬编码）、F-10（世界卡缺名称真实性自检）、F-11（角色关系机制错位）。
- **写章 P2**：F-03（自动确认孤悬过度承诺）、F-04（伏笔检测 auto-confirm 缺失，并入 R2-007）、F-05（确认全量重扫伏笔 O(N²) 且返回值丢弃）、F-06（write/route 死变量 isLatestChapter）、F-07（refine/continue 漏传 source 破坏溯源）、F-08（批量完成 toast 虚报）、F-09（continue order 冲突）、F-10（continue 标题续接正则污染）、F-11（版本号双真相）、F-12（DELETE 重排误改名 scene）。
- **故事线 P2**：F3（删主线后孤儿支线虚假回退）、F4（多主线聚合只认第一条）、F5（AI 不返 main 静默孤儿线）、F6（进度标题名实不符）、F8（parentId 无 Prisma 迁移靠 db push）、F9（chapterBindings 三处形状不统一）、F7（status:"main" 死过滤值）、F10（12章硬封顶+权重误导）。
- **entity-sync P2**：D 报告 P2×11（含 selfCheckFill 全正文 join 大库 O(行×正文)、高亮 60s 缓存滞后、按名反查 id、自动填表 skipLatest 临稿污染风险、重检按钮反馈粗等）。
- **导入导出 P2**：IO-12（导出仅正文无回导）、IO-13~17（往返一致性/备份文件名/零回归测试等）、IO-04/05/06/08（round-1 老问题仍存）。
- **UI P2**：UI-002~009（监测面板标签对比度、destructive 按钮、错误页标题、Toast 与批量进度胶囊遮挡、工具栏窄屏溢出、off-canvas 抽屉 inert、命令面板 scrollIntoView、原生 window.confirm）；UI-010~012（半角冒号语病、创意工坊黑话、错误页 pre 对比度）。
- **监控 P2**：F-03（批量写作 TOCTOU 竞态）、F-04（monitor 缓存语义冗余）、F-05（监控五类盲区）、F-06（响应缺 Schema 校验）、F-07/08（整洁度/一致性）。
- **游戏 P2**：G-new-2（结束导出并发竞态）、G4（maxWords 硬编码）、G5（开局非流式不可停止）、G6（as any 类型弱）、G7（每轮重复发 existingContent）、G8（空局导出分支乱）、G9（本地推理无兜底）。

---

## 三、汇总

| 类别 | 数量 |
|------|------|
| IMP 清单合计 | **15** |
| ├ P0 阻断 | 2（R2-001 / R2-002） |
| └ P1 重要 | 13（R2-003 ~ R2-015） |
| 观察池 | 约 81 条（下轮复核） |
| 8 报告原始发现 | ≈ 96 条 |

**最高优先执行顺序（阶段三/四建议）**：
1. **R2-001 + R2-002（P0 世界卡）**：先把「15 类自动填表闭环」从声明变为现实（补 5 类枚举+映射 + 接线分类器 + 补主张级集成测试 + 修正 CHANGELOG）。
2. **R2-014 + R2-015（世界卡 P1 收口）**：category 上枚举白名单 + 收敛单一来源，防静默错分/错字持久化。
3. **R2-003 + R2-004（写章）**、**R2-005 + R2-006（故事线）**、**R2-007（伏笔）**。
4. **R2-008 + R2-009（导入导出）**、**R2-010（UI）**、**R2-011 + R2-012（监控）**、**R2-013（游戏）**。

---

## 四、诚实边界

- P0 两条（R2-001/002）已由 Chair 亲自 `grep` + 读 `entity-sync.ts` 源码验证，证据确凿，非 Agent 单方断言。
- 沙箱无 Chromium：纯浏览器视觉项（UI 对比度实际渲染、抽屉 inert 开合、Toast 动画、游戏导出界面）标注「需本地 `npm run dev` 目测」，未臆断。
- 各透镜报告的 P2 观察项多为个例/纯美化/需本地目测，本轮不升级为主线修复，诚实标注理由下轮复核。
- 代码执行阶段须过 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误 + `npm test` 全绿（当前基线 238 例）门禁，Chair 亲验 git diff，防假收敛。
