import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 显式声明 Turbopack 根目录，避免在上层目录发现多余 lockfile 时误判 workspace root
  turbopack: {
    root: process.cwd(),
  },
  // 允许通过 127.0.0.1 访问 dev 资源（HMR/webpack-hmr）。
  // Next.js 16 默认仅允许 localhost，用 IP 访问会被 CORS 拦截导致客户端无法 hydrate。
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  // better-sqlite3 是原生模块，必须排除在打包之外、运行时直接 require，否则构建/启动会失败
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
