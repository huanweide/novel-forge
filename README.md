<!-- badges -->
[![License](https://img.shields.io/github/license/huanweide/novel-forge)](LICENSE)
[![CI](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/huanweide/novel-forge)](https://github.com/huanweide/novel-forge/stargazers)
<!-- /badges -->

# Novel Forge — AI 小说工坊

用 LLM 辅助长篇网文创作。玻璃态 Premium UI，支持多 LLM 提供商，从构思到章节生成全流程覆盖。

> **这是本地优先的应用**——每个作者在自己的电脑上运行，数据库和 API Key 都在本地，不上传到任何第三方。

---

## 目录

- [功能全景](#功能全景)
- [快速开始](#快速开始)
- [详细安装教程](#详细安装教程)
  - [方式一：Docker（推荐）](#方式一docker推荐零基础友好)
  - [方式二：手动安装 PostgreSQL](#方式二手动安装-postgresql)
  - [1. 环境准备](#1-环境准备)
  - [2. 克隆项目](#2-克隆项目)
  - [3. 安装依赖](#3-安装依赖)
  - [4. 配置数据库](#4-配置数据库)
  - [5. 初始化表结构](#5-初始化表结构)
  - [6. 启动开发服务器](#6-启动开发服务器)
- [首次使用向导](#首次使用向导)
  - [配置 LLM 提供商](#配置-llm-提供商)
  - [开箱预设与创意工坊](#开箱预设与创意工坊)
  - [一键示例与题材开局](#一键示例与题材开局)
  - [创建第一个项目](#创建第一个项目)
- [功能详解](#功能详解)
  - [工作台（写作主界面）](#工作台写作主界面)
  - [探讨模式（构思助手）](#探讨模式构思助手)
  - [拆书系统（学习工具）](#拆书系统学习工具)
  - [项目管理](#项目管理)
  - [导出小说](#导出小说)
- [LLM 提供商配置](#llm-提供商配置)
- [写作规则系统](#写作规则系统)
- [常见问题](#常见问题)
- [技术栈](#技术栈)
- [本地开发](#本地开发)
- [项目结构](#项目结构)

---

## 功能全景

```
Novel Forge
├── 🏠 首页            → 项目管理（创建/删除/概览）
├── 🎯 探讨模式         → 对话式构建小说世界（11步骤+抽卡）
├── ✍️ 工作台           → 核心写作界面
│   ├── 角色管理        → 角色卡 CRUD + AI 自动扩展
│   ├── 世界书          → 设定词条 + AI 自动补充
│   ├── 大纲编辑器      → 章节大纲 + 情节规划
│   ├── 风格管理        → 文风预设 + 自定义风格
│   ├── 规则管理        → 写作规则 + 强制约束
│   ├── 正文生成        → SSE 流式续写/润色/扩写
│   └── 伏笔系统        → 埋伏笔 + 追踪回收
├── 📚 拆书系统         → 15维度智能拆解 + 仿写引擎
├── ⚙️ 设置            → LLM 提供商 + API Key + 模型选择
└── 📋 更新公告         → 完整版本历史
```

---

## 快速开始

### 🐳 方式一：Docker（推荐，无需单独装数据库）

```bash
# 0. 装 Docker Desktop → https://www.docker.com/products/docker-desktop/
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
docker compose up -d                          # 数据库一条命令启动
echo DATABASE_URL="postgresql://novelforge:novelforge123@localhost:5432/novelforge" > .env
npm install
npx prisma db push
npm run dev
# 浏览器打开 http://localhost:3001
```

### 🛠️ 方式二：手动安装 PostgreSQL

```bash
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
# 写入数据库连接串（改成你本地 PostgreSQL 的账号/密码/库名）
echo DATABASE_URL="postgresql://novelforge:novelforge123@localhost:5432/novelforge" > .env
npm install
npx prisma db push
npm run dev
# 浏览器打开 http://localhost:3001
```

---

## 详细安装教程

### 方式一：Docker（推荐，零基础友好）

用 Docker 启动数据库，**不用手动装 PostgreSQL**。适合不想折腾数据库的同学。

#### 1. 安装 Docker Desktop

去 [docker.com](https://www.docker.com/products/docker-desktop/) 下载 Docker Desktop，安装后启动。任务栏出现鲸鱼图标就说明在运行了。

> 💡 Docker Desktop 免费，装一次以后所有需要数据库的项目都能复用。

#### 2. 克隆项目并启动数据库

```bash
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
docker compose up -d
```

`docker compose up -d` 在后台启动 PostgreSQL 数据库。输出 `✔ Container novel-forge-db Started` 即成功。

> 💡 默认用户名 `novelforge`，密码 `novelforge123`，数据库名 `novelforge`。这些定义在 `docker-compose.yml` 里，可以自己改。

#### 3. 配置环境变量

```bash
echo DATABASE_URL="postgresql://novelforge:novelforge123@localhost:5432/novelforge" > .env
```

#### 4. 安装依赖并启动

```bash
npm install
npx prisma db push
npm run dev
# 浏览器打开 http://localhost:3001
```

看到 `▲ Next.js 16.x.x (Turbopack) - Local: http://localhost:3001 ✓ Ready` 就成功了。

> 💡 以后再次使用：先 `docker compose up -d` 启动数据库，再 `npm run dev`。数据存在 Docker volume 里，不会丢。

---

### 方式二：手动安装 PostgreSQL

适合已经装了 PostgreSQL 或想完全手动控制的同学。

### 1. 环境准备

Novel Forge 需要以下软件：

| 软件 | 最低版本 | 检查方式 | 说明 |
|------|---------|---------|------|
| **Git** | 任意 | `git --version` | 克隆项目用 |
| **Node.js** | 20.x（≥20，Next 16 要求） | `node -v` | JavaScript 运行时 |
| **npm** | 9.x | `npm -v` | 随 Node.js 一起安装 |
| **PostgreSQL** | 14+ | `psql --version` | 数据库，存储所有小说数据 |

**安装 Git**：去 [git-scm.com](https://git-scm.com/download/win) 下载安装包，一路下一步就行。

**安装 Node.js**：去 [nodejs.org](https://nodejs.org) 下载 **LTS 20.x 或更高**版本并安装——Next 16 要求 Node ≥ 20，低于 20 会启动失败。一路下一步就行。

**安装 PostgreSQL**：去 [postgresql.org](https://www.postgresql.org/download/windows/) 下载安装包。安装时记住你设置的 `postgres` 用户密码（比如设为 `postgres`）。

> 💡 PostgreSQL 装完后会在系统托盘有个小象图标。不影响使用，可以不管它。

### 2. 克隆项目

打开终端（PowerShell 或 Git Bash），找一个你喜欢的目录：

```bash
cd ~/Desktop
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
```

### 3. 安装依赖

```bash
npm install
```

等 1-2 分钟，下载所有依赖包。如果卡住不动，可以试试：

```bash
npm install --registry=https://registry.npmmirror.com
```

### 4. 配置数据库

**创建数据库**：

```bash
# Windows PowerShell
createdb -U postgres novelforge
# 输入你安装时设置的 postgres 密码
```

> 如果提示 `createdb` 命令找不到，说明 PostgreSQL 没加到 PATH。用完整路径运行（**把 `17` 换成你装的版本号**）：
> ```bash
> & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres novelforge
> ```

或者用 pgAdmin（PostgreSQL 自带的图形化管理工具）：
1. 打开 pgAdmin → 右键 "Databases" → Create → Database
2. 数据库名填 `novelforge`，点 Save

**配置连接**：

在项目根目录创建 `.env` 文件：

```bash
echo DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/novelforge" > .env
```

把 `你的密码` 换成你安装 PostgreSQL 时设的 postgres 密码。

> ⚠️ `.env` 已被加入 `.gitignore`，不会被推送到 GitHub，密码安全。

### 5. 初始化表结构

```bash
npx prisma db push
```

这条命令会根据 `prisma/schema.prisma` 自动创建所有需要的数据库表。输出应该是 `Your database is now in sync with your schema.`。

> 以后如果从 GitHub 拉取更新后发现有新功能，再跑一次 `npx prisma db push` 同步表结构即可。不会丢数据。

### 6. 启动开发服务器

```bash
npm run dev
```

看到类似这样的输出就成功了：

```
▲ Next.js 16.x.x (Turbopack)
- Local: http://localhost:3001
✓ Ready in 2.3s
```

浏览器打开 `http://localhost:3001`，看到 Novel Forge 首页。

> 🎁 **首次启动即送**：clone 下来的仓库首次启动，会自动播种 16 个「trirui推荐」内置示范预设（世界观 / 角色 / 文风 / 规则），打开「创意工坊」即见，点一下就能套用——无需任何手动导入。
>
> ⚠️ 但要真正用 AI 写小说，还需配置 LLM API Key（见下方「配置 LLM 提供商」）。没配 Key 时，浏览预设、看示例、建项目都能用，只是不能调用 AI 生成。

---

## 首次使用向导

### 配置 LLM 提供商

Novel Forge 不自带任何 API Key。你需要用自己的 Key。

1. 点右上角 **⚙️ 设置**
2. 选择 LLM 提供商（推荐 **硅基流动**，国产便宜，DeepSeek 全系可用）
3. 填入你的 API Key
4. 点 **测试连接**——确认返回 "连接成功"
5. 点 **💾 保存设置**

**各提供商快速对比**：

| 提供商 | 获取 Key 地址 | 价格参考 | 推荐模型 |
|--------|-------------|---------|---------|
| 硅基流动 | [siliconflow.cn](https://siliconflow.cn) | ¥0.001~/1K tokens | `deepseek-ai/DeepSeek-V4-Flash` |
| DeepSeek 官方 | [platform.deepseek.com](https://platform.deepseek.com) | ¥0.002~/1K tokens | `deepseek-v4-flash` |
| OpenAI | [platform.openai.com](https://platform.openai.com) | $0.005~/1K tokens | `gpt-4o` |
| Groq | [console.groq.com](https://console.groq.com) | 免费额度 | `llama-3.3-70b-versatile` |
| 自定义 | 任何 OpenAI 兼容服务 | 看服务商 | 看服务商 |

> 💡 硅基流动新用户有免费额度，足够试用。2000 万字的 DeepSeek-V4-Flash 大概花几块钱。

### 开箱预设与创意工坊

Novel Forge 不是空壳——clone 下来就自带 **16 个「trirui推荐」内置示范预设**（世界观设定、角色原型、文风模板、写作规则），首次启动自动播种，打开「创意工坊」即见，点一下就能套用。

创意工坊也是你自己沉淀预设的地方：
- **套用 / 浏览**：系统预设直接套用，或当作写作参考。
- **自己创建**：用大白话描述你想要的风格 / 角色 / 规则，AI 帮你「丰满」成结构化预设（v0.46.2 的 AI 丰满面板），再发布到本机。
- **导入 / 导出文件**：每张预设可一键导出 `.preset.json`，也能从本机或社区下载的文件导入。纯本地、不共享、不上传——这是酒馆式的社区分发方式，不需要任何服务器。

> 系统内置预设随仓库走（clone 即带）；你导入 / 创建的预设只存本机，永不影响内置项。

### 一键示例与题材开局

不想从空白项目开始？两条捷径：
- **一键示例**：首页点「看示例」，一键载入示范仙侠小说《山海拾遗》——含完整世界观铁律、主角角色卡、已写好的 2 章正文，且规则已自动进上下文。点开即见「AI 生成 + 自动填表 + 设定召回」的完整效果。
- **按题材开局**：首页展开「按题材开局」，选 8 种高频题材（仙侠 / 都市 / 西幻 / 历史 / 言情 / 科幻 / 悬疑 / 武侠）之一，一键生成项目骨架（世界观铁律 + 卷纲三段式 + 第一章钩子），离线可用、零 Key 依赖。

### 创建第一个项目

1. 首页点 **+ 新建项目**
2. 填写：
   - **项目名称**：你的小说名（比如"星辰陨落之时"）
   - **简介**：一句话概括
   - **类型标签**：玄幻、都市、科幻……逗号分隔
   - **主线总纲**：主线剧情走向（可以不写，但写得越清楚 AI 越懂你）
   - **基调关键词**：黑暗、热血、悲剧、复仇……
   - **目标字数**：比如 100000（10万字）
3. 点 **创建项目**
4. 卡片上点 **进入工作台 →** 开始写作

---

## 功能详解

### 工作台（写作主界面）

工作台是核心写作界面，分三栏布局：

**左栏**：导航
- 📖 **角色管理**：创建/编辑角色卡，包含外貌、性格、背景、能力
  - AI 扩展按钮：勾选已有角色 → 一键让 AI 补充完整角色卡
  - 关系图谱：可视化角色关系
- 📚 **世界书**：设定词条（力量体系、势力、地点、货币……）
  - 每个词条有触发词——正文中出现这些词时自动注入
  - AI 扩展按钮：自动补充词条内容
- 📝 **大纲编辑器**：章节规划 + 情节走向
  - 5种大纲模板可选
- 🎨 **风格管理**：文风预设 + 自定义风格参数
- 📏 **规则管理**：写作规则，控制 AI 生成质量

**中栏**：编辑器 + AI 对话
- 正文编辑区，支持 Markdown
- AI 对话栏：选模式（续写/润色/扩写/改写）→ 输入指令 → 生成
- SSE 流式输出，生成过程实时可见

**右栏**：上下文监视
- 当前章节的角色自动识别
- 触发词条预览
- 伏笔状态追踪

### 探讨模式（构思助手）

适合还没动笔、正在构思的阶段。路径：首页 → 🎯 探讨

**工作流**：
1. **配置**：填写小说名称、主角、类型、流派、力量体系等
2. **对话**：按 11 个步骤逐步推进——开篇 → 世界观 → 主角 → 金手指 → 冲突 → 势力 → 力量 → 货币 → 地图 → 情节 → 自由讨论
3. **双模式**：
   - 💬 对话模式：自由跟 AI 讨论设定
   - 🃏 抽卡模式：AI 出 3-5 张候选卡（比如 5 个不同的金手指方案），你挑一张采纳
4. **汇总**：已采纳的设定自动汇聚到右侧面板
5. **创建项目**：一键把构思变成正式项目——角色、世界书自动导入

**两种创建方式**：
- 📦 直接创建：采纳什么导什么
- 🤖 AI 完善后创建：LLM 检测缺失设定，补全后再创建

### 拆书系统（学习工具）

分析别人的小说，提取可复用的技法。路径：首页 → 📚 拆书

**使用流程**：
1. 上传 .txt 文件（把小说丢进去）
2. AI 自动拆解为 15 个维度：
   - **人物维度**：主角/反派/导师/配角识别，关系图谱构建
   - **情节维度**：章节结构、情节点、转折点检测
   - **文笔维度**：句式风格、对白写法、描写密度
   - **设定维度**：世界观元素、力量体系提取
3. 查看拆解结果——每个维度有独立面板
4. **仿写引擎**：按拆解出的风格参数一键生成模仿文段
5. **导入项目**：把拆出的角色卡和设定导入到现有项目

### 项目管理

首页展示所有项目卡片，每张卡片显示：
- 项目名称 + 简介
- 类型标签
- 角色数 / 词条数 / 节点数 / 目标字数
- 最后更新时间

操作：进入工作台 / 删除（悬停出现 ✕ 按钮）

---

### 导出小说

写完一章或整本，可一键导出成多种格式，投给编辑 / 平台或自己备份：

| 格式 | 说明 | 适用场景 |
|------|------|---------|
| TXT | 纯文本 | 通用备份、粘贴到任何地方 |
| Markdown | 带格式的轻量标记 | Obsidian / Typora 等 |
| 网页 HTML | 含样式，浏览器打开即读 | 分享预览 |
| 可打印 PDF | 用浏览器「打印 → 另存为 PDF」从 HTML 生成 | 投稿 / 排版 |
| EPUB | 标准电子书 | 导入阅读器（Kindle 等） |
| **Word (.docx)** | 零依赖 OOXML，中文不乱码 | **投编辑 / 网文平台首选** |

> 导出入口：工作台顶部工具栏「导出」下拉。PDF 走浏览器打印（HTML 导出后 Ctrl/Cmd+P 另存为 PDF），其余格式直接下载。

## LLM 提供商配置

### 硅基流动（推荐）

```
Provider: 硅基流动
API Key: sk-xxxxxxxx（在 siliconflow.cn 注册获取）
默认模型: deepseek-ai/DeepSeek-V4-Flash
Base URL: https://api.siliconflow.cn/v1
```

### DeepSeek 官方

```
Provider: DeepSeek 官方
API Key: sk-xxxxxxxx（在 platform.deepseek.com 获取）
默认模型: deepseek-v4-flash
Base URL: https://api.deepseek.com
```

### OpenAI

```
Provider: OpenAI
API Key: sk-xxxxxxxx（在 platform.openai.com 获取）
默认模型: gpt-4o
```

### Groq

```
Provider: Groq
API Key: gsk_xxxxxxxx（在 console.groq.com 获取）
默认模型: llama-3.3-70b-versatile
```

### 自定义（兼容 OpenAI API 的服务）

选「自定义」，填入你的 API Base URL（比如 `https://your-api.com/v1`）+ Key + 模型名即可。

---

## 写作规则系统

Novel Forge 内置写作规则引擎，控制 AI 生成质量。

### 自动规则（探讨模式创建项目时自动生成）

新建项目时，7 条写作铁律自动写入数据库：

1. **句式铁律**——长短交错，禁止短句堆砌（3句以上≤15字即违规）
2. **人物指代**——名字优先，禁止他/她连用（每段不超过3个）
3. **禁用符号与句式**——破折号、括号、对白中数字全部禁止
4. **禁止描写声音/语气/眼神/视线**——不写声音特征，不写目光描写
5. **白描铁律**——只呈现可观察的动作和对白，零作者解读
6. **节奏控制**——细节密度20-30%，快慢节奏切换
7. **情节与情绪**——每章至少一次反转，抑扬交替

### 生效机制

```
生成请求 → getActiveRules("write_only") → injectRules()
→ 拼入 Prompt 顶部（优先级高于章纲和角色设定）
→ 发送给 LLM
```

### 手动管理

工作台 → 📏 规则管理 → 增/删/禁用单条规则。每条规则有：
- priority（优先级）：数字越大越靠前
- scope：`write_only`（仅写作时生效）/ `all`（全局生效）
- enabled：开关

---

## 常见问题

### Q: 为什么提示"模型不存在"？
A: 去 ⚙️ 设置检查模型名称是否正确。不同提供商的模型名格式不同——硅基流动用 `deepseek-ai/DeepSeek-V4-Flash`，DeepSeek 官方用 `deepseek-v4-flash`，不要混。

### Q: 测试连接失败？
A: 检查三点：① API Key 是否正确（不要有空格）；② 网络能否访问对应域名；③ Key 是否还有余额。

### Q: 数据库连接失败？
A: 检查三步：
1. PostgreSQL 服务是否在运行：`pg_isready`
2. `.env` 中的 `DATABASE_URL` 密码是否正确
3. 数据库 `novelforge` 是否已创建：`psql -U postgres -l | grep novelforge`

### Q: 端口 3001 被占用？
A: 杀掉占用进程再重启：
```bash
# Windows PowerShell
netstat -ano | findstr ":3001"
taskkill //PID <PID号> //F
npm run dev
```

### Q: 怎么更新到最新版？
A:
```bash
git pull origin main
npm install          # 可能有新依赖
npx prisma db push   # 同步数据库结构（不丢数据）
```

### Q: 怎么备份数据？
A: 备份 PostgreSQL 数据库：
```bash
pg_dump -U postgres novelforge > novelforge_backup.sql
```
恢复：
```bash
psql -U postgres novelforge < novelforge_backup.sql
```

### Q: 能多人协作吗？
A: 目前的架构是本地优先的——每个作者在自己的电脑上跑，有自己的数据库。多人协作需要自己搭 PostgreSQL 服务器并共享 DATABASE_URL。

### Q: 支持什么格式的导入？
A: 拆书系统支持 `.txt` 文件。字体编码建议 UTF-8。

### Q: 不想装 PostgreSQL，有没有简单办法？
A: 用 Docker，一条命令搞定数据库。见上方 [详细安装教程 → 方式一](#方式一docker推荐零基础友好)。

### Q: 怎么关掉数据库（释放内存）？
A:
- Docker 用户：`docker compose down`（数据不丢，下次 `docker compose up -d` 恢复）
- 手动安装用户：Win+R → `services.msc` → 找到 `postgresql-x64-xx` → 停止

### Q: 能部署到服务器上公网访问吗？
A: 可以。先跑 `npm run build`，然后用 `npm start` 启动生产模式（见下方 [生产部署](#生产部署)）。注意把 `DATABASE_URL` 指向服务器上的 PostgreSQL，并配置防火墙开放端口。

---

## 技术栈

- **前端框架**：Next.js 16 (App Router) + React 18
- **样式**：Tailwind CSS v4 + `tw-animate-css`
- **UI 语言**：玻璃态 — `bg-white/[0.02] backdrop-blur-sm` + 按压反馈动画
- **数据库**：PostgreSQL + Prisma ORM
- **API**：Next.js API Routes + SSE (Server-Sent Events) 流式响应
- **AI**：多提供商 LLM 调用（OpenAI 兼容协议）
- **构建**：Turbopack (开发) / Webpack (生产)
- **类型检查**：TypeScript strict mode

---

## 本地开发

```bash
npm run dev            # 开发服务器 (localhost:3001, Turbopack HMR)
npx tsc --noEmit       # TypeScript 编译检查（零错误才算过）
npx prisma studio      # 数据库可视化管理面板 (localhost:5555)
npx prisma db push     # 同步 Prisma schema → 数据库表
```

---

## 生产部署

如果不想每次写小说都手动 `npm run dev`，可以构建生产版——启动更快、更省资源。

```bash
npm run build          # 构建生产版本
npm start              # 启动生产服务器 (localhost:3001)
```

配合 Docker 数据库自启：

```bash
# 以后打开电脑只需要这两条
docker compose up -d   # 启动数据库
npm start              # 启动应用
```

> 💡 `npm start` 不会热更新（改了代码需要重新 `build`），但平时写小说不需要改代码，这是日常使用的最佳方式。

---

## 项目结构

```
novel-forge/
├── prisma/
│   └── schema.prisma         # 数据库模型定义
├── src/
│   ├── app/                  # Next.js App Router 页面
│   │   ├── page.tsx          # 首页（项目列表）
│   │   ├── explore/          # 探讨模式页面
│   │   ├── workspace/        # 工作台页面 [projectId]
│   │   ├── dissect/          # 拆书系统页面
│   │   ├── settings/         # 设置页面
│   │   ├── changelog/        # 更新公告页面
│   │   └── api/              # API 路由
│   ├── components/           # React 组件
│   │   ├── ui/               # 基础 UI 组件（Button 等）
│   │   ├── workspace/        # 工作台组件
│   │   ├── explore/          # 探讨模式组件
│   │   ├── editor/           # 编辑器组件
│   │   ├── dissect/          # 拆书组件
│   │   └── dashboard/        # 首页组件
│   ├── core/                 # 核心业务逻辑
│   │   ├── assembly/         # Prompt 拼装引擎
│   │   ├── llm/              # LLM 客户端（发送请求）
│   │   ├── explore/          # 探讨模式工具
│   │   └── dissect/          # 拆书引擎
│   └── lib/                  # 工具库
│       ├── llm.ts            # LLM 配置解析
│       ├── prisma.ts         # 数据库连接
│       ├── changelog-data.ts # 公告数据源
│       └── changelog-data.ts # 公告数据源
├── docs/                     # 架构文档
├── public/                   # 静态资源
├── CHANGELOG.md              # 完整版本历史
├── AGENTS.md                 # 项目规则（给 AI 助手看的）
└── README.md                 # 本文件
```

---

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

---

> 🎯 Novel Forge · AI 写作助手 · 本地优先 · 数据自有
