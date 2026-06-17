# Novel Forge 项目架构与分区治理

> GitHub AI 读取此文件即可理解项目结构、修改边界、定位目标。

## 目录分区（改什么就去什么目录）

```
src/
├── app/          ← Next.js 16 App Router：路由 + 页面 + API 端点
├── components/   ← React 组件：纯 UI，不含业务逻辑
├── core/         ← 核心业务：Agent 调度 + 管线 + 类型 + LLM 客户端
├── lib/          ← 工具库：纯函数 + 第三方封装
├── store/        ← Zustand 前端状态管理
├── generated/    ← Prisma 自动生成，禁止手动修改
docs/             ← 文档：架构参考（architecture-reference/）
prisma/           ← 数据库：Schema 定义 + 迁移文件
public/           ← 静态资源
scripts/          ← 一次性脚本
apk_build/        ← Android 打包（不参与 Web 逻辑）
```

## src/app/api/ — API 路由

| 路由 | 用途 | 调用的核心模块 |
|------|------|---------------|
| `generate/write/` | 核心生成——写新章节（SSE 流式） | core/pipeline → core/agents |
| `generate/refine/` | 润色已有章节 | 同上 |
| `generate/continue/` | 续写已有章节 | 同上 |
| `generate/update-cards/` | 章节变化检测 | core/llm 独立调用 |
| `generate/outline/` | 生成大纲 | core/agents Agent A |
| `generate/summarize/` | 生成章节摘要 | core/agents Agent 摘要 |
| `generate/apply-updates/` | 应用卡片更新 | Prisma |
| `generate/detect-entities/` | 实体检测 NER | 独立逻辑 |
| `generate/update-style-card/` | 更新风格卡 | 独立逻辑 |
| `parse-settings/` | AI 解析设定→三卡 | core/settings/parser |
| `projects/` | 项目 CRUD | Prisma |
| `characters/` | 角色卡 CRUD + 分类/展开 | Prisma |
| `lorebook/` | 世界书 CRUD + 导入 | Prisma |
| `rules/` | 规则 CRUD | Prisma |
| `settings/` | 全局 LLM 设置 | Prisma AppSettings |
| `story/` | 故事节点 CRUD | Prisma |
| `storylines/` | 故事线 CRUD | Prisma |

## src/core/ — 核心业务层（最核心，不含路由/组件/Prisma）

| 模块 | 职责 | 边界 |
|------|------|------|
| `agents/orchestrator.ts` | 4 Agent 编排 + Prompt 模板 + 审校/摘要解析 | 不含 HTTP（委托给 llm/client） |
| `pipeline/` | 生成管线：context-loader → pre-processor → post-processor | 不含 LLM 调用（委托给 agents） |
| `llm/client.ts` | LLM 客户端：createLLMClient、getEffectiveConfig、HTTP 请求 | 不含业务 Prompt（Prompt 在 agents/） |
| `assembly/engine.ts` | Prompt 组装 + tokenizer + trigger 匹配 | 不含 LLM 调用 |
| `distillation/` | S/A/B/C 四级事件蒸馏 | 独立算法 |
| `types/index.ts` | 全部 TS 类型定义 | 不含实现 |
| `templates/` | 风格预设、大纲模板 | 不含 UI |
| `settings/parser.ts` | 自由文本→三卡结构化 | 调 LLM，不含路由 |

## src/components/ — UI 层

| 目录 | 用途 |
|------|------|
| `workspace/` | 写作工作台组件（大纲面板、故事树、编辑区） |
| `editor/` | 编辑器组件（StyleEditor、EntityDetector） |
| `dashboard/` | 仪表盘/首页 |
| `ui/` | 通用 UI 组件（按钮、对话框等），可复用 |

## src/lib/ — 工具库

| 文件 | 用途 |
|------|------|
| `prisma.ts` | Prisma 客户端单例 |
| `llm.ts` | 多提供商 LLM 设置读取（getSettings + 60s缓存 + clearLLMCache） |
| `forbidden-checker.ts` | 禁用词扫描器 v2.0 |
| `changelog-data.ts` | 前端公告数据源 |
| `utils.ts` | 通用工具函数 |

## 修改定位速查

| 要改什么 | 去哪个文件 |
|----------|-----------|
| 新增 API 端点 | `src/app/api/` + 对应目录 |
| LLM 调用逻辑 | `src/core/llm/client.ts` |
| Agent Prompt | `src/core/agents/orchestrator.ts` |
| 生成管线流程 | `src/core/pipeline/` |
| 类型定义 | `src/core/types/index.ts` |
| 数据库结构 | `prisma/schema.prisma` |
| 禁用词扫描 | `src/lib/forbidden-checker.ts` |
| LLM 配置读取 | `src/lib/llm.ts` |
| UI 组件 | `src/components/` |
| 设定解析 | `src/core/settings/parser.ts` |
| 公告 | `CHANGELOG.md` + `src/lib/changelog-data.ts` |
| 架构参考 | `docs/architecture-reference/` |

## 技术栈

- Next.js 16 (App Router + Turbopack) + React 19
- Prisma + PostgreSQL (Docker: `novelforge:novelforge123@localhost:5432/novelforge`)
- Zustand 前端状态管理
- 多提供商 LLM：AppSettings 表动态读取（siliconflow/openai/deepseek/groq/custom）
- SSE 流式输出（章节生成）
