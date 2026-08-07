# Round-2 复检整合报告（阶段五 · 防假收敛）

> 日期：2026-08-07
> 主持：Chair（千惠 / tri）
> 方法：8 个独立复检子 Agent 平行，对 R2-001~015 共 15 条修复做「真生效」验证（Grep + Read 改后源码 + 实跑针对性测试），并深挖 round-2 透镜未发现的新坑。
> 结论：15 条修复**全部代码落地**；其中 R2-007 部分失效、R2-012 含功能退化；其余 13 条真生效。复检共挖出约 63 个新坑，按严重度分级后作为 round-3 输入。

---

## 一、R2 修复验证结论总表

| 编号 | 领域 | 原严重度 | 复检结论 | 关键证据 |
|------|------|----------|----------|----------|
| R2-001 | 世界卡 | P0 | ✅ 生效 | entity-sync.ts 顶部 import 分类器并在 custom 分支调用 |
| R2-002 | 世界卡 | P0 | ✅ 生效 | type 枚举补 5 类 + TYPE_TO_CATEGORY 补 5 映射；entity-sync.test.ts 主张级测试通过 |
| R2-003 | 写章 | P1 | ✅ 生效 | refine/continue 补传 source 字段，溯源链闭合 |
| R2-004 | 写章/UI | P1 | ✅ 生效 | page.tsx 新增 `localStorage.setItem("pregen-conf-"+id)` 写入端，键名一致 |
| R2-005 | 故事线 | P1 | ✅ 生效 | generate/route.ts mainId 解析加 `status!=="completed"` |
| R2-006 | 故事线 | P1 | ✅ 生效 | outline-context.ts mainTitleById 映射 + 支线追加「隶属主线」；单测 5/5 |
| R2-007 | 实体/伏笔 | P1 | ⚠️ 部分生效 | auto-confirm/手动/游戏导出闭环；**批量确认 + refine 确认两条漏斗未触发 detect**；detect 自调用有静默失败风险 |
| R2-008 | 导入导出 | P1 | ✅ 生效 | 后端 400 + 前端 toastWarning + page 暴露全节点类型三层拦截（仅「选空正文章」边缘残留） |
| R2-009 | 导入导出 | P1 | ✅ 生效 | import/route.ts 结构化错误细化；route.test.ts 2 项 + 临时 5 项通过 |
| R2-010 | UI | P1 | ✅ 生效（残留） | 深色 muted 改 #8E8B82，弹窗 4.86/卡片 4.83/纯底 5.39 ≥4.5；**surface-3 仍 4.25（UI-002 残留）** |
| R2-011 | 监控 | P1 | ✅ 生效 | audit-api-refs.cjs 实跑 REAL_BROKEN_LINKS=0，模板跳过 70 + 文档白名单 1 + FS 动态发现 |
| R2-012 | 监控/写章 | P1 | ⚠️ 主体生效·含退化 | 轻量 select + 按需拉正文落地；**多卷项目前文上下文截断 + keepWindow/章序号不对齐回归** |
| R2-013 | 游戏 | P1 | ✅ 生效 | resetGameSession 重拍实时 node.content 为快照；21 测试绿（不覆盖该函数，缺针对性单测） |
| R2-014 | 世界卡 | P1 | ✅ 生效（实现出入） | lorebook/route.ts 用 Set 校验（非清单描述的 z.enum）拒绝非法 category + 配套测试 4/4；功能达成但有出入 |
| R2-015 | 世界卡 | P1 | ✅ 生效 | LorebookEditDialog 分类下拉完全由 WORLD_MODULES 派生；pre-write-cards 由 ALL_WORLD_CATEGORIES 派生；无硬编码残留（tool-registry 四份 enum 单一来源仍残余） |

**生效判定**：13 条完全生效，2 条（R2-007 / R2-012）部分生效或含退化，需在 round-3 收口。

---

## 二、新坑汇总（按严重度分级，共约 63 条）

### 🔴 严重 / HIGH（round-3 必须处理）

1. **【worldcard·严重静默失败】** `src/lib/sync-global-prompt.ts:170` 的 `catOrder` 仅列 8 类世界卡，缺 magic_system/culture/history/law/currency/fate_system/physics/public_system 中至少 7 类 → R2-002 写库的正确分类在「生成侧全局提示」被丢弃，世界卡内容不被注入写作上下文。这是 R2-002 的「最后一公里」断点，必须补 catOrder 与分类器对齐。
2. **【io·HIGH】** 选非根节点（如单独选某章 section）导出仍静默生成空文件——R2-008 的 400 拦截只覆盖「全空」，未覆盖「选中节点无正文章」场景。
3. **【writing·HIGH】** NEW-1 续写（continue）章号不递增：order 字段在续写路径未 +1，导致章节顺序错乱。
4. **【entity·R2-007 部分失效】** 批量确认（batch confirm）与 refine 确认两条漏斗未触发 `/api/foreshadowing/detect` → 伏笔面板在批量/润色场景下仍不随写章更新。
5. **【monitor·R2-012 退化】** 多卷项目前文上下文被 keepWindow 截断，长项目跨卷衔接丢失；keepWindow/章序号不对齐导致补拉的正文错位。
6. **【ui·UI-002 残留】** `--nv-surface-3` 上 muted 文字对比度仍 4.25 < 4.5（AA），R2-010 只修了默认 surface。

### 🟠 MEDIUM（round-3 视容量处理）

7. **【storyline·N1】** orchestrator 用不存在的 `completed` 字段做死过滤，部分活跃主线被误排除。
8. **【storyline·N2】** 多主线场景 StorylineList 只渲染第一条主线，新活跃主线被吞且误归属。
9. **【storyline·N3】** 删除主线不清理子线，悬空 parentId 指向已删主线。
10. **【storyline·N4】** newMain 流旧支线未重挂，隶属关系静默丢失。
11. **【writing·NEW-2】** 大纲路径主线筛选混用 status/type，与 generate 路径不一致。
12. **【writing·NEW-3】** continue 的 order 重复，并发续写会撞 order。
13. **【game·A/B/C】** 重开与在途回合竞态崩溃、并发回合 round 冲突丢轮、实体状态面板不一致。
14. **【monitor·误报漏检】** audit-api-refs.cjs 仍有 3 处潜伏误报/漏检（动态发现未覆盖某些前端动态 import）。

### 🟡 LOW / 残余（观察池，下轮复核）

15. **【storyline·N5/N6】** loadOutlineData 的 status 过滤混入无效枚举 "main"；AI 返回零主线时支线 parentId 全空且无重复主线校验。
16. **【writing·NEW-4/NEW-5】** 剧情线 completed 死过滤、refine 空节点 mode 歧义。
17. **【ui·NEW-UI x3】** tool-registry 四份 enum 单一来源残余、下拉派生仍有边角、toast 触发遗漏。
18. **【game·D/E/F】** reset 非事务空窗、item 世界卡跨局残留、autosave 时序隐性依赖。
19. **【worldcard 残余】** 多源分类漂移（分类器 / TYPE_TO_CATEGORY / tool-registry / PUT 路由绕过白名单）。

---

## 三、Round-3 候选清单（优先收口严重/HIGH + 部分失效项）

| 优先级 | 项 | 说明 | 对应复检 |
|--------|----|------|----------|
| P0 | catOrder 补 7 类 | 修 sync-global-prompt.ts:170，对齐分类器，打通 R2-002 最后一公里 | worldcard |
| P0 | R2-007 收口 | batch confirm + refine confirm 漏斗补触发 detect；detect 自调用加失败日志/重试 | entity |
| P1 | io 空导出边角 | 选中无正文章节点也拦截/提示 | io |
| P1 | writing 续写章号 | continue order +1 修复 | writing |
| P1 | R2-012 退化修复 | 多卷前文不截断 + keepWindow/章序号对齐 | monitor |
| P1 | ui surface-3 | muted 在 surface-3 也达 AA | ui |
| P2 | storyline N1~N4 | 主线过滤/多主线渲染/删除清理/旧支线重挂 | storyline |

---

## 四、复检员诚实声明汇总

- **已真跑测试验证**：R2-002（entity-sync.test 9/9）、R2-006（5/5）、R2-009（import route.test 2+5）、R2-011（脚本实跑 0 断链）、R2-013（game-engine.test 21/21）、R2-014（lorebook route.test 4/4）。
- **仅静态闭环推演（待实机）**：R2-003/004/005/010/012/015 的端到端运行效果依赖真实 LLM/DB/浏览器，复检员已标注「未经实测，待验证」。
- **缺针对性单测**：R2-007 的 skipDetect 逻辑、R2-013 的 resetGameSession 重写均未被现有测试覆盖，仅 21/21 绿但不命中该函数——round-3 应补针对性测试。

> 本报告与 8 篇 `lens-*.md` 复检详报共同构成 round-2 阶段五留痕。Round-3 修复后将再次进入复检循环。
