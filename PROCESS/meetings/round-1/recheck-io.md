# 阶段五复检报告 · 导入导出迁移透镜（recheck-io）

> 复检子 Agent：MaxLoop 魔王系统复检（导入导出迁移透镜）
> 复验对象：round-1 阶段四"声称修复"的 4 个 IMP（IMP-013 / IMP-014 / IMP-015 / IMP-026）
> 复验日期：2026-08-06
> 门禁现状（Chair 已核验真实）：`SAFE_DELETE_DISABLE=1 npx tsc --noEmit` EXIT=0；`npm test` 211 passed
> 复验方法：① `git diff` + 读上下文确认修复；② 跑相关测试；③ 真机验证 IMP-013/026（dev 3001，curl 抓头与 markdown 正文比对）；④ 挖新坑

---

## 一、复验结论速览

| IMP | 阶段四自称 | 本透镜复验 | 等级 | 一句话 |
|-----|-----------|-----------|------|--------|
| IMP-013 导出文件名中文乱码 | 已修复（html/epub/docx 三分支加 `filename*=`） | **未真正修复（默认路径漏修）** | P1 | 默认 markdown/txt 导出头仍缺 `filename*=`，中文名仍乱码 |
| IMP-014 `.nfproject` 幂等过强 | 已修复（新增 forceNew 开关） | 逻辑正确，但有新坑 | P2 | forceNew 机制成立，但重复导入生同名"（副本）"且无回归测试 |
| IMP-015 import 事务 5s 超时 | 已核验无需改（timeout 已 120000） | **复核属实** | — | `import/route.ts:232` 确为 `timeout:120000` |
| IMP-026 导出目录锚点不匹配 | 已修复（slugify 保留 CJK） | **已修复（真机证实）** | — | 目录 `#第1章初遇与抉择` 与正文 `<a id="第1章初遇与抉择">` 一致 |

**残留问题数：P0×0 / P1×1 / P2×2**（详见第四节发现清单）

---

## 二、用户体验视角（双栏之一）

> 站在"用中文名项目导出、再导入备份"的真实用户角度。

- **场景 A · 默认导出**：用户写《真机验证导出测试》，点"导出"，前端大概率走默认 `format=markdown`（见 `export/route.ts:21` 默认值）。浏览器下载到的文件名是 `%E7%9C%9F...md` 这种 URL 编码串，**中文名看不懂、且多数浏览器不会自动解码成中文**。集成报告说"已修复"，但用户最常用路径没修到。
- **场景 B · 非默认导出**：用户若显式选 epub/docx/html，文件名 `filename*=UTF-8''中文.epub` 正常显示——这部分确实修好了。修复覆盖不均匀，用户按默认走就踩坑。
- **场景 C · 目录跳转**：导出的 markdown 在严格渲染器（Typora / VS Code 预览 / GitHub）里点目录能正确跳到对应章节，因为目录锚点和正文锚点用同一 `slugify` 生成，**这个体验是好的、已修好**。
- **场景 D · 导入备份**：用户导入第一份 `.nfproject` → 得到"X（导入）"；再次导入同一份（想建副本）勾选 forceNew → 得到"X（副本）"。这没问题。但**连续两次都勾 forceNew** → 得到两个都叫"X（副本）"的项目，列表里无法区分，只能靠创建时间猜。

---

## 三、总体视角（双栏之二）

> 站在工程质量、测试守卫、收敛真实性角度。

- **"已修复"判定存在假收敛**：IMP-013 在集成报告里被打成"已修复（第一批）"，但只覆盖了 html/epub/docx 三个非默认分支（`export/route.ts:90/104/117`），漏掉默认 markdown/txt 分支（`:166`）。属于"修了边角、漏了主干"的部分修复，门禁 211 passed 没拦住，因为**全仓没有 export 测试文件**。
- **IMP-015 复核确认无误**：上轮"已核验无需改"是诚实结论。`import/route.ts:232` 的 `{ timeout: 120000 }` 与 `:6` 的 `export const maxDuration = 300;` 都在，5s 默认超时问题在代码层面确实不存在。复检子 Agent 未盲目推翻上轮结论，而是复读代码验证。
- **测试守卫缺口是共性风险**：
  - 导出路径（IMP-013 的 content-disposition、IMP-026 的锚点一致性）**零自动化测试**，只能靠真机 curl 兜底。
  - 导入 forceNew/副本/幂等路径（IMP-014）在 `import/route.test.ts` 仅有 2 个用例（G1/W1 分支导入），**完全未覆盖 forceNew、副本后缀、幂等返回**，本次新坑（同名副本）毫无回归屏障。
- **真机验证价值**：IMP-013 的残留若只靠 `git diff` 看"有 filename*="就会误判通过；真机 curl 抓头才发现默认路径没动。这印证了本透镜"真机验证防假收敛"的方法必要。

---

## 四、发现清单（带 文件:行号 + 复验证据）

### F-1 · IMP-013 默认 markdown/txt 导出文件名仍中文乱码
- **严重度**：P1
- **位置**：`src/app/api/projects/[id]/export/route.ts:166`
- **现象**：默认格式（markdown/txt，见 `:21` 默认值）的响应头为
  `Content-Disposition: attachment; filename="%E7%9C%9F%E6%9C%BA%E9%AA%8C%E8%AF%81%E5%AF%BC%E5%87%BA%E6%B5%8B%E8%AF%95_2026-08-06.md"`
  无 `filename*=UTF-8''`，浏览器下载中文名显示为 URL 编码串。
- **根因**：阶段四仅给 html(`:90`)/epub(`:104`)/docx(`:117`) 三分支补了 `filename*=`，但 markdown/txt 的默认返回分支（`:163-168`）漏改，仍用 `encodeURIComponent(filename)` 塞进裸 `filename`。
- **真机证据**：`curl -s -i 'http://127.0.0.1:3001/api/projects/<id>/export?format=markdown'` 返回头无 `filename*= `；对照 `?format=epub` 返回 `content-disposition: attachment; filename="...epub"; filename*=UTF-8''%E7%9C%9F...epub`（含 `filename*=`，正常）。
- **建议**：将 `:166` 改为与 epub/docx 一致的形式，例如
  `"Content-Disposition": \`attachment; filename="${encodeURIComponent(filename)}"; filename*=UTF-8''${encodeURIComponent(filename)}\``
  （或统一抽一个 `disposition(filename)` 辅助函数，三处复用，杜绝再次漏改）。

### F-2 · IMP-014 重复 forceNew 导入生成同名"（副本）"项目，无编号去重
- **严重度**：P2
- **位置**：`src/app/api/projects/import/route.ts:52, :58, :83`
- **现象**：`forceNew=true` 时 `importSourceKey=null`（`:58`），跳过幂等命中，项目名追加"（副本）"（`:83`）。对同一备份连续两次 forceNew 导入 → 产生两个都叫"X（副本）"的项目，列表无法区分。
- **根因**：设计为"forceNew 即彻底新建副本、不做去重"，但副本名未做自增编号（如"X（副本 2）"），且 `importSourceKey=null` 使幂等彻底失效（符合预期，但缺 UI/文档提示）。
- **真机证据**：读码确认 `forceNew` 开关逻辑成立（`:52/58/83`）；无自动化用例触发该路径，属逻辑推演 + 代码确认，未做真机二次导入（dev 侧已清理验证项目，避免污染）。
- **建议**：① 给"（副本）"加自增序号；或 ② 在 UI/导入回执明确提示"forceNew 会生成完全独立副本、不做去重"；③ 至少补一个 import 测试覆盖 `forceNew` 分支。

### F-3 · 导出路径零自动化测试守卫（IMP-013/026 无回归屏障）
- **严重度**：P2
- **位置**：`src/app/api/projects/[id]/export/route.ts`（全文件无对应 `*.test.ts`）；`import/route.test.ts` 仅 109 行、2 用例
- **现象**：`npm test` 211 passed 但导出 content-disposition、slugify 锚点一致性均无测试。IMP-013 的"部分修复"能溜过门禁即源于此。
- **根因**：导出路由从未补测试；import 测试仅覆盖 G1/W1 分支导入，未覆盖 forceNew/副本/幂等。
- **建议**：新增 `export/route.test.ts`，断言（a）markdown 默认导出头含 `filename*=UTF-8''`；（b）markdown 正文目录锚点与正文 `<a id>` 一致（slugify 同源）。给 import 测试补 forceNew 用例。

### F-4 · IMP-015 复核：确实无需改（已确认）
- **严重度**：—（非缺陷，记录复核结论）
- **位置**：`src/app/api/projects/import/route.ts:232`（及 `:6` `maxDuration=300`）
- **现象**：事务超时确为 `timeout: 120000`（2 分钟），非默认 5s；API 路由 `maxDuration=300` 与 Vercel/Next 超时对齐。
- **结论**：上轮"已核验无需改"属实，本透镜无异议。

### F-5 · IMP-026 复核：已真修复（已确认）
- **严重度**：—（非缺陷，记录复核结论）
- **位置**：`src/app/api/projects/[id]/export/route.ts:174-182`（slugify）、`:132/136`（目录锚点）、`:193-194`（正文锚点）
- **真机证据**：导出《真机验证导出测试》含章节"第1章·初遇与抉择！"，markdown 目录为
  `- [#第1章初遇与抉择](...)`（slugify 去 `·`/`！` 保留 CJK），正文为
  `## <a id="第1章初遇与抉择">第1章·初遇与抉择！</a>`，两者锚点完全一致，严格渲染器可跳转。
- **结论**：已修复，真机证实，本透镜无异议。

---

## 五、诚实边界（本透镜能确认 / 不能确认）

**能确认（代码 + 真机证据）：**
- IMP-013 默认路径漏修（curl 抓头铁证：无 `filename*=`，对照 epub 有）。
- IMP-026 slugify 同源锚点正确（curl 抓正文，目录/正文锚点逐字一致）。
- IMP-015 timeout:120000 与 maxDuration=300 确在代码。
- IMP-014 forceNew 逻辑分支存在且成立（代码确认）。

**不能确认 / 留白：**
- F-2 的"同名副本"仅代码推演 + 逻辑确认，**未真机二次导入复现**（已清理验证项目，避免污染 dev 数据；如需铁证可补 import 测试或真机二次导入）。
- 全仓是否还有其他导出/导入边角路径（如 backup 快照、其他格式分支）未逐一穷举，仅覆盖 round-1 标记的 4 个 IMP 范围。
- 真机验证基于 dev 3001 即时状态，未重载/重启服务，假设 dev 与当前源码一致。

---

## 六、本透镜复验结论

- **IMP-013：未真正修复（P1 残留）**——阶段四的"已修复"是部分修复，仅覆盖 html/epub/docx 三个非默认分支，漏掉默认 markdown/txt 导出路径（`export/route.ts:166` 仍缺 `filename*=`，真机证据：默认导出头无 `filename*=`，中文名 URL 编码乱码）。这是典型的"假收敛"，211 passed 门禁因缺 export 测试而漏拦。
- **IMP-014：逻辑正确，但暴露新坑（P2）**——forceNew 跳过幂等 + 加"（副本）"机制成立；新坑为重复 forceNew 生成同名"（副本）"项目无编号去重，且无任何回归测试覆盖该路径。
- **IMP-015：复核属实，无需修改**——`import/route.ts:232` 的 `timeout:120000` 与 `maxDuration=300` 确在，5s 默认超时问题不存在。
- **IMP-026：已修复，真机证实**——slugify 保留 CJK 去标点，目录锚点与正文 `<a id>` 同源，严格渲染器可跳转。

**残留问题数：P0×0 / P1×1（IMP-013 默认路径漏修）/ P2×2（forceNew 副本名无编号 + 导出零测试守卫）。**

**IMP-015 复核结论：上轮"已核验无需改"结论诚实且属实，本透镜无异议，确认无需修改。**

---

*（验证项目"真机验证导出测试"已在 dev 侧 DELETE 清理，返回 200，无残留数据污染。）*
