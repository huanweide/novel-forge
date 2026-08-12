# round-18 方案与留痕（2026-08-12）

## 聚焦范围
本轮只做用户点名的「分类标签」硬伤：**F-04 角色 role 单源治理** + **F-05 题材 genre 单源对齐**。
flow-lens（续写静默交付 F1/F2、服务端自调用 origin 硬编码 F4）与 ui-lens 其余项（RefineDiffModal 无 focus-trap、虚拟滚动未接 WorldEntryList/CharacterList）留待后续子轮，不阻塞主循环。

## 根因
- **F-04**：角色 role 权威类型 `CharacterRole`（`src/core/types/index.ts:42`）是 **8 类**，但各 UI 组件手写「role→中文」三元表达式，且 `CHARACTER_ROLE_OPTIONS`（`src/lib/character-parse.ts`）漏 `comic_relief`，导致：
  - `DissectDimensions` / `ImportWizard` 把 `love_interest`/`catalyst`/`background`/`comic_relief` 全错标为「配角」；
  - `workshop` 角色定位下拉仅 2~3 个 option（缺其余 5 类）；
  - `CharacterList` 的 roleOrder/roleLabel、`CharacterFilters` 的筛选 chip 各维护一份不全映射。
- **F-05**：题材 `genre` 是自由 `string[]`（不可强枚举，否则破坏导入），但「题材名选项」散在两处——首页 `GENRE_TEMPLATES`（8 类，含西幻）与 explore `GENRE_OPTIONS`（12 类，含玄幻/奇幻/末世/游戏/军事，用奇幻而非西幻），两入口题材名不一致。

## 改动清单
### F-04 角色 role 单源治理
- `src/lib/character-parse.ts`：
  - `CHARACTER_ROLE_OPTIONS` 补 `{ value: "comic_relief", label: "喜剧担当" }`（对齐 8 类）；
  - 新增 `CHARACTER_ROLE_LABEL: Record<CharacterRole,string>`，由 `CHARACTER_ROLE_OPTIONS` reduce 派生——权威中文映射单一源。
- `src/components/dissect/DissectDimensions.tsx`：角色徽章改用 `CHARACTER_ROLE_LABEL[c.role]`，不再把非主角/反派/导师归「配角」。
- `src/components/editor/ImportWizard.tsx`：角色中文改用 `CHARACTER_ROLE_LABEL[char.role]`。
- `src/app/workshop/page.tsx`：角色定位下拉改为 `CHARACTER_ROLE_OPTIONS.map` 渲染全 8 类。
- `src/components/workspace/CharacterList.tsx`：roleOrder/roleLabel 由 `CHARACTER_ROLE_OPTIONS` 派生。
- `src/components/workspace/CharacterFilters.tsx`：筛选 chip 由 `CHARACTER_ROLE_OPTIONS` 派生（覆盖全 8 类）。

### F-05 题材 genre 单源对齐
- `src/core/explore/types.ts`：`GENRE_OPTIONS` 由 `GENRE_TEMPLATES.map(g=>g.name)` 并集补充项（玄幻/奇幻/末世/游戏/军事）派生，使 explore 建项目（被 `BuildConfigPanel`/`BuildConfigDialog` 共用）与首页选题卡片题材名一致。`GENRE_TO_TYPE` 装饰映射与 `genreMap` 关键词推断保留（派生逻辑，非选项列表）。

## 门禁
- `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`：0 错误。
- `npx vitest run`：59 文件 513/513 全绿。
- 无 Prisma schema 变更、无新依赖。

## 升版
- v2.0.12（双 changelog：根 `CHANGELOG.md` + `src/lib/changelog-data.ts`）。
