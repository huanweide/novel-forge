# round-17 改动方案 · 分类标签体系单一权威源治理

> 阶段二（评审收敛）+ 阶段三（方案）。Chair：千惠。日期：2026-08-12。

## 一、本轮聚焦范围（阶段二评审收敛）

上一轮 round-17 三透镜（classify / flow / ui）共 28 条发现。本轮按用户点名「分类标签」聚焦 P0 世界分类体系：

- **本轮做**：F-01（根因：世界分类多源 taxonomy 不通约）、F-02（`LORE_COLORS` 仅 11/15 缺 4 色）、F-03（`ChapterEntitiesPanel` 把 7 类吞进「其他」）。
- **转 round-18**：F-04（角色 role 3 处硬编码错标）、F-05（genre 3 套列表不同步）、flow-lens / ui-lens 其余项。

## 二、根因与权威源

`src/lib/world-category-classifier.ts` 的 `WorldCategory`（15 类）+ `ALL_WORLD_CATEGORIES` + `WORLD_CATEGORY_LABELS` / `WORLD_CATEGORY_SECTIONS`（均 `Record<WorldCategory,X>`，类型强制全覆盖）已是**成熟权威源**。F-01~F-03 的根因是 `entity-highlighter.ts` 与 `ChapterEntitiesPanel.tsx` 各自手抄 11/9 类、未从权威源派生——一旦增删分类，这三处必然漂移。

## 三、改动清单

### 3.1 src/core/entity-highlighter.ts
1. import 增加 `ALL_WORLD_CATEGORIES, type WorldCategory`。
2. `LORE_COLORS` 类型由 `Record<string,string>` 改为 `Record<WorldCategory,string>`，**原 11 色不变**，补全 `character_relationship / fate_system / physics / public_system` 4 色 → 类型系统强制 15 类全覆盖，漏一类 tsc 直接报错。
3. `WORLD_LEGEND_CATS` 由手抄 11 类数组改为 `[...ALL_WORLD_CATEGORIES]` 派生 → 图例自动覆盖 15 类。
4. `getCategoryColor` 内部索引加 `as WorldCategory` 兜底（保持 `string` 入参兼容调用方）。

### 3.2 src/components/workspace/ChapterEntitiesPanel.tsx
1. import `ALL_WORLD_CATEGORIES, WORLD_CATEGORY_SECTIONS`（classifier）+ `WORLD_MODULES`（worldPanelData，取 icon）+ `type IconName`。
2. 新增 `MODULE_ICON` 常量从 `WORLD_MODULES` 派生（分类→图标单一源）。
3. `buildGroups` 的 `groupDefs` 由「9 组手抄 + other 兜底吞一切」改为「character 组 + 遍历 `ALL_WORLD_CATEGORIES` 动态生成 15 组 + 仅兜底异常 category 的 other」→ 7 类不再被吞，且未来增删分类自动同步。

## 四、门禁（阶段五）

- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit --incremental false` → 期望 0 错。
- `npx vitest run` → 期望全绿（基线 513）。

## 五、升版（阶段六）

双 changelog 升 **v2.0.11**（根 `CHANGELOG.md` + `src/lib/changelog-data.ts` 三处：LATEST_VERSION / CHANGELOG_BRIEF / VERSIONS）。
