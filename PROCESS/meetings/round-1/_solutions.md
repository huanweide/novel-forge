# MaxLoop Round 1 解决方案（阶段三）

> 配套 `_integration.md` 的 IMP-001~IMP-030（Round-1 实施批次）。
> 每条含：文件:行号、改动意图、before→after 草样、验证方式。
> 代码执行 Agent 改前必须先 `Read` 目标文件对应区段，保留周围代码，仅做最小精准改动。

---

## IMP-001 完结切换 span→button（a11y，WCAG 2.1.1 A 级）
- 文件：`src/components/workspace/StorylineWorkbench.tsx:862-875`（LineNav 内 `<span onClick>`）
- before：
  ```tsx
  <span onClick={(e)=>{e.stopPropagation();onToggle();}} className="shrink-0 ..." title="标记完结">
    {s.status==="completed"?<Icon name="check"/>:<Icon name="circle"/>}
  </span>
  ```
- after：
  ```tsx
  <button type="button" aria-label={s.status==="completed"?"取消完结":"标记完结"}
    onClick={(e)=>{e.stopPropagation();onToggle();}}
    className="shrink-0 ... rounded-full focus-visible:ring-2 focus-visible:ring-ring/50">
    {s.status==="completed"?<Icon name="check"/>:<Icon name="circle"/>}
  </button>
  ```
- 验证：无头截图+键盘 Tab 可聚焦该按钮；`tsc` 通过。

## IMP-002 AI 生成按钮对比度（creative 3.75→达标）
- 文件：`StorylineWorkbench.tsx:398-413`、`StorylineList.tsx:118-133`
- 意图：按钮文字改用实心 creative 底+浅字（报告 F-02 方案③，对比度远高于 soft 底）。
- after：给该按钮套用现有实心主操作样式（如 `bg-[var(--nv-creative)] text-[#F0EEE8]` 或项目既有 `.btn-creative` 类）；列表入口同理（去掉 `text-[10px]` 紫底紫字，改实心）。
- 验证：复用 ui-ux-a11y 对比度脚本核对 creative 文字组合 ≥4.5:1。

## IMP-003 错误重试链接对比度
- 文件：`StorylineWorkbench.tsx:506`、`StorylineList.tsx:140`
- after：重试链接文字改 `text-[var(--nv-text-primary)]`（14.98:1）或局部提亮底；保证 ≥4.5:1。
- 验证：对比度脚本核对。

## IMP-004 输入框 placeholder 颜色统一
- 文件：`src/components/workspace/DialogUI.tsx:50-58`（input 无 placeholder 类）、`src/app/globals.css:613-615`（`input-glass::placeholder` 用 muted）
- after：DialogUI 的 input 加 `placeholder:text-[var(--nv-text-tertiary)]`；globals.css 的 `input-glass::placeholder` 改 `var(--nv-text-tertiary)`。
- 验证：截图核对 placeholder 可见度。

## IMP-005 侧栏高度塌陷
- 文件：`src/components/workspace/LeftPanel.tsx:55`（`aside` 类无 `h-full`）
- after：`aside` 加 `h-full`（或 `min-h-full`）；确认父 drawer 容器为 `flex` 以保证子项 stretch；内部 scroll 容器正确继承高度。
- 验证：无头截图量 `<aside>` 高度 ≈ 抽屉 805px。

## IMP-006 线索集标题去硬编码
- 文件：`StorylineWorkbench.tsx:773`（及关联 placeholder :791、:432）
- before：`线索集 / 纸集（融合龙王寨、菜市场注释、尸检报告等）`
- after：`线索集（伏笔、物证、人物备注等）`；placeholder 通用化（`标签（如：关键道具 / 人物线索）`、`例如：增加一条感情支线`）。
- 验证：无头截图线索集标题无项目专属词。

## IMP-007 剧情线→故事线（UI 层）
- 文件：`BackupDialog.tsx:18`、`ImportDialog.tsx:17`、`ForeshadowingPanel.tsx` 等 UI 组件中「剧情线」→「故事线」。
- 注意：仅改面向用户 UI 文案；后台代码（prompt/变量名）下轮处理，避免误改逻辑。
- 验证：全项目 Grep「剧情线」仅剩后台非 UI 引用。

## IMP-008 轮询空 catch 加错误计数+超时
- 文件：`StorylineWorkbench.tsx:85-124`（startPolling / interval 回调）
- after：回调 catch 中 `netErrCount.current++`；若 `netErrCount.current>5` 则 `clearInterval(pollRef.current);pollRef.current=null;setGenerating(false);toastError("生成状态同步失败，请重试")`。并加 `MAX_POLLS`（如 240 次≈6min）兜底；fetch 非 ok 已处理，仅处理抛异常分支。
- 验证：`tsc`；逻辑走查：连续 6 次网络错触发 toast 并停轮询。

## IMP-009 startPolling 加 interval 清理
- 文件：`StorylineWorkbench.tsx:85-124`
- after：函数开头 `if(pollRef.current){clearInterval(pollRef.current);pollRef.current=null;}` 再 `setInterval`。
- 验证：`tsc`；逻辑走查：连续调用不叠加 interval。

## IMP-010 关闭弹窗保留任务 id 可恢复
- 文件：`StorylineList.tsx:246-250`（onClose）、`StorylineWorkbench.tsx:126-131`（initialTaskId 挂载轮询）
- after：`onClose` 不再 `setGenTaskId(null)`（改为仅 `setWorkbenchId(null)` 与 `setGenSuggestions(null)`）；`StorylineWorkbench` 挂载时若 `initialTaskId` 存在或父级仍持有未完成 `genTaskId`，自动 `startPolling`。即：关闭仅卸载 UI，重开可续轮询。
- 验证：`tsc`；逻辑走查：生成中关闭→重开仍轮询到 done。

## IMP-011 列表 AI 生成连点锁
- 文件：`StorylineList.tsx:72-97`（handleGenerate）
- after：函数首行 `if(generatingRef.current) return; generatingRef.current=true;`；`finally` 中 `generatingRef.current=false;`（或 `useRef` 守卫）；并待任务 done/failed 再复位按钮 loading。
- 验证：`tsc`；连点不会创建多个游离任务（看服务端/日志仅 1 个 taskId）。

## IMP-012 toastCreated 参数修正
- 文件：`StorylineWorkbench.tsx:229`
- after：`toastCreated("故事线")`（只传实体名，避免「故事线 故事线已创建」）。
- 验证：操作后 toast 文案正确。

## IMP-013 AI生成→AI 生成 空格统一
- 文件：`StorylineList.tsx:130`
- after：`AI 生成`（带空格，与弹窗 `StorylineWorkbench.tsx:410` 一致）。
- 验证：Grep 两处均为「AI 生成」。

## IMP-014 七要素空值占位统一
- 文件：`StorylineWorkbench.tsx:40`（ELEMENT_META 结局 label）、`:728-731`（渲染）
- after：结局 label 简化为「结局」；空值统一显「—」或「待收束」（结局显「待收束」、其余显「—」），避免标签「结局（待收束）」+ 空值「待收束」重复。
- 验证：截图七要素网格无重复「待收束」。

## IMP-015 时间轴空态复用 EmptyState
- 文件：`StorylineWorkbench.tsx:759-763`
- after：空态改用 `<EmptyState icon="history" title="还没有章节进展" description="写作时会自动回写大事件" />`。
- 验证：截图时间轴空态与全局三态一致。

## IMP-016 加载错误态复用 ErrorState/Button
- 文件：`StorylineWorkbench.tsx:503-509`
- after：改用 `<ErrorState title="加载失败" description={...} action={<Button variant="outline" onClick={reload}>重试</Button>} />`。
- 验证：`tsc`；截图错误态用统一 Button 样式。

## IMP-017 线索 CRUD res.ok + 乐观更新/回滚
- 文件：`StorylineWorkbench.tsx:344-363`（handleCluePatch/handleClueDelete）
- after：fetch 后 `if(!res.ok){const d=await res.json().catch(()=>({}));toastError("更新/删除线索失败："+((d as any).error||`HTTP ${res.status}`));return;}`；采用乐观更新本地 list，失败回滚。
- 验证：`tsc`；模拟失败路径 toast 正确且状态一致。

## IMP-018 中间态 ending 只读
- 文件：`StorylineWorkbench.tsx:460-469`（ELEMENT_META 含 ending）、`:371-379`（updateSuggestionElement）
- after：中间态 ending 字段渲染为只读提示「结局不可在此填写，落库后可通过『标记收束』设定」，或从 ELEMENT_META 编辑列表移除 ending。
- 验证：中间态 ending 不可编辑；落库不再静默丢弃（因已不可填）。

## IMP-019 中间态「额外要求」死输入
- 文件：`StorylineWorkbench.tsx:431-432`
- after：文案改「对下一次生成的补充要求（可选）」，并说明当前草稿提交不含此内容；或落库时把 genExtra 作为 suggestions 批注随 commit 发送（若后端支持，否则仅改文案防误导）。
- 验证：文案不自我矛盾；无死输入困惑。

## IMP-020 落库 jargon→保存
- 文件：`StorylineWorkbench.tsx:226,235,489,492` 等
- after：「采用并落库」→「保存到故事线」；「落库中…」→「保存中…」；「落库失败」→「保存失败」（复用已有「保存失败」模式）。
- 验证：截图/操作文案无「落库」。

## IMP-021 线索图标按钮 aria-label
- 文件：`StorylineWorkbench.tsx:942,949`（线索编辑/删除图标按钮）
- after：补 `aria-label="编辑线索"` / `aria-label="删除线索"`。
- 验证：`tsc`；读屏可报出名称。

## IMP-022 滚动条 coarse 指针加宽
- 文件：`src/app/globals.css:709-721`（custom-scrollbar）
- after：加 `@media (pointer:coarse){.custom-scrollbar{width:9px}}` 或常显。
- 验证：触控环境截图滚动条可抓。

## IMP-023 空状态补 description
- 文件：`StorylineWorkbench.tsx:512-520`、`StorylineList.tsx:147-156`
- after：EmptyState 加 `description="让 AI 基于你的大纲自动规划主线与支线，填充七要素框架"`。
- 验证：截图空态有副文案。

## IMP-024 abandoned 完结按钮文案
- 文件：`StorylineWorkbench.tsx:676-688`（详情头部完结按钮）
- after：按 `selected.status` 显式分支：active→「标记完结」、completed→「重新开启」、abandoned→「重新启用」（或禁用）。
- 验证：abandoned 状态按钮文案不误导。

## IMP-025 时间轴「大事件」→「关键情节节点」
- 文件：`StorylineWorkbench.tsx:743,761`
- after：区域标题与空态文案「大事件」→「关键情节节点」。
- 验证：截图文案。

## IMP-026 orphanSides 死码
- 文件：`StorylineWorkbench.tsx:159`、`StorylineList.tsx:222`
- after：`sides.filter(s=>!resolveParent(s))`（删永假 `resolveParent(s)?.id===s.id`）。
- 验证：`tsc`；行为不变。

## IMP-027 进度条 label 计数不符
- 文件：`src/lib/storyline-progress.ts:34`、UI 标题 `StorylineWorkbench.tsx:711`
- after：label 改 `要素 ${filled}/6（不含结局）`；UI 标题副标题注明「结局单独标记」。
- 验证：截图进度文案与计数一致。

## IMP-028 btn-ghost+outline 叠加核查
- 文件：`StorylineWorkbench.tsx:482-483`（放弃按钮）、`:638`（取消）
- after：核查 Button 组件 variant=outline + className=btn-ghost 是否双边框；统一只用其一（推荐仅 `variant="outline"`）。
- 验证：截图放弃/取消按钮无双重边框。

## IMP-029 省略号/括号统一
- 文件：全局 `CenterPanel.tsx:252,390`、`OutlineDialog.tsx:109`、`RulesPanel.tsx:189`（半角 `...`）
- after：`...`→`…`；括号风格统一全角（中文语境）。注意：勿改 URL/代码标识符。
- 验证：Grep 无半角 `...` 在文案中。

## IMP-030 未知错误兜底常量
- 文件：storyline 组件中 8+ 处 `.catch(()=>({error:"未知错误"}))`
- after：抽 `const UNKNOWN_ERROR="请求失败，请稍后重试";`；可选按 HTTP 状态给 403/404/500 文案。
- 验证：`tsc`；文案更友好。

---

## 执行顺序建议（降低回归风险）
1. 先改纯文案/占位（IMP-006/007/012/013/014/019/020/023/024/025/027/029/030）——零逻辑风险。
2. 再改 a11y/对比度/布局（IMP-001/002/003/004/005/021/022/028）——视觉+合规。
3. 最后改交互健壮性（IMP-008/009/010/011/016/017/018/026）——逻辑相关，需 `tsc`+`vitest` 门禁。
4. 每完成一组跑 `SAFE_DELETE_DISABLE=1 npx tsc --noEmit`；全部完成后跑 `npx vitest run`。
