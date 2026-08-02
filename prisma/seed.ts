// 幂等 seed 脚本：播种 16 个内置示范预设（与 /api/seed/presets 同源，单一数据源）
// 运行：npm run db:seed  →  prisma db seed  →  tsx prisma/seed.ts
//
// 说明：
// - Prisma CLI 运行 `db seed` 时会自动加载项目根 .env（含 DATABASE_URL）；
//   同时显式 import "dotenv/config"，以防脱离 prisma 直接 `tsx prisma/seed.ts` 时缺环境变量。
// - 用相对路径 import 生成客户端与 BUILTINS，避开 @/ 别名解析，使 tsx 可直接运行。
// - 幂等：每个预设按 { type, title, isBuiltin:true } 查重，已存在则跳过，可重复执行。
import "dotenv/config";

import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { BUILTINS } from "../src/lib/builtin-presets";

const poolConfig = {
  connectionString: process.env.DATABASE_URL!,
  max: Number(process.env.PRISMA_POOL_MAX ?? 10),
  idleTimeoutMillis: 30_000,
  allowExitOnIdle: true,
};
const prisma = new PrismaClient({ adapter: new PrismaPg(poolConfig) });

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
      },
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
