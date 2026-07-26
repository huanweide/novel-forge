import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 显式声明 Turbopack 根目录，避免在上层目录发现多余 lockfile 时误判 workspace root
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
