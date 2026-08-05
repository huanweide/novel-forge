# 确认流程 · 端到端真机验证报告（费曼版）

> 适用读者：零基础大学生。目标——让你照着做也能复现「建项目→真实 LLM 写 12 章→逐章确认→整本交付」的完整闭环，并理解每一步在干什么、为什么。

---

## 一、干了什么（一句话）

我用「AI 智能体」的视角，在本地网站（端口 3001）真实跑通了 Novel Forge 的**确认流程**：先建了一个文明级题材项目，让真实的大模型写了 12 章正文（约 3.98 万字），然后逐章点遍所有确认按钮（提交确认 / AI诊断 / 确认通过 / 打回重写），最后点「项目确认完成」把整本书交付锁定。过程中发现并修复了一个会让流程死锁的真实 bug。

---

## 二、为什么这么做（底层原理）

用户要求「由开会决定智能体团队的大致确认流程，所有的按钮 UI」，并「由AI 智能体写 10 章以上、验证所有功能正常运转、最终在本地网站完成一次项目创作与确认流程」。

前置：Round 1 专项会议（7 人格 + 3 观测 + Chair 整合）已收敛出唯一权威规格 `agent-confirm-spec.md`，规定了一套 **5 态状态机**：

```
大纲态(outline_only) ──写正文──▶ 草稿态(drafting) ──提交确认──▶ 待确认(pending_confirm)
待确认 ──确认通过──▶ 已确认(confirmed) ──整本确认──▶ 项目交付(project_confirmed)
待确认 ──打回重写(填理由)──▶ 草稿态(drafting)
```

一句话类比：每一章像一枚火箭。**写正文**是总装，**提交确认**是申请发射窗口，**确认通过**是发射成功、正式入轨（此时才把这一章的设定/记忆写进数据库），**打回重写**是发射前发现故障、退回车间改；**项目确认完成**是全部火箭入轨、整个星座部署完毕。

规格最关键的一条铁律：**写正文后节点必须停在「草稿态(drafting)」，绝不自动「接受」**——因为未审视的草稿不该污染下游设定库；AI 诊断只是可选项，不是必经关卡。

---

## 三、方法 / 工具 / 效果

### 3.1 工具
- 本地 dev server（Next.js，`npm run dev -p 3001`），数据库 PostgreSQL，大模型走数据库里的 LLM 配置（key 在库不在 `.env`）。
- 三个 Node 脚本驱动真实 API（不用浏览器，因为沙箱无图形界面，用「真实 API 调用 + 读返回」代替点击）：
  - `scripts/agent-create-chapters.cjs`：批量建 12 章节点（含大纲）。
  - `scripts/agent-generate.cjs`：逐章调 `/api/generate/write`（SSE 流式生成）真实写正文。
  - `scripts/agent-confirm.cjs`：逐章调提交/诊断/确认/打回 + 整本交付。

### 3.2 发现并修复的真实断点（本验证的最大价值）
**现象**：生成完第 1 章后去点确认，中栏确认栏**没有任何按钮**——流程卡死。

**定位（第一性原理排查）**：
1. 读 `ChapterConfirmBar.tsx`：确认栏只在节点状态是 `completed` 或 `drafting` 时才显示「提交确认」按钮。
2. 抓 SSE 流发现生成后节点状态是 `reviewing`（后处理管线审校未过时的值）。
3. 读 `post-processor.ts` 第 194 行：生成后状态被定为 `reviewing`（审校未过时）/ `completed`（审校通过时）——**违反了规格「生成仅落 drafting」**。
4. 结论：`reviewing` 既不在确认栏的可点状态里，也不在状态机的确认前置态里 → 生成完的章节卡死，无按钮。

**修复（根因级，不改 UI）**：把 `post-processor.ts` 第 194 行改为生成后状态**恒为 `drafting`**。后处理的六维质量审校结果仍写入 `reviewLogs`/`qualityScore`，供「AI诊断」按钮展示，但**不再决定节点状态**（诊断是选项不是前置税，这正是会议定的）。

**效果**：重生成第 1 章验证 `status=drafting`、2413 字、生成完成 ✓。12 章全部落到 `drafting`，确认栏按钮全部出现。

### 3.3 第二个坑：确认偶发 503
**现象**：跑确认时所有 `确认通过` 返回 503「数据库访问出错」。

**定位**：读 dev 日志发现 `safeFillAfterWriting`（确认时自动填表）其实**成功**了，失败的是最后一步 `prisma.storyNode.update`。submit（只改旧字段）正常、confirm（多写新字段 `confirmedAt`）失败 → 证明运行中的 dev server 加载的是**旧 Prisma 客户端**，不含数据库里后来新增的 `confirmed_at` 列。

**修复（运维，非代码缺陷）**：重启 dev server 加载刚 `prisma generate` 出的新客户端。重启后单章确认立刻成功（`status=confirmed` 且写入 `confirmedAt`）。

> 反自欺注记：这个 503 不是代码 bug，是「旧进程 stale client」环境现象。验证时若再遇确认 503，先重启 dev server 再判。

### 3.4 验证结果（100% 通过）
| 环节 | 操作 | 结果 |
|---|---|---|
| 建项目 | `POST /api/projects` | 项目「火种：多行星文明备份计划」创建 ✓ |
| 写 12 章 | `POST /api/generate/write`（真实 LLM） | 12 章全部 `drafting`，共 39793 字，均章 3316 字 ✓ |
| 逐章提交确认 | `PATCH .../submit` | `drafting→pending_confirm` ✓ |
| 逐章 AI诊断 | `POST .../review`（纯本地六维质量分析，零 Token） | 全部 `passed=true`，分数 75–88，评级 A/B ✓ |
| 逐章确认通过 | `PATCH .../confirm` | `pending_confirm→confirmed`，触发自动填表（babylore 落库）✓ |
| 打回重写闭环（第5章） | `submit→reject(填理由)→submit→confirm` | 状态机完整闭环 ✓ |
| 整本交付 | `POST /api/projects/[id]/confirm` | `200`，写入 `confirmedAt`，「整本确认完成 🚀」✓ |
| 监控看板 | `GET /api/stats/monitor` | `confirmStats: {pending:0, confirmed:12, total:12, progress:100}` ✓ |

`tsc --noEmit` 零错误；双 changelog 升 `v0.46.90`；commit `ff3bcc3` 已代理推送。

---

## 四、关键取舍

- **修管线而非修 UI**：断点在「生成后状态」，根因在 `post-processor.ts`，所以改一处管线即可，不动确认栏组件——改动最小、契合规格、不引入新状态。
- **审校结果保留但去「闸门」化**：六维质量分析照常跑并写库，只是不再用它卡住节点状态（诊断是选项不是前置税）。
- **stale client 重启而非改代码**：503 是环境现象，重启即解，不为此改业务逻辑。

---

## 五、照做就能复现的步骤

```bash
# 1) 起服务（脚本自带 -p 3001；改了 schema 后务必重启以加载新 Prisma 客户端）
npm run dev            # 后台，端口 3001

# 2) 建项目
curl -X POST localhost:3001/api/projects -H 'Content-Type: application/json' \
  -d '{"name":"测试书","genre":["科幻"],"targetWordCount":36000,"synopsis":"...","toneKeywords":["硬核"]}'

# 3) 建章（scripts/agent-create-chapters.cjs，改 PROJECT_ID 后）
node scripts/agent-create-chapters.cjs

# 4) 写正文（scripts/agent-generate.cjs，支持 单章号 / 区间 2-12 / 999 全部）
node scripts/agent-generate.cjs 1-12

# 5) 走确认闭环（scripts/agent-confirm.cjs，第5章自动插打回重写）
node scripts/agent-confirm.cjs

# 6) 看监控看板进度应为 100%
curl "localhost:3001/api/stats/monitor?projectId=<你的项目ID>"
```

> 诚实边界：以上步骤在沙箱真机跑通（LLM 真实生成、DB 真实落库）。但**浏览器里的视觉交互**（确认栏按钮长相、左栏色点、右栏看板样式）未在沙箱目测——沙箱无 Chromium，需在你本地 `npm run dev` 打开 3001 目测确认。功能层（API + 状态机 + 自动填表）已全部真机验证通过。
