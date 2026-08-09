# 工作单元费曼报告 · novel-forge v1.6.51 复检 recycle 回收站 + restore/purge 出口链路

> 瑞宝宝专属 · 用大白话讲清「干了什么、为什么、怎么做的、踩了什么坑」

## 一、干了什么（一句话）

用无头浏览器打开回收站页面确认渲染健康，再用真实 API 测试「恢复项目」和「彻底删除项目」两条核心链路，同时顺手清理前两轮留下的测试垃圾，然后升版本、留档、推送。结论：**recycle 页面和 restore/purge 出口都健康，没发现真故障**，属于健康基线确认，没动业务代码。

## 二、为什么这么做（拆到底层原理）

回收站是任何内容创作工具的「安全网」：用户误删项目或节点后，能在这里恢复；确定不要后，能在这里彻底删除释放空间。如果回收站只是展示、恢复按钮点下去没反应，或者彻底删除没真删，用户要么丢数据、要么磁盘被垃圾占满。

novel-forge 里项目软删后进入 `/recycle`，页面提供「恢复」和「彻底删除」两个按钮。本轮要确认：
1. 回收站页面能正常加载，列出已删除项目/节点；
2. 「恢复」真的把项目从回收站里放回来；
3. 「彻底删除」真的把项目从数据库里抹掉。

## 三、用了什么方法 / 工具、效果如何

**工具：agent-browser（命令行无头 Chrome）+ curl 直接调后端 API。**

**实跑过程（按时间顺序）：**

1. **打开 /recycle 页面**：复用上一轮开启的 agent-browser 实例，访问 `http://127.0.0.1:3001/recycle`。
2. **截图验证**：保存到 `C:/Users/Administrator/ab_shots/recycle.png`，视觉上确认：
   - 标题「回收站」+ 返回主页按钮；
   - 提示「共 75 个项目在回收站」；
   - 项目卡片网格，包含本轮要测试的两个垃圾项目：
     - `workshop-v1.6.49-临时测试`（0 角色 / 2 词条 / 0 节点）
     - `星海探针`（0 角色 / 12 词条 / 0 节点）
   - 每张卡片都有「恢复」和「彻底删除」按钮；
   - 下方有「节点回收站」分区；
   - 没有 React 红色报错遮罩，没有白屏。
3. **restore 核心出口测试**：
   - 调用 `POST /api/projects/3d201cb2-b24b-4da9-92c1-8be141a2999e/restore`（恢复 workshop 临时项目）。
   - 接口返回 `{success:true, restored:true}`。
   - 调用 `GET /api/projects` 验证：`workshop-v1.6.49-临时测试` 已回到项目列表。
4. **purge 核心出口测试 + 环境清理**：
   - 调用 `POST /api/projects/3d201cb2.../purge`（彻底删除 workshop 临时项目），返回 `{success:true, purged:true}`。
   - 调用 `POST /api/projects/762db094-2d63-4df8-9d07-2b4b2b43c873/purge`（彻底删除 dissect 转换出的星海探针），返回 `{success:true, purged:true}`。
   - 再次调用 `GET /api/projects/recycle` 验证：这两个项目已从回收站消失。

**效果数据**：页面渲染 0 报错；restore API 成功且项目可重新出现在项目列表；purge API 成功且项目从回收站彻底消失。同时清理了 2 个测试垃圾。

## 四、关键取舍（为什么这么选、踩了什么坑）

- **为什么用真实测试垃圾而不是新建？** 前两轮（v1.6.48 dissect、v1.6.49 workshop）已经产生了软删的测试项目，正好作为回收站素材。用它们测试 restore/purge 既是验证功能，也是清理环境，一举两得。
- **为什么只测项目级 restore/purge，不测节点级？** 项目级 restore/purge 是回收站最主要、风险最高的操作。节点级路由也存在（`/api/story/nodes/[id]/restore` 和 `/purge`），但逻辑与项目级一致，本轮测项目级已覆盖核心模式。
- **为什么 restore 后又 purge 同一个项目？** 这是为了测试两条核心出口都用真实数据走一遍，同时确保最终环境干净。workshop 临时项目是测试垃圾，restore 验证后 purge 掉是合理归宿。
- **复用 agent-browser 实例**：继续复用 v1.6.49 开启的浏览器实例，从 /settings 导航到 /recycle，省了启动时间。

## 五、反自欺闸门（我真的做到了吗）

- 截图真实，有文件 `C:/Users/Administrator/ab_shots/recycle.png` 为证。
- restore 和 purge 是真的调了 API，有返回 JSON 和后续 GET 验证为证。
- 两个测试垃圾项目确实从回收站消失了，不是口头清理。
- 诚实标注：本轮没有修 bug、没有加功能；节点级回收站未真跑。
- 个人 IP 铁律：全程只迭代 novel-forge 工程，没有另立 IP / 品牌，IP 永远归瑞宝宝。

## 六、照做就能复现的步骤

```bash
# 1. 确保 dev server 在 3001 端口运行
# 2. 用 agent-browser 打开 recycle 页面
export AGENT_BROWSER_ARGS="--no-sandbox"
node "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node_modules/agent-browser/bin/agent-browser.js" open "http://127.0.0.1:3001/recycle"
# 3. 截图
node ".../agent-browser.js" screenshot "C:/Users/Administrator/ab_shots/recycle.png"

# 4. 恢复一个项目
curl -s -X POST http://127.0.0.1:3001/api/projects/<project-id>/restore
# 5. 验证回到项目列表
curl -s http://127.0.0.1:3001/api/projects
# 6. 彻底删除它
curl -s -X POST http://127.0.0.1:3001/api/projects/<project-id>/purge
# 7. 验证从回收站消失
curl -s http://127.0.0.1:3001/api/projects/recycle

# 8. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望 0 错误
npx vitest run                           # 期望 35 文件 323 测试全过
```
