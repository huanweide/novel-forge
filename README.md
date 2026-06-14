# Novel Forge

AI 小说工坊——用 LLM 辅助长篇网文创作。

## 快速开始

```bash
# 1. 装依赖
npm install

# 2. 配置数据库（需要本地 PostgreSQL）
# 创建数据库
createdb novelforge

# 3. 初始化表结构
npx prisma db push

# 4. 启动
npm run dev
# 打开 http://localhost:3001
```

## 首次使用

1. 打开页面 → 点右上角 **⚙️ 设置**
2. 选择 LLM 提供商：硅基流动 / DeepSeek 官方 / OpenAI / Groq / 自定义
3. 填入你的 API Key → 点 **测试连接**
4. 测试通过后 **保存设置** → 所有 AI 功能即刻生效

## 支持的 LLM 提供商

| 提供商 | 默认模型 | 说明 |
|--------|---------|------|
| 硅基流动 | DeepSeek-V4-Flash | 国产，便宜，DeepSeek 全系 |
| DeepSeek 官方 | deepseek-chat | 官方 API，兼容 OpenAI |
| OpenAI | gpt-4o | GPT-4o 系列 |
| Groq | llama-3.3-70b | 极速推理，开源模型 |
| 自定义 | 任意 | 任何兼容 OpenAI API 的服务 |

API Key 保存在本地 PostgreSQL 数据库，不会上传到任何第三方。

## 技术栈

- **前端**: Next.js 16 (App Router) + React 18 + Tailwind CSS
- **后端**: Next.js API Routes + SSE 流式响应
- **数据库**: PostgreSQL + Prisma ORM
- **AI**: 多提供商 LLM 调用（OpenAI 兼容 API）

## 环境变量（可选）

如果不想通过 UI 配置，也可以用环境变量：

```bash
LLM_API_KEY=sk-xxx  # 留空则在设置页面配置
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/novelforge
```

数据库设置优先于环境变量。设置页面填了 Key 就用数据库的，没填才走环境变量。

## 本地开发

```bash
npm run dev      # 开发服务器 (localhost:3001, Turbopack HMR)
npx tsc --noEmit # TypeScript 编译检查
npx prisma studio # 数据库管理面板
```
