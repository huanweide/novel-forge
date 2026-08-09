# 工作单元报告：一致性基线「人工纠错」（v1.6.51.6 / Next-2，v1.8 印章必需）

> 费曼式沉淀 · 零基础可读 · 瑞宝宝专属

## 一句话结论

把「AI 自动抽的设定集」升级成「人机共维护的权威设定集」：作者能**编辑 / 删除 / 手动新增**每一条一致性事实。这是 v1.8 印章的必需项（Next-1 已在 v1.6.51.5 完成）。本版**零数据库结构变更**——仅复用 `source` 字段标记「手动事实」，靠它让重抽不误删作者手填的设定。

---

## 一、干了什么

1. 后端加两个端点：
   - `POST /api/projects/[id]/consistency/manual` —— 手动新增一条事实（source 强制 `manual`）。
   - `PATCH/DELETE /api/projects/[id]/consistency/[factId]` —— 编辑 / 删除一条事实（带项目归属校验，越权返回 404）。
2. 抽出纯函数 `validateFactInput`（字段校验），新建和编辑两路由共用，单测 7 例锁死。
3. 面板 `ConsistencyPanel.tsx`：每条事实加「编辑 / 删除」按钮 + 行内表单；顶部加「新增」折叠表单；手动事实显示「手动」徽标。
4. **关键修复**：重抽（POST /consistency）从「全删全插」改成「只删自动抽取的事实」，手动事实不再被误删。
5. 升版本到 v1.6.51.6，写 changelog。

验证：tsc 0 错，vitest 40 文件 353 测试全过。

---

## 二、为什么这么做（底层原理）

**问题从哪来**：之前基线事实全是 AI 抽的，作者发现 AI 抽错了（比如把角色年龄抽成 18 但其实设定是 16）却**没法改**——只能眼睁睁看着错误设定被注入到后续生成提示词里，越错越离谱。一个「只读」的设定集对作者没用，作者需要能纠正它。

**为什么不自动改正文、却允许改基线**（第一性原理）：注意区分两层——
- 「生成的正文」是作者的创作成果，AI 不代笔（标红不改写铁律，见 v1.6.51.4/5）。
- 「基线设定集」是**工具自己的知识库**，本来就该准确。作者纠正知识库（把 18 改成 16）不是改创作，是修工具的记忆。这反而让后续生成更准，与「作者主权」不冲突。

**为什么用 `source` 字段标记手动事实、不新建字段**（第一性原理）：
- 手动事实的核心需求是「重抽时不要被删」。重抽是 `deleteMany + createMany`。只要在 deleteMany 加个条件 `source != 'manual'`，就能把手动事实排除在外。
- 新建一个布尔字段（如 `isManual`）也能做，但要改 schema + 迁移。而 `source` 字段本来就存在（记录事实来自哪一章/角色卡），把它的值约定为 `manual` 来标记，零迁移、零风险。能用现有字段解决，就别加新字段——这是 KISS 原则。

**类比**（秒懂）：
- 「一致性事实基线」= 一本**设定集**（主角几岁、什么发色、哪个门派）。之前只能 AI 往里写，作者不能改。
- 「手动事实 source=manual」= 作者拿红笔在设定集上改的那几行，打了个「我写的」印章。AI 每次重新整理设定集（重抽）时，看到印章就跳过、不擦掉。

---

## 三、方法 / 工具与效果

### 实施步骤（时间顺序）

| 步骤 | 动作 | 结果 |
|---|---|---|
| 1 | 读现有 `extractFacts.ts` / 路由 / 面板，摸清落点 | 发现重抽是「全删全插」，会误删手动事实 |
| 2 | **修重抽**：`deleteMany({ projectId, source: { not: "manual" } })` | 手动事实保留，致命 bug 提前堵住 |
| 3 | 写 `factValidation.ts` 纯函数 + 7 例单测 | 校验逻辑集中、可测，两路由复用 |
| 4 | 写 `manual/route.ts`（POST 新增） | 创建手动事实，source 强制 manual |
| 5 | 写 `[factId]/route.ts`（PATCH/DELETE） | 编辑/删除，带归属校验 |
| 6 | 改 `ConsistencyPanel.tsx`：编辑/删除/新增 UI | 端到端打通 |
| 7 | 升版 v1.6.51.6 + 双门禁 | tsc 0 + vitest 353 全过 |

### 关键代码（已实测）

```ts
// 重抽只清自动事实，保留手动事实（防误删）
await prisma.consistencyFact.deleteMany({ where: { projectId, source: { not: "manual" } } });

// 手动新增：source 强制 manual
const fact = await prisma.consistencyFact.create({
  data: { projectId: id, category, subject, attribute, value, source: "manual", confidence },
});

// 编辑/删除归属校验
const fact = await prisma.consistencyFact.findUnique({ where: { id: factId } });
if (!fact || fact.projectId !== id) return jsonError("事实不存在或无权访问", 404);
```

### 校验纯函数（两路由共用，7 例单测全过）
- 新建：subject/attribute/value 必填非空、category 必须枚举、confidence 必须 0~1。
- 编辑（allowPartial）：只传要改的字段，其余沿用当前值；传空串则回退当前值不报错。

---

## 四、关键取舍

**A. 为什么先修重抽、再写新功能？**
因为如果先写「手动新增」再发现重抽会把新增抹掉，等于白做。先堵致命 bug，功能才有意义。这是「诊断→修复→验证」铁律的体现：动笔前先把现有链路的危险点找出来。

**B. 用 `source='manual'` 而非新字段**
见上文第一性原理。零迁移是硬约束（线上 Neon 额度耗尽，靠本地 PG17 验证；能不 `prisma db push` 就不 push，降风险）。

**C. 删除加 `window.confirm` 二次确认**
事实删除不可恢复。侧栏按钮小、易误点，加浏览器原生确认框防手滑。轻量、零依赖。

**D. 编辑表单为何用「行内表单」而非弹窗**
侧栏空间窄，弹窗会挡视区、打断心流。点编辑就地展开输入框，改完收起，上下文不丢。符合「不空转、贴合创作者动线」。

**E. 踩坑实录（真实）**
- 面板初稿用了 `Icon name="edit"`，但图标库里编辑图标实际叫 `pencil`（之前 v1.6.51.3 踩过 `bookmark`≠`bookmarked` 的同款坑）。tsc 按 `IconName` 联合类型会直接报错。修复：核对 `icons.tsx` 实际 key，改用 `pencil`。
- 教训：**图标名以组件里的 keyof 联合类型为唯一真相**，不能凭记忆写，写完必过一遍 tsc。

---

## 五、可复现步骤（照做即得）

```bash
cd novel-forge
# 1. 跑本版新增校验单测（应 7/7 过）
npx vitest run src/core/consistency/factValidation.test.ts
# 2. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望 0 错
npx vitest run                            # 期望 40 文件全过
# 3. 面板操作：右侧栏「一致性基线」Tab → 点事实行「编辑/删除」或顶部「新增」
#    验证：手动新增后点「重抽」，手动事实仍在（不被删）
```

---

## 六、下一步（已排期）

- **Next-3（发布前可选打磨）**：成本 / 频率护栏——抽取按 subject+attribute 去重替代全清重插；后处理加闸门仅新章节确认 / 人工触发才重抽。
- **v1.8.0 印章** = Next-1（v1.6.51.5，已完）+ Next-2（本版，已完）完成且 tsc 0 / vitest 全绿 → **Next-2 完成即满足 v1.8 印章代码条件**，待 Next-3 打磨或直推 v1.8.0。
- 推送：TLS 代理 7897 恢复后一次性补推本地领先提交（v1.6.51 ~ v1.6.51.6），`git ls-remote origin main` 真查远程 HEAD 对账，绝不谎报。
