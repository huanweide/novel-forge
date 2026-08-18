import { PrismaClient } from "@/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { applySerialization } from "./prisma-serialize";

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
  const base = new PrismaClient({ adapter });
  return applySerialization(base);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
