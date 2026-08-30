import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  // DATABASE_URL 形如 file:./data/novelforge.db；适配器会按 url 打开本地 SQLite 文件
  //（自动剥离 file: 前缀），无需 Docker / 外部 Postgres。
  const url = process.env.DATABASE_URL || "file:./data/novelforge.db";
  const dbPath = url.replace(/^file:/, "");
  const absPath = path.isAbsolute(dbPath)
    ? dbPath
    : path.resolve(process.cwd(), dbPath);
  // 确保数据目录存在（better-sqlite3 只建文件、不建目录）
  fs.mkdirSync(path.dirname(absPath), { recursive: true });
  const adapter = new PrismaBetterSqlite3({ url });
  // v3.1.55：schema 已把 52 个原 Json / 标量数组字段改回原生 Json 类型，
  // 由 Prisma 自己负责 parse / stringify，不再需要 prisma-serialize 扩展 ——
  // 若继续挂载该扩展，对象会先被扩展 stringify 一次、再被 Prisma stringify 一次，
  // 造成双重编码（读出来是「字符串里的 JSON」，而非对象）。
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
