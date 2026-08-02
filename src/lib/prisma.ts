import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // BE-6：显式设连接池上限，避免高并发流式请求下连接耗尽（PrismaPg 底层 pg.Pool）。
  // 默认 10（与 pg 默认一致），可用 PRISMA_POOL_MAX 调大；idleTimeout 让空闲连接及时回收。
  const poolConfig = {
    connectionString: process.env.DATABASE_URL!,
    max: Number(process.env.PRISMA_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
  };
  const adapter = new PrismaPg(poolConfig);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
