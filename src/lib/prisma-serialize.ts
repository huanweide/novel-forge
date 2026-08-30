/**
 * Prisma Client Extension —— 透明 JSON / 数组 序列化层
 *
 * 背景：原项目用 PostgreSQL，schema 大量使用 Json 与 String[]（标量数组）。
 * 为让 clone 后「零安装、无需 Docker」跑起来，数据层迁到本地 SQLite 文件库。
 * 但 Prisma 的 SQLite 连接器不支持 Json 与标量数组类型，于是：
 *   1) schema 里把这些字段统一改成 String；
 *   2) 本扩展在底层透明地做「对象/数组 ↔ JSON 字符串」转换，
 *      应用层那 ~80 个读写文件一行都不用改，从根上杜绝回归。
 *
 * 写入时：serialized 字段若传入对象/数组 → JSON.stringify 成字符串入库。
 * 读取时：serialized 字段若是从库里取出的字符串（且看起来像 JSON）→ JSON.parse 还原。
 */

// 所有原 Json / String[] 字段（schema 改为 String 后，由本扩展接管序列化）
const SERIALIZED_FIELDS = new Set<string>([
  // Project
  "llmConfig", "postProcessingRules", "customSafetyRules", "buildConfig", "appliedPresets",
  "genre", "toneKeywords",
  // CharacterCard
  "appearance", "personality", "dialogueStyle", "relationships", "timeline",
  "aliases", "abilities", "hiddenMotives", "tags",
  // CharacterCardRevision
  "mainBefore", "mergedBefore", "mainAfter", "mergedIds",
  // LorebookEntry
  "keys", "relatedEntryIds",
  // StoryNode
  "reviewLogs", "activeCharacters", "activeLoreIds",
  // ChapterSummary
  "characterStates", "eventImportances", "keyEvents",
  // PendingCommitment
  "entityIds", "closureConditions", "partiallyFulfilledIds", "statusHistory",
  // Storyline
  "sevenElements",
  // StorylineEvent
  "sourceRefs",
  // GenerationTask / ImportTask / FillTask
  "result",
  // GameState
  "options", "entities", "items",
  // Rule
  "scopeConfig",
  // StyleCard
  "tonalMarkers", "lexicalFeatures",
  // DissectionTask
  "dimensions", "chapterList",
  // LoreTable
  "columns", "rows",
  // BabyloreFillBatch
  "insertedRowIds", "updatedRowsBefore",
  // Preset
  "content",
  // ChatSession
  "messages",
]);

function isSerialized(key: string): boolean {
  return SERIALIZED_FIELDS.has(key);
}

/**
 * 是否为「必须原样透传、禁止递归重建」的不透明值。
 *
 * v3.1.54 P0 修复：原实现对任何 typeof === "object" 都用 Object.keys 重建，
 * 而 Date / Buffer / Decimal / RegExp 这类内建对象的自有可枚举键为空，
 * 重建结果恒为 {} —— 直接后果：
 *   · 写入：`data: { updatedAt: new Date() }` 变成 `{ updatedAt: {} }`
 *     → Prisma 报 "Expected DateTime, provided Object"（chat-sessions 测试即因此挂）。
 *   · 读取：库里取出的 createdAt/updatedAt 被抹成 {}，
 *     → /api/projects 返回 "updatedAt":{}，前端 new Date({}) = Invalid Date，
 *       首页卡片时间显示 "Invalid Date"。
 *
 * 采用「精确黑名单」而非「plain object 白名单」：Prisma 返回的 model 对象在不同
 * 版本/适配器下原型未必是 Object.prototype，用白名单会让反序列化整体失效。
 */
function isOpaque(value: object): boolean {
  return (
    value instanceof Date ||
    value instanceof RegExp ||
    value instanceof Map ||
    value instanceof Set ||
    ArrayBuffer.isView(value) || // Buffer / Uint8Array 等 TypedArray
    value instanceof ArrayBuffer ||
    // Prisma Decimal 及其他自带 toFixed/toJSON 的数值包装类型
    typeof (value as { toFixed?: unknown }).toFixed === "function"
  );
}

// 递归：写入前把 serialized 字段的对象/数组序列化成字符串
function serialize(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(serialize);
    // Date / Buffer / Decimal 等一律原样透传，禁止重建（否则被抹成 {}）
    if (isOpaque(value)) return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const val = (value as Record<string, unknown>)[key];
      if (isSerialized(key) && val != null && typeof val !== "string") {
        out[key] = JSON.stringify(val);
      } else {
        out[key] = serialize(val);
      }
    }
    return out;
  }
  return value;
}

// 递归：读取后把 serialized 字段的字符串（看起来像 JSON）还原成对象/数组
function deserialize(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(deserialize);
    // 同 serialize：Date（createdAt/updatedAt/deletedAt…）等必须原样返回
    if (isOpaque(value)) return value;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      const val = (value as Record<string, unknown>)[key];
      if (
        isSerialized(key) &&
        typeof val === "string" &&
        (val.startsWith("{") || val.startsWith("["))
      ) {
        try {
          out[key] = JSON.parse(val);
        } catch {
          out[key] = val;
        }
      } else {
        out[key] = deserialize(val);
      }
    }
    return out;
  }
  return value;
}

// 写入类操作的负载键：create / update / data（含数组批量）
// 注意 Prisma 的 upsert 用 create+update，而非 data；createMany 用 data 数组。
function serializeArgs(args: Record<string, unknown>): Record<string, unknown> {
  if (!args) return args;
  const newArgs = { ...args };
  for (const key of ["data", "create", "update"] as const) {
    if (key in newArgs && newArgs[key] !== undefined) {
      const value = newArgs[key];
      newArgs[key] = Array.isArray(value)
        ? value.map((v) => serialize(v))
        : serialize(value);
    }
  }
  return newArgs;
}

/**
 * 给 PrismaClient 挂上透明序列化扩展。
 *
 * v3.1.54 P0 修复：原签名是 `(client: any): any`，返回 any 会把整个数据层的类型
 * 推导全部擦除——`prisma.project.findMany()` 退化成 any，于是所有
 * `.filter((c) => …)` 的回调参数变成隐式 any（126 处 TS7006）、
 * `.aliases` 之类属性访问变成「属性不存在于 {}」（29 处 TS2339），
 * 最终让 `next build` 在 TypeScript 阶段直接失败，项目无法产出生产构建。
 *
 * 本扩展只改运行时行为、不改 schema 形状，因此返回原 client 类型 T 是准确的：
 * 既保住类型推导，又不影响序列化逻辑。
 */
export function applySerialization<T>(client: T): T {
  return (client as { $extends: (ext: unknown) => unknown }).$extends({
    query: {
      $allModels: {
        async $allOperations({
          args,
          query,
        }: {
          args: Record<string, unknown>;
          query: (a: Record<string, unknown>) => Promise<unknown>;
        }) {
          const newArgs = serializeArgs(args);
          const result = await query(newArgs);
          return deserialize(result);
        },
      },
    },
  }) as T;
}
