import { defineConfig } from "vitest/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "src/**/[[]*[]]/**/*.test.ts",
      "src/**/[[]*[]]/**/*.test.tsx",
    ],
    // 组件测试文件顶部用 `// @vitest-environment jsdom` 单独切换环境，
    // 其余纯逻辑测试保持 node 环境；setupFiles 注册 jest-dom 匹配器。
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary"],
      reportsDirectory: "./coverage",
      // v2.18：纳入前端组件（角色管理 UI），此前仅覆盖 core/lib 纯逻辑层
      include: ["src/core/**/*.ts", "src/lib/**/*.ts", "src/components/workspace/**/*.tsx"],
      exclude: [
        "**/*.test.ts",
        "**/*.test.tsx",
        "**/*.d.ts",
        "**/*.config.ts",
        "src/core/**/__mocks__/**",
      ],
    },
  },
});
