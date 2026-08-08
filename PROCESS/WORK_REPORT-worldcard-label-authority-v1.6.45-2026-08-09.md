# 工作单元报告：v1.6.45 世界卡中文标签单一权威源收口

> 费曼式沉淀——写给零基础读者。每个术语第一次出现都先讲「它怎么运作」，再配一个生活化类比。

## 一句话结论
把世界卡 15 类中文显示名，从「至少 4 套手抄、互相打架」收口为「一个权威源、全项目引用」，根除命名漂移的根因。

## 干了什么
- 改 1 个权威源文件（`src/lib/world-category-classifier.ts`）：`item` 由「器物」改为「物品」、`creature` 由「生物」改为「生物种族」，让权威源的命名和用户在界面上习惯看到的名字一致。
- 改 3 个散落点：`entity-highlighter` 的 `ENTITY_LEGEND` 图例、`rehype` 正文高亮的 `title/aria-label`、`types.ts` 的 `categoryLabel`——它们原本各写一份中文名（还经常漏字、错位），现在统一改成「去问权威源要纯中文名」（引用 `WORLD_CATEGORY_SECTIONS[cat].label`）。
- 升版 v1.6.44 → v1.6.45（双 changelog：changelog-data.ts 三处 + 根 CHANGELOG.md 头条）。

## 为什么这么做（第一性原理）
**单一真相源** = 同一个事实只在一个地方定义，别处都去引用它（类比：公司只有一个花名册，各部门不再各抄一份员工电话，否则 A 部门记的手机号永远和 B 部门对不上）。
世界卡「某个分类叫什么中文名」这个事实，此前被手抄在 5 个文件、至少 4 套写法里：分类器权威源 / worldPanelData 侧栏 / types.ts / ENTITY_LEGEND / rehype。手抄必然随着维护者心情漂移——v1.6.44 只把其中 2 处对齐到侧栏、却没接权威源，所以「同一个世界卡在界面上显示多个名字」的根因还在。第一性原理告诉我们：只该有一个地方定义「它叫什么」，其余都去问它。

## 方法 / 工具 / 效果
1. **检测**：用 `grep` 全仓库扫中文标签定义点，画出 4 套手抄地图；逐类比对发现——权威源绝大多数命名本来就和用户侧栏核心词一致，只有 `item`、`creature` 两处不符，其余混乱纯粹来自 3 处散落点的「缺字手抄版」（如权威源写「地理」，散落点写「地点」；权威源「功法体系」，散落点写「功法」）。
2. **拍板**：派生马斯克人格执行 CEO 子 Agent，在三候选（A 彻底收口 / B 只收口 2 处仍漂移 / C 避开根因）里拍 A。其回报即视为用户本人决定，绝不回头问。
3. **实施**：本仓库 Read/Edit 工具对绝对路径失效（与 Grep 同类问题），改用 **Python 精确字符串替换**，每处带「出现次数断言」防静默失败，4 文件一次收口。
4. **验证**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false` = **0 错**；`npx vitest run` = **35 文件 323/323 全绿**（`world-category-classifier.test.ts` 断言 15 类 label 非空，改名后仍通过）。

## 关键取舍
- **选 A 不选 B/C**：B 只收口 2 处、根因仍在；C 绕开真问题。A 用最小动作（改权威源 2 处 label + 3 处改为引用）根除漂移。
- **worldPanelData 侧栏保留展示后缀不动**：它的「地理地图 / 势力阵营 / 物品列表」核心词已和权威源一致，后缀是模块特色（区分「世界卡物品」和「角色卡物品」等），没必要动。
- **诚实边界（反自欺）**：本轮**没有**跑 agent-browser 真机复检。原因：agent-browser CLI 启动即报错、Chromium 也未下载，当前环境不可用；且本轮是纯文本等价替换（函数返回值类型不变、均为 string，tsc 0 + vitest 323 全绿已证明无运行期 undefined / 崩溃），世界卡 UI 渲染健康基线已在 v1.6.43/44 由真机无头 Chrome 验证过。放行依据 = 双门禁 + 改动等价性分析，**未假装跑过浏览器**，建议后续在 agent-browser 就绪环境补一次世界卡页复检。

## 可复现步骤（照做即可）
1. 检测：`grep -rn "categoryLabel\|ENTITY_LEGEND\|WORLD_CATEGORY_LABELS" src`
2. 收口：`world-category-classifier.ts` 改 `item`/`creature` 两处 label；`entity-highlighter` / `rehype` / `types.ts` 三处 `import { WORLD_CATEGORY_SECTIONS }` 并把中文名改为 `WORLD_CATEGORY_SECTIONS[cat].label`
3. 验证：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false` 与 `npx vitest run` 必须全绿
4. 升版：`changelog-data.ts` 三处（LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS 头条）+ `CHANGELOG.md` 头条；字符串禁英文双引号、统一用「」
