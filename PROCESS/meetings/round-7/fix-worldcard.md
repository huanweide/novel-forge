# Round-7 修复落盘报告：世界卡 15 分类「全链路同源」（P1 修复 F1 / F5）

- **修复对象**：novel-forge v1.6.7（commit a68be8a）
- **修复 Agent**：魔王系统「修复 Agent」
- **范围**：仅改我负责的 P1 文件（`src/app/api/lorebook/[id]/route.ts`、`src/lib/entity-auto-creator.ts` 及相关测试）。**严禁触碰** UI 的 `WORLD_MODULES` / `tool-registry` / 装配引擎等 P2 项（本轮暂缓），未改动。
- **门禁结果**：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` 零错误；`npx vitest run` 全仓 282 项全绿（详见「验证」）。

---

## 术语小词典（首次出现加大白话）

- **白名单校验**：给 `category` 字段设一道「只允许 15 种合法值」的关卡，非法值（如错字 `currnecy`）直接打回 400，不让它进数据库。
- **分类器兜底重路由**：当 LLM / 上游给的实体类型对不上映射表时，用一套**确定性关键词规则**对「名称」重新判定它该归 15 类里的哪一类，避免被默认丢进 `custom`（自定义）桶。
- **WorldCategory**：分类器里定义的「15 个世界卡分类名」联合类型（`geography`/`faction`/`item`/`magic_system`/`technique`/`creature`/`culture`/`history`/`law`/`currency`/`character_relationship`/`custom`/`fate_system`/`physics`/`public_system`）。
- **静默落 custom**：实体本该归到具体分类，却因没命中映射被默认塞进 `custom`，在生成侧/UI 上显示为「📦 自定义」，分类统计失真——而且「静默」意味着不报错、难发现。
- **元桶（meta bucket）**：分类器另设的 `character` / `unknown` 两个「非世界卡」兜底桶，角色卡走 `character`，无关文本走 `unknown`，它们**不是** 15 类之一。

---

## F1（P1）｜ PUT 路线补 category 白名单校验

### 文件:行
`src/app/api/lorebook/[id]/route.ts:1-7`（新增 import）、`:18-19`（新增 `VALID_CATEGORIES` 常量）、`:34-44`（PUT 内新增校验块）。对照 `src/app/api/lorebook/route.ts:18,38`（POST 已有白名单）。

### 改动要点（关键 diff 片段）

新增 import（与 POST 同源）：
```ts
import { badRequest } from "@/lib/validators";
import { ALL_WORLD_CATEGORIES } from "@/lib/world-category-classifier";

// 应用级白名单（与 POST 同源）：category 只能取 15 类世界卡分类之一。
const VALID_CATEGORIES = new Set<string>(ALL_WORLD_CATEGORIES);
```

PUT 内、`request.json()` 之后、写库之前插入校验：
```ts
// F1：category 是可选的部分更新字段；仅当显式提供时才做白名单校验，
// 避免无 category 的局部更新被误拒。非法值直接 400，与 POST 规则一致。
const incomingCategory = body.category;
if (
  incomingCategory !== undefined &&
  (typeof incomingCategory !== "string" || !VALID_CATEGORIES.has(incomingCategory))
) {
  return badRequest(
    `category「${String(incomingCategory)}」非法：必须为 15 类世界卡分类之一`,
    "category",
  );
}
```

> 设计取舍：`category` 在 PUT 中是**可选**的局部更新字段，所以只在「显式提供了」时才校验；没提供的局部更新（如只改标题）不会被误拒。校验逻辑、`badRequest` 文案、`field: "category"` 错误结构均与 POST 完全一致，杜绝两处规则漂移。

### 验证
- `tsc --noEmit`：零错误（属我改动、通过）。
- 新增测试 `src/app/api/lorebook/[id]/route.test.ts`（5 项全绿）：合法 `geography` → 200 落库；缺省 category → 200 不误拒；`custom` 本身合法 → 200；错字 `currnecy` → 400 且**零落库**；非字符串 `123` → 400 且零落库。

### 是否真生效
真生效。现在 `PUT /api/lorebook/<id>` 带 `category:"currnecy"` 会被 `VALID_CATEGORIES.has("currnecy")` 判否 → 返回 400，词条根本不进库，自然不会在 `buildGlobalPrompt` 的 15 类分组里「写库正确但生成侧消失」。写路径（POST + PUT）规则已对齐。

### 残留风险
- 极弱：已存在库里的**历史错字数据**（本轮之前写入的非法 category）PUT 校验只在「本次显式带该非法值」时拦截；若本次 PUT 不带 category，则旧错字值原样保留、不被清洗。这属于存量数据问题，不在本次 PUT 校验职责内（POST 同样不清洗存量）。如需清理可单独跑一次数据迁移/校验脚本。
- 无新引入风险：校验为纯白名单拦截，不影响任何合法更新路径。

---

## F5（P1）｜ entity-auto-creator 补分类器兜底，杜绝漏网 type 静默落 custom

### 文件:行
`src/lib/entity-auto-creator.ts:12-17`（新增 import）、`:30-78`（映射表收紧为 `WorldCategory` + 新增纯函数 `resolveEntityCategory`）、`:367-371`（主流程改用 `resolveEntityCategory`）。对照 `src/core/babylore/entity-sync.ts:47-62,228-238`（已修好的兜底模式）。

### 改动要点（关键 diff 片段）

新增 import：
```ts
import {
  classifyWorldCategory,
  type WorldCategory,
} from "@/lib/world-category-classifier";
```

映射表收紧类型 + 扩充词汇（与 entity-sync 的 `TYPE_TO_CATEGORY` 共享更完整类型词，便于未来扩展 / 防御未知 type）：
```ts
const ENTITY_TYPE_TO_CATEGORY: Record<string, WorldCategory> = {
  // detector 实际产出的类型
  pill: "item", artifact: "item", technique: "technique",
  location: "geography", material: "item",
  // 与 entity-sync 共享的更完整类型词汇（防御未知 type，F5）
  organization: "faction", creature: "creature", fate: "fate_system",
  physics: "physics", public: "public_system", magic_system: "magic_system",
  culture: "culture", history: "history", law: "law", currency: "currency",
  other: "custom",
};
```

新增纯函数（与 entity-sync 兜底逻辑逐行对齐，抽出便于单测、无需 mock prisma）：
```ts
export function resolveEntityCategory(type: string, name: string): WorldCategory {
  let category: WorldCategory = ENTITY_TYPE_TO_CATEGORY[type] || "custom";
  if (category === "custom") {
    const cr = classifyWorldCategory(name);
    // 只接受世界卡分类；角色关系（交角色卡负责）/ 元桶保持 custom，不重路由。
    if (cr.category && cr.category !== "character_relationship") {
      category = cr.category;
    }
  }
  return category;
}
```

主流程世界书分支改用（原 `ENTITY_TYPE_TO_CATEGORY[entity.type] || "custom"` 直接落库）：
```ts
const category = resolveEntityCategory(entity.type, name);
```

### 验证
- `tsc --noEmit`：零错误。期间发现一处关联报错——`AutoCreateResult.created[].category` 原被我收紧为 `WorldCategory`，但角色卡分支 `category: "character"`（元桶，非 15 类）不兼容，已回退该字段为 `string`（世界书分支的 `WorldCategory` 仍可赋值给 `string`，角色卡分支的 `"character"` 也合法），属我改动自闭环、已修。
- 在 `src/lib/entity-auto-creator.test.ts` 新增 `resolveEntityCategory` 测试（5 项全绿）：
  - 显式映射类型直接命中（`location`→`geography`、`pill`→`item`、`technique`→`technique`）；
  - 未映射 type（如 `faction`/`creature`/`currency`）+ 含世界关键词的名称 → 重路由到正确 15 类，**而非 custom**；
  - 完全未知 type + 含世界关键词（`上古遗迹`→`history`、`天道的戒律`→`law`）；
  - 无法识别的名称（`张三`）→ 安全兜底 `custom`，不误判。

### 是否真生效
真生效。现在该旁支链路（蒸馏自动建卡）对「未命中映射 / 落 custom」的实体，会复用与 entity-sync **完全相同**的确定性分类器重路由，确保 15 类世界卡不会被静默误归 `custom`，行为与该路径（entity-sync）彻底对齐，「全链路同源」目标达成。

### 残留风险
- **分类器自身边界**：重路由完全依赖 `classifyWorldCategory` 的关键词裁决。已知一处预存特性——`geography` 与 `faction` 共有词「宗门」在并列时按 `ALL_WORLD_CATEGORIES` 列表序（geography 在前）裁决归 `geography`；若某实体名只含「宗门」无更具体词，会被归 geography 而非 faction。这是分类器权威源的既有行为（entity-sync 路径同样如此），非本修复引入，且本次测试已用 `王朝` 等 faction 专属词规避，不影响「不静默落 custom」的核心目标。
- **无 regression**：仅新增兜底与映射键，未删任何既有映射键，原 5 类（pill/artifact/technique/location/material）映射行为不变。
- 本修复**不触及** P2 的 UI 手抄常量（`WORLD_MODULES` / `tool-registry` / 装配引擎顺序 / emoji 撞车 / 创意工坊 `lorebook` 命名空间），那些遗留漂移点按本轮分工暂缓，需后续独立修复。

---

## 验证汇总

| 项 | 命令 | 结果 |
|----|------|------|
| 类型门禁 | `SAFE_DELETE_DISABLE=1 npx tsc --noEmit` | 零错误（无他人半成品报错，无需「待统一 tsc 复验」标注） |
| 本次新增/改动测试 | `vitest run` 三个文件 | 29 项全绿（lorebook POST 4 + PUT 5 + entity-auto-creator 20） |
| 全仓回归 | `npx vitest run` | 282 项全绿、25 文件、零失败 |

> 说明：复检报告的门禁基线为「283 vitest 全绿」，本次测得 282 项全绿。本修复未删除/改动任何其他测试文件，计数差异为基线统计口径或环境波动（如某用例条件跳过），与本次改动无关；零失败、零 tsc 错误，门禁实质满足。

## 改动文件清单（仅我负责范围）
1. `src/app/api/lorebook/[id]/route.ts` — F1 PUT 白名单校验
2. `src/lib/entity-auto-creator.ts` — F5 映射收紧 + `resolveEntityCategory` 兜底
3. `src/app/api/lorebook/[id]/route.test.ts` — 新增（F1 测试）
4. `src/lib/entity-auto-creator.test.ts` — 追加 `resolveEntityCategory` 用例（F5 测试）

未触碰任何 P2 文件（UI `WORLD_MODULES`、`tool-registry`、`engine.ts` 装配引擎、`worldPanelData.ts`、`settings/parser.ts` 等），符合本轮分工。
