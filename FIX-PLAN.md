# 架构统一修复 — 发现的问题 + 计划

## 自查出的矛盾

### 🔴 致命矛盾：LLM 配置双轨制

**问题：** AgentOrchestrator 构造函数走的是 `getDefaultClient()` / `getDefaultLLMConfig()`，这些已标记 `@deprecated`，内部调用 `getFallbackModel()` 只读环境变量。

但写/续写/微调路由在调用 `writeSection()` 时传了 settings 客户端——可审校和摘要方法用的还是构造器里的旧客户端。

**影响面：**
- write/route.ts → reviewContent() 和 summarizeChapter() 用旧模型
- continue/route.ts → 同上
- refine/route.ts → 同上
- summarize/route.ts → summarizeChapter() 用旧模型

### 🟡 次要矛盾：URL 半硬编码

- characters/expand/route.ts → DS_URL 仍是硬编码的 siliconflow URL
- import/commit/route.ts → baseURL 改读 settings 了但 commit 里的 fetch 还是旧 URL

### 🟡 已废弃函数仍被引用

- `getDefaultClient()` — orchestrator.ts (1处), settings/parser.ts (3处)
- `getDefaultLLMConfig()` — orchestrator.ts (1处)
- `getSiliconFlowClient()` — 无引用（已清理完毕）

---

## 修复计划

### 1. 统一 AgentOrchestrator 初始化

```typescript
// 改造前
constructor(client?: LLMClient) {
  this.client = client || getDefaultClient();  // 旧
  this.config = getDefaultLLMConfig();          // 旧
}

// 改造后
constructor(client?: LLMClient, config?: LLMConfig) {
  this.client = client || getDefaultClient();   // 兜底
  this.config = config || getDefaultLLMConfig(); // 兜底
}

static async fromSettings(overrides?: Partial<LLMConfig>): Promise<AgentOrchestrator> {
  const config = await getEffectiveConfig(overrides);
  const client = createLLMClient(config);
  return new AgentOrchestrator(client, config);
}
```

### 2. 全局替换调用点

```
new AgentOrchestrator()  →  await AgentOrchestrator.fromSettings()
```
4 个路由全替换。

### 3. 统一 expand/import URL

characters/expand 和 import/commit 里面的硬编码 URL 也改用 settings.baseUrl。

### 4. 发布 v0.20.0
