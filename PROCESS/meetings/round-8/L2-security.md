# 透镜 L2 安全边界审计（round-8 / v1.6.9）

> 审计员角色：只读深度审计员（MaxLoop Overlord round-8 开会子 Agent）
> 审计基线：已发布 v1.6.9，commit `fc5a662`（与 origin/main 一致，working tree clean）
> 审计日期：2026-08-07
> 说明：全程只读，未修改任何源码；所有发现均附 `file:line` 真实证据，无法验证处标注「未验证」。

## 一、审计方法与范围

**方法**
- 以 `git` 确认基线 commit，逐文件定位 L2 透镜相关落点。
- 使用 Grep / Read 检索危险模式（`child_process`/`spawn`/`exec`、`dangerouslySetInnerHTML`、`Content-Disposition`、`apiKey` 暴露、速率限制关键字等）。
- 重点精读：导出、导入、世界卡 PUT、设置、错误处理、schema。
- 不运行 `tsc`/`vitest`（由 Chair 统一跑）；仅做静态证据核对。

**范围（L2 安全边界）**
- 输入校验缺失（生成接口长文本 / 特殊字符 / 提示词注入；世界卡/角色卡字段）
- 路径穿越（导出/导入文件名、fs 路径拼接、import 解压遍历）
- 越权 / 横向移动（单用户下 projectId 归属校验、枚举遍历）
- 速率限制缺失（生成/导入无防刷 → 打爆 DeepSeek 网关造成资损）
- 敏感信息泄露（错误栈回显、密钥/token 进日志或响应、`.env` 泄漏）
- 文件上传校验（类型/大小未限制，超大文件拖垮服务）
- 命令注入（spawn/exec 外部命令参数未转义）
- HTTP header 中文导致 500（下载文件名、重定向 header 的 ByteString 规则遗漏）

**未覆盖 / 已交他人**：round-7 已修项（世界卡 PUT 白名单、entity-auto-creator 兜底、IO 导出 400）仅做「完整性复核」，不重复计为本次新发现。

## 二、发现清单

| ID | 严重度 | file:line | 问题描述 | 证据 / 复现 | 修复建议 |
|----|--------|-----------|----------|-------------|----------|
| L2-001 | P1 | 全仓库（无 `rateLimit`/`throttle`/`@upstash` 等任何限流机制，Grep 零命中）；`src/app/api/generate/*`、`src/app/api/import/*`、`src/app/api/settings/test/route.ts` | 全站速率限制缺失。任何可触达 API 的客户端可无限次调用消耗 LLM 的接口（生成/导入/测试连接），打爆 DeepSeek 网关，造成**资损**与服务不可用（DoS）。 | Grep `rateLimit|ratelimit|limiter|throttle|@upstash` 于 `src/` 返回 `No matches found`。各 route 直接处理请求无前置限流。 | 引入轻量限流中间件（如 `@upstash/ratelimit` 或内存令牌桶），对 `/generate/*`、`/import/*`、`/settings/test` 按 IP/全局设阈值；LLM 消耗型接口尤其需要。 |
| L2-002 | P1 | `src/app/api/import/parse/route.ts:287-288`（仅 `<30`）；`src/app/api/import/quick/route.ts:282`（仅 `<20`） | 导入文本 `rawText` **无上限校验**（只有下限）。超大文本（如数十 MB）会触发巨量 LLM 分块调用（`chunkByBudget`/`CONCURRENCY=4` 池）+ 服务端内存/CPU 占用，导致**资损（LLM 计费）与服务拖垮**。 | `import/parse` 仅 `if (text.length < 30) ...`；`import/quick` 仅 `if (text.length < 20) ...`，均无上限。正文可任意大。 | 设置明确上限（如 1 MB / 50 万字），超限返回 `413 Payload Too Large`；同样约束 `import/commit` 的 `chapters/characters/loreEntries` 数组与 `projects/import` 整包 JSON 体量。 |
| L2-003 | P2 | `src/lib/api-error.ts:96-101`（默认分支 `error: err.message`）；`src/app/api/import/parse/route.ts:535-536`（`send({type:"error", message: msg})`） | 错误响应回显内部消息。默认分类分支直接把 `err.message` 透传前端；SSE 错误路径把原始 `err.message` 直接发给客户端。若部署到非 localhost 环境，可泄露内部路径、SQL 片段或实现细节。 | `classifyError` 默认：`error: err.message || "服务器内部错误"`；`import/parse` catch：`message: err instanceof Error ? err.message : String(err)`。 | 默认分支返回泛化文案（如「服务内部错误，请查看日志」），明细仅 `console.error` 留存；SSE 错误同样用泛化消息。 |
| L2-004 | P2 | `prisma/schema.prisma:428`（`llmApiKey String @default("") // API Key（明文存储，数据库本地）`） | LLM API Key **明文存储**于数据库。GET 设置接口已掩码（仅后 4 位），但数据库文件或 `.nfproject` 备份泄露即可恢复明文密钥。 | schema 注释自承明文；`settings/route.ts:23` 仅展示 `maskKey(...)`。 | 密钥改存环境变量或经应用层加密（AEAD）后再入库；备份导出时对 `llmApiKey` 强制剔除/掩码。 |
| L2-005 | P2 | `src/app/api/settings/route.ts:42`（PUT 仅 `typeof llmBaseUrl === "string"`）；`src/app/api/settings/test/route.ts:18`（`testLLMConnection(provider, ..., baseUrl, model)` 由请求体 baseUrl 触发服务端 fetch） | `llmBaseUrl` 无协议/主机校验，且测试连接接口接受**任意** baseUrl 并让服务端发起 fetch → 若 API 可被外部网络触达，存在 **SSRF** 面（探测/打内网）。 | PUT 仅做类型判断；`test` 直接把 `body.baseUrl` 传入 `fetch(${baseURL}/chat/completions)`。 | 校验 scheme 仅 `http(s)`、禁止 `localhost`/内网 CIDR/metadata 地址；或把可连 baseUrl 收敛为可信域名白名单。 |
| L2-006 | P2 | `src/app/api/lorebook/[id]/route.ts:34-47`（PUT 仅对 `category` 白名单，其余字段原样写入） | 世界卡 PUT 仅校验 `category`；`content/title/keys/depth/enabled/parentId/relatedEntryIds` 无类型/长度校验。`parentId` 与 `projectId` 可被指向**他项目的条目**（FK 仅约束表内，无项目归属校验）；`syncGlobalPrompt(body.projectId || entry.projectId)` 会接受 body 中伪造的 projectId。单用户场景影响有限，但属越权逻辑缺陷雏形。 | 见 L2 透镜重点。round-7 的 category 白名单已正确落地（完整性已确认），但其余字段未被覆盖。 | 补充字段类型/长度校验；`parentId` 限定同一 `projectId`（`body.projectId` 一律丢弃，改用服务端 `entry.projectId`）。 |
| L2-007 | P2 | `src/app/api/generate/write/route.ts:33-37,60,86`（`authorNote`/`cardNotes`/`newCharacterRequests` 无上限，直接拼入 prompt） | 生成接口用户文本无长度上限，且以字符串拼接方式直接注入 LLM prompt（如 `generate/outline` 的「【用户角色备注——最高优先级】」）。属于**提示词注入**面：可劫持生成行为/污染正文，但**不导致代码执行**。 | `const { authorNote, cardNotes, newCharacterRequests } = body` 无 `maxLength`；`prepareAuthorNote`/`injectRules` 直接拼接。 | 对 authorNote 等设长度上限；用明确分隔符/系统角色边界标注「以下为用户输入」降低注入成功率。 |
| L2-008 | P2 | 全部 API（如 `src/app/api/projects/[id]/export/route.ts:37`、`import/parse:299`、`generate/write:45` 直接用 `body.projectId`） | 缺少**全局鉴权/归属校验**抽象层；接口盲目信任客户端 `projectId`。但 `prisma/schema.prisma` 主键均为 `uuid()`（`@default(uuid())`），不可枚举，单用户下无实际横向越权。属「单用户掩盖下的设计缺口」，未来多租户会直接暴露。 | 各 route 无 `userId`/归属校验；schema 主键为 uuid，枚举不现实。 | 引入 auth/归属校验中间件占位；即便单用户，也应在数据访问层固定「当前用户 = 单例」，避免 `projectId` 直接来自不可信 body。 |

## 三、已确认无问题的区域（诚实边界）

- **HTTP header 中文导致 500（ByteString 规则）**：已全面修复。导出 4 个分支（`markdown/txt/html/epub/docx`）与 `backup` 均使用 RFC 5987 `filename*=UTF-8''` + `encodeURIComponent`，无裸中文/控制字符入 header。`export/route.ts:121-202`、`backup/route.ts:65` 已验证。
- **命令注入**：全仓库无 `child_process` / `spawn` / `execSync` / `exec` 调用（Grep 命中均为 `regex.exec`，非 OS 命令）。无外部命令执行路径。
- **路径穿越（文件/解压遍历）**：导入全部为 `request.json()` 解析（`import/parse`、`import/quick`、`projects/import`、`import/commit`），**无文件上传、无 zip/解压、无 fs 路径拼接**。`projects/import` 整包在内存解析并做 id 重映射，未写盘到用户可控路径；下载文件名取自 `project.name` 并经 `encodeURIComponent` 处理。未发现 `../` 穿越面。
- **XSS（渲染未转义）**：唯一 `dangerouslySetInnerHTML` 出现在 `src/app/layout.tsx:38,54`，仅注入**静态**主题/Service Worker JS，非用户数据。用户数据（世界卡/角色卡/正文）经 React 自动转义渲染；导出 HTML 经 `escapeHtml` 转义（`src/core/epub.ts:11,49,127`）。**未验证**：前端组件是否另有 markdown 预览用 `dangerouslySetInnerHTML`（Grep 未命中，建议 Chair 复核组件层）。
- **密钥/ token 经接口泄露**：`settings` GET 已掩码（`maskKey` 仅后 4 位，`settings/route.ts:10-27`）；`settings/test` 仅用请求体 key 做服务端调用，**不回显** key（`:18-19`）。未发现 token 进入响应或日志明文。
- **round-7 已修项完整性复核**：世界卡 PUT `category` 白名单（L24-32）已完整落地，仅当显式传入时校验，与 POST 规则一致；`entity-auto-creator` 兜底、`IO 导出 400` 不重复报告。

## 四、需 Chair 关注的跨透镜风险

1. **L2-001 / L2-002（速率限制 + 导入体量）** 同时属于「成本可观测性 / monitor 透镜」——无限制会放大 `generation-metrics` 的成本失真与 LLM 网关熔断风险，建议与 monitor 透镜联动定阈值。
2. **L2-007（提示词注入）** 与「内容质量 / 一致性透镜」相关：用户输入可污染生成，需质量透镜评估实际影响面。
3. **L2-005（SSRF）** 与部署架构相关：若产品未来暴露到非 localhost（如 0.0.0.0 公网），该面会升级为 P0，建议部署透镜确认默认监听范围。

---

**汇总**：本次 L2 透镜共发现 **P1 × 2、P2 × 6、P0 × 0**（合计 8 条，含 1 条复核确认无新增）。最严重一条：**L2-001（全站速率限制缺失 → LLM 网关资损/DoS）**。
