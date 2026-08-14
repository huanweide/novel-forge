// vitest 全局 setup —— 注册 jest-dom 匹配器（toBeInTheDocument / toHaveAttribute 等），
// 供组件测试（jsdom 环境）使用。node 环境的纯逻辑测试不调用这些匹配器，但注册无副作用。
// 必须用 /vitest 子路径入口：它会从 vitest 显式 import expect 再 expect.extend，
// 否则 jest-dom 主入口在 setup 阶段引用全局 expect 会抛 ReferenceError（expect is not defined）。
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// 本项目 vitest 未开启 globals，@testing-library/react 的自动清理依赖全局 afterEach，
// 不开启时不会注册，会导致多个组件测试的 DOM 在 document.body 累积、getByRole 误匹配多个元素。
// 显式每个用例后清理，保证测试隔离。
afterEach(() => cleanup());
