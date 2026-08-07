# UI 面板与逻辑诊断（v1.6.3 重构前核查）

> 替代「截屏核查」的说明：沙箱无图形界面，且当前模型对图片返回 `Content filtered`，
> 无法读取像素截屏。本报告以「源码精读 + dev server(3001) SSR DOM + 关键链路运行时核查」
> 替代，等价于看 DOM 结构与代码逻辑，而非看截图。所有结论均附 `文件:行号` 证据。

## 一、方法

1. 重启干净 dev server（释放占用 3001 的旧进程），curl 抓取 SSR HTML 确认渲染骨架。
2. 精读 14 个相关源文件，定位交互、状态、API 调用与显示名。
3. 追踪数据链路（schema 默认 → API 保存 → recall 过滤）验证「启用此词条」是否真正生效。

## 二、已确认问题（对应需求 #1–#6）

### 需求 #1：编辑面板 UI
- **杂乱词条（实锤）**：`magic_system` 分类在全站 90% 处叫「力量体系」，唯三处异名：
  - `src/components/workspace/LorebookEditDialog.tsx:114` 写成「魔法体系」
  - `src/app/api/generate/pre-write-cards/route.ts:224` 建议语写成「能力体系」
  - 其余（`worldPanelData.ts:9` / `types.ts:143` / `engine.ts:217` / `dissect/engine.ts:777` / `sync-global-prompt.ts:173` / `entity-highlighter.ts:294`）均为「力量体系」
  → 用户感知的「杂乱」即此三处不同名。
- **「注重方式」解释偏简**：即「记忆注入方式」（depth）。`LorebookEditDialog.tsx:126` 仅一句话，未说明各层级何时用。
- **「启用此词条」关闭是否生效**：链路核查确认端到端生效——
  - schema 默认 `enabled Boolean @default(true)`（`prisma/schema.prisma`）
  - 新建 `asBool(raw.enabled, true)`、更新 `body.enabled`（`src/app/api/lorebook/route.ts` / `[id]/route.ts`）
  - 注入过滤 `where: { projectId, enabled: true }`（`context-loader.ts:39`、`sync-global-prompt.ts`、`game-engine.ts`、`tool-registry.ts`）
  → 缺的仅是前端「已停用」视觉反馈（列表卡片无灰显/徽标）。

### 需求 #2：统一到角色面板标准
- 角色面板 `CharacterDialog.tsx` 为标准：Modal + Collapse 分节 + DialogField/DialogInput + AI填满 + 别名(aliases)。
- 故事线编辑弹窗结构接近但字段用原生 label/input，未用 DialogField/DialogInput；缺「主线/支线」标识。

### 需求 #3：角色合并逻辑（同人异称）
- 根因：`src/lib/entity-auto-creator.ts` 的 `isSimilarName` 仅识别「繁简/错别字变体」，
  完全不识别「同人异称」（韩先生/韩姓男子/韩某/老韩 这类尊称或描述变体）。
- 后果：自动建卡把「韩先生」与「韩立」建成两张卡；去重合并（`character-dedupe.ts`）也因 `isSimilarName` 返回 false 而不并。
- 风险点：若直接把同人异称塞进 `isSimilarName`，会污染实体高亮/召回链路（注释明确警告"不改动匹配链路"），
  且多同姓正主时会错并（韩先生 并入 韩雪）。→ 需用「唯一性闸门」消歧。

### 需求 #4：AI 助手认知与权限 —— 见后续 #650。

### 需求 #5：故事线与主线/支线任务 —— 见后续 #651。

### 需求 #6：写作与世界卡融合 + 14 类自动填表 —— 见后续 #652（14 类与现有 12 世界模块映射缺口：
③命运体系 ④物理列表 ⑤公开体系 无直接模块；⑬新加的世界 ⑭新加的故事线 无模块）。

## 三、本轮已修复（Wave 1 + #649）

| 改动 | 文件 | 验证 |
|---|---|---|
| `magic_system` 统一为「力量体系」（编辑框+建议语） | `LorebookEditDialog.tsx:114`、`pre-write-cards/route.ts:224` | tsc 0 |
| 「注重方式」补层级说明（常驻 vs 触发用法） | `LorebookEditDialog.tsx` | tsc 0 |
| 「启用此词条」加实时状态文案（已启用/已停用） | `LorebookEditDialog.tsx` | tsc 0 |
| 世界卡片「已停用」徽标 + 灰显 | `WorldEntryCard.tsx` | tsc 0 |
| 故事线全屏弹窗编辑/删除接通（传 handler 回左栏） | `StorylinesModal.tsx` + `StorylineList.tsx` | tsc 0 |
| 故事线编辑弹窗对齐角色面板（DialogField/DialogInput + 主线/支线徽标） | `StorylineList.tsx` | tsc 0 |
| 同人异称识别（尊称/描述变体 → 并入正主别名） | `entity-auto-creator.ts` 新增 `isHonorificVariant`/`samePersonByHonorific`/`coreSurname`/`resolveHonorificTarget` | 单测 16 项 |
| 自动建卡：同姓正主唯一时把变体并入别名（自动融合，无需手动） | `entity-auto-creator.ts` | 单测 |
| 去重合并：同人异称按唯一性闸门并入，主卡优先普通姓名 | `character-dedupe.ts` | 单测 |

**质量门禁**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` → 0 错误；`vitest run` → **227 passed**（原 217 + 新增 10 条同人异称用例）。

## 四、待续（未在本轮落地）

- #650 AI 助手实时认知与权限（读取 AIChatBar + chat 路由后实施）
- #651 故事线与主线/支线任务更新（填表确认进度）
- #652 写作模块与世界卡融合 + 14 类自动填表验证（含 14 类↔12 模块映射补全）
