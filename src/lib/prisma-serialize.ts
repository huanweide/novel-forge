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

// 递归：写入前把 serialized 字段的对象/数组序列化成字符串
function serialize(value: unknown): unknown {
  if (value && typeof value === "object") {
    if (Array.isArray(value)) return value.map(serialize);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applySerialization(client: any): any {
  return client.$extends({
    query: {
      $allModels: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async $allOperations({ args, query }: any) {
          const newArgs = serializeArgs(args);
          const result = await query(newArgs);
          return deserialize(result);
        },
      },
    },
  });
}
