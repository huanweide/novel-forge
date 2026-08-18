// 幂等 seed 脚本：播种 17 个内置示范预设（与 /api/seed/presets 同源，单一数据源）
// 运行：npm run db:seed  →  prisma db seed  →  tsx prisma/seed.ts
//
// 说明：
// - Prisma CLI 运行 `db seed` 时会自动加载项目根 .env（含 DATABASE_URL）；
//   同时显式 import "dotenv/config"，以防脱离 prisma 直接 `tsx prisma/seed.ts` 时缺环境变量。
// - 用相对路径 import 生成客户端与 BUILTINS，避开 @/ 别名解析，使 tsx 可直接运行。
// - 幂等：每个预设按 { type, title, isBuiltin:true } 查重，已存在则跳过，可重复执行。
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { applySerialization } from "../src/lib/prisma-serialize";
import { BUILTINS } from "../src/lib/builtin-presets";

function createSeedClient() {
  const url = process.env.DATABASE_URL || "file:./data/novelforge.db";
  const dbPath = url.replace(/^file:/, "");
  const absPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  // 适配器内部按 url 打开本地 SQLite 文件（自动剥离 file: 前缀）
  const adapter = new PrismaBetterSqlite3({ url });
  return applySerialization(new PrismaClient({ adapter }));
}
const prisma = createSeedClient();

async function main() {
  let created = 0;
  let skipped = 0;
  for (const b of BUILTINS) {
    const exists = await prisma.preset.findFirst({
      where: { type: b.type, title: b.title, isBuiltin: true },
    });
    if (exists) {
      skipped++;
      continue;
    }
    const tags = Array.from(new Set([...(b.tags || []), "trirui推荐"]));
    // tags/content 是序列化字段（扩展在底层做 数组/对象 ↔ JSON 字符串 转换），此处直接传原始值
    await prisma.preset.create({
      data: {
        type: b.type,
        title: b.title,
        description: b.description || "",
        content: b.content || {},
        author: "trirui",
        tags,
        isBuiltin: true,
        isPublic: true,
      } as Record<string, unknown>,
    });
    created++;
  }
  console.log(
    `[seed] 内置预设播种完成：新增 ${created} 个，已存在跳过 ${skipped} 个，共 ${BUILTINS.length} 个。`,
  );
}

main()
  .catch((e) => {
    console.error("[seed] 失败：", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
