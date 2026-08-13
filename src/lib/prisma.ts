import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // Prisma 7 直连：通过 @prisma/adapter-pg 的 PrismaPg 适配器提供数据库连接，
  // 连接串从环境变量 DATABASE_URL 读取（由 Next.js 运行时注入）。
  // 注意：Prisma 7 已移除 schema 里的 `url` 与构造函数里的 `datasources` 选项，
  // 直连必须改用 adapter。
  const adapter = new PrismaPg(process.env.DATABASE_URL ?? "");
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
