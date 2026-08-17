<!-- badges -->
[![License](https://img.shields.io/github/license/huanweide/novel-forge)](LICENSE)
[![CI](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml/badge.svg)](https://github.com/huanweide/novel-forge/actions/workflows/ci.yml)
[![Stars](https://img.shields.io/github/stars/huanweide/novel-forge)](https://github.com/huanweide/novel-forge/stargazers)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](https://github.com/huanweide/novel-forge/pulls)
<!-- /badges -->

# Novel Forge — AI 小说工坊

> 把「写长篇」从体力活变成创意活：章节生成、设定自动建档、故事线自动推进，一条龙全自动。

Novel Forge 是一个**本地优先**的 AI 长篇网文创作工具。它不止帮你「写」，更帮你「管」：每写一章，它自动把人物、地点、物品、势力抽进结构化表格，自动创建角色卡与世界书词条，自动检测角色关系，自动把剧情进展写回故事线——你只管写，设定库自己长。

> **本地优先**：每个作者在自己电脑上运行，数据库与 API Key 全部留在本地，不上传任何第三方。
> **当前版本 v3.1.25（自检 banner AI 项黑话收敛·配置错误可读化·体验修复）** · 开箱即带 15 个示范预设（套用即开写，免手填表）· 一键示例小说 · 8 题材开局 · 6 格式导出 · 长篇小说不降智（分层记忆 + AI 远楼层压缩）· 批量写作 · 故事线缝合怪 · 世界卡 15 分类体系 · 故事线进度量化。

---

## 为什么值得一试

| 亮点 | 说明 |
|------|------|
| 🧠 **设定管线（自动填表可选）** | 生成章节后，开启「自动填表」即自动抽结构化表格 → 自动建角色卡/世界书 → 自动检测角色关系 → 自动回写故事线；默认关，纯手写作家不被动打扰 |
| 🧠 **长篇小说不降智** | 分层记忆引擎：滑动窗口（最近 4 章全文 + 最近 3 章摘要 + 故事线节拍）+ AI 远楼层压缩（同模型把塞不进上下文的远章节压成情节摘要），写 100 章人设/伏笔/设定不丢、不退化 |
| ⚡ **批量写作两段流** | 一次生成 1-10 章：先出章纲给你改，确认后再后台逐章写正文，可关窗口继续跑 |
| 🧵 **缝合怪推进** | 主线完结后自动构造承接的新主线，剧情永不干涸；三档节奏（快/均衡/慢热）可调 |
| 🎴 **角色卡体系** | AI 填满（全字段+性格三层+故事线+关系）、AI 扩展、全选联动、自动分类、**自动去重合并**（去龙套/并小名） |
| 🕸️ **可拖动关系图** | 角色卡内置「人际关系」列表 + 关系图双视图，节点可拖、位置记忆、双击开卡 |
| 🏠 **数据自有** | 本地 PostgreSQL，无云服务、无订阅、无账号；MIT 开源可自托管 |
| 📚 **拆书学习** | 15 维拆解他人作品 + 仿写引擎，越拆越会写 |
| 🎁 **零门槛开局** | 15 个示范预设、一键示例小说《山海拾遗》、8 题材开局，clone 即用 |
| 🌍 **世界卡 15 分类体系** | 命运体系/物理/公开体系等 15 类设定模块，确定性分类器自动路由填表，设定库不再混乱 |
| 📊 **故事线进度量化** | 主线/支线七要素 + 章节进展百分比，AI 写章实时感知剧情，前后不矛盾 |

---

## 界面与设计体系（虚空玻璃 · Void Glass）

Novel Forge 的视觉语言是一套刻意设计、可复用的体系，目标是在「好看」和「不简陋」之间找到平衡点——信息层次靠**实体卡片 + 留白**撑起，而不是堆毛玻璃滤镜。

| 设计决策 | 做法 | 为什么 |
|---------|------|--------|
| 🪟 **虚空玻璃（Void Glass）** | 用无色、低饱和的半透玻璃质感作为统一身份，而非花哨的彩色毛玻璃 | 你明确说过不要「一堆滤纸效果」——我们把糊窗的 `backdrop-blur` 杂色剥掉，改用实心表面 + 轻投影出层次 |
| 🟡 **香槟金单一身份色** | 全站只有五种语义色：`--nv-primary`（主蓝）/ `--nv-success`（绿）/ `--nv-warning`（黄）/ `--nv-danger`（红）/ `--nv-creative`（香槟金），金只做点缀与强调 | 杜绝游离的紫粉「离谱色」，配色永远只有一套逻辑，换主题不串色 |
| 🎬 **全站转场** | 切到任意页面都会轻轻淡入（转屏），抽屉/吸顶栏不会被转场弄错位 | 有了「翻页感」，不再硬切跳变 |
| ✨ **微交互** | 按钮按下冒金环、卡片悬浮浮起描边发光、列表错峰入场 | 点点划划都有反馈，界面「活」起来但不吵 |

> 设计令牌（CSS 变量）集中在 `globals.css`，所有组件只用语义色、不写裸 hex——这是「换主题不乱、配色统一」的根。贡献新界面请沿用这套令牌，不要在组件里硬编码颜色。

---

## 目录

- [功能全景](#功能全景)
- [界面与设计体系](#界面与设计体系)
- [快速开始](#快速开始)
- [详细安装教程](#详细安装教程)
- [首次使用向导](#首次使用向导)
- [核心功能详解](#核心功能详解)
- [LLM 提供商配置](#llm-提供商配置)
- [安全与隐私](#安全与隐私)
- [常见问题](#常见问题)
- [技术栈](#技术栈)
- [本地开发](#本地开发)
- [生产部署](#生产部署)
- [项目结构](#项目结构)
- [许可证](#许可证)

---

## 功能全景

```
Novel Forge
├── 🏠 首页            → 项目管理（创建/删除/概览）
├── 🎯 探讨模式         → 对话式构建小说世界（11步骤+抽卡）
├── ✍️ 工作台           → 核心写作界面
│   ├── 角色管理        → 角色卡 + AI填满/扩展/分类/去重合并 + 关系图
│   ├── 世界书          → 设定词条 + AI 自动补充（触发词注入）
│   ├── 大纲/章节       → 章纲折叠、一键直出正文、章名自动生成
│   ├── 自动填表        → 一键追评所有未填章节（后台运行）
│   ├── 批量写作        → 1-10 章：先生成章纲确认，再后台写正文
│   ├── 故事线          → 主线/支线七要素 + 章节进展时间轴 + 缝合怪推进
│   ├── 智能审阅        → AI 评分诊断 + 合格自动定稿 + 智能交付全书
│   └── 工具箱/统计      → 冲突推演、叙事能量曲线、写作监测
├── 📚 拆书系统         → 15维度智能拆解 + 仿写引擎
├── ⚙️ 设置            → LLM 提供商 + API Key + 骨架/配置/记忆衰减
└── 📋 更新公告         → 完整版本历史
```

---

## 快速开始

### 🐳 方式一：Docker（推荐，无需单独装数据库）

```bash
# 0. 装 Docker Desktop → https://www.docker.com/products/docker-desktop/
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
cp .env.example .env                      # 复制配置模板（默认值即可用）
docker compose up -d                      # 数据库一条命令启动
npm install
npx prisma db push                        # 初始化表结构
npm run dev
# 浏览器打开 http://localhost:3001
```

### 🛠️ 方式二：手动安装 PostgreSQL

```bash
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
# 先手动创建数据库 novelforge，再写入连接串（改成你的账号/密码/库名）
echo 'DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/novelforge"' > .env
npm install
npx prisma db push
npm run dev
# 浏览器打开 http://localhost:3001
```

> ⚠️ `.env` 已被 `.gitignore` 忽略，不会上传 GitHub；API Key 安全。

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
cp .env.example .env
```

默认配置直接可用；如需自定义数据库账号，改 `.env` 里的 `DATABASE_URL` 即可。

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

**安装 Git**：去 [git-scm.com](https://git-scm.com/download/win) 下载安装包，一路下一步。

**安装 Node.js**：去 [nodejs.org](https://nodejs.org) 下载 **LTS 20.x 或更高**版本并安装——Next 16 要求 Node ≥ 20。

**安装 PostgreSQL**：去 [postgresql.org](https://www.postgresql.org/download/windows/) 下载安装包。安装时记住你设置的 `postgres` 用户密码。

### 2. 克隆项目

```bash
git clone https://github.com/huanweide/novel-forge.git
cd novel-forge
```

### 3. 安装依赖

```bash
npm install
```

如果卡住不动，可以试试：`npm install --registry=https://registry.npmmirror.com`

### 4. 配置数据库

**创建数据库**：

```bash
# Windows PowerShell
createdb -U postgres novelforge
# 输入你安装时设置的 postgres 密码
```

> 如果提示 `createdb` 命令找不到，用完整路径运行（把 `17` 换成你的版本号）：
> ```bash
> & "C:\Program Files\PostgreSQL\17\bin\createdb.exe" -U postgres novelforge
> ```

或者用 pgAdmin：右键 Databases → Create → Database → 名称填 `novelforge`。

**配置连接**：

```bash
echo 'DATABASE_URL="postgresql://postgres:你的密码@localhost:5432/novelforge"' > .env
```

### 5. 初始化表结构

```bash
npx prisma db push
```

输出 `Your database is now in sync with your schema.` 即成功。以后从 GitHub 拉更新后再跑一次即可同步新表，不丢数据。

### 6. 启动开发服务器

```bash
npm run dev
```

浏览器打开 `http://localhost:3001`，看到 Novel Forge 首页。

> 🎁 **首次启动即送**：clone 下来的仓库首次启动自动播种 15 个内置示范预设（世界观/角色/文风/规则），打开「创意工坊」即见，点一下就能套用。
>
> ⚠️ 要真正用 AI 写小说，还需配置 LLM API Key（见下方「LLM 提供商配置」）。没配 Key 时浏览预设、看示例、建项目都能用，只是不能调用 AI 生成。

---

## 首次使用向导

### 配置 LLM 提供商

Novel Forge 不自带任何 API Key。你需要用自己的 Key：

1. 点右上角 **⚙️ 设置**
2. 选择 LLM 提供商（推荐 **硅基流动**，国产便宜，DeepSeek 全系可用）
3. 填入你的 API Key
4. 点 **测试连接**——确认返回「连接成功」
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

clone 下来就自带 **15 个内置示范预设**，首次启动自动播种，打开「创意工坊」即见：

- **套用即开写（免手填表）**：点「套用」后，预设里的世界观/文风/角色/故事线等内容会立刻写进你的项目、并即时聚合进 AI 的全局提示词——下一章生成直接生效，**流程上不要求任何手填表**。
- **套用 / 浏览**：系统预设直接套用，或当作写作参考。
- **自己创建**：用大白话描述你想要的风格/角色/规则，AI 帮你「丰满」成结构化预设。
- **导入 / 导出**：每张预设可一键导出 `.preset.json`，也能从社区文件导入。纯本地、不共享——酒馆式社区分发方式。

### 一键示例与题材开局

- **一键示例**：首页点「看示例」，一键载入示范仙侠小说《山海拾遗》——含完整世界观铁律、主角角色卡、已写好的 2 章正文，点开即见「AI 生成 + 自动填表 + 设定召回」完整效果。
- **按题材开局**：首页选 8 种高频题材（仙侠/都市/西幻/历史/言情/科幻/悬疑/武侠）之一，一键生成项目骨架，离线可用、零 Key 依赖。

### 创建第一个项目

1. 首页点 **+ 新建项目**
2. 填项目名称、简介、类型标签、主线总纲、基调关键词、目标字数
3. 点 **创建项目** → 进入工作台开始写作

---

## 核心功能详解

### 工作台（写作主界面）

三栏布局：

**左栏**
- 📖 **角色管理**：角色卡（外貌/性格三层/背景/能力/经历/故事线/人际关系）
  - **AI 填满**：一键让 AI 按内置格式补全所有缺失字段（含性格三层、故事线、关系）
  - **AI 扩展**：勾选角色批量扩展；「全选」自动联动扩展
  - **自动分类**：按阵营/身份/定位自然分组
  - **自动去重合并**：扫描全部角色——出现次数少又没背景的标「龙套」，名字相似（小名/繁简/错别字）自动合并到内容最丰富的卡
  - **关系图**：人际关系列表 + 可拖动关系图双视图（连线显示两人关系，双击开角色卡）
- 📚 **世界书**：15 类设定体系（命运/物理/公开体系等），触发词命中自动注入上下文；AI 自动补充并归入正确分类
- 📝 **大纲/章节**：章纲默认收起不挡阅读；选中章节直接「生成/重写」一键直出正文，章名自动生成
- 🧵 **故事线**：主线/支线七要素（欲望→阻碍→行动→结果→意外→转折→结局）；每章进展自动回写 + 进度条量化；一键打勾完结；**全屏总览弹窗**；缝合怪推进（主线完结自动开新线）；进度深度融入写作（AI 写章实时感知剧情进展）
- 📏 **规则管理**：写作规则，控制 AI 生成质量

**中栏**：正文编辑区 + 生成控制（作者指令、目标字数、生成/重写、批量写作）

**右栏**：AI 助手 / 实体追踪 / 工具箱 / 统计（今日字数、进度、趋势、叙事能量曲线）

### 长篇小说不降智（分层记忆引擎）

写长篇最怕「前面写的设定后面忘了、越写越智障」。Novel Forge 用一套分层记忆把上下文「装进有限窗口」：

- **滑动窗口（短期 + 中期）**：每次动笔前，AI 自动拿到「最近 4 章全文 + 最近 3 章摘要 + 故事线节拍」，保证紧邻剧情和主线进度始终在线。
- **AI 远楼层压缩（长期）**：更早的章节如果太长、塞不进模型上下文窗口，会被**同一个写作模型**先压缩成「情节摘要」再喂回——等于给 AI 装了长期记忆，写 100 章人设/伏笔/世界观设定都不丢、不退化。
- **S/A/B 四级事件记忆**：关键情节（死亡/突破/大事件）按重要度分层注入，次要背景自然淡出，避免噪声挤占窗口。

> 这套机制已用 maxloop 魔王系统多轮深度自查确认成立——**写长篇小说不降智、高质量**是可证的，不是口号。

### 自动填表（核心自动化，默认关）

- **一键追评所有未填表章节**：从第一章到最新章逐章自动抽取事实写入结构化表格（地点/物品/势力…），**后台运行**——点完即可关窗口，进度稍后在弹窗/右下角查看，重复点击自动去重
- **角色卡/世界书实体同步**：每章填表后自动识别**新角色与世界观实体**——新角色自动建角色卡（背景/故事线/性格/外貌全字段对齐内置格式），其他实体自动建世界书词条；已有实体查重跳过
- **角色关系回填**：自动检测正文中角色间的关系，新卡直接带关系、已存在卡按名补关系（不覆盖手填）
- 填表统一走基础对话模型（fast），实测单章约 7 秒完成

### 批量写作（两段流）

1. 点「批量写作」→ 选 1-10 章 + 作者指令
2. **先生成章纲**（后台运行）→ 完成显示 N 章章纲，可逐章编辑、勾选、全选
3. **确认生成正文** → 后台逐章写正文（自动章名/填表/审阅），右下角进度胶囊，可关窗口

### 生成流程（轻量化）

- 点「生成/重写」→ 确认弹窗：可选**先生成章纲**（可编辑，不满意改指令「修复章纲」再生成）→ 确认后生成正文；不生成章纲也能一键直出
- 智能审阅：AI 通读本章评分 + 问题清单；合格自动定稿、全书定稿后自动交付

### 探讨模式（构思助手）

适合动笔前：11 步对话推进（开篇→世界观→主角→金手指→冲突→势力→力量→货币→地图→情节→自由讨论）；抽卡模式 AI 出 3-5 张候选卡挑一张采纳；已采纳设定自动汇聚，一键创建项目（角色/世界书自动导入）。

### 拆书系统（学习工具）

上传 `.txt`，AI 按 15 个维度拆解（人物/情节/文笔/设定），每维度独立面板；**仿写引擎**按拆出的风格参数一键生成模仿文段；拆出的角色卡和设定可导入现有项目。

### 导出小说

| 格式 | 说明 | 适用场景 |
|------|------|---------|
| TXT | 纯文本 | 通用备份 |
| Markdown | 轻量标记 | Obsidian / Typora |
| HTML | 含样式网页 | 分享预览 |
| PDF | 浏览器打印另存 | 投稿/排版 |
| EPUB | 标准电子书 | 阅读器 |
| **Word (.docx)** | 零依赖 OOXML | **投编辑首选** |

支持选章节范围、附带大纲、作者署名（写入 DOCX 页脚与 EPUB 元数据）。

### 写作辅助工具

- **冲突推演**：输入剧情局势，一次返回 ≥3 个剧情冲突发展选项（触发点/张力/走向/风险伏笔），一键复制
- **叙事能量曲线**：章节事件分层加权 → SVG 折线峰谷 + 节奏诊断（虎头蛇尾/张力过平/读者流失风险提示）
- **统计面板**：今日字数、全书进度、近 7 天趋势、每日目标环

---

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

### 自定义（兼容 OpenAI API）

选「自定义」，填入 API Base URL + Key + 模型名即可。

---

## 安全与隐私

Novel Forge 的设计原则是**数据自有、密钥不落第三方**：

- 🔒 **API Key 只存本地**：Key 写入本地 PostgreSQL（AppSettings 表），由设置页加密管理；从未上传到任何服务器
- 🏠 **本地优先**：数据库、正文、设定、导出文件全部在你自己的电脑上；应用本身没有云服务、没有遥测、没有账号体系
- 🚫 **仓库零密钥**：`.env`、运行时状态、数据库文件、`*.pem` 全部被 `.gitignore` 忽略；代码中无任何硬编码密钥（CI 含安全检查）
- ⚠️ **注意**：Novel Forge 是**单用户、无鉴权**应用（类比 SillyTavern）。它默认只应运行在本机（`localhost`）。如需部署到公网（如 Vercel/服务器），**必须自行加一层鉴权**（反向代理 Basic Auth / VPN / 防火墙白名单），否则任何能访问该地址的人都能看到你的小说数据。README 不推荐无防护公网部署。

---

## 常见问题

### Q: 为什么提示「模型不存在」？
A: 去 ⚙️ 设置检查模型名称。不同提供商格式不同——硅基流动用 `deepseek-ai/DeepSeek-V4-Flash`，DeepSeek 官方用 `deepseek-v4-flash`，不要混。

### Q: 测试连接失败？
A: 检查三点：① API Key 是否正确（不要有空格）；② 网络能否访问对应域名；③ Key 是否还有余额。

### Q: 数据库连接失败？
A: 检查三步：① PostgreSQL 服务是否运行：`pg_isready`；② `.env` 的 `DATABASE_URL` 密码是否正确；③ 数据库 `novelforge` 是否已创建。

### Q: 端口 3001 被占用？
A: 杀掉占用进程再重启：
```bash
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
A:
```bash
pg_dump -U postgres novelforge > novelforge_backup.sql
psql -U postgres novelforge < novelforge_backup.sql   # 恢复
```

### Q: 能多人协作吗？
A: 目前是本地优先架构——每个作者在自己电脑上跑、有自己的数据库。多人协作需自己搭 PostgreSQL 服务器并共享 `DATABASE_URL`（注意补鉴权）。

### Q: 支持什么格式导入？
A: 拆书系统支持 `.txt`（建议 UTF-8）；创意工坊支持导入 `.preset.json` 预设。

### Q: 不想装 PostgreSQL？
A: 用 Docker，一条命令搞定：见 [快速开始 → 方式一](#方式一docker推荐无需单独装数据库)。

### Q: 生成太慢/填表卡住怎么办？
A: 填表与实体抽取会自动把推理模型映射为基础对话模型（fast），若仍慢请检查网络与 Key 余额；章节填表重跑幂等，不会重复建卡。

---

## 技术栈

- **前端框架**：Next.js 16 (App Router) + React 19
- **样式**：Tailwind CSS v4（虚空玻璃设计系统，CSS 变量令牌）
- **数据库**：PostgreSQL 17 + Prisma 7
- **API**：Next.js API Routes + SSE 流式响应 + 后台任务表（Fire-and-forget + 轮询）
- **AI**：多提供商 LLM（OpenAI 兼容协议；推理模型自动映射基础模型做抽取类任务）
- **构建**：Turbopack (开发) / Webpack (生产)
- **类型检查**：TypeScript strict mode（零错误门禁）

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

日常使用可以构建生产版（更快更省资源）：

```bash
npm run build          # 构建生产版本
npm start              # 启动生产服务器 (localhost:3001)
```

配合 Docker 数据库：

```bash
docker compose up -d   # 启动数据库
npm start              # 启动应用
```

> ⚠️ **公网部署前必读**：应用无内置鉴权。请务必在应用前加一层反向代理鉴权（Basic Auth / Tailscale / 防火墙白名单），并限制只能你本人访问。详见 [安全与隐私](#安全与隐私)。

---

## 项目结构

```
novel-forge/
├── prisma/
│   └── schema.prisma         # 数据库模型定义（项目/章节/角色卡/世界书/故事线/任务表…）
├── src/
│   ├── app/                  # Next.js App Router 页面 + API 路由
│   │   ├── page.tsx          # 首页（项目列表）
│   │   ├── explore/          # 探讨模式
│   │   ├── workspace/        # 工作台 [projectId]（写作主界面）
│   │   ├── dissect/          # 拆书系统
│   │   ├── api/              # API（generate/babylore/characters/storylines/story…）
│   │   └── …
│   ├── components/           # React 组件
│   │   ├── ui/               # 基础 UI（虚空玻璃设计体系）
│   │   ├── workspace/        # 工作台组件（角色卡/关系图/故事线/批量写作/填表弹窗…）
│   │   ├── explore/          # 探讨模式组件
│   │   └── dissect/          # 拆书组件
│   ├── core/                 # 核心业务逻辑
│   │   ├── babylore/         # 自动填表引擎（fill + 实体同步）
│   │   ├── pipeline/         # 生成后处理（章名/故事线回写/伏笔）
│   │   ├── agents/           # 编排器（多 Agent 写作）
│   │   └── …
│   └── lib/                  # 工具库（prisma/changelog/字符解析…）
├── docs/                     # 架构文档
├── .github/workflows/ci.yml  # CI（tsc + 测试 + 构建硬门禁）
├── CHANGELOG.md              # 完整版本历史（v3.1.6 …）
└── README.md                 # 本文件
```

---

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

---

> 🎯 Novel Forge · AI 写作助手 · 本地优先 · 数据自有
