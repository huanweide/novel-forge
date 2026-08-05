# Round-14 安全透镜审计报告：输入校验与深层安全坑

**项目**：novel-forge（本地单用户 AI 小说写作工具）
**技术栈**：Next.js 16 + React 19 + Prisma 7 + PostgreSQL 17
**审计对象**：工作副本 `C:\Users\Administrator\WorkBuddy\2026-07-25-14-19-44\novel-forge`
**基线**：HEAD = v1.0.2（commit 918c7d7）
**角色**：只读深度审计员（输入校验与安全透镜）
**前提**：本地单用户、无鉴权是设计前提，**不是漏洞**。下述评级均以此为前提区分「真实风险」与「本地单用户设计可接受」。

---

## 一、摘要

本次聚焦「输入校验与安全」七类深层坑，采用**只读静态审计**（全仓源码通读 + 危险模式扫描 + 历史 changelog 复核），未修改任何代码。

**核心结论：基于本地单用户前提，未发现必须立即修复的安全问题（0 条 P0/P1）。**

全仓扫描确认：
- 无 `child_process` / `exec` / `spawn` / `eval` / `new Function` → **无命令注入、无代码注入面**
- 无 `$queryRaw` / `$executeRaw` / `rawQuery` → **无原始 SQL 拼接**，DB 全部走 Prisma 参数化
- 无 `fs.writeFile` / `readFile` / `mkdir` / `unlink` / `path.join` / `path.resolve` / `../` / `FormData` → **无服务端文件落盘、无路径穿越面**
- 无 `dangerouslySetInnerHTML` / `redirect(` / `Location:` → **无 XSS、无开放重定向**
- 导出/备份 5 处 `Content-Disposition` 全部使用 `filename*=UTF-8''` 编码 → **无 ByteString 500 中文乱码面**（IMP-013 已真闭环）

遗留于**观察池**的两类面，仅在「服务被暴露到非本地网络」时才升级为真实风险：
1. **SSRF 面**：用户自配 LLM `baseUrl` 的 `fetch` 调用无 scheme/host 白名单校验（自残式，本地可接受）
2. **LLM Prompt 注入面**：用户输入拼入 prompt 未转义，但 LLM 仅生成文本、无工具调用/文件写/exec 越权通道（本地可接受）

---

## 二、逐条发现

### 发现 1：路径穿越 / 文件写入
**严重度：未发现（安全）**

经全仓扫描与逐路由通读，所有导入/导出/备份/恢复接口均在**内存中处理 JSON 或仅设置响应头**，**无任何服务端落盘逻辑**：

- `src/app/api/projects/[id]/export/route.ts`：文件名仅用于 `Content-Disposition` 响应头，不写盘；DB 查询 `where: { id }` 走 Prisma 参数化。
- `src/app/api/projects/[id]/backup/route.ts`：行 59 `name = (project.name || "project").replace(/[^\w一-龥-]/g, "_")` 做了字符清洗；返回 JSON 响应体，不写盘。
- `src/app/api/projects/[id]/restore/route.ts`：仅 `prisma.project.update({ data: { deletedAt: null } })`，无文件操作。
- `src/app/api/import/parse/route.ts`、`commit/route.ts`、`projects/import/route.ts`、`presets/import/route.ts`：全部 `request.json()` → 内存 JSON → `prisma.$transaction` 写库，无 `fs`、无 `path.join`、无 `../` 注入点。

**结论**：无 `../`、绝对路径、文件名注入的攻击面。本地单用户前提无影响。

---

### 发现 2：SQL 注入
**严重度：未发现（安全）**

全仓 Grep + Bash 兜底扫描结果为 **0 处** `$queryRaw` / `$executeRaw` / `rawQuery` / 字符串拼 SQL。所有 DB 访问均通过 Prisma 客户端参数化方法（`findUnique` / `findMany` / `create` / `update` / `delete` / `$transaction`），路由参数（如 `params.id`）直接进入 `where: { id }` 由 Prisma 转义。

**结论**：无 SQL 注入面。

---

### 发现 3：LLM Prompt 注入
**严重度：观察池（本地单用户设计可接受；网络暴露时升级 P1）**

用户输入（如导入 `rawText`、角色名、词条标题）在拼接 LLM prompt 时**未做转义/隔离**：

- `src/app/api/import/parse/route.ts`（行 ~218 `fetch(url, ...)`，url 由 `cfg.baseURL` + 用户 rawText 拼 prompt）
- `src/app/api/import/commit/route.ts`（行 ~107 `fetch(`${baseURL}/chat/completions`)`）

**缓解因素（关键）**：LLM 在本项目中**仅用于生成文本内容**（章节草稿、解析结果），**没有任何工具调用（tool use）/ 文件写 / `exec` / DB 越权通道**。即使存在 prompt injection，攻击者也只能诱导模型输出特定文本，无法触发任何越权操作。因此该面在「本地单用户 + 模型仅产文本」前提下风险可控。

**触发条件**：若未来引入 LLM 工具调用（如让模型直接调内部 API、写文件、执行命令），则必须在此前加入 prompt 沙箱/输入输出边界隔离，否则升级为 P0/P1。

**结论**：当前版本可接受，列入观察池，附升级条件。

---

### 发现 4：SSRF / 命令注入
**严重度：观察池（本地单用户自残式可接受；网络暴露时升级 P1）**

**命令注入**：全仓无 `child_process`、`exec`、`spawn`、`execFile`、`eval`、`new Function` → **零命令注入面**。

**SSRF 面**：所有对外 `fetch` 的 URL 均由用户自配的 LLM `baseUrl` 拼接，**无 scheme（仅允许 http/https）/ host 白名单校验**：

- `src/lib/llm.ts`：`testLLMConnection`（行 144–192）`fetch(`${resolvedBaseUrl}/chat/completions`)`，`resolvedBaseUrl` 来自入参 `baseUrl` 或 `PROVIDER_BASE_URLS`，无校验。
- `src/app/api/settings/test/route.ts`：`POST` 接收 `{ provider, apiKey, baseUrl, model }`，直接转发至 `testLLMConnection(..., baseUrl, model)` → 可请求任意 URL（含 `http://169.254.169.254/...` 云元数据等）。
- `src/app/api/settings/models/route.ts`：行 48 `fetch(modelsUrl)`，`modelsUrl = `${base}/models``，`base` 来自请求体，无校验。
- `src/app/api/import/parse/route.ts`（行 ~218）、`commit/route.ts`（行 ~107）：`baseURL` 来自 `getSettings()` 用户设置，无校验。

**触发条件**：攻击者必须是能访问本机设置界面的同机用户（本地单用户 = 自己配置自己），本质为「自残式」SSRF，本地前提可接受。若 `npm run dev` / 部署被暴露到非 localhost 网络（如 `0.0.0.0`），则任意能访问 Web 的人都可借此探测内网 → 升级为 P1，建议加 `baseUrl` 格式校验（仅 `http(s)://` + 非保留地址段）。

**结论**：命令注入未发现；SSRF 本地可接受，列入观察池并附升级条件。

---

### 发现 5：HTTP Header / 文件名（ByteString 500 铁律）
**严重度：未发现（安全，IMP-013 全覆盖）**

全仓 5 处 `Content-Disposition` 均使用 RFC 5987 `filename*=UTF-8''` 编码（中文名经 `encodeURIComponent`），无裸中文/控制字符直接进 header：

- `src/app/api/projects/[id]/export/route.ts`：行 90（html）、104（epub）、117（docx）、166（markdown+txt 默认分支）共 4 处均含 `filename*=UTF-8''${encodeURIComponent(filename)}`。
- `src/app/api/projects/[id]/backup/route.ts`：行 64 `filename="nfproject-${project.id.slice(0, 8)}.nfproject"; filename*=UTF-8''${encodeURIComponent(name)}.nfproject`。

**结论**：导出中文名不会触发 Node `TypeError: Header value must be a valid HTTP header` 的 ByteString 500。IMP-013 已全分支闭环（详见第三节）。

---

### 发现 6：敏感信息泄露
**严重度：观察池（局部可接受；建议收敛日志）**

**错误响应**：
- `src/lib/api-error.ts`：`classifyError` 默认分支（行 96–101）回显 `err.message`，**不含 stack / SQL 原文 / 密钥**；`jsonError` 仅返回 `{ error, code, hint }`。
- `src/app/api/import/commit/route.ts`：catch 回显 `err.message`（同上，无 stack 泄露）。

**设置接口密钥脱敏**：
- `src/app/api/settings/route.ts`：`GET` 经 `maskKey(settings.llmApiKey)`（行 23）仅显后 4 位，**不回显完整密钥**。

**日志**：仅 `console.warn/error` 打印 `message` 级别信息，未直接打印完整 API Key 原文（脱敏在响应层已做）。

**可改进点（非阻断）**：`classifyError` 默认回显 `err.message` 在极端情况下可能含第三方服务返回片段；建议本地场景维持现状即可，若网络暴露则改为固定文案 + 内部日志。

**结论**：当前无堆栈/SQL/密钥泄露风险，本地可接受，列入观察池。

---

## 三、历史复核：IMP-013（导出中文名乱码）是否真闭环

**结论：真闭环。**

书面证据链：

1. `src/lib/changelog-data.ts` 行 67 明确记录：
   > 「导出文件名乱码：markdown/txt 默认分支 Content-Disposition 补 `filename*=UTF-8''`（此前仅 HTML/EPUB/DOCX 三处，默认分支漏修致中文名乱码），现 4 分支一致」

2. 实测代码：export 路由 4 个分支（html/epub/docx/markdown+txt）全部存在 `filename*=UTF-8''${encodeURIComponent(filename)}`（行 90 / 104 / 117 / 166），与 changelog 描述一致。

3. backup 路由（行 64）独立覆盖 `filename*=UTF-8''` 编码。

**复核判定**：IMP-013 在代码层与记录层双向一致，无遗漏分支，确属真闭环。

---

## 四、观察池（当前本地单用户前提可接受，附升级条件）

| 项 | 位置 | 现状 | 升级为真实风险的条件 |
|----|------|------|----------------------|
| SSRF 面 | `src/lib/llm.ts:144`、`settings/test/route.ts`、`settings/models/route.ts:48`、`import/parse:218`、`import/commit:107` | 用户自配 `baseUrl` 无白名单，`fetch` 任意 URL | 服务暴露到非 localhost（如 `0.0.0.0`）→ 升级 **P1**，建议加 scheme/host 校验 |
| LLM Prompt 注入 | `import/parse/route.ts`、`import/commit/route.ts` 的 prompt 拼接 | 输入未转义，但 LLM 仅产文本、无工具调用越权通道 | 引入 LLM 工具调用/文件写/exec → 升级 **P0/P1**，需 prompt 沙箱隔离 |
| 错误响应回显 `err.message` | `src/lib/api-error.ts:96`、`import/commit/route.ts` catch | 无 stack/SQL/密钥，仅 message | 网络暴露且第三方错误含敏感片段 → 升级 **P2**，改固定文案 |

---

## 五、一句话结论

基于本地单用户前提，**未发现必须立即修复的安全问题（0 条）**；全仓无命令注入/SQL 注入/路径穿越/XSS/开放重定向，IMP-013 已真闭环，仅 SSRF 面与 LLM Prompt 注入面因「服务若暴露到非本地网络」而留入观察池。
