# 工作单元费曼报告 · novel-forge v1.6.49 复检 workshop 创意工坊 + apply 出口链路

> 瑞宝宝专属 · 用大白话讲清「干了什么、为什么、怎么做的、踩了什么坑」

## 一、干了什么（一句话）

用无头浏览器把创意工坊（workshop）页面真实打开、确认它渲染健康，再用一个临时项目验证「把预设应用到项目」这条核心链路真的会把内容写进数据库，然后升版本、留档、推送。结论：**workshop 页面和 apply 出口都健康，没发现真故障**，属于健康基线确认，没动业务代码，只更新了版本公告。

## 二、为什么这么做（拆到底层原理）

创意工坊是 novel-forge 里一个「预设超市」：系统或用户把文风、世界观、角色卡、剧情推进模板等做成预设，其他项目可以一键套用。它的价值在于**把参考资料里的「写法」变成可复用资产**。

如果页面只是静态好看、点「应用到项目」后实际没写进数据库，那这个核心功能就是假的。所以本轮要确认两件事：
1. 页面在真实浏览器里能正常加载、显示预设卡片、所有按钮可见；
2. 点击「应用到项目」背后的 API 真的会把预设内容落库。

这和 dissect 的复检逻辑一样：先确认已交付轮子能转，再往下修别的。

## 三、用了什么方法 / 工具、效果如何

**工具：agent-browser（命令行无头 Chrome）+ curl 直接调后端 API。**

**实跑过程（按时间顺序）：**

1. **打开 /workshop 页面**：agent-browser 访问 `http://127.0.0.1:3001/workshop`，页面标题显示「创意工坊 · 共创社区」。
2. **截图验证**：保存到 `C:/Users/Administrator/ab_shots/workshop.png`，视觉上确认：
   - 左上角「返回」按钮；
   - 右上角项目下拉已选「星辰」；
   - 9 个页签：全部、表格模板、剧情推进、文风、世界观、角色卡、正则、世界书、API参数；
   - 搜索框；
   - 「载入示范预设」「上传预设」「导入文件」三个按钮；
   - 预设卡片网格 ≥6 张，包括「缝合怪·多线剧情推进」「古风·严谨文笔」「快节奏·爽文笔」「宫斗·妃嫔居住建筑表」「仙侠·世界观骨架」「好感度·分阶段人设模板」。
   - 没有 React 红色报错遮罩，没有白屏。
3. **核心出口 apply 测试**：为了不污染「星辰」这个常驻测试样本，我先创建了一个临时项目：
   - `POST /api/projects` 建项目 `workshop-v1.6.49-临时测试`，拿到 ID `3d201cb2-...`。
   - `POST /api/presets/ad360ab7-.../apply` 把「缝合怪·多线剧情推进」预设应用到这个临时项目。
   - 接口返回：`{ ok: true, created: [{kind:"lorebook", name:"多线推进指令（缝合怪）"}, {kind:"lorebook", name:"多条件组合人设（好感度+资产）"}] }`。
   - 再查临时项目详情，`appliedPresets` 数组里已经记录了这次应用（类型、标题、时间戳、预设 ID）。
4. **清理**：临时项目 `3d201cb2-...` 通过 `DELETE /api/projects/...` 软删（`recycled:true`），进了回收站，环境保持干净。

**效果数据**：页面渲染 0 报错；apply API HTTP 200，创建 2 条 lorebook 词条并记录 appliedPresets，链路真实落库。

## 四、关键取舍（为什么这么选、踩了什么坑）

- **为什么用临时项目而不是星辰？** 因为 apply 会在目标项目里写入世界书词条 / 角色卡 / 文风 / 正则规则等，会污染瑞宝宝的常驻测试样本。建一个临时项目→验证→软删，是最安全、最可复现的方式。
- **为什么只测 apply、不测上传/导入/AI 丰满/复刻/导出？** 这些是二级链路，页面按钮和 API 路由都已存在，但 v1.6.49 的核心目标是确认「最重要的出口」健康。如果每个二级按钮都点一遍，本轮会严重超时，不符合「循环推进不空转」的铁律。后续如果发现某个二级链路有问题，再单独修。
- **为什么页面加载用 agent-browser 而不是 curl？** workshop 是「use client」页面，预设数据是通过浏览器里的 fetch(`/api/presets`) 异步加载的。curl 只能拿到一个空壳 HTML，看不到真实渲染的卡片，必须让浏览器执行 JS 才能验。
- **一个小坑**：截图时第一次用了 Linux 风格的 `/tmp/ab_shots/workshop.png`，agent-browser 报「系统找不到指定的路径」。改成 Windows 绝对路径 `C:/Users/Administrator/ab_shots/workshop.png` 才成功。这是 Windows 路径习惯差异，不算故障。

## 五、反自欺闸门（我真的做到了吗）

- 页面截图是真实的，不是代码里搜出来的——有 `C:/Users/Administrator/ab_shots/workshop.png` 为证。
- apply 链路是真的调了后端接口并返回 `ok:true` + 2 条创建记录，appliedPresets 也真实记录了，不是看代码猜的。
- 临时项目真的软删了（`recycled:true`），不是口头清理。
- 诚实标注：本轮没有修任何 bug、没有加功能，只是确认健康；上传/导入/AI 丰满/复刻/导出等二级链路没有真跑。
- 个人 IP 铁律：全程只迭代 novel-forge 工程，没有另立 IP / 品牌，IP 永远归瑞宝宝。

## 六、照做就能复现的步骤

```bash
# 1. 确保 dev server 在 3001 端口运行
# 2. 用 agent-browser 打开 workshop 页面（Windows 管理员需 --no-sandbox）
export AGENT_BROWSER_ARGS="--no-sandbox"
node "C:/Users/Administrator/.workbuddy/binaries/node/versions/22.22.2/node_modules/agent-browser/bin/agent-browser.js" open "http://127.0.0.1:3001/workshop"
# 3. 截图保存到 Windows 路径
node ".../agent-browser.js" screenshot "C:/Users/Administrator/ab_shots/workshop.png"

# 4. 建临时项目
curl -s -X POST http://127.0.0.1:3001/api/projects \
  -H 'Content-Type: application/json' -d '{"name":"workshop-测试临时项目"}'
# 5. 拿到返回的 id，应用一个预设（例如 story_progression 缝合怪预设）
curl -s -X POST http://127.0.0.1:3001/api/presets/<preset-id>/apply \
  -H 'Content-Type: application/json' -d '{"projectId":"<temp-project-id>"}'
# 6. 查看项目详情，确认 appliedPresets 有记录
curl -s http://127.0.0.1:3001/api/projects/<temp-project-id>
# 7. 软删临时项目
curl -s -X DELETE http://127.0.0.1:3001/api/projects/<temp-project-id>

# 8. 双门禁
SAFE_DELETE_DISABLE=1 npx tsc --noEmit   # 期望 0 错误
npx vitest run                           # 期望 35 文件 323 测试全过
```
