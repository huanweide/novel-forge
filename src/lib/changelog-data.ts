/**
 * Novel Forge 更新公告 —— 前端公告系统数据源
 *
 * ⚠️ 强制同步规则（每次代码变更 + commit 前必做）：
 *   本文件必须与项目根目录 CHANGELOG.md 保持同步。
 *   两个文件一起更新、一起 commit——缺一不可。
 *
 * 步骤：
 *   1. 在本文件 VERSIONS 数组最前面新增版本条目
 *   2. LATEST_VERSION → 新版本号
 *   3. CHANGELOG_BRIEF → 新版本4条摘要
 *   4. 同步更新 CHANGELOG.md（项目根目录）
 *   5. 两个文件一起 git commit
 *
 * 验证：localhost:3001/changelog 能看到最新版本
 */

export interface VersionEntry {
  version: string;
  date: string;
  title: string;
  sections: Array<{
    label: string;
    items: string[];
  }>;
}

export const LATEST_VERSION = "v1.6.11";

/** 首页公告弹窗摘要（只列最新版本的关键项） */
export const CHANGELOG_BRIEF = [
  "v1.6.11 双 P0 bug 修复：章节摘要 summarize 不再把 LLM 自由文本 JSON.parse（对齐全站 raw 约定），消除 500（#113）；精修 refine 按已有正文长+增量放大 max_tokens 预算，消除整章重输出截断（#114），并加 L5-06 完整性保护（新输出过短则保留原正文+告警）防静默丢前文",
  "v1.6.11 Round-16 功能实用性董事会：游戏模式三处 UI 入口（大纲树 / 工作区 / 新手引导）移除——7/7 人格判为傻子功能，偏离本地写作利器核心",
  "v1.6.11 限流降级：单用户本地场景下限流属过度防御，rate-limit 加 ENABLE_RATE_LIMIT 开关默认关闭，仅保护自用 API key / 供应商额度时开启，不再误伤本地作者",
  "v1.6.11 构建修复：globals.css 新增 @source not 排除 PROCESS 审计文档被 Tailwind v4 误扫描生成非法 CSS 变量名，根治 next build 因文档反引号类名字面量报错",
];

/** 完整版本历史（最新在前） */
export const VERSIONS: VersionEntry[] = [
  {
    version: "v1.6.11",
    date: "2026-08-07",
    title: "Round-16 功能实用性董事会（星辰底座实机复检 / 双 P0 bug 修复 / 游戏模式入口移除 / 限流降级 / 构建修复）",
    sections: [
      {
        label: "星辰底座实机复检与双 P0 bug 修复",
        items: [
          "章节摘要 summarize 修复（#113）：route 把 LLM 返回的自由文本 characterStates 当 JSON.parse 必抛 SyntaxError→500；改为 raw: characterStates 对齐全站 post-processor/apply-extraction 的 { raw } 约定，星辰底座实机复检 HTTP 200 通过",
          "精修 refine 截断修复（#114）：writeSection 原传 targetWords（增量）致 max_tokens 预算只覆盖增量、整章重输出在已有正文处截断增长 0；改为传 existingContent.length+targetWords（cap 5000）放大预算，截断消除",
          "refine L5-06 完整性保护：新输出显著短于原正文（<90% 且非主动缩写意图）时降级保留原正文+告警，防模型把续写误解为重写精简版而静默丢前文；prompt 加「一字不落保留已有正文」铁律",
        ],
      },
      {
        label: "Round-16 功能实用性董事会裁决",
        items: [
          "游戏模式入口移除（全票傻子功能）：大纲树游戏按钮、工作区互动游戏按钮、新手引导游戏化激励三处 UI 入口隐藏（底层 game 路由/引擎/页面代码保留作技术债参考），7/7 人格判定其偏离本地写作利器核心、把小说平台偷换为互动游戏引擎",
          "限流降级：单用户本地场景下限流属过度防御（防不存在的多租户滥用），rate-limit 加 ENABLE_RATE_LIMIT 开关默认关闭，仅当保护自用 API key/供应商额度避免资损时设 true 开启，不再对本地作者误伤",
        ],
      },
      {
        label: "构建稳定性修复",
        items: [
          "globals.css 新增 @source not 排除 PROCESS 审计文档与诊断产物被 Tailwind v4 自动扫描误入反引号类名字面量（如 text-[var(--nv-…)]）生成非法 CSS 变量名，根治 next build 因文档内容报错；关键帧位置整理",
        ],
      },
    ],
  },
  {
    version: "v1.6.10",
    date: "2026-08-07",
    title: "魔王 Round-8（性能内存墙与摘要去重 / 全站限流与导入安全 / 数据并发与孤儿治理 / 浅色金 AA 与写章截断检测）",
    sections: [
      {
        label: "性能与内存墙（L1 路A + L3-002）",
        items: [
          "post-processor 4.5 段四查询改 Promise.all 并发 + 窄列 select（summary 仅 id/chapterId/content/order/nodeId；beat 仅 id/nodeId/content；commitment 仅 id/sourceNodeId/type/content；character 复用 context-loader 已载窄列），并加 take 上限（summary50/beat60/commitment30）杜绝长书全量载入峰值内存",
          "context-loader 的 characterCard/lorebookEntry 查询加 take:50 + 窄列投影（characters 仅 id/name/role/arcProgress/currentStatus；lorebook 仅 id/title/category/content）并回传 data.characters 供 post-processor 复用，消除重复查",
          "摘要/节拍写前 deleteMany 去重（chapterSummary where chapterId、storyBeat where nodeId），先清旧再建新，杜绝重复行挤占 take 窗口；复用 create 返回值替代 634/684 重查",
          "export 递归建树 O(N²) 改为一次性 childrenMap（O(N)）按 id 查子；world-category-classifier 关键词模块级小写预计算，消除内层 toLowerCase 重复开销",
        ],
      },
      {
        label: "全站限流与导入安全（L2 路B）",
        items: [
          "新建 src/lib/rate-limit.ts 内存滑动窗口（Map + 惰性清理），导出 createRateLimiter/rateLimit；generate/write|refine|continue|chapter-outline、import/parse|quick|commit、settings/test 接入，阈值生成类 10/min、导入类 5/min、settings/test 3/min，超限返回 429 Too Many Requests",
          "import/parse 与 import/quick 的 rawText 加上限 50 万字符，超限返回 413，防一次性巨文本打爆内存",
          "api-error.ts 的 classifyError 默认分支泛化（error 改为「服务器内部错误，请查看日志」，明细仅 console.error），SSE 错误路径同样不回显原始 err.message，杜绝异常信息泄漏",
        ],
      },
      {
        label: "数据并发与孤儿治理（L3 路C）",
        items: [
          "story/nodes/[id] 删除节点包 $transaction：先 deleteMany 关联孤儿（chapterSummary where chapterId、storyBeat where nodeId、pendingCommitment/pendingItem where sourceNodeId）再删节点，根除删节点留孤儿 String 引用",
          "storylines/[id] 重挂 updateMany + delete 包 $transaction 原子；删除后扫描相关 storyNode 的 bindings JSON 剔除被删线条目并 update，引用一致性收敛",
          "storyline-writer 与 plan-chapter 对同一条 Storyline 的 chapterBindings 改写包 $transaction 原子，并统一 bindings 结构为 {storylineId,chapterId,chapterOrder,element,note,focus,advance,at}，消除解析脆弱与并发丢失更新",
          "entity-auto-creator 写入前二次查重（projectId+name/title）+ try/catch 捕获 P2002 转 skip + 内存 Set 去重，防并发实体重复；story-status.ts 新增 STORYLINE_STATUS/COMMITMENT_STATUS 常量，全仓替换 status 字面量；confirm-guard 幂等前置（仅状态真跃迁才执行填表副作用）",
        ],
      },
      {
        label: "浅色金 AA 与写章端到端（L4 路D + L5 路E）",
        items: [
          "globals.css 浅色新增 --nv-accent-text-on-light: oklch(0.50 0.12 95)（CR≥4.5 达 WCAG AA），新增 .text-accent-label 类；settings/recycle/workshop/page/game/status-badge 等 11 处金色小文字改 text-accent-label，治愈浅色金 CR≈2.51 不达标",
          "workspace/[projectId]/page.tsx 与 CenterPanel 生成进度加 aria-live=polite 区域（错误用 assertive），屏幕阅读器可感知生成状态",
          "llm/client 的 resolveMaxTokens 改为按 targetWordCount*1.6 动态计算（下限 4096）替代固定 4096 与字数脱钩；流式透传 finish_reason，write/refine/continue 检测 length 截断即回滚节点（refine 回滚 prevContent、write 标记 truncated），不把残片落库",
          "write/refine/continue 透传 request.signal 至 chatStream，断连即中止生成与落盘（L5-04）；continue 起点前复用/清理本会话孤儿 drafting 节点，SSE 中断即删孤儿（L5-03）；import/commit 逐章校验 content 非空，缺漏跳过并告警而非整事务回滚（L5-06）",
        ],
      },
    ],
  },
  {
    version: "v1.6.9",
    date: "2026-08-07",
    title: "魔王 Round-7 补批（故事线状态机与入口治理 / IO 健壮性 / 世界卡安全兜底 / 伏笔面板实时性 + 监控减负）",
    sections: [
      {
        label: "故事线状态机与入口治理（SL-1~SL-6）",
        items: [
          "abandoned/paused 治理覆盖章纲、抽卡、游戏三入口：chapter-outline 双路由补 filterActiveStorylines 排除已完成/废弃线；game/outline/generate 的 main 死字面量改 OR[ {type:main},{status:active} ]；intent-parser/tool-registry 的 paused 状态统一改 abandoned，状态机口径一致",
          "workspace/[projectId]/page.tsx 的 storylineId 选择器短路修正（原 && 短路漏渲染活跃线）；generate/continue/route.ts 加事务 + 空响应守卫，防 order 并发重复章号与空壳写入",
        ],
      },
      {
        label: "IO 健壮性（IO-1~IO-8）",
        items: [
          "generate/write、generate/refine 路由空守卫前置（write 空摘要、refine 无守卫已补），杜绝空正文/空摘要入库",
          "projects/[id]/export 非法 format 返回 400 而非静默降级；import/commit 返回结构化错误并异步触发（fire-and-forget）伏笔 detect；pipeline/post-processor 连败跳过空壳，导入导出与续写链路更稳",
        ],
      },
      {
        label: "世界卡安全与兜底（WC-1~WC-2）",
        items: [
          "lorebook/[id] PUT 加字段白名单（仅允许更新允许的字段，防越权改类型/归属）；lib/entity-auto-creator 的 resolveEntityCategory 加兜底（分类器未覆盖实体时回退不丢），世界卡写入更可控",
        ],
      },
      {
        label: "伏笔面板实时性 + 监控减负（FS-1~FS-3 + MON）",
        items: [
          "components/workspace/ForeshadowingPanel 订阅 store 500ms 防抖重拉 + 监听 foreshadowing:updated 事件驱动刷新，确认/定稿后面板秒级更新；core/foreshadowing 排除 sourceNodeId 防 refine 误判回收；auto-confirm 循环内 skipDetect 避免重复 detect",
          "stats/monitor 路由加 15s TTL 缓存（不再每次全量扫）；scripts/audit-api-refs.cjs 容注释过滤 + 模板归一，巡检更稳",
        ],
      },
    ],
  },
  {
    version: "v1.6.8",
    date: "2026-08-07",
    title: "魔王 Round-7 收口（伏笔 detect 并发去重 / 时序倒挂假阳性 / 长书内存峰值 / 多主线跨线误归属 / 浅色 tertiary AA）",
    sections: [
      {
        label: "伏笔 detect 并发去重（NEW-2）",
        items: [
          "confirm-guard.ts 的 triggerForeshadowDetect 加 projectId 进程内互斥去重锁（detectLocks），并发确认（批量确认/多章同时定稿）只发一次全量 detect 并复用在途 promise 结果，杜绝超时重试放大服务端雪崩",
        ],
      },
      {
        label: "伏笔 detect 时序倒挂假阳性 + 长书内存峰值（NEW-3 + NEW-4）",
        items: [
          "detectPayoffs 回收判定口径由 updatedAt 改为 createdAt >= anchor：排除伏笔埋设前旧章节被无关润色 refine 刷新 updatedAt 误判 fulfilled 的时序倒挂假阳性，同时保留与伏笔同期创建章节日后 refine 补回收的合法命中（Round-4 新坑1 能力不回退）",
          "DB 层按 createdAt >= minAnchor 预过滤章节正文，不再把全书旧章节一次性载入；命中由单个巨型 haystack 改为按片段数组逐个短路（.some），长篇小说 O(C×S) 全量载入的峰值内存显著下降",
        ],
      },
      {
        label: "多独立主线跨线误归属（NEW-5）",
        items: [
          "outline-context.ts 的 pickReassignMainId 仅在「恰有一条活跃兄弟主线」时自动重挂；0 条或 ≥2 条活跃兄弟时返回 null，交由删除路由把子线 parentId 置空、由 resolveParent 回退，杜绝多独立主线并存时把被删主线子线盲目嫁接第一条 active 主线",
        ],
      },
      {
        label: "浅色 tertiary 达 WCAG AA + 层级倒挂消解（NEW-UI-WC-2）",
        items: [
          "globals.css 浅色 --nv-text-tertiary 由 #6B6E78（surface-3 上 3.767:1 < 4.5 AA）改为 #5E616B（≈4.577:1 ≥ AA），且仍弱于专用 --nv-text-muted-on-surface-3(#5A5D67, 4.860)，层级不再倒挂",
        ],
      },
    ],
  },
  {
    version: "v1.6.7",
    date: "2026-08-07",
    title: "魔王 Round-6 收口（故事线重挂守卫口径对齐 / 伏笔 detect 旧运行时兼容 / 伏笔面板 hover 配色 / 测试误删事故补救）",
    sections: [
      {
        label: "故事线重挂守卫口径对齐（R4-NEW-6）",
        items: [
          "outline-context.ts 的 isRehangTargetActiveMain 查询由无效枚举字面量 status: { in: [active, main] } 改为 OR: [{ type: main }, { status: active }]，消除 main 死字面量（status 枚举无此值）导致的守卫恒漏判",
          "与前端 isRehangTargetActiveMain 严格 status === active 口径对齐，重挂目标判定不再因脏查询漏掉活跃主线",
        ],
      },
      {
        label: "伏笔 detect 旧运行时兼容（R4-NEW-7）",
        items: [
          "confirm-guard.ts 的 AbortSignal.timeout 调用加 typeof AbortSignal?.timeout === 'function' 防护，旧 Node 运行时该 API 未定义时降级为不传 signal，根除每次 detect 同步抛错必然失败",
          "confirm-guard.test.ts 补降级用例：AbortSignal.timeout 未定义时 triggerForeshadowDetect 不抛且 fetch 仍发出、opts.signal 为 undefined",
        ],
      },
      {
        label: "伏笔面板 hover 配色修复（NEW-UI-WC-3）",
        items: [
          "ForeshadowingPanel.tsx 的 hover:bg-[var(--nv-surface-4)] 改为已存在的 surface-2（surface-4 主题未定义、原 hover 无反馈），面板交互可见性恢复",
        ],
      },
      {
        label: "测试误删事故补救 + 门禁收口",
        items: [
          "补救 Round-5 Agent 把装配引擎测试误写入 game-engine.test.ts 覆盖原 21 例游戏引擎测试（净减 14 例）的事故：git checkout 恢复 game-engine 21 例 + 新建 assembly/engine.test.ts 归位 4 例装配测试",
          "门禁实跑：tsc 零错误 + 283 单测全绿（从误删后 262 恢复），game-engine 21 例 + engine.test.ts 4 例 + classifier 8 例全部就位，误删清零",
        ],
      },
    ],
  },
  {
    version: "v1.6.6",
    date: "2026-08-07",
    title: "魔王 Round-3 + Round-4 + Round-5 收口（伏笔检测全漏斗闭环 / 世界卡 15 类全链路同源 / 故事线死过滤+N8+abandoned / IO与监控健壮性 / surface-3 三主题达 AA）",
    sections: [
      {
        label: "伏笔检测全漏斗闭环（R2-007 收口 + Round-4 新坑1）",
        items: [
          "confirm-guard.ts 新增 triggerForeshadowDetect 共享 helper（真实 request.url.origin + 失败 console.error + 轻量重试一次），applyConfirm / post-processor 步骤4.5 / 手动 confirm 三处统一收口",
          "batch-confirm 在所有节点确认后仅触发一次全量 detect（避免 N 次重复重扫）；Round-4 修 detect 只读陈旧摘要——detectPayoffs 改为并行读 chapterSummary + storyNode.content 实时正文，refine 改写后的伏笔回收信号真正可见、面板更新",
        ],
      },
      {
        label: "世界卡 globalPrompt 15 类无遗漏（PIT-1 + PIT-2）",
        items: [
          "sync-global-prompt.ts 的 catOrder 由硬编码 10 项（含 2 虚构分类、漏 7 类）改为从 ALL_WORLD_CATEGORIES 派生，根除「世界卡写库正确但 globalPrompt 静默丢弃 7 类」最后一公里断点",
          "Round-4 消除 catLabel 手抄漂移根因：分类器新增 WORLD_CATEGORY_LABELS 单一权威常量，键类型与 ALL_WORLD_CATEGORIES 共用 WorldCategory 联合类型，编译期强制 1:1 对齐，新增/改名类漏改即 tsc 失败；Round-5 将游戏侧 engine.ts 第二份手抄 CATEGORY_SECTIONS（11/15、漏 4 类塌缩 custom）改为从分类器 WORLD_CATEGORY_SECTIONS 派生，键入 Record<WorldCategory> 强制 15 类全覆盖，多源漂移根因彻底清除",
        ],
      },
      {
        label: "故事线死过滤 + N8 回归（N1~N4 + N8）",
        items: [
          "orchestrator 死过滤修复：s.completed 字段不存在致恒 true，已完结/废弃线仍注入写作；改为 filterActiveStorylines 按真实 status 排除 completed/abandoned",
          "多主线只渲染第一条修复（groupStorylinesByMain）+ continue 章号 order 不递增修复（续写节点 order 严格递增不重复）；Round-4 修 N8 回归：删除主线级联重挂收紧为仅活跃兄弟主线，[id]/route.ts 与 generate 双处加固，保住 R2-006 隶属前缀",
          "Round-5 故事线 abandoned 主线排除：StorylineList 多主线遍历剔除 abandoned 主线、stories generate/[id] 路由补 N4/N8/abandoned 守卫，废弃主线不再污染写作上下文与 UI 渲染",
        ],
      },
      {
        label: "IO / 监控 / 主题可达性（R3-IO + R2-012 + surface-3 三主题）",
        items: [
          "IO 空导出边角修复：选中非根节点其子树无正文时 export/route.ts 新增正文空判定守卫返回 400 + roots 口径修正，杜绝静默产出空白文件",
          "监控 R2-012 退化修复：context-loader 窗口度量口径由整体节点序号改为章/节序号，前文截断退化消除；surface-3 muted 全三主题达 WCAG AA（深色 Round-3 新增令牌、浅色/苍青 Round-4 重新核算取值）",
        ],
      },
    ],
  },
  {
    version: "v1.6.5",
    date: "2026-08-07",
    title: "魔王 Round-2 深度体检 + 15 项修复（世界卡闭环 / 写章溯源 / 故事线层级 / 伏笔闭环 / IO 健壮性 / 主题可达性 / 监控去误报）",
    sections: [
      {
        label: "世界卡 15 类自动填表闭环（P0 · R2-001/R2-002）",
        items: [
          "确定性分类器 world-category-classifier.ts 正式接入自动填表：entity-sync.ts 对 custom 分支用分类器兜底路由，根除 v1.6.3「分类器声明即摆设」",
          "type 枚举补 magic_system/culture/history/law/currency 5 类、TYPE_TO_CATEGORY 补 5 映射，15 类世界卡全部可达；新增主张级集成测试（mock LLM 覆盖各 type，断言落库分类覆盖全集）",
        ],
      },
      {
        label: "世界卡收口（P1 · R2-014/R2-015）",
        items: [
          "lorebook API 用 ALL_WORLD_CATEGORIES 做 Set 白名单校验，非法分类（如 currnecy 错字）直接 400 拒绝，不再静默持久化错乱数据",
          "LorebookEditDialog 分类下拉与 pre-write-cards 完整性校验全部由 WORLD_MODULES / ALL_WORLD_CATEGORIES 派生，消除 13~36 文件字符串散落",
        ],
      },
      {
        label: "写章溯源与批量角色卡（P1 · R2-003/R2-004）",
        items: [
          "refine/continue 路由补传 source 字段，填表/确认溯源链闭合",
          "批量生成 PreGenConfirm 补 localStorage 写入端，批量角色卡约束主路径真正生效（此前读写断链）",
        ],
      },
      {
        label: "故事线层级（P1 · R2-005/R2-006）",
        items: [
          "generate 解析现有主线优先接管未完结主线，支线不再误挂已完结旧主线",
          "formatStorylines 注入「支线 X 隶属于主线 Y」层级说明，AI 写章实时感知支线归属",
        ],
      },
      {
        label: "伏笔检测闭环（P1 · R2-007，部分）",
        items: [
          "applyConfirm 新增 skipDetect，auto-confirm / 手动确认 / 游戏导出三条路径触发 /api/foreshadowing/detect",
          "批量确认与 refine 确认两条漏斗的 detect 触发留待 v1.6.6 收口（复检发现）",
        ],
      },
      {
        label: "导入导出健壮性（P1 · R2-008/R2-009）",
        items: [
          "导出勾选仅命中父节点时后端返回 400 + 前端 toastWarning 提示（空导出主场景拦截）",
          "导入错误细化为超时 / P2002 / P2003 / 字段缺失结构化错误",
        ],
      },
      {
        label: "深色主题可达性 + 监控去误报 + 生成按需加载（P1 · R2-010/R2-011/R2-012）",
        items: [
          "--nv-text-muted 由 #83807A 调亮至 #8E8B82，弹窗/卡片/纯底对比度 4.86/4.83/5.39 达 WCAG AA（surface-3 残留 4.25 留 v1.6.6）",
          "API 巡检脚本跳过模板插值 + 文档白名单 + 文件系统动态发现，实跑 REAL_BROKEN_LINKS=0",
          "context-loader 全量节点改为轻量 select + 按需拉取 keepWindow(≥5) 章正文，长项目不再无界拉 10–20MB（多卷前文截断退化留 v1.6.6）",
        ],
      },
      {
        label: "质量门禁",
        items: [
          "tsc 零错误 + 246 单测全绿（较 v1.6.4 净增 8：entity-sync 4 + lorebook 4）；18 文件改动经 8 透镜深度体验 + 8 复检 Agent 交叉验证「真生效」",
        ],
      },
    ],
  },
  {
    version: "v1.6.4",
    date: "2026-08-07",
    title: "故事线支线联动 UI + 数据化（#651）+ #652 整体标记完成",
    sections: [
      {
        label: "支线联动 UI 与数据化（#651）",
        items: [
          "generate 路由两阶段创建：先建主线拿 id，再建支线时 parentId 挂主线，落实'支线服务于主线'铁律，schema 的 parentId 字段从此真正生效（此前所有支线 parentId 均为 null）",
          "StorylineList 主线卡片聚合'旗下支线数 + 支线平均进度 + 综合联动进度条（主线本体 70% + 支线生态 30%）'，一眼看到主线带动了几条支线、整体推进到哪",
          "支线卡片显示'隶属主线：XXX'标签并左侧 accent 竖线缩进，形成可见层级归属；归属解析优先 parentId、回退唯一主线，历史数据（parentId 为 null）同样联动",
        ],
      },
      {
        label: "#652 整体标记 completed",
        items: [
          "子项 #653✅ #654✅ #655✅ #656✅（世界卡三类模块补全 / 确定性分类器 / 故事线融入写作 / 进度量化）全绿，#657 质量门禁（tsc 0 / vitest 238），#658 升版收尾，本条整体 completed——v1.6.3 写作模块与世界卡融合工作全部收口",
        ],
      },
      {
        label: "质量门禁",
        items: [
          "tsc 零错误 + 238 单测全绿（19 文件），#651 改动不破坏编译与现有测试",
        ],
      },
    ],
  },
  {
    version: "v1.6.3",
    date: "2026-08-06",
    title: "世界卡体系补全（三类模块 + 确定性分类器 + 14 类自动填表验证）+ 故事线深度融入写作 + 进度量化",
    sections: [
      {
        label: "世界卡三类模块补全（#653）",
        items: [
          "世界面板 WORLD_MODULES 新增命运体系(fate_system,icon compass)/物理列表(physics,icon flask)/公开体系(public_system,icon landmark) 三类模块，并补齐功法(technique)/货币(currency) 此前缺失的模块定义，世界书分类覆盖由 12 类扩至 15 类",
          "四处定义点同步：core/types/index.ts 的 LoreCategory 枚举、core/settings/parser.ts 的 ParsedLoreEntry.category、core/agents/tool-registry.ts 的 agent 工具 enum 与中文映射 CATEGORY_MAP、components/workspace/LorebookEditDialog.tsx 分类下拉（全仓唯一硬编码点）补齐三类 option",
          "填表链路同步：core/babylore/entity-sync.ts 的 TYPE_TO_CATEGORY 补 fate/physics/public 映射；api/generate/pre-write-cards/route.ts 完整性校验补 fate_system/physics/public_system/currency 等判定，避免新模块被误判缺失",
        ],
      },
      {
        label: "世界卡确定性分类器与 14 类自动填表验证（#654）",
        items: [
          "新增 src/lib/world-category-classifier.ts：确定性强、长词优先消歧，覆盖 15 个世界卡分类 + 2 个元桶（地点/人物），让自动填表路由到正确模块，不再靠 LLM 自由发挥",
          "配套 src/lib/world-category-classifier.test.ts 6/6 通过，验证长词优先、元桶兜底、边界消歧",
          "entity-sync 补齐 fate/physics/public 映射后，14 类自动填表链路完成闭环验证（写章自动建卡 → 确认自动填表 → 世界书正确归类）",
        ],
      },
      {
        label: "故事线深度融入写作（#655）",
        items: [
          "outline-context.ts 的 formatStorylines 经 orchestrator.buildPromptContext 注入写作 systemPrompt，修仙/非修仙双分支均覆盖",
          "仅注入未完成的 active 线（status=active 且未完结），让 AI 写章时实时感知主线/支线七要素进展与章节绑定，避免各写各的、前后矛盾",
          "真实生成验证：新城项目写章时已能读到故事线上下文",
        ],
      },
      {
        label: "故事线进度量化与 UI + 质量门禁（#656 + #657）",
        items: [
          "新增 src/lib/storyline-progress.ts：computeStorylineProgress 计算七要素填充数 + 章节进展数，输出完成百分比与文案；配套 storyline-progress.test.ts 5/5 通过",
          "StorylineList 主/支线卡片新增进度条小组件，直观显示每条故事线的完成度",
          "质量门禁：tsc 零错误 + vitest 238 个测试全绿（较 v1.6.2 的 217 净增 21：分类器 6 + 进度 5 + entity-auto-creator 16）；21 个在途改动全部收口",
        ],
      },
    ],
  },
  {
    version: "v1.6.2",
    date: "2026-08-06",
    title: "UI 三项体检收尾（按钮反馈 / 去重 / 配色）+ 生成链路健壮性修复",
    sections: [
      {
        label: "按钮完成反馈补齐（用户要求：每个按钮点击后要有成功反馈）",
        items: [
          "useConfirmDelete 删除成功后补 toastSuccess「已删除」（覆盖删章节/项目/角色/词条/剧情线/规则等 8 处复用）",
          "ExportDialog 导出后 toastSuccess「已开始导出，文件将在新标签页下载」；BackupDialog 备份包下载后 toastSuccess「备份包已开始下载」",
          "workspace 页 handleAddSection（新建章）、handleConfirmOutline（批量建章）、handleBatchGenerate（批量写作完成）均补成功 toast",
        ],
      },
      {
        label: "按钮去重（用户要求：重复的合并，不要重复按钮）",
        items: [
          "Toolbar 删除「更多▾→工具箱」下拉（与右栏 RightPanel 的「工具箱」tab 完全重复），工具箱入口统一由右栏 tab 承载",
          "ToolboxDialog 模态组件重写为纯类型模块（仅导出 ToolboxItem 类型 + CATEGORY_META 常量），删除与右栏重复的 React 模态；静态自查确认 onOpenToolbox 全仓零引用、无组件再当弹窗渲染",
        ],
      },
      {
        label: "配色兼容（用户要求：与其他按钮保持较好兼容，不要风格差异）",
        items: [
          "DrawCards 心情色卡硬编码色（purple-/pink-）收归 --nv 设计令牌（creative/danger/info/success/warning/accent）",
          "RelationshipGraph 图例爱情色 bg-pink-400 → --nv-creative；CharacterDialog 创建/保存按钮统一 btn-primary；ProjectConfigPanel 主按钮 text-white → --nv-text-primary",
          "清理用户可见 emoji：Toolbar 自定义文风标签「✏️ 自定义文风」→「自定义文风」",
        ],
      },
      {
        label: "生成链路健壮性（真实生成「新城」第7章验证中发现并修复）",
        items: [
          "摘要重试兜底：post-processor 调用 summarizeChapter 时若返回空 summary（沙箱 LLM 网关偶发），最多重试 3 次再继续；连败则保留占位标题，绝不写垃圾标题",
          "空响应回滚：write 路由检测到正文为空（模型偶发空返回）时，将节点回滚到 outline_only 并清空残片，避免在前端留下无法继续的脏空章",
          "质量门禁：tsc 零错误 + 217 单元测试全绿；真实生成验证链路（记忆召回→正文→废词扫描→六维质量→审校→自动确认→实体入库→DONE）闭环通过",
        ],
      },
    ],
  },
  {
    version: "v1.6.1",
    date: "2026-08-06",
    title: "章节承接修复 + 章节命名修复（LLM 整章摘要作章名） + 故事线/世界面板截断与点击修复",
    sections: [
      {
        label: "章节承接修复（用户反复强调：每章须顺着写）",
        items: [
          "route.ts writingInstruction 新增「承接上一章结尾」段：取 previousNodes 末章（紧邻上一章）content 末 400 字，拼接显式指令「请务必从上一段结尾处自然接续展开，保持情节/人物/时间线连贯；可顺同场景或合理切换，但绝不凭空重启无关开头」",
          "上一章由 sliding window（keepChapters=4）的 previousNodes 提供，新章自动顺延序号（order+1），符合「上一章第四章→本章第五章」的预期",
        ],
      },
      {
        label: "章节命名修复（用户指出：章名不该由开头写了什么字决定）",
        items: [
          "移除 v1.4.0 的「标题为空时用正文首段前 20 字兜底」错误逻辑（post-processor.ts），该逻辑导致章名变成正文开头碎片段",
          "改为在摘要环节用 summarizeChapter 对整章生成的 summary 作章名，前缀「第N章：」（N=order+1）；仅当标题为空或仍是「第N章」占位、且正文非空时才回填，绝不覆盖用户自定义标题，也避免模型空返回时写垃圾标题",
          "同步回填刚创建的 ChapterSummary.chapterTitle，保持上下文摘要一致",
          "真实生成验证：第7章标题正确生成「第7章：樊斯瑞深夜赴悬崖别墅见迭戈·美第奇，得知父亲留下的地图是临摹、探测仪数据曾被第三……」",
        ],
      },
      {
        label: "故事线 UI 修复（用户指出：主线点击应能打开、文字被截断）",
        items: [
          "StorylineList 主线条目标题点击直接打开全屏总览弹窗（StorylinesModal），落实「主线剧情点击打开」",
          "主线条目标题、支线条目标题、详情描述由 truncate 改为 break-words，窄栏内完整换行显示不再截断",
          "StorylinesModal 主线/支线标题同样 truncate→break-words",
        ],
      },
      {
        label: "世界面板 UI 修复",
        items: [
          "WorldEntryCard 标题 truncate→break-words，且点击直接打开编辑弹窗看全文",
          "内容预览 line-clamp-3→line-clamp-4，窄栏内展示更多文字",
        ],
      },
      {
        label: "质量门禁与验证",
        items: [
          "tsc 零错误 + 217 单元测试全绿；dev server 实测全链路：新建第7章节点→真实生成（1962 tokens，自动确认 confirmed）→ 章名与承接均正确；workspace 页 SSR 200；测试节点已清理",
        ],
      },
    ],
  },
  {
    version: "v1.6.0",
    date: "2026-08-06",
    title: "角色关系自动回填 + 批量写作章纲确认流 + 生成确认章纲循环 + 缝合怪节奏",
    sections: [
      {
        label: "自动填表补全角色关系（v1.2.0 遗留解决）",
        items: [
          "entity-sync LLM 抽取协议新增 relationships（对方名/关系/动态，1-4 条，只记正文明确体现的关系，禁止脑补）",
          "新角色建卡即带 relationships；已存在角色卡按名称匹配补关系（同名关系不覆盖、封顶 8 条，失败不影响表格）",
          "实测「新城 · 龙陨之地」第四章：已存在卡「韩姓男子」自动补上「迭戈·美第奇：主仆」「樊斯瑞：对手」两条关系，「龙渊」补 2 条",
        ],
      },
      {
        label: "批量写作两段流（章纲确认）",
        items: [
          "batch-write 支持双模式：mode=outline 建 N 章并后台逐章生成章纲（写 node.outline，不写正文，result.outlines 返回章纲列表）；mode=write 用 nodeIds 逐章后台写正文（write 自动读取 outline 作为本节大纲）",
          "BatchWriteDialog 重写为两阶段：先生成章纲（后台+轮询进度）→ 章纲列表逐章可编辑/勾选/全选 → 确认后保存章纲并启动正文后台生成（右下角进度胶囊可关窗口）",
          "实测两段流闭环：章纲模式 60s 生成「第5章」章纲（核心冲突/情感基调/场景序列），write 模式约 2.2min 正文完成（章名自动兜底、智能审阅定稿 confirmed，2694 字）",
        ],
      },
      {
        label: "单章生成确认内置章纲循环",
        items: [
          "PreGenConfirm 新增「章纲（可选步骤）」区：先生成章纲 → 直接编辑 → 不满意改作者指令点「修复章纲」重新生成 → 确认生成正文（确认时自动保存编辑后的章纲）；不生成章纲也能一键直出正文",
        ],
      },
      {
        label: "缝合怪节奏调控 + 故事线全屏弹窗 + 视图精简",
        items: [
          "BuildConfig 新增 stitchPace（fast/steady/slow，默认 steady），BuildConfigDialog 三选一 UI 带小字说明；storylines/generate 的 newMain 分支按节奏描述构造新主线事件密度",
          "新增 StorylinesModal 全屏总览弹窗：主线/支线完整过程（七要素 + 章节进展时间轴）+ 一键打勾完结 + AI 生成；左栏故事线 tab 工具栏加入口",
          "删除大纲「时间线」视图（世界时间已删，三视图冗余），左栏只留分卷/平铺；OutlineTree/LeftPanel/page 类型同步收窄",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿；dev server 实测全链路"],
      },
    ],
  },
  {
    version: "v1.5.0",
    date: "2026-08-06",
    title: "批量写作后台化 + 故事线 UI 升级 + 生成确认极简化",
    sections: [
      {
        label: "批量写作（round-6 方案落地）",
        items: [
          "新增 POST /api/story/batch-write：FillTask(taskType=batchWrite) 立即返回 taskId，后台逐章——建新章节 → 调自身 /api/generate/write（完整链路：章纲计划/记忆召回/正文/后处理/章名兜底/自动填表）→ 消费 SSE 到 done → 上报进度；同项目运行中任务去重",
          "正文区新增「批量写作」按钮 → 弹窗选数量（1-10）+ 作者指令 → 启动后台任务；右下角进度胶囊显示「批量写作中… X/Y 章（Z%）」，可隐藏（任务继续），完成 toast 并自动刷新章节列表",
          "实测「新城 · 龙陨之地」count=1：后台 2.8min 生成第 5 章（3883 字、章名自动取正文首段、自动填表 8 条、智能审阅自动定稿 confirmed）",
        ],
      },
      {
        label: "故事线 UI 升级",
        items: [
          "故事线卡片状态图标可点击：一键在「活跃 ↔ 已完结」间切换（PUT status），主线打勾提示「自动缝合新主线」",
          "故事线展开详情新增「章节进展」时间轴：渲染每章自动回写的大事件（chapterBindings，含七要素阶段与章节号）",
        ],
      },
      {
        label: "生成确认极简化",
        items: [
          "PreGenConfirm 去掉复杂角色调度（角色卡大列表勾选/每卡备注/缺角色自建按钮），只留「人物（可选，逗号分隔）」+ 作者指令 + 确认；人物输入匹配已有卡优先出场、新名作为 AI 自建，留空则自动调度",
          "onConfirm 签名不变，父组件 handleWriteConfirmed 等无需改动",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.4.0",
    date: "2026-08-06",
    title: "生成轻量化·填表后台化：一键追评改后台 + 自动去重合并 + 故事线回写与缝合怪 + 删世界时间",
    sections: [
      {
        label: "一键追评填表后台化（不再死等，可关页面）",
        items: [
          "新增 FillTask 任务表（taskType 支持 fill/batchWrite），POST /api/babylore/fill-all 改为创建任务后立即返回 taskId（实测 139ms），后台 fire-and-forget 逐章执行（本地进程常驻，关页面任务继续）",
          "新增 GET /api/babylore/fill-task/[taskId] 进度轮询；同项目运行中任务自动去重（返回既有 taskId）",
          "前端「自动填表」弹窗一键追评改后台：点击后提示「后台填表已启动，可关闭本窗口」，2.5s 轮询显示「填表中 X/Y 章（Z%）」，完成 toast；已填章节自动跳过（增量语义沿用）",
        ],
      },
      {
        label: "角色自动去重合并（自动分类旁新增按钮）",
        items: [
          "新增 POST /api/characters/dedupe：全正文统计角色出现次数（每章封顶 1 次）——出现<3 次且背景薄弱标记「🎭 龙套」（不删除，可筛选）；相似名称（小名/繁简/错别字变体，isSimilarName）合并到内容最丰富的角色：别名并入、关系合并改指、被并卡软删标记「🗂 已合并」",
          "角色工具栏「自动分类」旁新增「自动去重合并」按钮，悬浮显示详细介绍；结果弹窗展示合并组与龙套清单，关闭即刷新列表",
          "实测「新城 · 龙陨之地」17 角色：483ms 扫描，0 组合并 0 龙套（角色均干净，逻辑正确）",
        ],
      },
      {
        label: "故事线回写 + 缝合怪推进（自动生成故事线默认开启）",
        items: [
          "新增 src/core/pipeline/storyline-writer.ts：orchestrator 计算的 threadProgress（之前被丢弃）现在回写 Storyline——白名单七要素、仅 active 线、impactScore>=4 才写（只记大事，不吃个饭这种细节）、覆写七要素 + chapterBindings 留痕；非法 id 静默降级",
          "缝合怪推进对接：主线标记完成（PUT status=completed）且无其他 active 主线 → 自动构造承接的新主线（storylines/generate 新增 mode:newMain，prompt 要求承接前主线结局、开启下一阶段冲突）；开关 autoConstructNewMain 默认开启，可在项目设定关闭",
          "自动生成故事线（autoGenerateStoryline）默认改为开启，小字说明与缝合怪推进的联动；BuildConfig 新增 autoConstructNewMain 字段与开关 UI",
        ],
      },
      {
        label: "删世界时间 + 章名自动生成",
        items: [
          "世界时间手动输入删除（正文区/大纲时间线不再显示 worldTime，交给 LLM 判断），时间线视图退化为按大纲顺序展示章节序号",
          "章名自动生成：正文保存时若标题为空或「第N章」占位，用正文首段前 20 字兜底（零成本，不额外调 LLM）",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.3.0",
    date: "2026-08-06",
    title: "自动填表全面打通：一键追评实测修复（速度 4min→7s）+ 角色卡/世界书实体自动填充",
    sections: [
      {
        label: "一键追评实测修复（速度与效果，实测驱动）",
        items: [
          "实测「新城 · 龙陨之地」一键追评：原来 4m18s 失败（ops=0「模型未返回任何有效操作」）。根因：deepseek-v4-flash 是推理模型，推理内容过长吃光 max_tokens=8000 导致 content 为空，且生成超长使响应体长时间挂起",
          "新增 fillModelOf：填表这类纯抽取任务统一映射到基础对话模型（deepseek-chat，实测 154-319ms 直出 JSON），推理模型原样透传其余场景；max_tokens 保持 8000；content 为空时从推理尾部提取最后一个 JSON 块兜底",
          "修复后实测：单章 7.4s 成功（16 ops 全落地），一键追评 7.16s（ok:true、applied=16）——速度提升约 36 倍；保留精简诊断日志（[fill] LLM 耗时/raw_len）便于排查",
        ],
      },
      {
        label: "角色卡/世界书实体自动填充（新功能：所有内容都能填写）",
        items: [
          "新增 src/core/babylore/entity-sync.ts：每章填表后按内置格式抽取章节中新出现且确定的角色与世界观实体（LLM 一次调用，名称零杜撰、基于正文事实）",
          "角色 → CharacterCard（内置字段：name/role/background/storyLine/personality/appearance/currentStatus/tags 全对齐）；其他实体 → LorebookEntry（title/category/keys/content，category 映射 geography/item/technique/faction/creature）",
          "查重复用 isSimilarName（繁简/错别字变体不重建）；挂载 babyloreFill（单章）与 babyloreFillAll（一键追评）双链路，失败不影响表格结果",
          "实测「新城 · 龙陨之地」第四章：自动创建角色卡「韩姓男子」（background 3-5 句基于正文、storyLine/appearance 就位）与世界书词条「欧阳集团(faction)」「临港新城(geography)」；已有 16 卡 19 词条全部查重跳过",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.2.0",
    date: "2026-08-06",
    title: "角色卡体系升级：AI 填满全覆盖 + 新增故事线 + 关系图内置角色卡 + 自动填表独立入口",
    sections: [
      {
        label: "AI 填满全覆盖 + 新增故事线（需求 1：确认所有属性都会填）",
        items: [
          "CharacterCard 新增 storyLine 字段（prisma db push + generate 已同步），角色卡表单新增「故事线」区块（该角色在全书主线中的起落），保存/回填全链路支持",
          "autofill 的 detectEmptyFields 扩展：新增 timeline / relationships / storyLine 检测，性格检测升级——三层（表层/中层/内核）全空时也会触发补全，不再漏填；prompt 补充全部新字段描述与简洁约束（背景/故事线 3-5 句、列表 1-6 项，不堆砌套话）",
          "前端 handleAutofill 回填去掉 surface/middle/core/relationships/timeline 的「保留原值」逻辑——AI 填满结果全字段回填；personality 写库改合并（保留已有主导/驱动等，仅补三层）",
        ],
      },
      {
        label: "全选联动 AI 扩展 + 分类简化（需求 2/3）",
        items: [
          "角色列表「全选」后自动联动「AI 扩展」（不再需要再手动点扩展按钮），handleExpand 支持传入选中的 ids",
          "expand 后端补齐 storyLine 与性格三层输出与写库，与 AI 填满字段范围对齐——「AI 扩展」与「AI 填满」同一套字段逻辑",
          "自动分类由四维（称号/学校/经历/俱乐部）简化为单路自然分组（3-6 组，按阵营/身份/功能定位），每角色只归一组、全部覆盖、不好归的入「未分类」；ClassifyPanel 面板兼容新分组结构",
        ],
      },
      {
        label: "角色关系：关系图内置角色卡 + AI 自动检测（需求 4）",
        items: [
          "右栏「实体」tab 的关系图子页移除（不再重复占用侧栏），关系图内置到角色卡编辑弹窗「人际关系」区块——列表/关系图双视图切换，列表即「人物名：关系：动态」逐行编辑，关系图即节点可拖动的图形视图",
          "AI 填满与 AI 扩展都会自动检测角色关系（relationships 字段为空时由 LLM 根据项目上下文推断 1-4 条关联人物写入），「角色关系是检测出来的」从手填变为自动",
        ],
      },
      {
        label: "自动填表独立入口 + 一键追评（需求 5）",
        items: [
          "「自动化」从 Toolbar「更多」下拉提出为一级「自动填表」按钮；弹窗改名「自动填表」（原自动化填表设置）",
          "自动填表弹窗新增「一键追评所有未填表章节」：从第一章到最新一章逐章自动填表（已填自动跳过防重复，POST /api/babylore/fill-all），填完自动自检",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.5",
    date: "2026-08-06",
    title: "正文区零遮挡：确认流程整体收口到「项目设定」弹窗 + 章纲默认收起、一键直出正文",
    sections: [
      {
        label: "正文区零遮挡：下方确认流程收口到设置弹窗",
        items: [
          "移除 page.tsx 中正文下方的 ChapterConfirmBar 常驻渲染块，正文阅读区不再被确认栏挤占；组件保留并整体复用进 ProjectSettingsDialog 的「确认与交付」分区",
          "设置弹窗内确认与交付分区完整保留全部能力：单章定稿/提交确认/打回重写/重开、AI 审校诊断、人工接管、智能交付全书、智能审阅/自动交付两开关；未选中章节时显示引导文案「先在大纲里选中一个章节」",
          "onDiagnose 与 onAction 由 page.tsx 透传，AI 诊断结果仍走原有 PostGenPanel 统一分析面板展示（主动触发才出现、可关闭），功能零丢失",
        ],
      },
      {
        label: "章纲作为可选步骤：默认收起 + 一键直出正文",
        items: [
          "确认章纲折叠按钮默认收起（outlineExpanded 初始 false），章纲较长不常驻显示；「生成/重写」按钮独立在生成控制区，选中章节即可一键直出正文，无需先走章纲",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.4",
    date: "2026-08-06",
    title: "魔王系统 Round-5 收尾：关系图可拖动 + 确认流程默认收起与用途说明 + 大纲状态徽章统一 + 项目设定枢纽入口",
    sections: [
      {
        label: "关系图可拖动 + 角色卡联动（R5-关系图诉求）",
        items: [
          "RelationshipGraph 完全重写：以角色卡 relationships 为持久化真源驱动连线，节点坐标支持鼠标/触摸拖动并写入 localStorage（项目级键 rel-graph-pos-{id}），松手即保存、刷新不丢；新增重置布局按钮清空坐标回到圆形布局",
          "连线之上直接显示两人关系字（relation 字段着色），节点双击在已知角色集合内才打开对应角色卡，避免别名节点误开",
          "LLM 分析改为按需：去掉挂载自动跑（避免遮挡正文+烧 token），仅由「重新分析正文」按钮触发，用于比对角色卡有而正文未体现的关系；空态区分「还没有角色」与「角色卡未填人际关系」两类引导",
        ],
      },
      {
        label: "确认流程默认收起 + 智能用途说明（R5-下方确认流程）",
        items: [
          "ChapterConfirmBar 默认收起为极简状态条（localStorage 记忆 collapsed，默认 true），仅留标题 + 状态徽章 + 智能审阅标签 + 展开箭头，正文阅读区不再被常驻操作挤占",
          "新增「这是什么？确认流程怎么用」折叠说明，讲清状态流转（大纲中/草稿/待确认/已定稿/审校中）、智能审阅、AI诊断、人工接管、自动交付、智能交付全书六块用途，把用户没看懂的功能一次性说清",
          "AI诊断按钮补 title：AI 通读本章给综合评分与问题清单（错别字/逻辑/违禁等）帮你决定能否定稿；人工接管按钮补 title：临时切回逐章人工审批由你决定提交/通过/打回",
        ],
      },
      {
        label: "左侧大纲统一状态徽章（R5-左侧统一）",
        items: [
          "抽离共享组件 src/components/ui/status-badge.tsx：覆盖 outline_only/drafting/completed/pending_confirm/confirmed/reviewing 六态，视觉三档（灰=进行中、橙=需行动、绿=已定稿），未知兜底灰显，供确认栏与大纲复用消除重复",
          "OutlineTree 节点状态由原先 Icon+自算颜色改为统一 StatusBadge，时间线视图改复用 NodeTreeItem 并传 badgeSlot 显示世界时间，左栏两种视图风格一致",
        ],
      },
      {
        label: "项目设定统一入口（R5-模块迁移与设置）",
        items: [
          "顶栏三个散落按钮（项目设定/记忆衰减/项目配置）合并为一个「项目设定」按钮，触发新建 ProjectSettingsDialog 枢纽弹窗，下方三块归口入口（小说骨架/项目配置/记忆衰减）点击各自跳到原弹窗，关闭枢纽再开子弹窗",
          "枢纽弹窗内联确认交付两开关（智能定稿 autoConfirmEnabled / 智能交付全书 autoDeliverEnabled），直接 PATCH /api/projects/[id] 持久化并 patchProject 同步前端，把分散的自动化开关收到一处",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.3",
    date: "2026-08-06",
    title: "魔王系统 Round-5 第二批：统一折叠组件落地人物卡/世界侧栏/分组/故事线 + 右栏重构为四 tab（还原实体 tab）",
    sections: [
      {
        label: "统一折叠组件 Collapse 落地（R5-4）：长表单与密集列表可逐段收起",
        items: [
          "新建 src/components/ui/collapse.tsx 可复用折叠组件：支持受控 open / 非受控 defaultOpen、onOpenChange 回调、chevron 箭头（展开 arrowDown、收起 arrowRight）、mountOnOpen 懒挂载、sm/md 两档、disabled，头部与内容样式严格收敛到虚空玻璃设计令牌（--nv-text-primary / --nv-surface-3）",
          "CharacterDialog 九大区块（基本标识/外貌/性格详析/背景状态/能力功法/经历时间线/人际关系/对话风格/人物弧光）由静态 h4 分区改为 Collapse 折叠，超长人物卡可逐段收起、按需展开，减少滚动疲劳",
          "WorldModuleSidebar 词条容器由 space-y-0.5 改为 grid grid-cols-2 gap-1 双列网格，信息密度对齐云笔舒适排版；CharacterGroupList 按角色分组折叠、StorylineList 六要素编辑折叠，密集列表可整体收拢",
          "icons.tsx 补注册 arrowDown（原仓库仅注册 arrowRight），使折叠 chevron 的类型与渲染闭环；WorldEntryCard 经评估维持 line-clamp-3 截断（再包折叠会与紧凑网格意图重复，主动跳过并说明）",
        ],
      },
      {
        label: "右栏重构为四 tab（R5-5）：功能不丢、整合更顺",
        items: [
          "RightPanel 重构为 AI助手 / 实体 / 工具箱 / 统计 四 tab；原查询实体 tab 被误删后已还原——实体追踪 / 伏笔 / 关系图三个面板只在右栏被引用，删则变死功能，本次补回确保 novel-forge 自有功能零丢失",
          "工具箱 tab 内联 ToolboxDialog 网格（write/generate/analyze 三组），工具入口从仅靠弹窗触发升级为常驻 tab，与更多按钮弹窗并存兼容",
          "统计 tab 整合原底部 StatRow（总字数/角色/词条/节点）+ 监测三块（叙事能量曲线/生成延迟/上下文监控）+ 上下文预览，首屏默认展开叙事能量避免空白",
          "AIChatHeader 去重：移除与右栏统计重复的总字数/角色/词条/节点统计条，单一数据来源；page.tsx 接 toolboxItems prop、移除与快捷键冗余的记忆召回项；AIChatBar PRESETS 新增去AI味 / 文段概括 两个聊天预设，走既有 runPreset 到 handleSend 管线",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.2",
    date: "2026-08-06",
    title: "魔王系统 Round-5 第一批：补齐智能审阅真实开关 + 开关统一收敛 + 风格令牌治理 + emoji 清场",
    sections: [
      {
        label: "联动补洞：智能审阅（autoConfirmEnabled）不再是孤儿后端",
        items: [
          "ChapterConfirmBar 新增「智能审阅」真实开关，与「自动交付」并排同面板，复用已验证的 PATCH /api/projects/[id] 通路落地到 Project.autoConfirmEnabled",
          "此前该字段有 schema + API + 后处理读取，却全项目无一处 UI 可翻转，设置页文案还误导「可在设置中关闭」——本次补上真开关并修正该假入口文案",
          "isAutoMode 改为读本地态，切换即时驱动保守/智能两种确认形态，无需等待父组件重拉",
        ],
      },
      {
        label: "开关统一收敛（R5-2）：六处手搓开关并入 Switch 组件",
        items: [
          "AutomationSettingsDialog 两处 peer-sr-only 药丸、BuildConfigPanel 方形 Checkbox、LorebookEditDialog/OutlineDialog/ExportDialog 的 enabled/appendMode/includeOutline 全部改为统一 Switch",
          "BuildConfigDialog 与 BuildConfigPanel 的强制原创人名/自动生成故事线双入口标签对齐，消除 P0-1 标签漂移与视觉分叉",
          "删除 BuildConfigDialog 局部 Toggle、BuildConfigPanel 局部 Checkbox 两套重复实现，收敛到 src/components/ui/switch.tsx",
        ],
      },
      {
        label: "风格统一与令牌治理（R5-3 / R5-6）",
        items: [
          "globals.css 删除重复的 --color-accent 令牌（此前被 stray 行覆盖，导致 --color-accent 指向 shadcn 而非 --nv-accent）",
          "浅色主题背景由冷灰 #EEF0F4 暖化为米色 #F3EFE8，呼应云笔暖色舒适感",
          "BuildConfigPanel/changelog 页硬编码 rgba(99,102,241) 辉光、ImportWizard 的 accent-pink-600/accent-success 收敛到 --nv-primary/--nv-success 设计令牌",
          "StyleEditor/ImportWizard/Dissect*/ContextPreview/SettingsImporter/tool-registry 等用户可见 UI 的 emoji 批量替换为统一 Icon 图标体系（协议层 emoji 契约不动）",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.1",
    date: "2026-08-06",
    title: "确认流程折叠区布局打磨：统一 Switch 组件 + 药丸 Toggle + 去 emoji",
    sections: [
      {
        label: "体验减法：ChapterConfirmBar 折叠头部更清爽",
        items: [
          "新增可复用 src/components/ui/switch.tsx 药丸开关，风格收敛到 --nv-primary / --nv-surface-3，支持 sm/md 两档与 label 插槽",
          "全书智能交付折叠区标题与主按钮左右分离：左侧「折叠入口 + 自动交付 Toggle」，右侧「智能交付全书」主按钮，避免三元素折行拥挤",
          "自动交付开关由原生 checkbox 改为统一 Switch，符合云笔式右置 Toggle 视觉习惯",
          "「智能交付全书」与「确认整本交付」按钮的 🚀 emoji 替换为 Icon name=rocket，保持图标体系一致",
        ],
      },
      {
        label: "集成与风格统一",
        items: [
          "Switch 组件为后续设置页、项目配置、功能开关卡片统一 Toggle 风格奠基，避免各页面开关样式碎片化",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿"],
      },
    ],
  },
  {
    version: "v1.1.0",
    date: "2026-08-06",
    title: "确认流程优化：全书交付区默认收起 + 新增「自动交付」开关（最后一章定稿自动整本交付）",
    sections: [
      {
        label: "新增功能：全书智能交付自动执行",
        items: [
          "Project 新增 autoDeliverEnabled 开关（默认开）；全书章节（chapter/section/scene）全部达 confirmed 后自动置 confirmedAt，无需手动点「确认整本交付」",
          "自动交付钩子挂在三处确认漏斗——applyConfirm（生成时自动确认/智能交付全书/游戏导出章）、node PATCH 手动确认、batch-confirm 批量确认，覆盖所有可能「最后一章定稿」的时机；写入幂等，重复命中不重复置时间戳",
        ],
      },
      {
        label: "体验减法：确认流程面板瘦身",
        items: [
          "全书一键智能交付区默认收起，仅留折叠入口 + 「智能交付全书」主按钮 + 「自动交付」开关，减少常驻占用",
          "保守模式（关闭自动交付）才暴露手动「确认整本交付」按钮；自动模式下该按钮冗余收起，smartDeliver 不再重复触发交付（服务端已在放行末章时自动交付）",
        ],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 217 单元测试全绿（新增 maybeAutoDeliver 六分支单测：关闭/已交付/有未确认/无章节/全部确认/异常，确定性锁死分支行为）"],
      },
    ],
  },
  {
    version: "v1.0.4",
    date: "2026-08-06",
    title: "泄漏护栏：entity-highlighter 两模块级 Map 容量上限（与 round-2 monitorCache 一并闭环）",
    sections: [
      {
        label: "修复 P2：同源泄漏",
        items: ["IMP-504 entity-highlighter.ts 的 cache 此前仅用 60s TTL 做命中判断却从不清过期、lastGoodMap 无任何淘汰，随切换项目数无限增长", "新增 ENTITY_CACHE_MAX=256 容量上限 + evictIfNeeded() LRU 删最旧（Map 插入顺序首元素），与 round-2 monitorCache 修复同构闭环", "invalidateEntityCache 同时清 lastGoodMap 对应 key，避免脏映射残留"],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 211 单元测试全绿（entity-highlighter.test.ts 3 passed）；MaxLoop round-15 同源泄漏闭环收口"],
      },
    ],
  },
  {
    version: "v1.0.3",
    date: "2026-08-06",
    title: "数据完整性补丁：备份静默丢数据 + markdown 角色关系失效 + 大书导入事务超时",
    sections: [
      {
        label: "修复 P1：备份静默丢数据",
        items: ["IMP-501 backup/route.ts 的 bundle 新增 excluded 自描述字段（声明不含 ChapterSummary/StoryBeat/PendingCommitment/PendingItem/StoryNodeRevision/GameSession）", "前端 BackupDialog 新增告知文案：本次备份包含 8 类核心设定、不含游戏进度/版本历史/记忆摘要等，需文本导出迁移设定"],
      },
      {
        label: "修复 P1：markdown 角色关系失效",
        items: ["IMP-502 parser.ts 的 toCharacterCreateParams 将 targetCharacterId 改为 targetName，对齐全系统契约", "经 normalizeRelationships 与 sync-global-prompt 注入世界书时角色关系不再渲染成 ?(?)；备份再导入也不灭失"],
      },
      {
        label: "修复 P1：大书导入事务超时",
        items: ["IMP-503 import/commit/route.ts 事务补 { timeout: 120000 }，与 projects/import 口径一致", "数百章串行落库不再因 Prisma 默认 5s 上限整段回滚、章节零写入"],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 211 单元测试全绿；新增 scripts/agent-round14-p1-verify.cjs 真机复验 3 条 P1 全 PASS；MaxLoop round-14 五透镜深度审计收口"],
      },
    ],
  },
  {
    version: "v1.0.2",
    date: "2026-08-06",
    title: "稳定性补丁：补漏提交 + 副本名叠加 + 缓存泄漏护栏",
    sections: [
      {
        label: "补入上轮漏提交",
        items: ["IMP-003 游戏导出自动回填设定库的前端提示 toast 此前漏入仓，本轮补入并核验与 game-engine autoFilled 链路一致"],
      },
      {
        label: "修复",
        items: ["导入 forceNew 去尾再追加，反复导入同一备份不再叠加成「xxx（副本）（副本）」", "stats/monitor 内存缓存加 512 容量上限并删最旧，防长运行内存泄漏"],
      },
      {
        label: "质量门禁",
        items: ["tsc 零错误 + 211 单元测试全绿；MaxLoop round-2 观察池复核完成，记录与代码一致性已校验"],
      },
    ],
  },
  {
    version: "v1.0.1",
    date: "2026-08-06",
    title: "复检修复版（v1.0.1）——导出文件名乱码、监控全站红误导、游戏复导出堆叠三项 P1 修复",
    sections: [
      {
        label: "复检修复（MaxLoop 阶段五）",
        items: [
          "导出文件名乱码：markdown/txt 默认分支 Content-Disposition 补 filename*=UTF-8''（此前仅 HTML/EPUB/DOCX 三处，默认分支漏修致中文名乱码），现 4 分支一致",
          "延迟监控全站红误导：GenerationLatencyPanel 改用 useParams 从 [projectId] 路由段取 id，替代旧正则（要求尾斜杠、Next.js 默认无尾斜杠→匹配失败→全站红），修复后仅显示本项目真实延迟",
          "游戏复导出正文堆叠损坏：endGameAndExport 改用原正文快照（进入游戏前拍 originalContentSnapshot 存会话）作前置，多次导出不再把上次全量当原正文叠加；新增 schema 列 + 真机验证脚本",
        ],
      },
      {
        label: "质量门禁",
        items: [
          "tsc --noEmit 零错误；全量 211 单元测试（较 v1.0.0 增 8 例：generation-metrics/route、auto-rate、confirm-guard 扩充、监控单测）全绿",
          "新增 agent-game-reexport-stack-verify.cjs 真机脚本：复现并断言复导出不堆叠（C1 前置 C0、C2 不以 C1 开头、C2 仍以 C0 前置）",
          "防假收敛：6 透镜复检子 Agent 复验上轮 23 条修复，诚实暴露 2 条 P1 假收敛（导出/监控）+ 新挖 1 条游戏 P1，全部已修并亲验门禁",
        ],
      },
    ],
  },
  {
    version: "v1.0.0",
    date: "2026-08-05",
    title: "正式版发布（v1.0.0）——Max Loop 全量收口，全功能确认与真机验证通过",
    sections: [
      {
        label: "正式版里程碑",
        items: [
          "版本从 v0.46.x 迭代线升至 v1.0.0 正式版：确认流程体系（护栏统一/幂等/审校联动/填表溯源/日志同构/状态枚举）与体验减法（徽章三档/toast 收敛/交付一步化/弹窗记忆）全部收敛",
          "全功能巡检：99 个 API 路由 vs 前端 106 处引用交叉核对 0 断链；空按钮/挂空 handler/恒 disabled 0 处；导航链路（首页→工作区→游戏/表格）完整；src 全量 TODO/FIXME 0 处",
          "正式版用户旅程真机验证（scripts/agent-release-journey.cjs）：建项目→建章→真实 LLM 生成 3416 字→自动定稿（confirmed+质量分 87）→整本交付→软删，9/9 全绿",
        ],
      },
      {
        label: "验证矩阵（发布门槛）",
        items: [
          "tsc --noEmit 零错误；全量 203 单元测试（14 文件）全绿；CI 真闸（tsc+test+lint:colors+build）就绪",
          "8 个真机验证脚本全绿：batch-guard（护栏统一）/ round2（审查修复）/ idempotency（幂等）/ smart-deliver（智能交付 autoRate 100%）/ game-light-confirm（游戏轻确认主路径+边界）/ quality-blind-test（盲测证伪）/ diag / release-journey（用户旅程）",
          "游戏模式真机全链路：真实 LLM 游戏→导出轻确认（confirmed+auto-confirm 标记+质量分回写；边界关开关 drafting）",
        ],
      },
      {
        label: "诚实边界（发布前已知，不影响功能正确性）",
        items: [
          "lint 存量债 2542 个（1134 errors 历史 no-explicit-any）未全清，基线存档待专项（增量已归零）",
          "沙箱无 Chromium：前端视觉未浏览器目测，交互逻辑层已验，本地 npm run dev 可见",
          "Vercel 线上部署需用户侧控制台操作（无部署凭据）；代码已就绪（postinstall 自动 prisma generate）",
        ],
      },
    ],
  },
  {
    version: "v0.46.103",
    date: "2026-08-05",
    title: "状态枚举全面落地 + lint 增量归零 + 游戏导出状态提示（Max Loop Round9 收尾，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "状态枚举单一真相全面落地（规范性收尾）",
        items: [
          "story-status.ts 新增 STATUS_OUTLINE_ONLY/STATUS_DRAFTING/STATUS_PENDING_CONFIRM/STATUS_CONFIRMED/STATUS_COMPLETED/STATUS_REVIEWING 单态常量 + CONFIRMABLE_STATUSES 改引用常量",
          "核心确认链路 10 文件字面量→常量引用：auto-confirm / [id] PATCH / batch-confirm / nodes / rollback / game-engine / post-processor / stats-monitor / projects-confirm / generate-write",
          "game-engine 的 gameSession.status 与会话状态无关（不属 StoryNode 状态机），保留原字面量不误替换",
          "create/import/dissect 域的历史字面量保留（初始创建态/流程固定态，不参与确认判定，替换收益低）——诚实边界",
        ],
      },
      {
        label: "lint 增量归零（存量债基线存档）",
        items: [
          "confirm-guard.ts:110 唯一 no-explicit-any 修复（Prisma.JsonArray 类型）；本轮新建文件（story-status/quality-thresholds/confirm-guard.test/extract-keys.test）lint 干净",
          "eslint.config.mjs 对 scripts/*.cjs 豁免 @typescript-eslint/no-require-imports（CommonJS 工具脚本 require 是标准用法，非 ESM 违规）",
          "ChapterConfirmBar 修 s.icon as any（icon 字段类型化 IconName）+ 移除未用 allConfirmed 解构；PreGenConfirm loadCards 改函数声明消 no-use-before-define；剩 2 个存量 warning（exhaustive-deps/no-unused-expressions）标注历史债",
        ],
      },
      {
        label: "游戏导出状态提示（体验闭环）",
        items: [
          "game/[nodeId] 页 ended 屏按导出轻确认结果区分：confirmed → 绿色「已导出并自动定稿（质量分 N）」；drafting → 橙色「待手动确认（智能审阅关闭或质量未达标）」；兜底原文案",
          "handleEnd 消费 /api/game/end 新增的 status/qualityScore 字段存 state，导出链路（游戏→确认看板）在 UI 层闭环可见",
        ],
      },
      {
        label: "验证",
        items: [
          "tsc 零错误；全量 203 测试绿（14 文件）；确认体系 5 个真机脚本 + 游戏全链路回归全绿（见 Round9 复检段）",
          "沙箱无 Chromium，游戏 ended 屏视觉未浏览器目测（诚实边界，本地 npm run dev 可见）",
        ],
      },
    ],
  },
  {
    version: "v0.46.102",
    date: "2026-08-05",
    title: "体验减法第二刀：智能交付一步化 + 生成前弹窗记住选择（Max Loop Round7，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "智能交付一步化（点击 2 → 1）",
        items: [
          "原流程：智能交付全书 → 扫描放行合格章 + 展示拦截清单 → 再点「确认整本交付」两步；现扫描无拦截且本轮有放行时自动调 projects/[id]/confirm 整本交付，前端一步完成",
          "有拦截时保持原行为（展示清单 + 保留「确认整本交付」按钮），作者处理后手动交付；按钮文案/忙态不变",
        ],
      },
      {
        label: "PreGenConfirm 记住选择（生成前角色调度弹窗降级第一步）",
        items: [
          "弹窗有实际功能（选择哪些角色卡参与生成 + 作者指令 + 新角色），不能删；降级为「记住上次选择」——同项目 localStorage 存 selected/newChars/authorNote，下次打开预填，作者少重复勾选、保留控制",
          "localStorage 不可用/无记录时回落默认全选；预填仅过滤仍存在的角色卡（scheduledIds 交集），不残留失效 id",
        ],
      },
      {
        label: "回归修复与验证",
        items: [
          "agent-smart-deliver-verify.cjs 的 GOOD 正文 ~120 字 <150 结构门槛（v0.46.97 引入），老脚本章节全被拦导致 VERIFY_FAIL——正文加长至 ~230 字后回归 VERIFY_PASS（首次 409 → C 改优质 → 二次扫描放行 → 整本交付 200 + autoRate 100%）",
          "全量 203 测试绿；tsc 零错误；沙箱无 Chromium，前端交互未浏览器目测（诚实边界）",
        ],
      },
    ],
  },
  {
    version: "v0.46.101",
    date: "2026-08-05",
    title: "体验减法第一刀：状态徽章三档收敛 + toast 三连弹收敛为一条（Max Loop Round6，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "状态徽章体验减法（对齐枚举单一真相）",
        items: [
          "StatusBadge 原 8 态映射与 story-status.ts 六态枚举不一致——rejected/revised 为历史假态（实际不再产生），completed 语义也对不齐；现删除假态、confirmed 文案收敛为「已定稿」，未知状态兜底灰显不再误导",
          "视觉三档语义收敛（乔布斯方向）：灰=进行中/待处理（outline_only/drafting/completed）、橙=需行动（pending_confirm/reviewing）、绿=已定稿（confirmed）——作者一眼可判「这章要不要我管」",
        ],
      },
      {
        label: "toast 收敛（一次生成 3 连弹 → 1 条）",
        items: [
          "实证：生成完成同时弹「自动填表完成」+「记忆召回 N 条」+「正文已生成并保存」三条 toast（page.tsx 624/635/644），打断创作流",
          "收敛：填表成功信息存入 ref 合并进 done toast（正文已生成并保存（自动填表：抽取 N 条，写入 M 行））；记忆召回信息已在「宝宝流记忆召回面板」展示（page.tsx:1019），删冗余 toast；生成完成仅 1 条 toast",
          "验证：tsc 零错误、203 测试全绿；沙箱无 Chromium，toast 视觉效果未浏览器目测（诚实边界），逻辑已代码层验证",
        ],
      },
    ],
  },
  {
    version: "v0.46.100",
    date: "2026-08-05",
    title: "状态枚举单一真相源 + auto-confirm reviewing 遗留态/幂等虚报修复（Max Loop Round5，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "状态枚举化（单一真相源）",
        items: [
          "新建 src/core/story-status.ts：STORY_NODE_STATUSES（outline_only/drafting/pending_confirm/confirmed/completed/reviewing 六态文档化）+ StoryNodeStatus 类型 + CONFIRMABLE_STATUSES（可自动/批量确认态），取代散落的状态字符串字面量",
          "applyConfirm 的 updateMany 条件更新改引用 CONFIRMABLE_STATUSES——可确认状态集合单一真相，不再内联数组",
        ],
      },
      {
        label: "auto-confirm 修复（代码审查遗留项）",
        items: [
          "reviewing 遗留态（v0.46.90 前审校中，不再写入新数据）显式 skip 交人工——此前会进评估、幂等跳过但虚报 confirmed",
          "消费 applyConfirm 返回值：返回「节点已确认（幂等跳过）」时计入 skipped 而非 confirmed，并发/重试下不再虚报放行，数据一致性修复",
          "验证：全量 203 测试绿（幂等回归 agent-idempotency-verify.cjs 全绿）；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.99",
    date: "2026-08-05",
    title: "autoConfirmEnabled API 入口 + reviewLogs 结构统一 + 盲测扩展实证（Max Loop Round4，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "配置/结构补齐（创造检验 P8 / P6）",
        items: [
          "P8：projects/[id] PATCH 支持 autoConfirmEnabled 字段写入——智能审阅开关获得 API 入口，自动化脚本与测试无需直连 DB 即可切换确认模式（此前仅 UI/DB 可切）",
          "P6：post-processor 审校条目补 action:review + at 键，与确认(auto-confirm/confirm)/提交(submit)/打回(reject)/重开(reopen)/诊断(diagnose) 日志全链同构，reviewLogs 统一为 {action, at, ...} 结构，前端可统一渲染；旧字段 timestamp/issues 保留向后兼容",
        ],
      },
      {
        label: "盲测扩展实证（闸门防线必要性）",
        items: [
          "新增 3 样本：400 字同一句劣质文 analyzer 打 64 分仍 ≥60 过线、250 字口号堆砌文 77 分过线、中长普通文 83 分——证明「凑字数长文/长空话」同样骗过纯统计分",
          "结论强化：v0.46.97 的机械重复结构门槛是必要防线——若无它，400 字同一句（过 150 字长度门槛）仅凭 analyzer 64 分会被自动放行；盲测现共 12 样本，假放行率 100% 证伪记录完整",
        ],
      },
    ],
  },
  {
    version: "v0.46.98",
    date: "2026-08-05",
    title: "填表残词过滤 + _src 溯源增强（Max Loop Round3·创造检验 P4/P5，tsc 零错误 / 203 测试绿）",
    sections: [
      {
        label: "填表残词过滤（P4）：世界书 keys 不再被切词残留污染",
        items: [
          "实证（创造检验）：自动填表后世界书冒出「片空旷区域」等 location 词条——extractKeyTerms 正则提取 2-6 字中文词当专有名词，无残词过滤，量词/虚词开头的切词片段被当关键词入库",
          "修复：dissect/engine.ts 的 extractKeyTerms 加 BAD_PREFIX（片/个/只/块/这/那/有/在/是/被/让/我们/一个/一片…）与 BAD_SUFFIX（的/了/着/过/地/得/们结尾）过滤，宁缺勿滥；函数导出供单测，新增 3 用例（片空旷区域拦、林舟原保留、正常专有名词不受影响）",
        ],
      },
      {
        label: "_src 溯源增强（P5）：填表事实可追溯确认入口",
        items: [
          "实证（创造检验）：事实表行 _src 一律 ch0:batchmanual，无法区分事实来自自动确认/手动确认/批量确认",
          "修复：safeFillAfterWriting 接受 source 参数，srcLabel 追加来源段（ch{order}:batch{id}:{source}）；applyConfirm 传 auto-confirm、PATCH 手动确认传 manual、batch-confirm 传 batch，三入口分别标记；fill.ops 溯源断言（^ch?:batch）向后兼容",
        ],
      },
    ],
  },
  {
    version: "v0.46.97",
    date: "2026-08-05",
    title: "质量分闸门盲测证伪 + 自动放行结构门槛 + 阈值单一真相源 + batch 幂等（Max Loop Round2，tsc 零错误 / 200 测试绿）",
    sections: [
      {
        label: "闸门盲测证伪（scripts/agent-quality-blind-test.ts）",
        items: [
          "9 个多样本（优质长文/优质对话/平庸流水账/劣质重复短句/劣质空话/对话体/无标点长句/短文本/空文本）跑 analyzeQuality：劣质、短、空文本全部 ≥60 分过线（73~100 分），假放行率 100%——实证「纯统计正则分数测的是表面特征，不是内容质量」，分数不能作唯一自动放行依据",
          "短文本（不足50字）与空文本均得 100 分——空正文拦截（50 字）是唯一有效防线，本已实现；非空劣质文需结构门槛兜底",
        ],
      },
      {
        label: "修复落地（全部验证全绿）",
        items: [
          "自动放行结构门槛（confirm-guard）：evaluateConfirmEligibility 在分数评估前叠加 MIN_AUTO_CONFIRM_LENGTH=150（正文 <150 字不自动放行）+ 机械重复检测（按句分割 ≥5 句且去重唯一率 <60% 判定「同一句凑字数」拦截）；盲测中所有劣质/短/空样本被拦，优质长文正常放行；分数降级为参考与看板",
          "阈值单一真相源：新建 src/core/quality-thresholds.ts 导出 QUALITY_PASS_THRESHOLD=60，confirm-guard 与 quality-analyzer（消除内部硬编码 60）共同引用，消灭软分裂",
          "batch-confirm 补幂等（updateMany 条件更新仅 pending_confirm 才终态，并发/重复确认 count=0 不重复计数/追加），TOCTOU 修复",
          "单测新增结构门槛 2 用例（短正文即使满分也拦、机械重复 160 字拦）共 10 个，全量 200 测试绿；round2/idempotency/batch-guard 三验证脚本回归全绿；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.96",
    date: "2026-08-05",
    title: "Max Loop Round2 审查修复：手动确认护栏+幂等 / auto-confirm 审校联动 / 非法分数拦截 / done 状态同步 / CI 套件可跑（tsc 零错误 / 198 测试绿）",
    sections: [
      {
        label: "审查发现的问题（代码审查 + 创造检验双报告）",
        items: [
          "代码审查（主审）：NaN/Infinity 非有限分数可绕过拦截（NaN<60 恒 false）、CI 套件含 DB 集成测试在 Actions 必红、batch-confirm 无幂等、auto-confirm 不消费 applyConfirm 返回值、analyzer 内部硬编码阈值",
          "创造检验（工坊·真实 LLM 生成 1 章 + 手动 1 章）：SSE done 事件 status 与库态不同步、审校 passed=false（logic major 缺陷）仍被 auto-confirm 放行、三条确认路径护栏不一致（PATCH 手动 confirm 无门槛）、超时重试下确认计数与日志不一致",
        ],
      },
      {
        label: "修复落地（全部真机验证全绿）",
        items: [
          "手动确认补护栏+幂等（PATCH confirm）：空正文/过短(<50字) 422 拦截，updateMany 条件更新（仅 pending_confirm 才终态），重复确认 409 不重复 increment/append；真机验证 agent-round2-guard-verify.cjs（422/409/计数 1→1 全过）",
          "auto-confirm 审校联动：requirePassed 时任一审校 passed=false（如逻辑自查 major 缺陷）blocked 附 reason 交人工，对照无审校失败章正常放行",
          "confirm-guard 非法分数拦截：qualityScore 采信处补 Number.isFinite（NaN/Infinity 回退本地重算），杜绝 NaN<60 恒 false 绕过；单测新增 NaN 用例共 8 个，全量 198 测试绿",
          "done 事件状态同步：generate/write 的 SSE done 前重查库态（反映管线内 auto-confirm 结果），前端不再拿到过期 status；CI 套件 fill.selfcheck 集成测试加 describe.skipIf(!DATABASE_URL)，Actions 无 DB 时跳过、门禁不再必红",
        ],
      },
    ],
  },
  {
    version: "v0.46.95",
    date: "2026-08-05",
    title: "护栏统一收编 + 单测门禁 + CI 真闸 + 幂等守卫（Max Loop Round1·Step2 检验落地，tsc 零错误 / 197 测试绿）",
    sections: [
      {
        label: "护栏统一收编（batch-confirm 修复空正文拦截漏洞，消除阈值分裂）",
        items: [
          "实证（真实性职能指证）：batch-confirm/route.ts 内联复制 QUALITY_PASS_THRESHOLD=60/gradeOf/护栏逻辑，且丢失空正文/过短(<50字)拦截——同一空正文章 qualityScore=90 走 auto-confirm 被拦、走 batch-confirm 被放行，单一护栏宣称与实际不符",
          "修复：batch-confirm 评估逻辑收编到 confirm-guard 的 evaluateConfirmEligibility（import 复用，删除内联阈值/gradeOf/评估代码），保留 batch 确认的 batch:true 日志语义；真机验证 scripts/agent-batch-guard-verify.cjs 全绿（空正文章拦截、优质章放行、auto-confirm 同拦、两入口行为一致）",
        ],
      },
      {
        label: "confirm-guard 单元测试 + CI 真闸 + 幂等守卫",
        items: [
          "新增 src/core/confirm-guard.test.ts 7 个单测：gradeOf 分级边界、空正文/过短拦截、60/59 阈值边界、qualityScore=null 回退 analyzeQuality、requirePassed=false 旁路语义、analyzer 对空文本高分佐证（证明空正文拦截必须显式存在）；全量 vitest 13 文件 197 测试全绿",
          "ci.yml 去掉全部 || true 形同虚设的豁免：新增 npx tsc --noEmit + npm test 硬门禁，lint:colors/build 硬门禁，任一失败即红；lint 存量 2542 问题（1134 errors 历史 no-explicit-any 债）保留豁免并标注待专项清理",
          "applyConfirm 幂等守卫：改 updateMany 条件更新（仅 status 在 drafting/pending_confirm 才执行终态），重复/并发第二次调用 count=0 不重复 increment revisionCount、不重复追加 reviewLogs；真机验证 scripts/agent-idempotency-verify.cjs 全绿（重复 auto-confirm：revisionCount 1→1、auto-confirm 日志 1→1）",
        ],
      },
    ],
  },
  {
    version: "v0.46.94",
    date: "2026-08-05",
    title: "游戏导出轻确认闭环（Round1 遗留边界 #519）：游戏模式导出章节纳入统一确认流程，自动定稿 + 自动填表 + 看板可见（tsc 零错误）",
    sections: [
      {
        label: "游戏导出轻确认闭环（Round1 遗留边界 #519）：复用 confirm-guard 护栏，与正式章节确认链路完全统一",
        items: [
          "src/core/game/game-engine.ts 的 endGameAndExport 改写：导出正文后先 evaluateConfirmEligibility 评估质量分并落 drafting，再按项目 autoConfirmEnabled 开关走轻确认——开启且达标则 applyConfirm（confirmed + safeFillAfterWriting 自动填表 + reviewLogs auto-confirm 标记），否则维持 drafting 留给用户手动确认；qualityScore 回写供 MonitorPanel 看板可见",
          "根治「游戏导出章节在确认流程与监控看板隐形」缺口：原 endGameAndExport 直接写死 status:completed 绕开 auto-confirm/自动填表/qualityScore/reviewLogs，现复用 Round3 #1 的 evaluateConfirmEligibility + applyConfirm，零新增填表逻辑，与正式章节确认体系完全统一",
        ],
      },
      {
        label: "真机验证（scripts/agent-game-light-confirm-verify.cjs 全绿）",
        items: [
          "主路径（autoConfirm 默认开）：建项目→建章→game/start→2轮 game/action(SSE)→game/end，导出节点 status=confirmed、autoConfirmed=true、qualityScore=85、reviewLogs 含 auto-confirm 标记（自动填表已触发）、qualityScore 回写",
          "边界（切 autoConfirmEnabled=false）：同项目新节点导出 status=drafting、autoConfirmed=false——关闭智能审阅时游戏章节停在待确认态，与正式章节一致，人类在确认栏手动定稿即可",
        ],
      },
    ],
  },
  {
    version: "v0.46.93",
    date: "2026-08-05",
    title: "确认 UI 减法 + 一键智能交付全书 + 真机生成验收（Round3 #516/#517/#518 全绿，tsc 零错误）",
    sections: [
      {
        label: "一键智能交付全书（Round3 #518）：12章×4按钮压缩为1次扫描+1张清单",
        items: [
          "ChapterConfirmBar 新增「智能交付全书🚀」主入口：调 POST /api/story/nodes/auto-confirm 扫描全书（合格自动放行、不合格进 blocked 附 reason），前端内联展示「自动放行 N 章 / 拦截 M 章」清单（列出被拦截章标题+原因），再一键 confirm 整本交付；保守模式（关智能审阅）用户同样可用此按钮批量自动放行合格章",
          "后端链路复用既有 auto-confirm 端点 + projects/[id]/confirm 端点（均经 Round3 #1 真机验证），前端仅为组合调用；scripts/agent-smart-deliver-verify.cjs 验证全绿（VERIFY_PASS）：建3章→首扫放行 A/B 拦截 C(qualityScore=30)→首次整本交付 409(C未确认)→C改优质→二次扫描放行 C→二次整本交付 200 + confirmedAt 设置 + autoRate=100%",
        ],
      },
      {
        label: "确认 UI 减法（Round3 #516）：智能审阅态收敛人工按钮 + 自动放行率看板",
        items: [
          "ChapterConfirmBar 接收 autoConfirmEnabled prop：智能审阅态下 drafting/pending_confirm 章常态只显「系统自动判定，仅拦截异常」+ AI诊断 + 人工接管(折叠展开原4键)，合格章零点击；confirmed 章显示「已自动定稿」、重开降级为不显眼小字；保守模式保持原逐章4键不变",
          "MonitorPanel 确认看板加「自动放行率」指标：monitor 端点 confirmStats 新增 autoConfirmed(由智能审阅自动审定数) 与 autoRate(占比)，从 reviewLogs 的 auto-confirm 动作标记统计；看板并列展示「智能自动放行 / 人工确认」两档，让自动化收益可见",
        ],
      },
      {
        label: "真机生成验收（Round3 #517）：重启 dev 修复 stale client，生成完零点击自动确认",
        items: [
          "初测 FAIL 根因：v0.46.92 加 autoConfirmEnabled 字段后未重启 dev，旧进程加载的 Prisma 客户端不含该列，post-processor 3.1段 select:{autoConfirmEnabled:true} 查询抛错被 catch 吞掉，auto-confirm 静默跳过（qualityScore=83 达标却停 drafting）；重启 dev 加载新客户端后即正常",
          "重启后真机生成一章：SSE 收 auto_confirm 事件、节点最终 status=confirmed、reviewLogs 含 {action:auto-confirm, fill:自动填表已执行}——生成完直接自动确认+自动填表，人工零点击（VERIFY_PASS，scripts/agent-gen-autoconfirm-verify.cjs）",
          "运维铁律重申：改 schema/新增字段后必须重启 dev（npm run dev，非 npm run dev -p 3001）加载新 Prisma 客户端，否则 post-processor 的 select 新列查询会因 stale client 抛错被 catch 吞掉、auto-confirm 静默不生效",
        ],
      },
    ],
  },
  {
    version: "v0.46.92",
    date: "2026-08-05",
    title: "智能自动确认（Round3 #1）：生成完合格章自动确认 + 共享质量护栏 + 项目开关 + 端到端验证全绿（tsc 零错误）",
    sections: [
      {
        label: "智能自动确认（Round3 #1）：生成完合格章自动确认，人类降级异常处理者",
        items: [
          "新增 POST /api/story/nodes/auto-confirm：智能审阅模式下扫描项目下所有 drafting/pending_confirm 章（或显式 nodeIds），合格章自动确认（含 safeFillAfterWriting 自动填表），不合格章（空正文/过短/质量分<60）进 blocked 并附 reason；返回结构与批量确认端点一致，前端看板可复用",
          "抽离共享护栏 src/core/confirm-guard.ts：evaluateConfirmEligibility（空正文/过短优先拦截、qualityScore 非 null 采信省分析、null 回退本地 analyzeQuality 零 Token、<60 拦截）与 applyConfirm（自动填表副作用 + status=confirmed），批量确认/自动确认/生成流水线三处复用单一 QUALITY_PASS_THRESHOLD=60 真相，消除阈值分裂",
          "Project 模型新增 autoConfirmEnabled Boolean @default(true) 开关；post-processor 生成完落库后 best-effort 调用 applyConfirm——若项目开启且质量达标直接 confirmed（含 SSE auto_confirm 事件），失败 catch 降级为 drafting 不阻塞主流程；db push 同步数据库并对已有项目自动填充 true",
          "端到端真机验证 scripts/agent-auto-confirm-verify.cjs 全绿（VERIFY_PASS）：建沙盒项目→建3章（A/B 优质留空质量分实时算、C 短文本）→扫全书自动确认→A/B 86/A 放行 confirmed、C 正文过短拦截 blocked、最终态 a/b=confirmed c=drafting；护栏路径（实时分析+过短拦截）覆盖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.91",
    date: "2026-08-05",
    title: "批量确认本卷（MCCS Round2）：批量确认端点 + 左栏批量确认按钮 + 质量护栏拦截低分章 + 端到端真机验证全绿（tsc 零错误）",
    sections: [
      {
        label: "批量确认本卷（MCCS Round2·规格 agent-confirm-spec 第47-48行）",
        items: [
          "新增 POST /api/story/nodes/batch-confirm：左栏批量模式勾选 pending_confirm 章节后一键确认；质量护栏 requirePassed 默认 true，仅放行 qualityScore>=60 的章，低于阈值（含无法解析正文）进 blocked 并附 reason，不被蒙混过关",
          "左栏 LeftPanel 批量工具栏新增「批量确认 N」按钮（仅当 selectedPendingCount>0 时显示），workspace page.tsx 加 handleBatchConfirm 回调与 batchConfirming 忙态；确认后 loadProject 刷新 + 清空选择 + 退出批量模式，toast 汇总放行/拦截/跳过数",
          "PUT /api/story/nodes/[id] 补 qualityScore 透传（qualityScore: body.qualityScore）；undefined 时为 Prisma no-op 不影响现有手动保存，让「客户端可落库质量分」成为合法能力，与批量确认端点「score==null 才回退 analyzer、否则用 DB 值」护栏设计一致",
          "端到端真机验证 scripts/agent-batch-verify.cjs 全绿（VERIFY_PASS）：A/B 章 qualityScore 留 null → 后端实时 analyzer 打 90/A 放行 confirmed；C 章直接置 qualityScore=30 → <60 拦截进 blocked 保持 pending_confirm；护栏两条路径（实时分析兜底 + DB 低分直判）均覆盖，最终态正确",
        ],
      },
    ],
  },
  {
    version: "v0.46.90",
    date: "2026-08-05",
    title: "确认流程断点修复：写章后状态恒为 drafting（不再卡 reviewing 死锁）+ AI 智能体端到端验证 12 章全闭环（tsc 零错误）",
    sections: [
      {
        label: "确认流程断点修复（MCCS Round1 验证中发现）",
        items: [
          "根因：generate/write 后处理管线把生成后节点状态定为 reviewing（审校未过时），而确认栏仅认 completed/drafting，导致生成完的章节卡在 reviewing 且无任何确认按钮，流程死锁",
          "修复：post-processor.ts 生成后状态由 reviewing/completed 改为恒为 drafting（契合 Round1 规格「生成仅落 drafting、诊断是选项不是前置税」）；后处理六维质量审校仍写 reviewLogs/qualityScore 供 AI诊断展示，但不决定节点状态",
          "端到端验证：AI 智能体真实建项目「火种：多行星文明备份计划」→ 真实 LLM 写 12 章（约 3.98 万字）→ 逐章提交确认/AI诊断/确认通过（触发自动填表）→ 第5章走打回重写闭环 → 整本确认完成🚀，全部按钮与状态机闭环通过",
          "运维注记：dev server 旧进程加载的 Prisma 客户端不含新增 confirmed_at 列会导致确认 503，重启加载新客户端即修复（非代码缺陷，属环境 stale client）",
        ],
      },
    ],
  },
  {
    version: "v0.46.89",
    date: "2026-08-05",
    title: "确认流程（MCCS Round1 落地）：中栏确认栏4键状态机 + 左栏确认态色标 + 右栏确认看板 + 自动填表移至确认后（tsc 零错误）",
    sections: [
      {
        label: "确认流程（MCCS Round1·由专项会议决定）",
        items: [
          "由7人格专项会议（乔布斯/智能体团队/PG/张雪峰/芒格/费曼/工坊）+3观测智能体（进度/质量/偏差）+Chair整合，maxloop迭代收敛出单一权威规格 agent-confirm-spec.md",
          "5态状态机：outline_only→drafting→pending_confirm→confirmed→project_confirmed；ContentStatus 扩 pending_confirm/confirmed 两态，StoryNode/Project 各加 confirmedAt 时间戳",
          "中栏确认栏 ChapterConfirmBar：4键（提交确认/确认通过/打回重写须填理由/AI诊断）+ 整本确认完成🚀；左栏 OutlineTree 加 pending_confirm 橙、confirmed 绿色标；右栏 MonitorPanel 加确认看板（待确认/已确认/进度条）",
          "最高杠杆修复：自动填表 safeFillAfterWriting 从写章后移至确认通过后才触发，根治未审视草稿污染设定库；AI诊断走纯本地六维质量分析（零Token、不依赖代理）真实可用",
        ],
      },
    ],
  },
  {
    version: "v0.46.88",
    date: "2026-08-05",
    title: "填表闭环对齐计划 P1-2：默认每章自动填表（fillFrequency 3→1、skipLatestChapter true→false）+ 已有项目数据迁移",
    sections: [
      {
        label: "填表闭环对齐计划（P1-2·每章自动填表）",
        items: [
          "根因：此前默认 fillFrequency=3（每3章填）+ skipLatestChapter=true（跳过最新章），而你总在写最新章 → 写章时填表几乎从不触发 → 前端对 skip 静默不弹 → 误判填表没工作",
          "修复：schema.prisma 的 fillFrequency @default(3)→1、skipLatestChapter @default(true)→false；loop.ts fallback 同步；对齐计划 P1-2「每写完一章自动填表」本意，写一章即触发、前端 toast「已写入 N 行」可见",
          "数据迁移：对已有 24 个项目 UPDATE 为 fillFrequency=1、skipLatestChapter=false（prisma db push 更新列默认 + 一次性脚本迁移已有行），本地立即生效；新项目随 @default 生效",
          "可观测性本就具备：前端 page.tsx 已消费 babylore_fill/babylore_recall SSE 事件（填表成功/失败 toast、召回条数 toast），仅此前因默认跳过导致不触发；保留频率/跳过可配（防重 roll 污染由填表去重+selfCheck 保护）",
        ],
      },
    ],
  },
  {
    version: "v0.46.87",
    date: "2026-08-04",
    title: "部署自检加固（P0-3）：doctor 补 Prisma client 生成检查 + 端口 3001 占用检测；全面自查 tsc/vitest/API/build 全绿（tsc 零错误）",
    sections: [
      {
        label: "部署自检加固（P0-3·doctor 补全）",
        items: [
          "doctor 脚本新增 Prisma client 生成检查：检测 src/generated/prisma/client.ts 是否存在，未生成时 fail 并提示「SAFE_DELETE_DISABLE=1 npx prisma generate」——直击已知坑（safe-delete 拦截 prisma generate，dev server 看似能起但所有 API 报 Cannot find module）",
          "doctor 新增端口 3001 占用检测：启动前用 net.createServer 探测端口，被占时 warn（可能是上一个 dev 进程未退出），避免端口冲突启动失败",
          "修正 Prisma 7 client 检查路径：Prisma 7 generator 输出 client.ts（非旧版 index.js），原检查误报已修；doctor 实测自检通过",
          "全面自查结果：tsc 零错误、vitest 190/190 全绿、/api/health+projects+settings 全 200、npm run build 通过；用户提过的问题（船建模/首页卡片/船黑/UI按钮/7项UI反馈/P3噪声）代码层全部修复；部署站 health 404+projects 500 为 Vercel 侧（未重新部署+Neon额度），代码已就绪",
        ],
      },
    ],
  },
  {
    version: "v0.46.86",
    date: "2026-08-04",
    title: "删 UI 噪声（智能体团队优化计划 P3·先减法后乘法）：顶栏导出/更多下拉收敛 + 右栏监测三面板默认折叠 + 左栏5→3 tab（更多▾收故事线/规则）+ 后处理提取常显其余收高级▾（tsc 零错误）",
    sections: [
      {
        label: "删 UI 噪声（智能体团队优化计划 P3·先减法后乘法）",
        items: [
          "顶栏收敛：原本 9 个按钮压到 7 个可见（零删任何功能）——「导出文件」与「复制全文」合并进「导出▾」下拉，「自动化」「工具箱」收进「更多▾」下拉；文风 / 大纲 / 摘要 / 导入书稿 / 备份包 保持常显；下拉用 relative z-50 容器 + fixed inset-0 z-40 遮罩，点击外部或遮罩即关闭，零误触零回归（Toolbar.tsx）",
          "右栏监测默认折叠：监测 tab 内「叙事能量曲线 / 生成延迟 / 节点监测」三面板改为可点开的折叠区块，默认全收起；折叠时不挂载子组件（NarrativeEnergyPanel / GenerationLatencyPanel / MonitorPanel 均带 fetch），展开才加载——省首屏请求与渲染开销，作者需要时一键展开看数据（RightPanel.tsx）",
          "左栏 5→3 tab：大纲 / 角色 / 世界 三个高频 tab 常显，低频的「故事线」「规则」收进「更多▾」下拉（activeTab 落在隐藏 tab 时「更多」按高亮态呈现），功能零丢失；呼应智能体团队「先减密度」——作者 90% 时间只用前三者，剩余两项随时可达（LeftPanel.tsx）",
          "后处理面板去过载：5 个 tab 的「章节提取」常显，「废词检测 / 逻辑自查 / 本地蒸馏 / 审校」4 个高级分析收进「高级▾」第二行（默认折叠），任一高级 tab 有问题时高级入口显红点角标；用内联双行展开（非绝对定位下拉）规避 PostGenPanel overflow-hidden 容器对下拉菜单的裁切，零裁切零回归（PostGenPanelTabs.tsx）",
        ],
      },
    ],
  },
  {
    version: "v0.46.85",
    date: "2026-08-04",
    title: "生成延迟硬指标（P2）：LlmCallLog 加 durationMs/firstTokenMs 计时埋点 + GET /api/generation-metrics 延迟聚合 + 生成延迟面板（本地vs云端对比 + 2s 阈值标红）（tsc 零错误）",
    sections: [
      {
        label: "生成延迟硬指标（智能体团队优化计划 P2·把延迟写进门禁）",
        items: [
          "监测 tab 新增「生成延迟」面板（GenerationLatencyPanel）：展示首 token 延迟 P95（流式到首个字）、总延迟 P95（端到端 95 分位）、输出吞吐 token/s、样本数，并在总延迟 P95 > 2000ms 时红色警示「超过两秒就是失败」（智能体团队原话铁律）；本地推理（Ollama）vs 云端 API 总延迟 P95 横向对比条形，作者一眼看出本地是否更快",
          "零新增 schema 主表：复用既有 LlmCallLog 加 durationMs（总耗时）/firstTokenMs（首 token 延迟）两可空字段，PRISMA_DISABLE_SAFE_DELETE=1 npx prisma db push + generate；在 src/core/llm/client.ts 的 chat（成功返回测端到端总耗时，含重试/故障转移）与 chatStream（readStream 新增 onFirstToken 回调测到首个正文 token 的 TTFB）埋点，经 src/lib/llm.ts 的 recordLlmCall 落库，全程 fire-and-forget try-catch 容错，绝不阻塞生成主流程",
          "新增 GET /api/generation-metrics 路由（force-dynamic）：从 LlmCallLog 聚合最近 300 条成功调用（role 不以 fail: 前缀、durationMs 非空，剔除重试/失败记账避免失真），算首 token/总延迟的中位 P95 均值、整体输出吞吐、按 Base URL 含 localhost/11434 分本地/云端对比；返回 overThreshold 标志（P95 总延迟 > 2000ms），供面板标红",
          "该指标直接验证 P0 本地推理整合收益：本地推理走本机 GPU 零网络往返、云端走 API 受代理/限流影响，作者拿到真实延迟分布即可量化「本地推理到底值不值」；呼应智能体团队计划 P2「生成延迟当硬指标 / 把延迟写进门禁」，与 P0 本地推理、P1 叙事能量曲线形成可机检连贯性 + 性能闭环",
        ],
      },
    ],
  },
  {
    version: "v0.46.84",
    date: "2026-08-04",
    title: "叙事能量曲线（叙事物理引擎雏形·P1）：ChapterSummary 事件分层确定性加权能量 + SVG 折线峰谷标注 + 节奏诊断（tsc 零错误）",
    sections: [
      {
        label: "叙事能量曲线（智能体团队优化计划 P1·先粗粒度）",
        items: [
          "监测 tab 顶部新增「叙事能量曲线」面板：SVG 折线图展示各章叙事能量（张力）随章节变化，自动以空心圈标注峰值（accent 色）与谷值（success 色）章节并附能量数值；概览卡显示均值 / 峰值章 / 谷值章",
          "能量计算零新增 schema 字段：复用 ChapterSummary 既有 eventImportances（S/A/B/C 四级事件分层）+ keyEvents 密度，确定性加权 raw = 1.0*S + 0.7*A + 0.4*B + 0.15*C + 0.05*keyEvents，再 /3.0 截断到 [0,1] 得 energy；按 StoryNode.order 排章节序（缺失 StoryNode 顺序的章节按 createdAt 兜底），一章多条摘要取最新",
          "节奏诊断：computeNarrativeEnergy(@/core/narrative-energy) 含峰谷定位、能量方差、首末趋势（虎头蛇尾检测）、峰谷落差（张力过平 <0.15 / 起落强烈 >0.5）、连续下降段（≥3 章且累计降幅 >0.4 提示读者流失风险）、平缓平台（≥4 章张力不动提示打破单调），给作者 1-3 条可操作建议",
          "新增 GET /api/narrative-energy?projectId=xxx 路由（force-dynamic，只读聚合无副作用，缺 projectId 返 400，异常核心兜底返空结构）；NarrativeEnergyPanel 仿 MonitorPanel 风格 fetch 渲染，空数据给出引导文案；整段 try-catch 容错，任何异常不阻断监测 tab 其余模块",
        ],
      },
    ],
  },
  {
    version: "v0.46.83",
    date: "2026-08-04",
    title: "伏笔收束率指标（确定性语义种子检测，复用五状态机）+ 本地推理垂直整合（Ollama 免 Key 一键预设）（tsc 零错误）",
    sections: [
      {
        label: "伏笔收束率指标（智能体团队优化计划 P0）",
        items: [
          "伏笔面板顶部新增收束率进度条：实时展示 payoffRate = (已回收 + 0.5*部分回收) / 活跃伏笔，以及已回收/部分/活跃计数；点「重新检测」POST /api/foreshadowing/detect，扫描该伏笔 detectedAt 之后写入的全部章节摘要，用语义种子确定性回写 status / fulfillmentRatio / fulfilledAt",
          "检测零新 schema 字段：复用既有五状态机（pending/detected/partially_fulfilled/fulfilled/voided）+ fulfillmentRatio，新增 detectPayoffs（回写）/ computePayoffStats（只读聚合）于 @/core/foreshadowing.ts；种子取「描述里连续中文短语(≥3字) + closureConditions 闭环条件」，命中规则为闭环条件任一命中或描述短语命中≥2 → 已回收，仅命中 1 且仍埋设中 → 部分回收，未命中维持原状（绝不降级已回收）",
          "免跨表脆弱解析：故意不依赖 entityIds（UUID，跨 CharacterCard/LorebookEntry 易错），改用语义种子做字符串命中，可单测、零外部 LLM 调用、永不超时；list 路由附只读 payoffStats，面板首屏即见收束率无需手动触发",
          "新增 POST /api/foreshadowing/detect 路由（幂等、可重复调用、异常返回 ok:false 不抛 500）；整段 detectPayoffs / computePayoffStats try-catch 容错，任何异常返回零值统计，绝不阻断调用方主流程",
        ],
      },
      {
        label: "本地推理垂直整合（智能体团队优化计划 P0·白痴指数最高环节）",
        items: [
          "设置页新增「本地推理 (Ollama)」一键预设：选中即填默认 Base URL http://localhost:11434/v1，并展示 Base URL 输入框（本机 Ollama 地址）与「本地推理无需 API Key」提示；模型名留空则提示须填（如 qwen2.5:7b）",
          "测试连接放行无 Key：POST /api/settings/test 对 provider===local 跳过 apiKey 校验（baseUrl 必填），testLLMConnection 走 OpenAI 兼容 /chat/completions，Ollama 忽略空 Bearer；保存路由 PUT /api/settings 接受空 llmApiKey 落库",
          "getSettings 本地分支：llmProvider===local 时免 Key，直接用 db.llmBaseUrl + db.llmModel 构建配置（Base URL / 模型名缺失则明确报错），PROVIDER_BASE_URLS 补 local 兜底；LLM 客户端本就 OpenAI 兼容，生成链路零改动即可本机 GPU 跑模型，零 API 费用",
          "白痴指数视角：此前 DeepSeek API 托管推理占整链路成本 ~9x（自购 GPU 算力的倍数），本地推理把这笔外部依赖收回到作者自己的机器，是智能体团队计划书中杠杆最高的单项优化；保留云端 API 作兜底，不强制",
        ],
      },
    ],
  },
  {
    version: "v0.46.82",
    date: "2026-08-04",
    title: "伏笔后续发展思路：面板可编辑 + AI 依缝合怪多线原则自动推演方向并落库，新增 update 路由（tsc 零错误）",
    sections: [
      {
        label: "伏笔后续发展思路（用户反馈）",
        items: [
          "伏笔面板新增可编辑「后续发展思路」区：展开任意伏笔即见 AI 依现有剧情（缝合怪多线推进原则：主线/个人线/事件线多速率兑现）推演的 2-4 句方向，作为写作参考指示；作者可手填自己的判断，或点「AI 重生成」让模型按最新剧情重新推演",
          "PendingCommitment 模型新增 developmentHint 字段并落库：作者手填与 AI 生成的方向都持久化，刷新面板后保留，不复写原有埋设/检测/回收/废弃状态机",
          "自动生成接入两条伏笔计入路径：正文后处理本地蒸馏检出的伏笔（post-processor）与拆书抽取计入的伏笔（apply-extraction）在创建后异步 fire-and-forget 调 enrichForeshadow 落库，不阻塞正文生成、LLM 异常静默回退",
          "新增 POST /api/foreshadowing/update 路由：支持手填 developmentHint / 描述 / 状态 / 优先级，以及 regenerateHint 触发 LLM 重生成；面板「保存方向」「AI 重生成」按钮调此路由并即时本地刷新；开发强调「只给方向不替作者写正文，贴合已有剧情不凭空开新线」",
        ],
      },
    ],
  },
  {
    version: "v0.46.81",
    date: "2026-08-04",
    title: "实体高亮固定色 + 表头图例 + 正文点击跳转设定界面：角色醒目橙 + 世界书各分类高对比固定色，配色单一来源收敛，tsc 零错误",
    sections: [
      {
        label: "实体固定色高亮 + 表头图例 + 正文点击跳设定（用户反馈）",
        items: [
          "角色卡固定醒目橙（#F97316），世界书各分类升级为高对比固定色（势力绿/物品金/地点天蓝/法术紫/功法红/生灵粉/文化青/历史靛/法则琥珀/货币柠檬绿/自定义灰）；固定色单一来源收敛到「src/core/entity-highlighter.ts」的 CHARACTER_COLOR / LORE_COLORS，API route、正文高亮 span、表头图例三者共用，消除此前 API 复制硬编码导致的配色漂移",
          "表头图例：正文上方新增固定色图例行（角色 + 世界书各分类，色块 + 中文标签），一眼看懂每种颜色代表哪类实体，与「本章实体」彩色徽章互补（徽章是本章实际涉及、图例是全局色卡分配）",
          "正文点击跳转：高亮 span 现带 data-entity-id 并 role=button / tabIndex 可聚焦，MarkdownViewer 新增 onEntityClick 容器层事件代理，点击正文内被高亮实体名即打开其设定界面（角色→角色编辑器、世界书→世界书编辑器），复用 CenterPanel 既有的 onEditCharacter / onEditLore；globals.css 统一 hover / focus 浅底高亮（去旧角色蓝硬编码）",
          "颜色引擎补 id 透传：EntityHighlight / EntityRaw / EntityMatch 加 id 字段，buildEntityMapFromData 与 findEntitiesInText 透传 id，rehype 插件把 id 写入 span 的 data-entity-id，支撑点击跳转；固定色纯展示不引入额外状态，与「不需要别的」约束一致",
        ],
      },
    ],
  },
  {
    version: "v0.46.80",
    date: "2026-08-04",
    title: "顶部栏导入入口去重：删除冗余「导入设定」按钮，保留「导入书稿」（弹窗内可切设定/章节/快速模式）（tsc 零错误）",
    sections: [
      {
        label: "导入入口去重（用户反馈）",
        items: [
          "删除顶部栏「导入设定」按钮，仅保留「导入书稿」：二者均打开同一个 ImportWizard 弹窗，仅 initialMode 预选不同（settings / chapters），弹窗内「导入类型」选择器可自由切换「章节正文 / 设定文本 / 快速导入」，删一个不丢能力",
          "清理接线：Toolbar 移除 onImportSettings prop 与对应按钮；workspace 页移除 onImportSettings 处理器，统一走 onImportChapters（默认 chapters 模式，设定模式在弹窗内选择）；刷新后顶部栏少一个重复入口",
        ],
      },
    ],
  },
  {
    version: "v0.46.79",
    date: "2026-08-04",
    title: "首页纸舟星海静态化：降低船密度 + 向日葵螺旋分散 + 停止巡游动画 + 降像素比减卡顿（tsc 零错误）",
    sections: [
      {
        label: "纸舟星海静态化（用户反馈）",
        items: [
          "停止绕圈巡游：orbitSpeed 置 0，删除每帧 boids-lite 分离避让（O(n^2) 计算，卡顿主因之一）与逐帧旋转/缩放/摇晃/入场坠落，船水平固定、船头朝向建船时固定朝外，仅随波浪轻浮贴合水面（自然停泊感，非巡游移动）",
          "降低密度：3D 船数封顶 MAX_BOATS=12（作品再多也只渲染 12 艘），下方按钮列表仍列出全部作品、可点击进入写作区；减少 Draw Call 直接降卡顿",
          "均匀分散：改用向日葵（黄金角）螺旋分布，轨道半径随 sqrt(i) 增大、Z 拉伸由 0.6 提到 0.85，船阵天然均匀散开、互不重叠、不再聚堆",
          "减卡顿：渲染像素比上限 1.75→1.5，削减海面着色器像素开销；相机一次缓动到位后静止，场景除海浪与极轻灯辉外不再自主运动；底部说明由「水面随机巡游」改为「星海静泊」",
        ],
      },
    ],
  },
  {
    version: "v0.46.78",
    date: "2026-08-04",
    title: "会员股东 Round 12 收尾 UI 批量修复增强：语法高亮仅颜色 + 去词条统计、章纲默认折叠、游戏模式检测粒子/高亮回归 + 进度条 + 构思开头前置 + 自动推进开关（tsc 零错误）",
    sections: [
      {
        label: "语法高亮仅颜色区分 + 去词条统计（用户反馈）",
        items: [
          "globals.css 删除「非颜色区分线索」整块（11 类差异化下划线 + ::before 前导形状标记），rehype-entity-highlight 去除 font-weight:600，实体高亮回到只用颜色区分，无前缀、无下划线",
          "MarkdownViewer 删除正文下方 EntityLegend（按角色/势力/物品/地点/世界观/功法分类计数），章节名下方不再显示统计词条，仅保留纯渲染高亮",
        ],
      },
      {
        label: "章纲默认折叠（用户反馈）",
        items: [
          "CenterPanel 大纲区改为默认收起的「章纲·已设」按钮，点击才展开大纲文本并进入编辑；轻量章纲/抽卡分镜等生成控制保持常驻可见，长章纲不再常驻占屏",
        ],
      },
      {
        label: "游戏模式检测粒子与高亮回归（用户反馈）",
        items: [
          "GameParticles 重构为 forwardRef 暴露 emitBurst(x,y,color,count)，内部新增爆发粒子系统（向外迸发 + 轻微重力衰减）；游戏页 handleStart/handleAction 在检测到新实体时调用触发",
          "新增顶部「发现：角色·名 / 势力·名 / 物品·名」浮动提示层（nf-discovery-pill 动画，3 秒淡出），与粒子同步出现，修回此前丢失的检测反馈手感",
        ],
      },
      {
        label: "游戏模式进度条 + 构思开头 + 自动推进（用户反馈）",
        items: [
          "载入/每轮生成(generating)/导出(ending)均显示顶部 indeterminate 进度条；导出额外弹出「正在收束并导出本章正文」覆盖层，缓解载入慢的焦虑",
          "就绪界面新增「构思开头」按钮 + 新接口 /api/game/concept（LLM 基于项目/角色/世界书生成 2-4 句开场构思与建议起始行动），可预览并「采用此构思开场」带入 /api/game/start（start 路由新增 concept 入参并融入开场提示词）；支持重新构思/不用直接开始",
          "自动推进按钮升级为可点开关：开启后每轮结束延迟 1.4s 自动触发「自动推进剧情」，停止生成即暂停并清空定时器；用 autoAdvanceRef/statusRef 避免闭包读到旧状态导致死循环",
        ],
      },
    ],
  },
  {
    version: "v0.46.77",
    date: "2026-08-04",
    title: "会员股东 Round 12 魔王系统 N1 修复：推理模型(deepseek-v4-flash)游戏端点空正文闭环 + 全局输出预算保护（tsc 零错误，真机游戏 start/action 复测非空）",
    sections: [
      {
        label: "N1 推理模型游戏空正文闭环（魔王系统修复）",
        items: [
          "根因：deepseek-v4-flash 是推理模型，先吐思考链(reasoning_content)且与正文共用 max_tokens 预算；game/start、game/action(processGameTurn)、章尾收束三处预算仅 800/800/400，全部预算被思考链吃光导致正文 content 为空，游戏开局与回合返回空叙事（Round 12 e2e 复测 N1 实锤：max_tokens=800→content 0，max_tokens=2000→content 461）",
          "修复：LLM 客户端层新增推理模型最低输出预算保护 resolveMaxTokens——命中推理模型正则(含 v4-flash/reasoner/thinking/o1 等)时 max_tokens 强制不低于 2500，非推理模型保持原设定；三处游戏端点字面量同时抬到 2500 做防御纵深",
          "配套：readStream 现把 reasoning_content 的 token 计入 completionTokens，使流式用量计数与最终 usage 一致，灭监测面板少算推理消耗",
          "真机复测(dev:3001 真实 DeepSeek)：game/start 返回 narrative 619 字 + 4 选项 + 建 session(世界卡联动跑通)；game/action SSE 返回 game_done.narrative 653 字 + 4 选项；均非零、叙事连贯，N1 闭环",
        ],
      },
    ],
  },
  {
    version: "v0.46.76",
    date: "2026-08-04",
    title: "会员股东 Round 12 魔王复测回流补丁：Q1 碎片过滤补强（isCompleteEntityName 漏网闭环，tsc 零错误，回归测试全绿）",
    sections: [
      {
        label: "Q1 碎片过滤补强（青砚，魔王复测回流）",
        items: [
          "e2e 复测发现 isCompleteEntityName 对「以实体后缀结尾但不含功能/身体词」的碎片仍漏过滤（显得像一根/潮之后裸露/地名像一根/车铃），测试项目真实 lorebook 实测漏进 91 条 [自动发现] 占位碎片",
          "补强：FRAGMENT_FUNCTIONAL 扩充谓语/描述/感知/指代字（像/显/似/裸/得/用/号/潮/退/醒/剪/搁/斜/进/泡/记/住/顿/隔/刺/撬/打/问/远/处/拉/第/推）；新增 FRAGMENT_COMMON_PREFIX（≤3字且首字为日常器物：车/桌/门/窗/玻/璃…）灭车铃/玻璃门；新增 FRAGMENT_COMMON_PHRASES（手指/社区/中心/本子/封皮/玻璃/位于）灭手指骨/社区中心门/本子封皮/龙渊两只手指/位于新城",
          "刻意不收之/地/比/亮/朝/甲/曲等会误杀真实专名的字（龙陨之地含之、比干含比、孔明之亮）；83 条代表碎片全拦、真实专名（龙渊/中南海/乌坦城/叶凌云）零误杀；entity-detector.test.ts 新增魔王回流回归测试锁定",
          "清理测试项目 91 条 [自动发现] 占位碎片（召回净化已排除出 prompt，清理仅为去 clutter）；过滤器强化后新漏网已闭合",
        ],
      },
    ],
  },
  {
    version: "v0.46.75",
    date: "2026-08-04",
    title: "会员股东 Round 12 复验闭环：分支备份导入 P0 修复 + 填表透传溯源与跨表防错放 + 三卡检索去污染与匹配词边界 + 游戏动词闭环与轮次幂等 + 导入 deadline/口径闭环 + 监测面板按项目成本 + a11y 闭环（tsc 零错误）",
    sections: [
      {
        label: "分支备份导入 P0 闭环（工坊 G1 + W1）",
        items: [
          "projects/import 原 strip 删除必填 forkPointNodeId 致含 storyBranches 的 .nfproject 备份导入整体失败、事务回滚零创建 → 改为占位 nodeMap[old] ?? old ?? 空串，待章节 pass 后 step 3.5 回填重映射彻底闭合 P0；parentBranchId 重映射灭悬空、选择性导入 forkPoint 静默丢失改为 lostForks 提示、事务超时 60s→120s",
        ],
      },
      {
        label: "填表透传溯源与跨表防错放（墨白 M1 + M2）",
        items: [
          "continue/refine 透传 nextNode.order/nodeId 与 currentNode.order/nodeId 给 safeFillAfterWriting，写入行 _src 由 ch?:batchmanual 修正为 ch{n}:batchmanual 闭合章节溯源；填表写入前校验人物实体不匹配地理表则报错不写错（灭角色萧薰儿落妃嫔居住建筑表类跨表错放），crossTableIssues/skippedOps 贯穿 babyloreFill/babyloreFillAll 汇总进自检与诊断；顺带 projectId 接入 recordLlmCall 灭成本面板失明",
        ],
      },
      {
        label: "三卡检索去污染与匹配词边界（青砚 Q1 + Q2 + Q3）",
        items: [
          "实体抽取蒸馏分段过滤含功能词/标点/超长候选灭句子碎片（右手拇指/核桃壳在他指）建卡污染世界书；matchNameStrict 3字+ 覆盖区间吞并修中段嵌入（灭李星云剑法误命中李星云），2字分支保持不吞并保召回（Round4 铁律，trigger.test 回归锁定）；entity-detector 填 aliases 复活去重、entity-highlighter 补 2字尾边界与非颜色线索、buildEntityMapFromData 入 aliases",
        ],
      },
      {
        label: "游戏动词闭环与轮次幂等（阿游 A1 + A2 + A3 + A4）",
        items: [
          "GameState 轮次写入改 upsert（sessionId_round 幂等抗 P2002 并发失败）；reconcile 前端镜像补 unequip/destroy/skip 三分支与后端 applyItemChanges 对齐；ItemChange.operation 扩为 7 值诚实类型；OP_MAP 补消费/卸下/损毁/流转同义词（消告警不污染数据），ensureItemLorebook 加 owner 维度去重并 export，start 开场 gain 物品也建世界卡",
        ],
      },
      {
        label: "导入 deadline/口径闭环 + 监测面板按项目成本 + a11y（磐石 P_a/P_b/P_c + 用户#16 + 清览 L1）",
        items: [
          "commit 加 COMMIT_DEADLINE_MS=270_000 全局 deadline，到点停放飞、未放飞批留 null 走 ruleMerge 兜底报 partial 与 parse 口径一致；parse totalTokens 改 usage.total_tokens ?? usage.totalTokens ?? prompt+completion 统一；monitor/route 按 projectId 分组聚合本月 llmCallLog，MonitorPanel 新增 AI 成本卡片（调用次数/token 总量/估算花费/占全局比）闭合用户#16；a11y 补 CommandPalette/toast aria-label、暗色 select option 高亮、三页抽屉遮罩 aria-hidden、卡片 truncate 补 title",
        ],
      },
    ],
  },
  {
    version: "v0.46.74",
    date: "2026-08-04",
    title: "会员股东 Round 11 复验闭环：填表主链路溯源修复 + 建卡别名去重/变体收敛 + 游戏动词闭环与轮次唯一 + 抽屉焦点逃逸修复 + 导入并发/超时/口径闭环 + 正则 ReDoS 纵深防御（tsc 零错误）",
    sections: [
      {
        label: "填表主链路修复（墨白 2 P1）",
        items: [
          "loop.ts 调 babyloreFill 透传 chapterOrder，修复 Round10 引入的自动填表写入行 _src 恒为 ch?:batchmanual 断线（灭章节溯源名存实亡 + 同名异源弱告警因解析不到章节永不触发）；babyloreFillAll 全跳过判定收窄——仅当脏标记含 DB 找不到正文章节的幽灵 id 才判 all_skipped_mislabeled 并提示清理，正常已校验章节全跳过判 all_clean 不诱导破坏性重填；fill.ops 测试断言同步修正",
        ],
      },
      {
        label: "建卡别名去重与变体收敛（青砚 2 P1）",
        items: [
          "apply-extraction findExactDuplicate + entity-auto-creator autoCreateEntities 把已有角色 aliases 与新建实体 aliases 摊平进查重候选集，灭「炎帝」（alias 萧炎）与「萧炎」双卡；isSimilarName 长名合并阈值由 levenshtein<=1 收紧为等于 0（先繁简归一），灭「青云宗/青云山」「玄铁剑/玄铁刀」类语义不同实体误并漏建；DetectedEntity 类型增可选 aliases 字段支撑批内去重；确认仅作用于建卡去重路径，不触达 matchNameStrict/recall 匹配语义（Round8/9/10 OOC/召回修复无回流）",
        ],
      },
      {
        label: "游戏动词闭环与轮次唯一（阿游 2 P1）",
        items: [
          "OP_MAP 扩充同义动词（吞下/服下→consume、舍弃/抛弃/遗弃/遗失/失落→discard、解下/卸下/脱下→unequip、典当/抵押→skip、损毁/摧毁/弄坏→destroy），game-engine applyItemChanges 增 unequip/destroy/skip 分支，收窄原 else→gain 兜底（仅获得类动词兜底、其余未知动词安全跳过不再默认 +1 污染背包）；schema GameState 加 @unique([sessionId,round]) 防并发/重试写重复轮次快照致对账歧义，已 db push + generate",
        ],
      },
      {
        label: "抽屉焦点逃逸修复（清览 P1）",
        items: [
          "explore / workspace / game 三页抽屉的 inert 由仅覆盖中栏上移到顶栏 header/toolbar 及同级交互条，窄屏 aria-modal 打开时顶栏按钮不再被 Tab/读屏访问，灭模态焦点逃逸；对话框本身不参与 inert 焦点陷阱仍生效",
        ],
      },
      {
        label: "导入并发/超时/口径闭环（磐石 4 P1）",
        items: [
          "commit 的 char/lore 两路 merge 由裸 Promise.all 改为共用 4 路限流池 MERGE_LIMIT，封顶并发灭超大导入打爆 LLM 提供方；parse 加全局 deadline 280s，到时优雅中断剩余批次、已完成块如实上链为 partial（skippedChunks 标记）不丢全部结果；B 路世界提取由串行尾部改为与 A 路分块同池并发；mergeOneBatch 在 provider 不返 total_tokens 时回退 prompt+completion 求和，与 parse 口径统一灭监控 totalTokens 失真",
        ],
      },
      {
        label: "正则 ReDoS 纵深防御（工坊 2 P2）",
        items: [
          "forbidden-checker parseRegexPattern 编译后复用 isLikelyUnsafeRegex 做 ReDoS 预判，命中抛友好错误并被扫描过程捕获为 info 提示跳过、不崩溃；预设 regex apply 入口前移 isLikelyUnsafeRegex 校验，不安全正则直接返 422 拦截不写库；两项均为纵深防御（当前无活跃用户输入触发路径）",
        ],
      },
    ],
  },
  {
    version: "v0.46.73",
    date: "2026-08-04",
    title: "会员股东 Round 10 复验闭环：填表完整性（单章自检/skippedOps/同名异体告警/行级溯源/清脏标记）+ 游戏归属与前后端对齐 + 抽屉无障碍闭环 + 导入真实记账与并发 + 建卡去重/预设守卫（tsc 零错误）",
    sections: [
      {
        label: "填表完整性闭环（墨白 4 P1）",
        items: [
          "babyloreFill 落库后跑 selfCheckFill 回传归属/跨表 issues（单章填表主链路补自检，灭写章自动填表零错名缺失）；applyOps 收集 skippedOps:{op,reason,table} 使单 op 失败可追溯不静默丢数据；selfCheckFill 增补表内同名异源弱告警（不静默合并撞名不同实体）；写入行附 _src（章节+批次）与 _ts 溯源（rows 为 JSON 列，不改 schema）；新增 /api/babylore/clear-filled 清脏标记出口 + tables 页展示 fillErrorMeta",
        ],
      },
      {
        label: "游戏归属/前后端对齐/主线一致（阿游 3 P1）",
        items: [
          "开局 initialItems 写入 owner（与 processGameTurn 对齐）灭同名物品混淆；开局响应补 items 且前端 handleStart 用后端权威背包预建，开场即前后端一致不必等首次 abort 对账；OP_MAP 扩展同义动词（拾取/佩戴/吃掉/丢掉…）且未知动词 console.warn 默认当 gain，灭叙事有物背包无记录",
        ],
      },
      {
        label: "抽屉无障碍闭环（清览 P1）",
        items: [
          "explore 右抽屉（已采纳面板）补 ref={rightDrawerRef}+role=dialog+aria-modal+aria-labelledby+sr-only 标题，与左抽屉对齐，焦点陷阱/ESC 真正生效，闭环 Round9 漏修的最后一抽屉",
        ],
      },
      {
        label: "导入真实记账 + 去冗余 + 并发（磐石 3 P1）",
        items: [
          "import/parse 成功分支改用供应商真实 data.usage 记账（缺失退回分词估算），与 commit/mergeOneBatch 口径统一；buildGlobalContext 仅名称索引去细节、mergeOneBatch 拼本批聚焦清单，灭大世界逐批重复发送 30 万+ token 冗余与后段丢失；分块解析改 4 路限流并发、按完成顺序回报 SSE 进度，解超大书超 300s 被强杀；monitor since 改动态生成",
        ],
      },
      {
        label: "建卡去重（青砚 P2）",
        items: [
          "apply-extraction 建角色卡/词条前先 findFirst 精确查重并复用 isSimilarName 做繁简/错字变体去重，灭重复角色卡污染三卡召回与 OOC 上下文",
        ],
      },
      {
        label: "预设守卫（工坊 P2）",
        items: [
          "预设 apply 的 api_config 由整体摊平改按 llmConfig 子键白名单逐层深合并、剔除非配置键，灭污染；未知 type 改返 400 杜绝静默 no-op 仍写 appliedPresets/downloads，提升预设套用可信度",
        ],
      },
    ],
  },
  {
    version: "v0.46.72",
    date: "2026-08-04",
    title: "会员股东 Round 9 复验闭环：数字边界守卫 + abort 语义干净 + 填表死循环消除 + 流式成本可见 + 移动抽屉无障碍 + 正则回归修复/导入幂等落库（tsc 零错误）",
    sections: [
      {
        label: "数字关键词边界守卫（青砚 P1）",
        items: [
          "matchKeyword 对含数字且非纯数字的关键词（如「2049年」「第3章」）加数字边界守卫：命中位置首/末字符是数字且紧邻也是数字（数字串被延长）则跳过，灭「2049年」误命中「12049年」；纯数字与无数字关键词行为不变",
        ],
      },
      {
        label: "abort 语义彻底干净（阿游 P1）",
        items: [
          "game-engine 消费 chatStream 的 catch 区分 AbortError：用户主动停止不再被误判为「LLM 调用失败」，优雅放弃本轮、不污染回放/对账；信号透传链路（engine→chatStream→client fetch）保持正确",
        ],
      },
      {
        label: "填表死循环消除（墨白 P1）",
        items: [
          "babyloreFillAll 全跳过 error 结构化：携带 {processed,applied,skipped,failed,nodeIds} 并区分「无待填数据」vs「疑似旧版误标脏标记」；每个已评估节点（applied 成功或 clean 跳过）清除脏标记，灭「全 clean 跳过→ok:false→UI 一直显示有更新→无限重填」死循环",
        ],
      },
      {
        label: "流式成本可见 + 崩溃孤儿锁清理（磐石 P1）",
        items: [
          "establishStream 加 stream_options:{include_usage:true}，流式末段返回真实 usage，token 不再恒 0；MODEL_PRICING 增补 deepseek-v4-flash（估算价），默认硅基流动模型成本可见不再全 $0；commit 幂等锁获取前先删 15 分钟以上陈旧锁，灭进程崩溃永久孤儿锁",
        ],
      },
      {
        label: "移动抽屉无障碍（清览 P1）",
        items: [
          "workspace/explore/game 三页窄屏模态抽屉（left/right aside/div）补 role=dialog + aria-modal + aria-labelledby + 焦点陷阱（复用 use-focus-trap）+ ESC 全局关 + 背景 inert，键盘/读屏焦点不再逃逸到背景",
        ],
      },
      {
        label: "正则回归修复 + 导入幂等落库（工坊 P1）",
        items: [
          "regex.ts 把 `?` 移出 repeated 集（内层 `?` 仍经 hasQuantInside 捕获 (a?)+ 类真 ReDoS），修复 Round8 误杀合法可选组（(https?://)?/(a+)? 被当 ReDoS 静默丢弃）的回归；Project 加 importSource @unique + 导入并发 P2002 幂等返回已存在项目，落库到 DB 唯一约束",
        ],
      },
    ],
  },
  {
    version: "v0.46.71",
    date: "2026-08-04",
    title: "会员股东 Round 8 实现：OOC/召回死代码接线 + 游戏abort透传彻底化 + 填表假完成修复 + 幂等锁跨实例/弹窗无障碍（tsc 零错误）",
    sections: [
      {
        label: "OOC/召回死代码接线（青砚 P0）",
        items: [
          "删无生产调用方的 findCharacterByName 死代码（误导 Round7 修复未接线）；matchLoreEntries 新增 tables 形参，collectTableKnownNames 把表格关键列值（≥2字，name/title/place 等）并入 knownNames；3字 lorebook key 恰为更长表值前缀时被吞并，灭「李星云剑法」内「李星云」误召回——Round7 修复落到真生产路径",
        ],
      },
      {
        label: "游戏 abort 透传彻底化（阿游 P1）",
        items: [
          "processGameTurn 把 AbortSignal 透传到 chatStream（client.ts 用 AbortSignal.any 合并超时转发 fetch），停止后 LLM 真正中断不再丢 token；空流（0 chunk）新增守卫跳过 $transaction，不提交幻影空轮次",
        ],
      },
      {
        label: "填表假完成修复（墨白 P1）",
        items: [
          "babyloreFillAll 全跳过分支由 ok:true 改为 ok:false 带 error 摘要（注明全部跳过、applied=0、疑似旧版误标脏标记），与 Round6 ok&&applied>0 门槛一致，灭静默假完成",
        ],
      },
      {
        label: "幂等锁跨实例 + 监控/采样（磐石 P1）",
        items: [
          "commit 幂等锁由进程内存 Map 改 DB 唯一约束（ImportCommitLock.projectId+nodeId），跨实例有效，P2002 冲突返 409 跳过，finally 释放；import_parse 失败 Flash 调用补 recordLlmCall（fail:import_parse，token 0）与 client.ts 口径一致；buildLoreSample 改头+最多4段均匀中段窗口+尾采样，覆盖长文中段",
        ],
      },
      {
        label: "弹窗无障碍补全（清览 P1）",
        items: [
          "toast Confirm/Prompt 与 CommandPalette 补 role=dialog + aria-modal + aria-labelledby + 焦点陷阱（ESC 全局可关、Tab 循环），灭读屏报不出名与键盘可逃逸——Round7 Modal 收敛漏掉的 2 处手写模态",
        ],
      },
      {
        label: "正则/导入工程加固（工坊 P1）",
        items: [
          "regex isLikelyUnsafeRegex 补 ? 量词嵌套检测，覆盖 (a?)+/(a?)* 类 catastrophic backtracking；import 创建 storyNode 时剥离 parentId/branchId、pass2 按旧→新映射回填、悬空置 null，灭外键悬空；幂等查重由事务外移入 $transaction 内防并发重复",
        ],
      },
    ],
  },
  {
    version: "v0.46.70",
    date: "2026-08-04",
    title: "会员股东 Round 7 实现：abort 信号透传自愈 + 幂等锁空载荷 DoS 修复 + OOC 词条误报回归 + 填表假完成/不可变更新 + 导入分叉重映射/正则重叠交替/事务超时 + 19 处弹窗 aria（tsc 零错误）",
    sections: [
      {
        label: "abort 信号透传自愈（阿游 P0）",
        items: [
          "game-engine processGameTurn 增 signal 形参，流式循环与 $transaction 提交前 if(signal.aborted) return 丢弃本轮；action/route 透传 req.signal；前端 handleStop 改 async，abort 后 await reconcileWithBackend 读权威态整体覆盖，灭流式中断前后端重新错位（Round6 P0-2 想灭的故障重现）",
        ],
      },
      {
        label: "幂等锁空载荷 DoS 修复（磐石 P0）",
        items: [
          "commit/route 空载荷校验（chapters/characters/loreEntries 全空→400）移到 commitLocks.set 之前，400 提前返回不再经过锁；合法写入不被 300s 阻塞；finally 释放作兜底",
        ],
      },
      {
        label: "OOC 词条误报回归（青砚 P1）",
        items: [
          "trigger.findCharacterByName 新增 extraKnownNames，把同章节词条/技能/功法/地点等长名候选并入 knownNames；matchNameStrict 原支持 knownNames 更长名前缀吞并，现「李星云剑法」内「李星云」被吞并不误报 OOC，「李星云看见」仍正常",
        ],
      },
      {
        label: "填表假完成 + 游戏健壮性（墨白/阿游 P1）",
        items: [
          "babyloreFillAll 汇总各章 applied/ok，任一章失败或 applied=0 返回 ok:false（不恒 true），灭静默假完成；前端背包更新改纯函数不可变写法（reconcile.applyFrontendItemChanges），entities 跨轮 flatMap 按 name 去重",
        ],
      },
      {
        label: "导入/正则工程加固（工坊/磐石 P1）",
        items: [
          "import/route 分支创建缓存旧 forkPointNodeId 并回填重映射，恢复分叉拓扑；交互事务显式 timeout:60000，大备份不再被 5s 默认超时回滚；regex isLikelyUnsafeRegex 增补重叠交替检测（(a|aa)+/(a|b)+ 均拦）；parse world/文风改头中尾三段采样拼接（>32k 取中段），长文后段设定进入 LLM；commit 多步写包 $transaction 整体回滚",
        ],
      },
      {
        label: "弹窗无障碍补全（清览 P1）",
        items: [
          "Grep 全项目裸弹窗，19 处补 aria 关联：StyleEditor loading/error 用 ariaLabel；17 处带可见标题弹窗补 labelledBy + 标题加 id（更新公告/上传预设/新建表格/游戏教程/历史版本/项目设定/快捷键/自动化/批量导入/导入/扩展结果/生成前确认/配置中心/规则/故事线/工具箱）",
        ],
      },
    ],
  },
  {
    version: "v0.46.69",
    date: "2026-08-04",
    title: "会员股东 Round 6 实现：3字+名最长匹配优先 + 游戏流式中断自愈 + 填表空章节静默丢数据 + 连词/介词高亮 + 中文复合数字 + 背包owner隔离 + import事务幂等 + 正则ReDoS防护 + Modal无障碍（tsc 零错误）",
    sections: [
      {
        label: "3字+角色名最长匹配优先（青砚 P0-1）",
        items: [
          "matchNameStrict 3字+ 名撤销 Round5 前缀守卫，改最长匹配优先：直接子串命中（任一侧边界），仅当命中位置紧后 CJK 且能从该处拼出 knownNames 中更长已知名时才被吞并（灭「李星云剑法」误命中「李星云」）；中文常规行文（李星云看见/碎玉轩内）恢复命中，recall/trigger 召回世界书不再断裂；recall.ts/trigger.ts 最小适配传入候选实体名集合",
        ],
      },
      {
        label: "游戏流式中断前后端自愈（阿游 P0-2）",
        items: [
          "新增 GET /api/game/state 返回后端权威 summary；page.tsx 在 abort/停止/断网后调用 reconcile 整体覆盖 currentRound/totalWords/items/plotProgress/entities/narrative/options，灭流式中断致前后端轮次/背包永久错位；game-engine 事务提交时机加注释固化",
        ],
      },
      {
        label: "填表空章节静默丢数据（墨白 P0-3）",
        items: [
          "safeFillAfterWriting 完成门槛由 babylore.ok 提升为 ok && applied>0；空 ops/全失效 ops 章节不再永久标已填，返回 ok:false 留待重试，灭防重复机制反噬的静默数据缺口；update 未命中且非身份列时告警跳过不静默建伪行；跨表校验新增唯一名写错表告警",
        ],
      },
      {
        label: "中文复合数字 + 背包 owner 隔离（阿游 P1）",
        items: [
          "parseGameQuantity 支持中文复合数字（十二=12/一百零五=105/二十五=25），灭数量失真；背包变动按 (name, owner) 二元组匹配，主角与 NPC 同名物品隔离、世界卡同步",
        ],
      },
      {
        label: "导入/正则工程加固（工坊/磐石 P1）",
        items: [
          "import/route.ts 整段包 $transaction，失败 rollback 不留孤儿项目/半吊子记录；按 projectId+source 幂等去重，重复导入不再成倍复制；regex.ts 新增 isLikelyUnsafeRegex 静态防护（嵌套量词/超大 {n}/超长 pattern），恶意正则拒跳过不挂死生成热路径；import/parse callFlash 加 60s 超时+≤2 重试；ImportWizard 消费 status/worldFailed 提示部分失败；commit/route 加 projectId 级幂等锁；分块改字符预算(16000/块+重叠)",
        ],
      },
      {
        label: "连词高亮 + Modal 无障碍（青砚/清览 P1）",
        items: [
          "entity-highlighter 头边界补介词（在/于/为/从/到/让/使/叫…）+ 省略号/间隔号，灭「在萧炎」不高亮；Modal 新增 labelledBy/ariaLabel，9 个调用点补语义名，灭 bare 弹窗 WCAG 4.1.2 缺口",
        ],
      },
    ],
  },
  {
    version: "v0.46.68",
    date: "2026-08-04",
    title: "会员股东 Round 5 实现：游戏物品变动归一化落库 + 角色名2字匹配回归 + 填表伪行/游戏回退错位 + 导入失败标记闭环 + 弹窗滚动/连词高亮（tsc 零错误）",
    sections: [
      {
        label: "游戏物品变动全部修复（阿游 P0）",
        items: [
          "game-prompts.ts 的 parseGameOutput 设唯一归一化点 OP_MAP：中文操作 获得/消耗/装备/丢弃 映射为英文枚举 gain/consume/equip/discard；引擎(game-engine)、前端(page)、开局(start/route) 的英文比较全部生效，修复 Round4 新增的 equip/discard 与既有 gain/consume、世界卡自动补建、开场入包全部落库失败——CI| 四种变动真实改变背包与世界书",
        ],
      },
      {
        label: "角色名 2字匹配回归修正（青砚 P0）",
        items: [
          "matchNameStrict 的 2字 CJK 关键词由 Round4 两侧闭边界改回任一侧边界/子串命中：中文无空格，叶凡/萧炎/林动等最常见2字角色名在 OOC 检测与 worldbook 召回中不再全漏检（修正 Round4 过度收紧的回归）；单字保留紧后非CJK 前缀守卫、3字+ 加前缀守卫灭尾随复合词误命中",
        ],
      },
      {
        label: "填表伪行 + 游戏回退错位（墨白/阿游 P1）",
        items: [
          "填表 applyOps 的 update/delete 缺有效 match 列时整体跳过并告警，灭静默插入带脏键 undefined 的伪行（防重复/零错名漏防）；跨表同名判定去掉 categories.size>=2 硬门槛，同类别(custom)多表互错填也报归属待确认；空章正文不触发 LLM 填表",
          "游戏回退后前端用 DELETE /api/game/state 返回的重算 summary 整体覆盖 totalWords/items/plotProgress/entities，灭回退后基于陈旧字数累加导致的字数虚高与背包残留（与后端 rollback 权威态一致）",
        ],
      },
      {
        label: "导入失败标记闭环（磐石 P1）",
        items: [
          "import/parse 新增 worldFailed 标志：非分块 A路角色提取失败与 B路世界/文风提取失败纳入计数，importStatus 在任何阶段失败即 partial/failed，灭小项目(非分块)与 B路世界提取失败仍谎报 completed 的数据丢失误导",
        ],
      },
      {
        label: "弹窗滚动 + 2字名连词边界（清览 P1）",
        items: [
          "bare 弹窗（BackupDialog/ImportDialog/MemoryDecayDialog/ExportDialog）补 max-h+overflow-y-auto 滚动约束，Modal 的 bare 分支默认固化 max-h-[90vh] overflow-y-auto；2字实体名头边界集补连词（与和跟同及等把被给向对由的）与全角引号「」『』，灭「萧炎与炎帝」仅高亮萧炎",
        ],
      },
      {
        label: "自动建卡/下拉/书卡/备份/预设/正则（青砚P2/清览P2/工坊P2）",
        items: [
          "自动建卡 isSimilarName 对 2字名做繁简归一化去重（萧炎/蕭炎 不再各建一张卡，白云/白衣 不误并）；暗色原生下拉 option 背景改不透明暗色（对比度恢复）；书卡网格窄栏降为 1 列 + 标题截断；备份导出 include 键名与导入对齐、预设 character 套用按名去重、正则编译失败结构化告警、.nfproject 还原补 maxDuration",
        ],
      },
    ],
  },
  {
    version: "v0.46.67",
    date: "2026-08-04",
    title: "会员股东 Round 4 实现：一键填表静默丢数据 + CJK2字尾随误命中 + 实体高亮最长名优先回归 + import分块失败标记 + 游戏状态断裂三修（tsc 零错误）",
    sections: [
      {
        label: "一键填表静默丢数据修复（墨白 P0-1）",
        items: [
          "fill.ts 的 applyOps 由「rowsCache/getRows 独立副本」模式改为直接累积改 tables 内 t.rows（同一引用贯穿多章循环）：上一章写回后 t.rows 即最新，下一章 applyOps 看到累积结果，灭「一键填表每章整体覆盖写回、静默丢失前序章」的数据黑洞",
        ],
      },
      {
        label: "CJK2字尾随误命中 + 单字名漏检（青砚 P0-1/P0-2/P1-1）",
        items: [
          "match.ts 新增 matchNameStrict：CJK 2字关键词要求闭边界（前后都非 CJK 字符）才命中，灭「李星云剑法」误命中「李星云」这类尾随伪词；单字关键词要求闭边界，灭 OOC 单字角色名（如「林」）漏检",
          "matchNameStrict 不动 matchKeyword 本体、不翻案既有 match.test.ts，仅在 trigger.ts/recall.ts 的唤起名与世界书/表格行匹配处接线替换，风险隔离",
        ],
      },
      {
        label: "实体高亮最长名优先回归（清览 P0-1）",
        items: [
          "findEntitiesInText 改为先收集所有候选（含重叠，regex.lastIndex=idx+1 不跳整段），再按名称长度降序、idx 升序贪心占用，灭「李星云剑法」误高亮「李星云」这类最长名被短名截断；最终按 start 升序输出，保留 O(L+命中) 复杂度",
        ],
      },
      {
        label: "import 分块失败如实标记（磐石 P0-1）",
        items: [
          "import/parse 分块分支新增 failedChunks/totalChunks 计数，每块 res.error 与 JSON 解析 catch 各加 failedChunks++；importStatus = 全成功 completed / 全失败 failed / 否则 partial，done 事件与 task 更新如实带上 status 与 failedChunks，灭「部分块失败却标记 completed」的误导",
        ],
      },
      {
        label: "游戏状态断裂三修（阿游 P0-2/P0-3）",
        items: [
          "game-engine 的 itemChanges 补 equip（existing.equipped=true）与 discard（减到 0 移除）分支，CI|装备|物品名|数量 与 CI|丢弃|物品名|数量 真实改变背包状态",
          "gameState.create + gameSession.update 包进 prisma.$transaction，灭两步写中间崩溃导致状态机断裂",
          "新增 DELETE /api/game/state?sessionId=&round=N：删 ≥round 的 gameState 并重算 currentRound/totalWords/plotProgress 回滚 session；前端回退按钮改为 async 调此接口后再内存裁剪，灭「回退只改 UI 不落库」的假回退",
          "GameItem 接口加 equipped?: boolean 字段；game-prompts 中文数字选项兼容（candidatePattern 放宽 [一二三四五六]），承接 Round 4 既有改动一并提交",
        ],
      },
    ],
  },
  {
    version: "v0.46.66",
    date: "2026-08-03",
    title: "会员股东 Round 3 实现：监控第6盲区 + 数字子串误伤 + 实体高亮 O(N·L) + 表格告警标红 + 游戏选项承接（tsc 零错误）",
    sections: [
      {
        label: "监控盲区彻底清零（磐石 P0）",
        items: [
          "import/parse 的 callFlash 每次 Flash 调用补 recordLlmCall（role:import_parse），成本看板第6处盲区清零，导入解析 token 不再漏记",
          "babyloreFillAll 失败章不再被永久标记跳过：filledSet.add 加 if(r.ok) 守卫，失败章留待重试，灭「一次失败永久跳过」的数据死区",
        ],
      },
      {
        label: "数字子串误伤 + OOC 暴力子串（青砚 R-F4 + OOC）",
        items: [
          "match.ts：纯数字关键词（如 2049）无论长度都走词边界判定，灭 2049 误命中 120499 这类数字子串误伤",
          "findCharacterByName 角色名/OOC 查找改 matchKeyword 词边界匹配，灭「阿游」暴力子串误命中「阿克游说」",
          "banned-words 拉丁/数字短词（长度≤2 且非纯中文）走词边界判定，保留中文词子串，灭 vx 误命中 avx",
        ],
      },
      {
        label: "实体高亮 O(N·L) → O(L+命中)（清览 P1）",
        items: [
          "findEntitiesInText 改为单遍正则扫描（一次遍历文本命中所有实体名），复杂度从 外层实体×内层 indexOf+占用切片 降为 文本长度 + 命中数，长正文高亮不再卡顿；保留最长名优先与边界判定",
        ],
      },
      {
        label: "表格填表告警 UI（墨白 F2/F3/F6）",
        items: [
          "单章自动填表卡补 warnings 渲染（此前只显示 operations/applied/error，漏掉疑似错误地名），与一键填表卡对齐",
          "selfCheckFill 加跨表同名归属校验：同一名称值出现在≥2个类别不同的表 → 标记「归属待确认」，灭自动填表把人名写进地点表等误归属",
          "LoreTableGrid 新增 flaggedRows prop，自检问题行（疑似错误地名/空值）红色高亮，作者一眼定位待修行",
        ],
      },
      {
        label: "游戏选项承接 + 解析健壮（阿游 P1-1）",
        items: [
          "selectedOption 显式进入 prompt（承接上一轮选项分支），并从上一轮 states 补全选项文本；playerAction 持久化带选项编号，历史记录可读",
          "parseGameOutput 选项解析重写：基于连续编号行块判定选项区（避免正文编号列表误当选项），编号放宽 1–6、超界丢弃不残留、同号只取首次",
        ],
      },
    ],
  },
  {
    version: "v0.46.65",
    date: "2026-08-03",
    title: "会员股东 Round 2 实现：监控盲区清零 + 边界修正 + 导入合并归一化 + 正则校验前置（tsc 零错误）",
    sections: [
      {
        label: "监控盲区清零（磐石 P0）",
        items: [
          "填表(babylore runFillForText)、大纲(generate/outline)、章纲(plan-chapter)、角色扩写(characters/expand)、导入合并(import/commit) 5 处裸 fetch 全部补 recordLlmCall，成本看板不再漏记这几路 LLM 调用",
          "usage 取自 OpenAI 兼容响应的 data.usage（prompt_tokens/completion_tokens/total_tokens，兼容 camelCase），失败/缺字段安全回退 0",
        ],
      },
      {
        label: "实体高亮边界修正（青砚 F1 收尾）",
        items: [
          "match.ts：英文/拼音 2 字关键词改为「两侧都须为词边界」才算命中（beforeBoundary && afterBoundary），灭 waitAI/xAI/AIx 紧贴拉丁字母的伪词误触发；中文关键词保持任一侧边界即命中",
        ],
      },
      {
        label: "导入 AI 合并关系归一化（工坊 P1）",
        items: [
          "import/commit 的 AI 合并成功写入分支（characterCard.update）也走 normalizeRelationships，旧格式 {target,type} 自动转 {targetName,relation}，灭合并后角色关系静默失效",
        ],
      },
      {
        label: "正则后处理校验前置（工坊 P1）",
        items: [
          "ProjectConfigPanel 保存规则前校验全部正则（含手改已有规则）合法性，非法正则阻止保存并提示，灭生成后处理时因非法正则崩溃",
        ],
      },
    ],
  },
  {
    version: "v0.46.64",
    date: "2026-08-03",
    title: "会员股东 Round 1 收口：填表/召回/高亮精度 + 导入健壮性（10 项逻辑修复，tsc 零错误）",
    sections: [
      {
        label: "写章自动填表 ↔ 一键 fill-all 防重复打通（墨白 F1）",
        items: [
          "safeFillAfterWriting 成功填表后写入 .runtime/babylore-filled.json 防重复标记（此前写章填表全程不标记，导致一键 fill-all 会把已填章节再填一遍）",
          "fill.ts 导出 markChapterFilled 供写章与 fill-all 共享同一防重复标记；write 路由补传 nodeId",
        ],
      },
      {
        label: "实体高亮修复（清览 P1 + 青砚）",
        items: [
          "2 字实体名尾边界放宽：仅查头边界（防止把别的词中间片段误当实体），灭「2 字实体名几乎不高亮」；3 字及以上本来就不查边界",
          "match.ts 新增 isBoundaryChar：英文 2 字关键词（如 AI）仅在空白/标点/中文相邻处算边界，灭英文短词边界退化误触发",
        ],
      },
      {
        label: "填表 / 召回精度（墨白 F5 + 墨白/磐石 recall + 阿游 P2）",
        items: [
          "applyOps 的 update/delete 匹配改大小写不敏感（与 insert 去重一致），灭「青龙镇/青龙鎮」字形/大小写漏匹配",
          "recall 命中按关键词特异性 score 降序再截断（table 优先于 lorebook），灭 200+ 词条时按数组序截断丢关键长词；清除 RecallItem.score 死代码",
          "ensureItemLorebook 移除字面量「物品」键（只留 itemName），灭游戏物品词条把「物品」二字当召回关键词导致的噪音",
        ],
      },
      {
        label: "导入健壮性（工坊 P1）",
        items: [
          "同批重复角色/词条去重：导入循环内加 seenCharNames/seenLoreTitles，同批内重复名跳过，灭 createMany 写入重复行",
          "角色关系字段归一化：新增 normalizeRelationships，把旧格式 {target, type} 自动转 {targetName, relation}，灭 sync-global-prompt 编译出 ?(?)；ruleMergeChar 合并也走归一化",
        ],
      },
      {
        label: "一键填表容错（磐石 P0 部分缓解）",
        items: [
          "babyloreFillAll 循环内每填完一章即增量 saveFilled，灭中途超时/崩溃丢失全部进度（串行→分批并行架构优化留待 Round 2）",
        ],
      },
    ],
  },
  {
    version: "v0.46.63",
    date: "2026-08-03",
    title: "全面修复：填表灭错名 + 三卡检索词边界匹配 + 自动建卡相似度去重 + 一键填表自检 + 游戏物品归属联动",
    sections: [
      {
        label: "填表引擎灭错名（Bug F）",
        items: [
          "全量权威名录：tablesText 不再只给最近8行，改为给每个表附【权威名录·已有名称】（去重全量）+ 全量样例行（前60行截断保护），LLM 看不到全量才造地名变体的根因消除",
          "强化提示词铁律：名称零杜撰（逐字复制正文原文用字、禁止繁简混用/同义变体）、复用已有（名录内名称必须 update 不可再 insert）、完整性、填后自检（名称必须在正文有原文否则不填）",
          "代码级去重：applyOps 的 insert 增加同主键名查重，已存在则自动转 update，杜绝同名重复行",
          "返回疑似错误地名警告：每个被填名称若不在正文中找到原文，返回 warnings 提示，供人工复核",
        ],
      },
      {
        label: "三卡检索词边界匹配（Recall/F 检索瞎匹配）",
        items: [
          "新增 src/core/text/match.ts：matchKeyword 长度≥3 直接命中、长度2 需处于词边界、长度1 直接拒绝（灭「林」命中「森林」）；dedupSubstring 最长匹配优先（短词被更长已命中词包含则剔除）；scoreKeyword 按长度打分",
          "trigger.ts/recall.ts 全面接入：世界书绿灯关键词与表格行关键列不再暴力 includes，改用词边界匹配 + 最长匹配优先 + 长度加权排序，瞎匹配与错内容注入归零",
        ],
      },
      {
        label: "自动建卡相似度去重（entity-auto-creator）",
        items: [
          "精确查重之外加相似度去重：编辑距离 ≤1 且长度差 ≤2，灭掉「青龙镇/青龍镇」「李尘/李麈」这类繁简/错别字变体重复入库世界书与角色卡",
        ],
      },
      {
        label: "一键填表 + 自检 + 游戏物品归属联动",
        items: [
          "一键填表：新增 babyloreFillAll（按 order 遍历所有有正文章节，首章→最新；已填章节用 .runtime 标记跳过防重复；填完自动跑 selfCheck 地名正确性 + 信息完整性）；新增 /api/babylore/fill-all 路由 + 表格页「一键填表（首章→最新）」按钮 + 自检报告展示",
          "游戏物品归属：GameItem 加 owner 字段（默认主角），CI| 标记支持归属者，背包 UI 显示「归属：XX」；游戏获得新物品若无对应 item 类世界书词条则自动补建，世界卡物品类保留、无则补充",
        ],
      },
    ],
  },
  {
    version: "v0.46.62",
    date: "2026-08-03",
    title: "UI 质检 P0：墨灵面板去重 + 项目设定可滚动 + 原生下拉暗色适配 + 正则规则弹窗统一",
    sections: [
      {
        label: "墨灵面板去重（Bug A）",
        items: [
          "删除 ChatMessageList 空状态块里与 AIChatHeader 完全重复的「AI 写作助手就绪 / 我能直接查角色卡、世界书、大纲…」文案，空状态由头部统一展示，避免就绪提示出现两次",
          "同步移出已无引用的 hasHistory/loading 解构参数，保持 tsc 零警告",
        ],
      },
      {
        label: "项目设定弹窗可滚动（Bug H）",
        items: [
          "BuildConfigDialog 的 bare Modal 补 overflow-y-auto（之前 bare 分支不带滚动，长内容超出 90vh 被截断且不可滚动），现在流派标签/开关等超长内容可正常滚动查看",
        ],
      },
      {
        label: "原生下拉暗色适配（I-1）",
        items: [
          "globals.css 新增 select option / select optgroup 的 --nv-surface-2 背景 + --nv-text-primary 文字色，原生 <select> 下拉列表在暗色主题下不再呈现高亮刺眼白底",
        ],
      },
      {
        label: "正则规则 UI 统一（I-2）",
        items: [
          "项目配置中心正则分区加区分说明：正则后处理（生成完成后对正文做替换/清洗）vs 创作铁律（注入 AI 提示词约束写作），二者互不影响、各管一段",
          "「+ 新增规则」由内联追加行改为与「规则」面板一致的模态弹窗（同级渲染避免嵌套 transform 影响 fixed 定位），并在提交前用 new RegExp 校验正则合法性，非法 pattern 给出明确报错",
          "实测确认正则规则确实生效：applyRegexRules 已接入 write/refine/continue 三路由并发送 postprocess_regex SSE 事件，属后处理而非上下文注入",
        ],
      },
    ],
  },
  {
    version: "v0.46.61",
    date: "2026-08-03",
    title: "纸舟星海重做：圆角真实船体 + 意境分层命名 + 舷窗图案旗帜 + 随机配色 + 绕圈巡游避让",
    sections: [
      {
        label: "圆角真实船体（重做 makeHull）",
        items: [
          "makeHull 改为放样几何：截面为闭合环（龙骨尖底→右舷弧→甲板→左舷弧），沿船长 25 站放样、首尾收尖（sin 收分），得到圆润船体；computeVertexNormals 平滑着色，绝非长方体",
          "核潜艇保留圆柱艇身+围壳+潜望镜+螺旋桨的圆角建模（用户点赞参照）；航母保留宽甲板巨舰造型、驱逐舰改用圆角船体",
        ],
      },
      {
        label: "意境命名 + 层级归类 + 弱化真实名",
        items: [
          "TYPE_POETIC 意境名：暗夜金帆=黑珍珠号、赤骨怒潮=复仇女王号、幽海磷光=飞翔的荷兰人、云港巨舰=航空母舰、银锋迅影=驱逐舰、深蓝潜蛟=核潜艇、无名漂流=未名舰队",
          "TYPE_TIER 一层平波（核潜艇/驱逐舰）/两层扬帆（三艘帆船+未名舰队）/三层连云（航母）；首页文案改写去真实名强调，书栏主显意境名、真实名仅 tooltip 小字",
          "GENRE_TO_TYPE 未命中题材回退未名舰队 drift（新增第 7 种船型：小巧折纸漂流艇，略弯带图案）",
        ],
      },
      {
        label: "舷窗 + 定制图案旗帜 + 武器放大",
        items: [
          "每艘船两侧加环形发光舷窗（addPortholes），按船型不同色（幽绿/暖白/冷蓝）",
          "按船型挂定制图案旗帜（getFlagTex 客户端惰性 CanvasTexture：骷髅/幽灵漩涡/星徽/雷达棱纹/波浪鳍/问号），SSR 安全",
          "航母舰载机放大 1.3 倍并增至 4 架、驱逐舰舰炮/导弹架放大 1.1–1.25 倍；大船加宽舷台、抬高甲板纵深",
        ],
      },
      {
        label: "放大 + 随机配色 + 绕圈巡游避让",
        items: [
          "整体缩放上调至 0.95–1.9、相机默认半径 15（范围 8–30）、雾远界拉远；TYPE_DRAFT 吃水系数抬升船体，使吃水线落在船高下 1/3 不再半沉",
          "每型随机亮色（TYPE_HUE 色相族 + 船间抖动）保证类型区分与相邻不撞色；hullMatFor 每船克隆材质、卸载时按 perBoat 标记释放",
          "船只椭圆轨道独立巡游（orbitR 3.4–7、角速度各异有界不远漂），separate 做 boids 分离避让、船头朝运动切向、避免穿模",
        ],
      },
    ],
  },
  {
    version: "v0.46.60",
    date: "2026-08-03",
    title: "彻底清除 Flash 品牌露出：写作区「Flash 章纲」→「轻量章纲」+ 补全遗漏的占位符/注释文案",
    sections: [
      {
        label: "写作区轻量预览按钮去 Flash 化（v0.46.59 遗漏项）",
        items: [
          "CenterPanel 写作区「Flash 章纲」按钮改名「轻量章纲」：提示词输入框 placeholder（Flash 轻量预览提示词 → 轻量预览提示词）、按钮 title（移除 V4 Flash 字样）、按钮文字（Flash 章纲 → 轻量章纲）三处同步清理",
          "功能完全不变：仍走 onGenerateChapterOutline → /api/generate/chapter-outline，模型由 completeText 取数据库默认设置，不绑定 Flash",
        ],
      },
      {
        label: "注释与占位符文案同步清理",
        items: [
          "路由注释：chapter-outline/draw、agent/analyze-chapter、import/commit 三处历史「v4-flash 常返回…」健壮性注释改为中性「模型偶发返回…」表述（不影响逻辑）",
          "import/commit 文件头与合并引擎注释的「V4 Flash」→「AI 模型/模型」；ProjectConfigPanel 模型名占位符示例 deepseek-v4-flash → deepseek-chat",
        ],
      },
      {
        label: "复核与保留项说明",
        items: [
          "全量 grep 复核：src/app/api/generate、agent、import、components、workspace 下已无任何用户可见 Flash 字样",
          "刻意保留：settings/page.tsx 与 lib/llm.ts 中的真实模型默认值（如 deepseek-ai/DeepSeek-V4-Flash，用户需选型）、自动生成 Prisma 客户端、历史 CHANGELOG 记录——这些不是误导标签，移除会破坏功能或丢失记录",
        ],
      },
    ],
  },
  {
    version: "v0.46.59",
    date: "2026-08-03",
    title: "交互打磨：移除 Flash 模型名 / 游戏章纲剧情感知 / 目标字数默认3000 / 快速文本框跳转即丢 / 游戏入口常显 / AI助手面板活现化",
    sections: [
      {
        label: "移除 Flash 模型名（用户：快速章纲不提 Flash，用默认模型）",
        items: [
          "chapter-outline 与 draw 路由删除 modelUsed:\"v4-flash\" 误导标签（实际模型由 completeText 走数据库默认设置 architectModel，从未硬编码 Flash）",
          "多章大纲 generate/outline 删除死逻辑：shouldUseFlash 变量、返回值 modelUsed，以及 OutlineDialog 的「用 V4 Flash」复选框、模型标签显示、文案中的 V4 Pro/Flash 字样",
        ],
      },
      {
        label: "游戏模式章纲联动 + 入口常显（用户：两个按钮联动 / 游戏模式没效果）",
        items: [
          "/api/game/outline/generate 注入 formatStorylines 活跃剧情线（status in active/main），与抽卡/快速章纲一致——游戏章纲也呼应主线不盲写",
          "OutlineTree 游戏按钮改为常显（移除 opacity-0 group-hover:opacity-100 隐藏）+ 清晰 tooltip「进入游戏模式——像文字 RPG 一样创作本章」；后端 /api/game/start 实测可用（返回开场叙事+选项）",
        ],
      },
      {
        label: "目标字数默认 3000 + 快速文本框跳转即丢（用户：统一调整默认3000 / 跳转不保存）",
        items: [
          "写作区 targetWordCount 默认 800→3000，write 路由兜底参数同步 800→3000；number 输入保持可调",
          "作者指令 / 章纲提示词 / 微调指令三框移除 localStorage 写入 + 服务端 PATCH + 加载恢复逻辑，改为会话内临时态，导航离开即丢、不持久化",
        ],
      },
      {
        label: "AI 助手面板活现化重设计（用户：UI更活现 / 图标更突出）",
        items: [
          "AIChatHeader 改为渐变发光头像 + 「墨灵 AI 写作助手就绪」+ 能力说明行 + 实时项目统计条（总字数/角色/词条/节点，从 useProjectStore 计算）",
          "试试 chips 加图标（users/target/plus/book/search）+ 渐变悬停；发送按钮改渐变发光 + hover 放大 + 禁用态灰显；快捷预设芯片补背景与悬停放大",
        ],
      },
      {
        label: "章首高亮确认（用户：章首不显示收集数据，只正文默默显示）",
        items: [
          "rehype-entity-highlight SKIP_TAGS 已含 h1-h6 与 blockquote，章节标题（章头）不高亮，仅正文段落高亮",
          "实体收集只显示在右侧 ChapterEntitiesPanel + 正文下方 EntityLegend，不在每章开头展示——确认已满足，本次无需改动",
        ],
      },
    ],
  },
  {
    version: "v0.46.58",
    date: "2026-08-03",
    title: "全面质检升级：名字高亮优化 / Agent「墨灵」/ 备份选择 / 导入合并 / 正则预设 / 记忆衰减说明 / 游戏模式教程与融合",
    sections: [
      {
        label: "名字高亮优化（用户：章头不显示、只正文高亮；提高准确率；世界卡/角色卡该高亮）",
        items: [
          "rehype-entity-highlight：SKIP_TAGS 增加 h1-h6 与 blockquote——标题（章头）不再高亮，只正文段落高亮",
          "entity-highlighter：新增 COMMON_STOP_WORDS 停用表（单字代词/助词 + 什么/现在/这个等极泛化双字词）——这些词即使被注册成实体名也绝不参与匹配；完整词条名（如「世界卡」「角色卡」）不受影响正常高亮",
          "保留既有准确率机制：最长名优先 + 已占区间不重复 + 2字名强词边界",
        ],
      },
      {
        label: "Agent「墨灵」美化与能力（用户：起名高亮/教学/区分度/模式开关/与全部功能交互）",
        items: [
          "命名「墨灵」：AIChatHeader 与消息列表均显示渐变高亮身份（bg-clip-text），头部加「墨灵能做什么」教学折叠（角色/世界书/大纲/伏笔/关系网/分析六类能力 + 示例话术）",
          "模式开关：设置页「7. Agent 助手 · 墨灵」开关（localStorage nf-agent-mode）——默认可操作；切只读后 AIChatBar 传 mode=readonly，generate/chat 后端拦截全部写工具（character_*/lore_*/outline_*/foreshadowing_*/chapter_generate/relation_sync）返回提示，前端头部显示「可操作/只读」徽标",
          "能力与现有功能联通：chat 工具注册表已覆盖角色/词条/大纲/伏笔/章节/实体/剧情线/规则/风格/分析/关系同步（11 类 28 个工具），可操作模式下能填写/修改/生成",
        ],
      },
      {
        label: "备份导出选择 + 导入备份包（用户：选择保留哪些设定再导出；补导入功能）",
        items: [
          "backup API 支持 ?include= 逗号分隔过滤（characters/lorebook/chapters/branches/storylines/style/tables/rules）；workspace 备份按钮改为 BackupDialog 弹窗勾选（默认全选）",
          "import API 支持 body.include 只导入选中部分；首页导入备份改为 ImportDialog 弹窗勾选后导入为新项目",
          "修复隐藏 bug：Content-Disposition filename 含中文导致 ByteString 500（header 只能 Latin-1）——改 RFC 5987 filename*=UTF-8'' 编码；实测 include 过滤正确（16角色/4章节/词条0）",
        ],
      },
      {
        label: "导入书稿/设定合并 + 摘要确认",
        items: [
          "写作页「导入设定」「导入书稿」统一进 ImportWizard（新增 initialMode prop：settings=仅抽三卡不建章节 / chapters=整本分章+抽卡），移除独立 SettingsImporter 入口——三卡全程可交互编辑",
          "摘要按钮：执行前 confirm 明确【范围】仅本章正文、【产出】章节摘要+关键事件+角色状态+事件重要度（S/A/B/C 供记忆衰减）",
        ],
      },
      {
        label: "正则预设选择 + 记忆衰减说明",
        items: [
          "ProjectConfigPanel 新增「从预设添加」：拉取创意工坊 regex 预设列表，点击一键加入全部规则（无需手写名字/pattern），保留手动新增",
          "设置页新增「6. 记忆衰减」说明卡：S永久/A30章/B15章/C5章 + 执行方式（Vercel 定时任务自动 / 本地手动，写作页底部按钮预览执行），衰减不改正文与伏笔",
        ],
      },
      {
        label: "游戏模式（用户：教程指引 + 与现有配置融合，包含本章原字数）",
        items: [
          "game/start 与 loadGameContext 注入本章已有正文（existingContent），buildGameSystemPrompt 增加「本章已有正文（N字——游戏从这段内容之后续接，不得重复或推翻）」——跑团从已写内容继续，字数累加",
          "游戏页首次进入教程弹窗（localStorage 记忆）：说明跑团式互动玩法、三步上手、与工作区设定实时联动、结束回合可写入正文",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + 路由矩阵（home/settings/workspace）+ 备份 include 实测通过",
          "高亮停用表为保守清单（若你的词条名恰好是停用词，可在回复中告知我再加白名单例外）；Agent 只读模式在设置页切换后需刷新聊天面板生效；游戏教程/备份弹窗/墨灵身份的视觉需浏览器实跑验收",
        ],
      },
    ],
  },
  {
    version: "v0.46.57",
    date: "2026-08-03",
    title: "质检化处理：章纲人话化 + 章纲剧情感知 + 编辑保护（P0/P1/P2 全实施）",
    sections: [
      {
        label: "质检背景（用户：用户视角判断方便/麻烦；章纲 vs 剧情预设关系；一键生成章纲意义；先出计划再实施）",
        items: [
          "先出计划（PROCESS/QUALITY_PLAN.md）→ 用户确认「继续」→ 按 P0→P1→P2 实施",
          "现状实证：保存边界已正确（角色/词条/预设/作者指令=显式保存；正文=mod+s+流式落库；globalPrompt 仅显式保存后 sync 编译）；正文干净（格式铁律防章节标题入正文）；「关键词写在开头」实指抽卡卡片等宽字体+彩色代码标签",
          "关键架构结论：剧情预设（plan-chapter）= 推进引擎（write 前自动跑，管剧情往哪走）；章纲 = 内容蓝图（管本章写哪些场景事件）——原本两套机制脱节（章纲不读剧情线=盲写），本轮打通",
        ],
      },
      {
        label: "P0-1 章纲人话化",
        items: [
          "draw/route.ts 的 system prompt 改为自然语言六小节（【场景】【事件】【人物】【悬念/钩子】【伏笔】【情绪】），严禁 C| R| K| 等前缀；chapter-outline（非 draw）本就是自然语言格式未动",
          "DrawCards.tsx：删除 P0_LINE_COLORS 14 色代码高亮 + 等宽字体，改 OutlinePreview 按小节分区渲染（小节标题 + 缩进条目）；兼容旧格式（无小节标题时剥离 C| R| 前缀当普通段落）",
        ],
      },
      {
        label: "P0-2 章纲剧情感知（打通章纲与剧情预设）",
        items: [
          "outline-context.ts：loadOutlineData 并行查活跃 storylines；新增 formatStorylines（title+description+非空七要素）与 extractLastChapterHook（优先取上章 outline 的【悬念/钩子】小节，找不到回退正文结尾 300 字）",
          "chapter-outline/draw 两路由 prompt 注入【活跃剧情线——本章必须顺着这些线推进】+【上一章结尾钩子——本章开头必须承接】",
          "回归实测（第四章抽卡）：自动生成「周远征循潮痕追查找到陈牧、龙渊与叶凌云天台棋局续接、高千惠与欧阳佩对接」——完美承接上章钩子并沿剧情线推进；旧格式上章（无【悬念/钩子】）走正文结尾回退，容错生效",
        ],
      },
      {
        label: "P1 编辑保护 + 保存铁律",
        items: [
          "OutlineDialog：预览章纲手动编辑（touched 跟踪）后未「确认写入」就关窗 → window.confirm 提示防丢失（章纲编辑只进预览 state，不确认即丢）",
          "保存边界铁律固化进 QUALITY_PLAN.md：①正文/草稿允许自动保存；②定义/要求类（角色卡/词条/预设/作者指令/章纲）一律显式保存；③globalPrompt 只在显式保存后 sync 重编译；④关窗即丢的编辑场景必须给未保存提示",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + 回归实测（人话章纲 + 剧情感知 + 旧格式兼容）",
          "DeepSeek 并发限流仍会偶发空卡（前端「生成失败」标签可重抽）——外部限制；DrawCards 人话视觉需浏览器实跑验收",
        ],
      },
    ],
  },
  {
    version: "v0.46.56",
    date: "2026-08-03",
    title: "修复全局快捷键系统无限更新循环（Maximum update depth exceeded）",
    sections: [
      {
        label: "报错定位（用户反馈：弹出报错，Console Error — Maximum update depth exceeded，ShortcutProvider.tsx:89 setVersion）",
        items: [
          "症状：打开使用全局快捷键的页面（workspace 写作页 4 个快捷键同时注册）时，React 报 Maximum update depth exceeded",
          "根因（典型 React 反模式）：register 每次注册/注销都 setVersion(v+1) → context value 的 useMemo 依赖 version → version 变则 ctx 对象引用变 → useShortcut 的 effect 依赖 [ctx, ...] 重跑 → cleanup（unregister）再 setVersion → 再循环——注册→版本号→ctx 变化→注销→版本号→ctx 变化，无限往复",
          "version 本身冗余：registryRef 是 ref（不触发渲染），keydown 监听与 list() 每次调用都实时读 ref，无需 state 参与——引入 version 的唯一效果就是制造循环",
        ],
      },
      {
        label: "修复",
        items: [
          "register 不再 setVersion：注册/注销只操作 registryRef（set/delete），零渲染",
          "value 的 useMemo 依赖移除 version（保留 register/openHelp/closeHelp/helpOpen）——ctx 引用只在 helpOpen 开/关时变化",
          "调用方依赖审计：workspace 4 处 useShortcut 的 id/combo/description 均为字符串常量、handler 走 handlerRef、opts 只取 allowInEditable 标量——无其他不稳定依赖，循环彻底消除",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200；快捷键速查弹层（helpOpen + list() 实时读注册表）功能不变",
          "修复后快捷键注册/注销零渲染，性能优于原实现；需浏览器实跑确认无报错",
        ],
      },
    ],
  },
  {
    version: "v0.46.55",
    date: "2026-08-03",
    title: "终极实验修复轮：抽卡/上下文预览/Agent 分析 JSON 解析鲁棒性 + 写作空正文容错",
    sections: [
      {
        label: "终极实验背景（用户指令：用 flash v4 全链路测试「新城 · 龙陨之地」从构建到写作几章，边写边修）",
        items: [
          "实测覆盖：设定导入（项目+16角色卡+12世界观词条+文风模板）→ 主线 → 章纲生成/抽卡 → 正文写作 3 章（2120/1140/1933 字）→ 后处理管线（babylore 召回/剧情预设/禁用词扫描/质量评分/审校/摘要/分类/逻辑检查/自动填表）→ 创意工坊预设应用 → Agent 工具调用 → 上下文检查（preview-context 分层 Token/激活角色/触发词条/模板注入验证）",
          "监控确认：stats/monitor 3 章 5193 字、36 次 LLM 调用 298k tokens（deepseek-v4-flash）、今日字数统计正常",
        ],
      },
      {
        label: "修复 1：章纲抽卡 JSON 解析鲁棒性（draw/route.ts）",
        items: [
          "症状：v4-flash 返回 markdown 包裹/尾逗号/截断 JSON 时，3/3 卡片 JSON 解析失败（空白卡），用户无法抽卡",
          "修复：多级容错（剥代码块 → 提取最外层 {} → 直接 parse → 去尾逗号/控制字符再 parse → 正则提取各字段兜底），修复后 3 张 2 张完整（「三份记录」1888 字、「潮痕」2638 字）",
          "剩余空卡为 DeepSeek 并发限流（Promise.allSettled 容错 + 前端「生成失败」标签），非代码问题",
        ],
      },
      {
        label: "修复 2：上下文预览不读作者指令（preview-context/route.ts）",
        items: [
          "症状：数据库 project.authorNote 明明有 121 字作者指令，preview-context 的 authorNote 区域却显示「无」（只读请求体显式参数）——用户在上下文预览面板看不到作者指令的注入情况",
          "修复：请求体未显式传 authorNote 时回退到 project.authorNote；验证通过（tokens=116、内容正确显示「写作要求：①冷峻克制的文风…」）",
        ],
      },
      {
        label: "修复 3：Agent 章节分析 JSON 解析失败（agent/analyze-chapter/route.ts）",
        items: [
          "症状：analyze-chapter 返回「分析结果解析失败，请重试」、differences 恒为空",
          "修复：同款多级鲁棒 JSON 解析（剥块 → 提取 {} → 多级 parse）",
        ],
      },
      {
        label: "修复 4：写作偶发空正文静默成功（generate/write/route.ts）",
        items: [
          "症状：LLM 偶发空响应时（第 2 章 93s 返回空），write 仍走后处理管线并发送 done——前端显示成功但正文为空，且空正文还会生成垃圾摘要污染记忆",
          "修复：fullContent 为空时发送明确 error 事件（「生成内容为空（模型未返回正文），请重试或检查 LLM 配置」），不再静默 done；实测第 3 章空响应立即收到 error 提示，重试即成功（1933 字）",
        ],
      },
      {
        label: "数据修正（导入脚本字段错误）",
        items: [
          "16 位角色 relationships 字段格式：target/type → targetName/relation（sync-global-prompt 编译关系显示 ?(?) 的根因）；樊斯瑞错误别名「高千惠」清除（导入脚本 alias 参数传错）",
          "验证：globalPrompt 重新编译后关系正确显示（樊斯瑞→高千惠(守护/执念)、叶凌云→沈凌波(夫妻/搭档)+龙卫(统帅)、KID→顾望舒(保护/越界)+迭戈(雇佣/欠命)）",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200；DeepSeek 并发限流与偶发空响应为外部模型端限制（重试即成功，容错已就位）",
          "第 2 章正文只覆盖前两条线（法医室+菜市场），因 mystery 模板 1000 字/节上限——多视角章纲的字数配比可在后续版本按需调整",
        ],
      },
    ],
  },
  {
    version: "v0.46.54",
    date: "2026-08-03",
    title: "修复「我的作品」书卡不可见（入场动画依赖 observer 时序导致永久透明）",
    sections: [
      {
        label: "根因定位（用户反馈：下面应该写着所有书，但完全看不到任何一本，有的却可交互）",
        items: [
          "症状吻合：书卡在 DOM 里（hover 虚空特效/交互仍在）但卡片本身透明——.home-stagger-item 初始 opacity:0，只有加上 .is-visible 才播放 nf-card-in 显示",
          "根因：useStaggerOnView 依赖 IntersectionObserver（threshold 0.1）触发 is-visible——观察器挂载时机、10% 可见阈值、滚动事件被 3D canvas 拦截等任一环节失败，卡片即永久 opacity:0 不可见",
          "历史回响：changelog 曾记录 v0.46.4x 修过同类 bug（空依赖导致观察器未挂载）；本次为 observer 时序链路的再次失效，说明该机制在真实浏览器环境不可靠",
        ],
      },
      {
        label: "修复（速度修复，确定性优先）",
        items: [
          "useStaggerOnView 重写：ready（!loading && projects.length>0）后直接对全部 data-stagger-item 加 is-visible（保留 60ms 交错 delay，reduced-motion 无 delay）——零异步依赖，100% 显示",
          "CSS 兜底：.home-stagger-item.is-visible 显式加 opacity:1（animation both 之外），即使动画不播放也强制可见",
          "排查确认无其他隐藏源：全局 opacity/visibility 扫描仅 tooltip(731)/微光等无关项；NewBookCard/ProjectCard/骨架屏结构正常",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + 编译无警告；动画在页面加载后即播完，滚动到作品区时书必完整可见（失去「滚动到才浮现」的叙事，换取确定性）",
          "浏览器实跑验收：本地 http://127.0.0.1:3001 刷新后「我的作品」应直接看到 9 本书 + 新建卡",
        ],
      },
    ],
  },
  {
    version: "v0.46.53",
    date: "2026-08-03",
    title: "船亮色涂装 + 光照提亮 + 主题按钮修复 + WebGL 降级兜底（诊断修复轮）",
    sections: [
      {
        label: "船太黑修复（用户指令：船太黑看不清，设计不同的颜色）",
        items: [
          "六种名船高辨识亮色涂装：黑珍珠号亮金船体（HULL_GOLD_MAT 0xc9a24e）、复仇女王号猩红船体（HULL_RED_MAT 0xa8433a）、飞翔的荷兰人幽绿青船体（GHOST_MAT 0x3f9f8c）+ 亮白绿破帆、航空母舰浅灰蓝甲板（DECK_MAT 0x9aabbf）、驱逐舰浅蓝灰舰体（HULL_GREY_MAT 0x6e88a8）、核潜艇亮银（METAL_MAT 0x9fb0c0）；黑帆独立材质 SAIL_BLACK_MAT 微反光不糊黑，金饰提亮 0xe6b54e",
          "光照体系提亮：AmbientLight 0x2a3860×0.9 → 0x9fb4e8×1.4（所有船体不再只亮点灯 8 艘）、新增 HemisphereLight 1.15（天顶暖+海底冷自然光）、DirectionalLight 月光 0.5→0.85",
          "背景与雾色：canvas clear color 0x05070f 近黑 → 0x0a2a55 深海蓝、scene.fog 同步（远景不糊黑，与漫画海衔接）",
        ],
      },
      {
        label: "主题切换按钮修复（用户指令：修改 ui 风格的按钮无法交互）",
        items: [
          "根因：顶栏 sticky z-10 与页面内容层 z-10 同级，DOM 靠后的内容绘制在上层——滚动后 header 被内容覆盖，点击落在内容层上按钮失灵 → header z-index 10→40",
          "次要按钮窄屏收敛：「示例」「导入备份」改 hidden md:inline-flex，主题切换/设置/⌘K 等核心按钮常驻可点；顺带修 className 冲突（hidden 与 inline-flex 不共存）",
        ],
      },
      {
        label: "我的作品无显示（诊断：本地正常，线上站无数据库）",
        items: [
          "实证：本地 /api/projects 返回 200 + 9 部作品（含「仙侠 · 开局骨架」「探讨中的小说」），useQuery 渲染逻辑正常，SSR 200；Vercel 线上站 /api/projects 返回 HTTP 500（无数据库）→ 线上作品区永远空白",
          "新增 WebGL 降级兜底：3D 渲染器创建失败（浏览器禁 WebGL/驱动问题）时静默跳过，不再因 useEffect 抛错拖垮整棵组件树——「我的作品」区在任何情况下都能显示",
          "整页提亮：.nf-home::before 暗角 0.48→0.22、网格 opacity 0.5→0.3，页面不再发闷",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 标记验证通过；诊断六维度全绿（Prisma 3 migrations、API 全 try/catch、无死代码）",
          "亮色涂装观感/对比度需浏览器实跑验收（本地已最新）；线上展示站无法从代码侧修复（需用户在 Vercel 面板配数据库或只以本地为准）",
        ],
      },
    ],
  },
  {
    version: "v0.46.52",
    date: "2026-08-03",
    title: "主页调亮对比加强 + 顶栏悬浮下移 + 现代名船（黑珍珠/复仇女王/荷兰人/航母/驱逐舰/潜艇）",
    sections: [
      {
        label: "主页调色与布局（用户指令：亮一点、对比强、顶栏下移、看不到作品）",
        items: [
          "整体提亮：--nv-void #050508→#0E1424、--nv-abyss→#161E34、surface/border 白透明度升、文字四级全提亮（主文字近白 #F8F7F2 对比 17:1）；shadcn 令牌与 body 三层径向渐变同步提亮；主色 oklch 0.62→0.66 保对比",
          "顶部 UI 栏：sticky top-0 贴死 → sticky top-2 + mx-2 圆角浮起 + bg-[var(--nv-abyss)]/90 backdrop-blur + 阴影，顶栏「下来」了，系统提示文字不再被顶没",
          "作品区修复：书封/书架背景亮化（spine 比例升到 68%、底色 #1a2340）、.nf-book3d 补纯色 background fallback（不支持 color-mix(in oklch) 的浏览器不再「一团黑」）；书名保留放大样式",
          "根因说明：本地 /api/projects 返回 9 个项目（含「探讨中的小说」）正常；若用户看不到作品，多为访问 Vercel 线上站（无数据库，/api/projects 失败→作品区空/黑）——以本地 dev 为准",
        ],
      },
      {
        label: "现代名船（用户指令：搜加勒比海盗黑珍珠/复仇女王 + 航母舰队，做现代船）",
        items: [
          "上网核实黑珍珠号（Black Pearl）：大型三桅 Galleon、黑色船体+黑帆、32 门炮、加勒比最快船——据此建黑珍珠号（黑色三桅+黑帆+金饰炮门+金艉楼）",
          "六种现代船：黑珍珠号（武侠/言情/田园）、复仇女王号·黑胡子旗舰（仙侠/玄幻/历史，黑帆金饰+骷髅）、飞翔的荷兰人·幽灵船（冒险/西幻，青灰船体+破帆+幽绿舷灯+独角鲸牙）、航空母舰（科幻/军事，宽平甲板+右舷舰岛+斜角甲板+弹射线+甲板 3 架舰载机「子舰=作品」）、驱逐舰（推理/都市，舰桥+主炮+导弹架+雷达天线）、核潜艇（悬疑/灵异/谍战，艇身+围壳+潜望镜+螺旋桨+侧舷绿灯）",
          "材质体系重建：BLACK/GOLD/GHOST/GHOST_SAIL/GHOST_GLOW/DECK/HULL_GREY/METAL/DARK 纯色 + 桅杆木纹；删古代船部件（makeCanopy/makeTower/makeDragonHead）与渔网/竹篷/帆布材质；交互（悬浮书名/点击确认/旋转缩放/掉落/真灯≤8）全保留",
        ],
      },
      {
        label: "文案精简（用户指令：不要很多理念介绍）",
        items: [
          "删除「纸舟星海 · 设计说明」四卡区块与 DesignNote 组件；区块说明压成一句（黑珍珠号、复仇女王号、飞翔的荷兰人、航空母舰……每一艘都是真实的名船，对应你的一部作品）",
          "预览文件 paper-boats-preview.html 重写同步（现代名船+漫画海+悬浮书名+确认+图例+署名 RuiTri）",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 含「每一艘船/黑珍珠号/航空母舰」标记验证通过；残留引用 grep 归零",
          "现代船为低模程序化建模（非真实船体扫描）；名船观感/调亮后的对比度需浏览器实跑与用户验收；线上 Vercel 展示站未自动部署且无数据库（作品区不可用），以本地 dev 为准",
        ],
      },
    ],
  },
  {
    version: "v0.46.51",
    date: "2026-08-03",
    title: "纸舟星海换回真实船型（用户指令：不要纸船，设计成真实的船型）",
    sections: [
      {
        label: "真实船型恢复",
        items: [
          "用户指令「还是不要纸船了，你就把它设计成真实的船型好吗？」：从 v0.46.47 高模真实船代码恢复六种实体船模——乌篷（半圆竹篷+篷脊+长橹拖尾）、楼船（多层甲板+四角飞檐+暗窗+顶饰+墨红旗+舷边）、帆船（双受风帆+桅索+横桁）、渔船（吊杆+网具+舱房+货舱）、龙舟（龙首下颌双眼鬃毛+8 坐板+中央鼓+尾鳍）、机关舟（金属壳+冷蓝光缝+侧鳍+尾推+天线）",
          "材质真实化：getHullMat 船体改浅木纹（木色 0x7d6b52，真实木船感）、getWoodMat 深木纹（桅/橹/凳/鼓）、帆布纹、竹篾篷、机关舟金属、楼船墨红旗；删除宣纸纹 getPaperTex 与折纸工具 paperBoard/paperStick/paperTent/paperSail",
          "makeHull 恢复默认段数 14/6（真实船平滑曲面）；TYPE_NAMES 改回真实船名",
        ],
      },
      {
        label: "保留的交互与视觉（前几轮成果不受影响）",
        items: [
          "漫画风格海面（亮蓝+白色浪花线+扩散同心波纹）+ 拖拽旋转/滚轮缩放（球坐标相机）",
          "悬浮纸船显示书名 chip；点击纸船/书栏弹确认「你确认要进入《书名》吗？」确认后进写作区",
          "入场从 12 高度掉落 + 落水扑通沉浮；真灯池 ≤8 按距离-活跃度分配，灯亮则船身受光",
          "纸舟舞台切角棱框设计（nf-boat-stage）；右下角署名 GitHub + RuiTri",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 自查通过；预览文件 paper-boats-preview.html 重写同步（真实船+漫画海+悬浮书名+确认+书架示意）",
          "真实船观感（木纹质感/船型辨识度）需浏览器实跑与用户验收；线上 Vercel 展示站未自动部署",
        ],
      },
    ],
  },
  {
    version: "v0.46.50",
    date: "2026-08-03",
    title: "纸舟/作品区交互与视觉升级（确认进入/悬浮书名/虚空特效/书架设计感）",
    sections: [
      {
        label: "交互优化（用户指令 a/b/c）",
        items: [
          "a 写作页返回：Toolbar 返回按钮补 title「退出写作页，返回首页」+ aria-label + active 按下反馈（原 onClick=router.push('/') 本就生效，补全视觉提示）",
          "b 确认进入：点击纸船（pointerup）或下方书栏，先弹 window.confirm「你确认要进入《书名》吗？」，确认后才 router.push(/workspace/{id})（取消则留在海面）",
          "c 悬浮见名：pointermove 命中纸船时顶部浮现书名 chip（《书名》悬浮标签，pointer-events-none），移开消失——纸船与书一一对应",
        ],
      },
      {
        label: "视觉设计（用户指令 2）",
        items: [
          "纸舟舞台设计感：容器加 nf-boat-stage——六边形 clip-path 切角棱框 + 左上/右下折纸角（紫罗兰三角）+ 竖向细纹底，有棱有角不再矩形堆砌",
          "我的作品区：网格首项插入「+ 新建小说」卡（虚线书形，hover 抽书效果，点进 /explore 探讨模式）；ProjectCard 书名放大加粗（text-lg/xl）",
          "hover 虚空特效：卡片加 .nf-void 层——题材色光圈（--spine 派生）+ 黑洞渐变，位置按作品序号 --vx/--vy 变化，每本书悬浮效果本本不同",
          "书架设计感：.nf-bookshelf 加顶部横梁（主题色渐变线）+ 底部底座（深色渐变）；书脊加纸页层叠纹理（repeating-linear-gradient）",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + /settings /workspace/{id} 200 自查通过；SSR 含 nf-boat-stage 标记（作品区为客户端渲染，SSR 仅骨架屏属正常）",
          "confirm 用浏览器原生弹窗（轻量）；虚空特效/切角/悬浮 chip 的观感需浏览器实跑与用户验收；线上 Vercel 展示站未自动部署",
        ],
      },
    ],
  },
  {
    version: "v0.46.49",
    date: "2026-08-03",
    title: "三档主题系统（夜航/白昼/苍青）+ pipeline 自查全绿",
    sections: [
      {
        label: "主题系统（用户指令：设置能调整 UI 风格）",
        items: [
          "三档主题：夜航（暗色·默认，Void Glass 虚空玻璃）、白昼（浅色，既有 .light）、苍青（新增第三档：青绿深色风格，整套令牌换青绿系——主色 oklch(0.70 0.13 200)、创意青、强调→亮青、背景深青黑 #04090C）",
          "ThemeToggle.tsx 升级为三档选择器：按钮（图标+当前主题名）+ 弹出菜单（夜航/白昼/苍青 各带说明与勾选态），点击外部关闭；选择写 localStorage('nf-theme')，theme-color meta 同步",
          "layout.tsx 防闪烁脚本升级三档（azure 同时挂 azure+dark 保留 Tailwind dark: 变体，防止 shadcn 组件在苍青下失效）；入口：首页顶栏常驻按钮（设置旁）+ 设置页「界面风格」区；设置页文案更新",
        ],
      },
      {
        label: "pipeline 自查（用户指令：确认最终版本/无 bug/按钮齐全/响应正常）",
        items: [
          "tsc 零错误（SAFE_DELETE_DISABLE=1 npx tsc --noEmit）",
          "路由矩阵全 200：/ /settings /explore /dissect /workshop /recycle /changelog /manifest.json /workspace/{id}/tables；/tables 独立页 404 属正常（v0.46.39 已删入口，结构化表格在 workspace 内，已实测 200）",
          "功能按钮齐全：首页顶栏 开始创作/拆书/创意工坊/回收站/更新面板/主题/设置/⌘K/示例/导入备份 + 书架卡片 删除/进入工作台；SSR 含 主题脚本(nf-theme)/三档菜单/纸舟星海/RuiTri 标记",
          "OPTIMIZATION_PLAN 46 项 ✅ 全闭环（无 ⏳/待做）；RuiTri + GitHub 右下角署名确认；纸舟星海交互（旋转/缩放/点击直达/掉落）与书架 hover 抽出均在",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "主题切换为代码层验证（tsc/SSR/路由）；三档主题的实际观感（尤其苍青色系配比）需浏览器实跑与用户验收",
          "苍青主题覆盖了 --nv-* 与 shadcn 主要令牌，个别未覆盖的自定义色（如 body 三层径向渐变）仍在暗色基调上，观感以实跑为准；线上 Vercel 展示站未自动部署",
        ],
      },
    ],
  },
  {
    version: "v0.46.48",
    date: "2026-08-03",
    title: "纸舟星海改版：漫画海 + 各式小纸船 + 旋转缩放 + 点击直达写作区",
    sections: [
      {
        label: "海面：漫画风格",
        items: [
          "seaFrag 整体换色：亮蓝主色（0.10,0.30,0.60）+ 亮天蓝边缘光（fresnel 1.1）+ 起伏深蓝水波 + 白色浪花线（foam 提亮至 0.45）+ 漫画扩散同心波纹（sin 圆环）",
          "清除色改亮蓝（0x0a2a55）配合漫画海；雾色同步；场景光照提亮（Ambient 0x3a4a72@1.0 + Directional 0xffffff@0.9）让纸船在亮海上有对比",
        ],
      },
      {
        label: "船：各式各样的小纸船（用户指令：不用真的船）",
        items: [
          "删高模真船部件（makeCanopy/makeTower/makeDragonHead/makeSail/金属壳/竹篷纹理）与对应材质（METAL_MAT/DARK_MAT/FLAG_MAT/getCanopyMat），新增折纸工具 paperBoard（双面纸板）/paperStick（纸杆）/paperTent（A 形纸棚）/paperSail（斜纸帆）",
          "六种折法：经典纸船（V 形船身+中央纸棚+首尾纸角上折）、塔式纸船（两层叠纸台+顶层纸旗）、双帆纸船（双纸桅+两片斜纸帆）、平筏纸船（浅平船身+纸棚+尾桨+线网）、长龙纸船（窄长+首尾纸尖大幅上翘+纸坐板+纸鼓）、尖角纸船（灰纸棱角+冷蓝折痕+纸翼+天线）",
          "makeHull 默认段数降到 8/4（更棱角的折纸感）；题材→折法映射（GENRE_TO_TYPE）保留，未命中回退经典纸船；真灯池 ≤8、折痕线题材色保留；TYPE_NAMES 改纸船名",
        ],
      },
      {
        label: "交互：旋转缩放 + 点击直达",
        items: [
          "拖拽旋转：pointerdown/move 改相机目标 yaw/pitch（clamp 俯仰 0.12~1.1），渲染循环缓动跟随（lerp 0.08）；滚轮缩放：wheel 改目标 radius（6~26），preventDefault 不滚动页面；cursor grab/grabbing/pointer 三态",
          "点击直达：pointerup 位移<6px 视为点击 → pickBoat → router.push(/workspace/{id})（无 id 走 /explore）；下方书栏点击同样直达；移除原聚焦面板（focused 详情卡/回到全景）与聚焦逻辑",
          "入场掉落：从 12 高度 ease-out 掉落 + 落地后 0.6s 内扑通沉浮（sin 衰减）；船随海起伏 ±0.10/±0.07 保留",
        ],
      },
      {
        label: "书架清理 + 真书 + 署名",
        items: [
          "作品区书架只渲染真实项目（无占位假书，占位灵感仅 projects 为空时兜底）；每本书按题材显示不同立体书封（.nf-book3d：题材色封面/书脊/厚度，hover 抽出突出效果），「我的作品」每本显示不同",
          "首页右下角 fixed 署名：GitHub（https://github.com/huanweide/novel-forge）+ 作者 RuiTri；纸舟星海说明与四条设计说明更新（船即作品/灯即活性/海即漫画/点击即入）",
          "预览文件 paper-boats-preview.html 重写同步（漫画海+六种纸船+旋转缩放+点击直达+书架示意+署名）；交互链条确认：纸船区点击与书架点击均路由 /workspace/{id}（已验证 HTTP 200）",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 含「纸船进入写作区/RuiTri」标记验证通过；旧文案「点击纸船拉近」零残留",
          "纸船为程序化折纸近似（非真实折纸扫描）；漫画海观感/纸船辨识度/旋转缩放手感需浏览器实跑与用户验收；线上 Vercel 展示站仍为旧版未自动部署",
        ],
      },
    ],
  },
  {
    version: "v0.46.47",
    date: "2026-08-03",
    title: "作品区书架化 + 纸舟材质/水/动感修饰（用户验收反馈一轮）",
    sections: [
      {
        label: "书架：一排排整齐的立体书",
        items: [
          "用户反馈「没有看到一排排整齐的书架」：作品区 ProjectCard 升级为 3D 立体书——题材色渐变封面铺满整卡、左侧深色书脊竖条（含竖边投影）、底部浅色书页厚度边；网格容器加书架板背景（竖分隔纹+底部加深），一排排立着的书",
          "突出效果：hover/焦点时书「从书架抽出」——上浮 10px + 微放大 + 题材色辉光 + 深阴影，z-index 提升避免遮挡；暗色/浅色主题双适配（.light 书架板与书封都换浅色）",
          "卡片信息保留：书名/描述/题材标签/角色词条节点字数统计/更新时间/删除按钮/「进入工作台 →」链接全部原样；骨架屏同步书形",
        ],
      },
      {
        label: "纸舟星海 · 材质修饰",
        items: [
          "四种 Canvas 纹理客户端惰性构建（延续 getNetMat 的 SSR 安全模式）：宣纸纹（船体，米白底+极淡噪点）、木纹（桅/橹/凳/鼓等木料，深棕底+深浅竖木纹）、帆布纹（受风帆，米白底+斜织细纹，近不透 opacity 0.97）、竹篾纹（乌篷，深色底+竖向竹篾）",
          "机关舟金属壳更名 METAL_MAT、暗部件 DARK_MAT、冷蓝 COLD_MAT、墨红旗 FLAG_MAT、暖白灯芯 CORE_WARM 保持纯色共享（模块顶层安全）；船从平涂色块升级为有质感的墨色一笔",
        ],
      },
      {
        label: "水效果 + 动感 + 聚焦",
        items: [
          "水：CPU/GPU 双层波波幅 0.16/0.11 → 0.19/0.13（船起伏更明显）；海面 fresnel 系数 0.9→1.15、sheen 提亮、flow 加强，新增浪花高光 foam（smoothstep 白沫，低饱和守墨色）",
          "动感：船纵摇横摇幅度 ±0.06/±0.05 → ±0.10/±0.07；系统 prefers-reduced-motion 时船仍随海起伏（物理姿态），仅相机静止不漂移（原实现会整段停动画）",
          "聚焦：点击船聚焦放大 1.15→1.32、相机推进 lerp 0.06→0.085、lookAt 0.08→0.1，点船拉近望「下一章」反馈更明显",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 含 nf-book3d 骨架书标记验证通过；预览文件 paper-boats-preview.html 重写同步（去花哨+新材质+水增强+6型+书架示意）",
          "纹理为程序化近似（非真实木纹/纸纹扫描图）；书架/船的观感与质感需浏览器实跑与用户验收；线上 Vercel 展示站仍为旧版（GitHub main 已更新，展示站未自动部署）",
        ],
      },
    ],
  },
  {
    version: "v0.46.46",
    date: "2026-08-03",
    title: "去花哨·回到实用版型：保留 3D 模型动态与 ≤8 真灯，所有书全量显示",
    sections: [
      {
        label: "去花哨（页面层 + 海面层）",
        items: [
          "页面层：删除 AuroraBackground 极光漂移、ParticleField 星尘粒子（含卡片 hover 向粒子层派发的 nf-particle-attract 联动）、Hero 区主/辅光晕与半环轨道装饰；首页回到书本网格为主、3D 安静点缀的实用版型",
          "海面层：移除海面星点、船头加性光晕 sprite（lampGlow）、光尾 mesh（trail）、涟漪池（ripples）、航线光带（route）；仅留平静墨海 ShaderMaterial + 小船轻晃 + ≤8 真灯诚实受光",
          "同步删除无引用的 AuroraBackground.tsx / ParticleField.tsx 源文件；设计说明「尾迹即坚持」改为「舟即起伏」以对齐现状",
        ],
      },
      {
        label: "保留与增强（模型动态 + 真实细节）",
        items: [
          "6 种真实船型（乌篷/楼船/帆船/渔船/龙舟/机关舟）保留并含高模细节：楼船四角飞檐+暗窗+顶饰、龙首下颌+双眼+鬃毛、楼船低饱和墨红旗、渔船下垂渔网、龙舟中央鼓+尾鳍、机关舟侧鳍/尾推/天线",
          "模型动态保留：随墨海双层波起伏 + 轻微纵摇横摇（rotation.z/x 低频振荡）；真灯池仍封顶 8（焦点船+最近/最活跃），灯亮则船身受光，墨色视觉语法统一",
          "题材色折痕晕染（addEdges 用题材色而非默认蓝）保留；船大小=字数、灯亮=活跃度语义保留",
        ],
      },
      {
        label: "所有书显示 + 入口确认",
        items: [
          "首页 /api/projects 全量返回（含旧设置/题材骨架项目），ProjectCard 网格 + 纸舟书栏选书均列出",
          "UI 按钮交互确认：ProjectCard「进入工作台 →」(Next <Link href=/workspace/{id}>) 与纸舟书栏选书 openBoat 均路由到 /workspace/{id}（已验证 HTTP 200）；3D 小船点选聚焦后「打开这本书」同路由",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 无极光/粒子/光晕残留标记验证通过",
          "修复渔网贴图 makeNetTexture 在模块顶层调用 document.createElement 导致的 SSR ReferenceError（改为客户端惰性创建 getNetMat，仅在 useEffect 内 createBoat 时构建）",
          "3D 观感（船型轮廓辨识度、墨色统一度、动态自然度）仍需浏览器实跑与用户验收",
        ],
      },
    ],
  },
  {
    version: "v0.46.45",
    date: "2026-08-03",
    title: "纸舟星海 maxloop 第1轮：BoatFactory 6 真实船型 + ≤8 真灯性能纪律",
    sections: [
      {
        label: "设计计划（董事会整合）",
        items: [
          "开会：PG/乔布斯/智能体团队/费曼/张雪峰/芒格 六方报告 → Chair 整合落盘 会议/纸舟星海小船设计/整合.md",
          "共识：船型即语义（非用户选）、结构真实三要素（比例+连接+光影）、保留原 UI（书栏+详情卡）、性能纪律（≤8 真灯+bloom 假光+实例化+LOD+船型封顶6）、统一墨色视觉语法、真实≠堆细节",
          "船型清单≤6 + 题材映射表：乌篷(武侠/言情/田园)、楼船(仙侠/玄幻/历史)、帆船(冒险/西幻)、渔船(悬疑/灵异)、龙舟(历史连载)、机关舟(科幻/推理)；未命中回退乌篷（不新增第7种几何）",
        ],
      },
      {
        label: "BoatFactory · 第1轮实现",
        items: [
          "makeHull 参数化船体（收分+舷弧+V 底），部件库 canopy/mast+受风帆/tower+飞檐/dragonHead/网具/冷蓝发光缝，createBoat(type) 按配方拼装，换船型=换配置不写新类",
          "真灯池 8 个：每帧按相机距离-活跃度打分选 ≤8 艘挂真 PointLight（不投影），其余发光球+加性光晕 sprite 假光（r128 无 UnrealBloom 后处理，用 sprite 等价实现）",
          "保留：船大小=字数、灯亮=活跃度、光尾=连续性、折痕光=题材色；底部书栏+详情卡「打开这本书/回到全景」按钮、从书栏进入方式全部不变",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR 含关键标记验证通过；几何/材质共享已落实",
          "3D 观感（轮廓辨识度、墨色统一度、部件比例微调）需浏览器实跑与用户验收；maxloop 第2轮聚焦高模+真灯受光、第3轮 LOD+实例化收口",
        ],
      },
    ],
  },
  {
    version: "v0.46.44",
    date: "2026-08-03",
    title: "首页 UI 升级·润色修复（Phase 4）：stagger 致命修复 + 粒子场润色 + 无障碍",
    sections: [
      {
        label: "致命修复 · stagger 观察器时序",
        items: [
          "根因：useStaggerOnView 原用 [] 空依赖，且项目网格仅在 projects 加载完成后才渲染（loading 时为骨架屏）；挂载时 staggerRef.current 为 null、观察器从未挂上，数据回来网格出现时 effect 早已跑过不再执行 → 卡片永久 opacity:0 不可见",
          "修复：useStaggerOnView 改为接收 ready 标志（!loading && projects.length>0），数据加载完网格挂载后再挂 IntersectionObserver，逐张 add is-visible 触发 nf-card-in 上浮入场；reduced-motion 路径同步改走 ready 门控",
        ],
      },
      {
        label: "粒子场润色",
        items: [
          "粒子上限 90→150、密度公式 area/22000→area/16000，4K 等大屏星点密度显著提升、不再稀疏（≤150 时 O(n²) 连线开销仍可忽略）",
          "reduced-motion 增 MediaQueryList change 监听：系统设置中途切换也能正确 stop()+renderStatic() 或 start()，避免状态不同步",
          "鼠标视差改由 pointer:fine 门控：触屏设备（pointer:coarse）不做 canvas transform 视差，避免点击/滑动时背景乱抖",
        ],
      },
      {
        label: "无障碍",
        items: [
          "项目卡片删除按钮原本仅 group-hover 显形，键盘 focus 不可见、无法触发；补 group-focus-within:opacity-100 + focus-visible:opacity-100，键盘用户可正常看见并删除",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 验证；卡片可见性修复经代码审查确认（条件渲染 + ref 时序根因）",
          "粒子密度/reduced-motion 实时切换/触屏视差行为需浏览器实跑最终确认；O(n²) 连线在 150 粒子内安全，未上空间网格（避免过度复杂化）",
        ],
      },
    ],
  },
  {
    version: "v0.46.43",
    date: "2026-08-03",
    title: "首页 UI 升级·联动润色（Phase 3）：卡片 stagger 入场 + 粒子聚拢",
    sections: [
      {
        label: "卡片 stagger 入场",
        items: [
          "项目网格包 home-stagger 容器，每张卡包 home-stagger-item；IntersectionObserver 进入视口逐张播放 nf-card-in（translateY+scale+rotateX 上浮），间隔 60ms，像『书一本本浮现』",
          "入场动画作用于外层 home-stagger-item、card-lift:hover 起伏作用于内层 ProjectCard——父子不同元素、transform 互不覆盖；reduced-motion 下直接 add is-visible（无动画）",
        ],
      },
      {
        label: "轻量粒子聚拢（hover/focus）",
        items: [
          "卡片 hover 与键盘 focus 经 window 事件 nf-particle-attract 向 ParticleField 注入屏幕坐标目标点；粒子层仅对目标点 320px 内粒子施加微弱吸引力偏移，移开/失焦后 elastic 衰减回位",
          "仅局部受力、不全局重绘、开销可忽略（INP 友好）；reduced-motion 下不监听该事件；派发/监听解耦（page 只 dispatch，粒子层独立订阅），零跨组件硬依赖",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + 无错误页验证；stagger/聚拢具体观感（上浮节奏、聚拢幅度）需浏览器实跑确认",
          "首屏 loading 态渲染骨架屏、不渲染项目网格，故首屏 SSR HTML 不含 home-stagger-item（已代码审查确认逻辑正确，非遗漏）；首页升级三阶段 v0.46.41/42/43 全部收官",
        ],
      },
    ],
  },
  {
    version: "v0.46.42",
    date: "2026-08-03",
    title: "首页 UI 升级·交互状态补全（Phase 2）：active 凹陷 / focus 间隙 / 骨架屏 / Bento 空态",
    sections: [
      {
        label: "点击态与聚焦态",
        items: [
          "主按钮 .btn-primary:active 在现有 scale(0.97) 基础上叠加 inset 0 2px 6px 阴影，形成『按压下陷』语义，过渡沿用全局 --dur-micro(150ms) 快速触感反馈",
          "全局 button:focus-visible 加 ring-offset-2 + ring-offset-[var(--background)]（间隙色随明暗主题自动切换），键盘 Tab 焦点环清晰可见且不与元素贴边",
        ],
      },
      {
        label: "加载态骨架屏（替代三点脉冲）",
        items: [
          "新增 ProjectCardSkeleton 子组件：surface-elevated 容器 + 标题/描述/标签/统计条占位块，每块内嵌 shimmer-line 流光横扫（复用现有 .shimmer-line），与最终 ProjectCard 同形",
          "项目列表加载分支由 3 个 animate-pulse 圆点改为 6 张同列骨架屏网格，加载即呈现真实布局骨架、禁通用圆形 spinner，对齐前端纪律",
        ],
      },
      {
        label: "空态 Bento 不对称",
        items: [
          "FeatureCard 组件加 featured/className 可选 props；空态三张等宽卡改为 sm:grid-cols-2 不对称 Bento——主引导卡（探讨模式）featured 跨整行放大（p-7、图标/标题加大），拆书/配置两张副卡并排错落",
          "拉开视觉层级、避免技能明确不推荐的 AI 默认三等分布局；邀请式文案『还没有小说项目…』保留（非道歉腔）",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 200 + SSR HTML 含 shimmer-line 骨架屏标记验证（首屏 loading 态已被 SSR 渲染）；col-span-2 Bento 因属空态条件渲染、首屏不出现，已代码审查确认逻辑正确",
          "骨架屏/空态/Bento 具体观感（流光密度、错落比例）需浏览器实跑确认；Phase 3（卡片 stagger 入场 + 可选 hover 聚拢/焦点聚光）待续",
        ],
      },
    ],
  },
  {
    version: "v0.46.41",
    date: "2026-08-03",
    title: "首页 UI 升级·背景签名层（Phase 1）：极光漂移 + 星尘粒子",
    sections: [
      {
        label: "背景签名层（Layer A 极光 + Layer B 粒子）",
        items: [
          "新增 src/components/home/AuroraBackground.tsx：fixed z-0 pointer-events-none 容器内 3 个超大模糊光斑（blur 120px，靛蓝/紫罗兰/金三色族），仅动 transform/opacity 做 38~50s 极慢漂移呼吸，与 body 既有三层径向渐变叠加成流动星云",
          "新增 src/components/home/ParticleField.tsx：canvas 2D 星尘场，60~90 个微光点（按视口面积动态上限，70% 中性星白+30% 三色族点缀），邻近粒子极淡连线构成星图；隐喻『故事星尘/记忆碎片』，契合小说宇宙主题",
        ],
      },
      {
        label: "粒子工程化与无障碍",
        items: [
          "DPR 适配（上限 2）防高分屏模糊；requestIdleCallback 延迟启动（timeout 1200ms）不阻塞 LCP",
          "prefers-reduced-motion 静态降级：仅绘制一帧静态星点、不进入 rAF 循环；visibilitychange 页面隐藏暂停 rAF、回前台恢复",
          "鼠标视差：canvas 整体 transform 位移合成（不重算粒子坐标），缓动跟随；-inset-6 溢出覆盖边缘避免露白；浅色主题监听 html.light 切换深蓝灰调色板",
        ],
      },
      {
        label: "接入与一致性",
        items: [
          "page.tsx 根 div 注入 <AuroraBackground/>+<ParticleField/>（fixed z-0）；Hero section 与 main 提至 relative z-10，确保内容恒定在背景层之上、交互不被拦截",
          "globals.css 补 .aurora-blob 基础与 aurora-drift-1/2/3 关键帧、.light .aurora-layer 降透明度适配；颜色锁定三色族，与 .text-gradient 同源，不引入第四装饰色——在现有 Void Glass 体系增量升级，不重写",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "tsc 零错误 + dev 编译 200 + SSR HTML 含 aurora-layer/-inset-6/aurora-blob 新标记验证；背景具体观感（极光流动、星点密度、连线观感）需在浏览器实跑确认，文档色值/时长均引用现有令牌、未实测渲染以实际为准",
          "粒子连线/hover 聚拢属签名增强，INP 超标则降级为静态星点（待 Phase 3 实测）；CLS=0、LCP 不被背景阻塞为性能红线；计划文档见 PROCESS/HOMEPAGE_UI_UPGRADE_PLAN.md",
        ],
      },
    ],
  },
  {
    version: "v0.46.40",
    date: "2026-08-03",
    title: "清理 10 个 @deprecated API 端点（BE-8 收官）：死代码删除",
    sections: [
      {
        label: "删除清单（确认零引用）",
        items: [
          "tools/execute、generate/detect-entities、generate/update-cards、generate/apply-updates",
          "lorebook/summarize（含 apply 子路由，头注释自证『死代码，前端无引用』）、lorebook/import、lorebook/expand",
          "pending-items、presets/[id] 的 GET/PUT/DELETE（裸 id 路由；apply/fork 子路由保留）",
          "两轮交叉核验：① 全 src grep `@deprecated` 定位 10 个路由文件；② 全 src（.ts/.tsx）搜路径串 + 无 /api/ 前缀串，确认仅出现在 changelog-data.ts 历史与路由自身注释，前端 fetch 与后端 route-to-route 调用均为 0",
        ],
      },
      {
        label: "保留与边界",
        items: [
          "保留 presets/[id]/apply 与 presets/[id]/fork（创意工坊套用/复刻，活跃调用）；保留 PendingItem Prisma 模型（删路由不影响模型，ORM 层移除需迁移，超出本次范围且无害）",
          "core/llm/client.ts 的 9+ @deprecated 导出不在本次范围——ARCH-1 已说明仍被迁移期调用方引用，强删会破坏构建，故保留",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "文件式 API 路由删除不会触发 tsc 报错（无 import 依赖），故安全网全靠『全量 grep 零引用』+ tsc 零错误；未在浏览器逐个点击对应按钮验证（纯删除、无 UI 改动，风险极低）",
          "当初 BE-8 标注『删除端点与 U5 冲突故保留』现证为过度谨慎——U5 功能本身后续已被移除/重构，这些端点确无活引用",
        ],
      },
    ],
  },
  {
    version: "v0.46.39",
    date: "2026-08-03",
    title: "UI 审计·按钮清理（#217-2/#217-3）：导入按钮厘清 + 次级行去重",
    sections: [
      {
        label: "导入按钮厘清（#238 / 设定 vs 导入）",
        items: [
          "问题：顶部栏「设定」(`SettingsImporter`：粘贴设定文本→AI 拆角色卡+世界书+风格卡，不建章节) 与「导入」(`ImportWizard`：粘贴整本书稿→自动分章+抽角色/世界观/风格) 在『从文本抽取设定』上概念重叠，标签又都含混，用户难分",
          "处理：标签改为「导入设定」/「导入书稿」并补 tooltip 厘清主职责差异；二者主输出不同（建章节树 vs 不建），经评估强行合并会丢能力，故选择厘清而非硬并（符合审计『跟不上才删、有用则整合』原则）",
        ],
      },
      {
        label: "次级按钮行去重（#240）",
        items: [
          "移除次级按钮行与「工具箱」对话框完全重复的「结构化表格」(`/workspace/{id}/tables`)、「创意工坊」(`/workshop`)——两处入口指向同一目的地，属冗余；保留「工具箱」内的入口即可",
          "保留「项目设定」(`BuildConfigDialog`：小说骨架设定) / 「记忆衰减」 / 「项目配置」(`ProjectConfigPanel`：书名/模型/LLM 参数) 并补 tooltip 区分；确认「项目设定」与「项目配置」职责不同、非重复，仅补说明",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "未做浏览器端到端实跑；本次仅 tsc 零错误 + 文案/指向对齐既有路由（风险低）",
          "「设定」与「导入」的概念重叠未靠删组件解决，而是靠标签/tooltip 厘清——若后续要把 `SettingsImporter` 的轻量拆卡能力并入 `ImportWizard`，属更大重构，超出本次审计清理范围",
        ],
      },
    ],
  },
  {
    version: "v0.46.38",
    date: "2026-08-03",
    title: "UI 审计·文风机制整合（#217-1）：顶部栏文风控件统一 + 创意工坊文风联动",
    sections: [
      {
        label: "文风控件统一（去重）",
        items: [
          "问题：进入小说界面顶部栏并排两套文风控件——基于 `styleCard` 的标签按钮（但 `/api/projects/[id]/style` GET 不返回 `styleDescription`，标签永远退化成「文风」空按钮）与只读硬编码 `STYLE_TEMPLATES` 的 `StyleSelector` 下拉，二者数据源错位且冗余",
          "修复：统一为单一「文风」入口按钮，实时显示当前激活风格（经 `getTemplate(styleTemplateId)` 解析模板名/图标，未命中显示「✏️ 自定义文风」），点击打开 `StyleEditor` 统一风格中枢",
          "删除冗余的 `StyleSelector` 头部下拉组件（`Toolbar`、`page.tsx` 同步清理 `styleCard`/`onStyleSelect`/`povLabel`/`ProjectData` 等未用引用）；修复 `page.tsx` 加载时未水合 `styleTemplateId` 的隐性 bug（`setStyleTemplateId(styleData.styleTemplateId)`），让按钮加载即显示真实风格",
        ],
      },
      {
        label: "创意工坊文风联动",
        items: [
          "`StyleEditor` 新增「工坊文风」Tab，异步 `GET /api/presets?type=style` 拉取公开文风预设并列表（标题/描述/作者/下载数）",
          "「套用」映射：`content.styleDescription` 并入本项目「风格笔记」（参与生成 System Prompt）、`povType` 直接写入、`dialogueRatio`/`descriptionRatio`（0-1）按比例四舍五入进 12 维度 `dialogueRatio`/`descriptionDensity`（1-10）；并调 `POST /api/presets/[id]/apply` 同步更新 `StyleCard` 分析模型，实现双向联动",
          "此前工坊 `type=style` 预设的 `apply` 只写 `StyleCard` 分析模型、不参与生成——本次让社区文风预设真正驱动本项目写作风格",
        ],
      },
      {
        label: "诚实边界",
        items: [
          "工坊文风「套用」为追加式：不覆盖用户原有风格笔记与维度，仅当预设含对应字段才同步；不改动 `styleTemplateId`（保留用户基础模板脚手架）",
          "`StyleCard` 三卡分析模型保持独立，工坊预设经 `apply` 写它仅作分析参考，生成仍以 `Project.llmConfig` 文风配置为准",
          "未做浏览器端到端实跑；本次仅 tsc 零错误 + 复用已验证 PUT 链路（风险中低）",
        ],
      },
    ],
  },
  {
    version: "v0.46.37",
    date: "2026-08-03",
    title: "时间线视图（#216 收口）：FE-N6 左侧大纲新增「时间线」视图 + 节点世界时间标记",
    sections: [
      {
        label: "时间线视图（FE-N6）",
        items: [
          "Schema：`StoryNode` 新增 `worldTime String?`（书中世界时间自由文本，如「天启三年春」／「星历2049」），已 `prisma db push` 同步本地 PG17 并 `prisma generate` 更新客户端类型",
          "视图三态升级：左侧大纲根 `volumeView: boolean` 二态重构为 `viewMode: \"volume\" | \"flat\" | \"timeline\"` 三态，与现有分卷/平铺并列；`OutlineTree` 新增时间线分支——过滤非卷节点、按 `worldTime` 字符串升序排序（未标记的排末尾），每行渲染世界时间徽标 + 类型图标 + 标题 + 字数，点击即选中",
          "`LeftPanel` 切换 UI 改为「分卷 / 平铺 / 时间线」三按钮（沙漏图标），`page.tsx` 状态 `volumeView` → `viewMode` 枚举，并下传 `onSetViewMode`",
        ],
      },
      {
        label: "世界时间录入与持久化",
        items: [
          "`CenterPanel` 节点控制栏新增「世界时间」输入框（沙漏图标），受控 `wtDraft` 同步选中节点，失焦（或回车）调用 `handleSaveWorldTime` 回写库",
          "`PUT /api/story/nodes/[id]` 的 `data` 补 `worldTime: body.worldTime`，保存经乐观锁 `expectedVersion` 校验、冲突转交 `SaveConflictModal`；`GET` 本就返回完整节点（含 world_time），读取链路无需改",
          "`StoryNodeData` 类型补 `worldTime: string | null`；tsc 零错误",
        ],
      },
      {
        label: "诚实边界与计划",
        items: [
          "时间线排序用纯字符串 `localeCompare`（中文按拼音序），不解析语义时间——作者想精确控序需填可比较文本（如统一前缀「卷一·」）；多时间线/非线性叙事的复杂轴暂未做",
          "世界时间仅支持章节/分节/场景节点标记，卷（volume）不参与时间线排序（卷是结构容器）",
          "#216 全部收口：ARCH-3/ARCH-6/ARCH-1/FE-N8/FE-N6 完成；ARCH-4 迁移历史维持暂缓（schema 与旧迁移已漂移，本地 db push 够用）；非 ⭐ 续做项全部完成",
        ],
      },
    ],
  },
  {
    version: "v0.46.36",
    date: "2026-08-03",
    title: "保存冲突乐观锁（#216 收口）：FE-N8 非流式保存带版本戳 + 冲突解决面板",
    sections: [
      {
        label: "保存冲突乐观锁（FE-N8）",
        items: [
          "Schema：`StoryNode` 新增 `editVersion Int @default(1)`，每次成功 PUT +1，作为乐观锁基准；已 `prisma db push` 同步本地 PG17 并 `prisma generate` 更新客户端类型",
          "`PUT /api/story/nodes/[id]` 支持可选 `expectedVersion`：有则 `where: { id, editVersion: expectedVersion }` 条件更新；库版本与客户端携带的不符 → 返回 409 + 库里当前 `{editVersion,title,outline,content}` 快照（`conflict:true`）；无 `expectedVersion` 的旧调用方走普通更新（不强制锁）；并发窗口内 `P2025` 也降级为 409",
          "新建 `src/components/workspace/SaveConflictModal.tsx`：收到 409 弹出，并排展示「我的版本（将保存）」与「库里版本（已更新 vN）」，三按钮——用我的（以服务端当前版本为基准强制覆盖）/ 用库里的（放弃本地，载入服务端）/ 保留双方（库里版本追加进 `notes` 备注，我的版本覆盖）",
        ],
      },
      {
        label: "前端接线",
        items: [
          "workspace 页 3 处保存统一接入：`handleSaveNode`（正文 mod+s）、`handleDrawSelect`（抽卡章纲）、`onEditOutline`（大纲编辑）——均携带 `expectedVersion: selectedNode.editVersion`，成功响应回写 `setSelectedNode(node)`（含新 editVersion），409 转交冲突面板",
          "`src/components/workspace/types.ts` 的 `StoryNodeData` 补 `editVersion: number` 字段，使 `selectedNode.editVersion` 在 TS 层可见",
        ],
      },
      {
        label: "诚实边界与计划",
        items: [
          "未处理「AI 流式改写直接覆盖未提交 textarea」的 UI 受控问题——那是 UI 受控层（大纲 textarea 绑定方式），不在 FE-N8 字面范围；本批次聚焦「保存冲突」显式化",
          "`GameOutlineEditor` 等其它 PUT 入口暂未带 `expectedVersion`（兼容旧调用，不会误触发 409）；如需全覆盖后续可补",
          "#216 仍剩 FE-N6（时间线视图）待续；ARCH-4 迁移历史维持暂缓",
        ],
      },
    ],
  },
  {
    version: "v0.46.35",
    date: "2026-08-03",
    title: "合并 LLM 抽象（#216·批次2）：ARCH-1 非流式调用统一到 core/llm 门面",
    sections: [
      {
        label: "合并两套 LLM 抽象（ARCH-1）",
        items: [
          "新增统一门面便捷函数 `completeText(system, prompt, { model?, temperature?, maxTokens?, role?, config? })` 于 `src/core/llm/client.ts`：内部走 `getEffectiveConfig()` + `createLLMClient(config).chat()`，复用已验证的指数退避重试 + 故障转移链，无需再手写 fetch",
          "6 个 API 路由的非流式调用迁到 `completeText`：characters/classify、storylines/generate、generate/chapter-outline（selection + outline 两处）、generate/chapter-outline/draw（并行多温度各调一次）、lorebook/import、lorebook/summarize；原 temperature / maxTokens 参数逐一保持不变",
          "删除旧层 `src/lib/llm.ts` 的 `callLLM` / `callSiliconFlow`（@deprecated 别名）/ `LLMCallOptions` 接口——旧层不再承担任何非流式生成，降级为纯工具库（保留 `getSettings` / `mapLLMError` / `recordLlmCall` / `testLLMConnection` / `MODEL_PRICING`，仍被大量路由引用，不可删）",
        ],
      },
      {
        label: "依赖与卫生",
        items: [
          "移除死依赖 `openai`：grep 全仓无任何 `import \"openai\"`，统一门面与旧封装均用原生 fetch，已从 package.json + package-lock.json 删除并通过 `npm install` 同步",
          "修正 `lib/llm.ts` 顶部过时注释，指向新门面 `core/llm/client.ts` 作为非流式调用唯一入口",
        ],
      },
      {
        label: "诚实边界与计划",
        items: [
          "未强删 `core/llm/client.ts` 内 9+ 个 `@deprecated` 导出（如 getDefaultLLMConfig / getSiliconFlowClient）：仍有引用方，强删会破坏构建——「合并」务实落地为「非流式调用统一走新门面」，而非字面删除全部 deprecated 符号",
          "ARCH-1 落地后 #216 仍剩 FE-N8（保存冲突乐观锁）/ FE-N6（时间线视图）待续；ARCH-4（迁移历史）维持暂缓（本地 db push 已够用）",
        ],
      },
    ],
  },
  {
    version: "v0.46.34",
    date: "2026-08-02",
    title: "架构与测试收口（#216·批次1）：ARCH-3 输入校验层 + ARCH-6 测试护栏",
    sections: [
      {
        label: "集中输入校验层（ARCH-3）",
        items: [
          "新增 src/lib/validators.ts（手写轻量守卫，零新依赖）：asStr/asStrOrNull/asStrArray/asInt/asBool + ValidationError/badRequest + readValidatedBody(request, validate) 统一入口（JSON 解析失败或字段校验失败返回 400，绝不直接进 prisma）",
          "给 4 个完全裸信任入参的写路由补校验：characters(POST)/lorebook(POST)/story-nodes(POST)/rules(POST)——projectId/name 等必填、字段类型与长度约束，脏数据在落库前被拦下",
          "config 路由（projects/[id]/config PUT）已有手工 typeof 守卫 + 范围校验，标注为已合规，不重复改造",
        ],
      },
      {
        label: "测试护栏（ARCH-6）",
        items: [
          "新增 vitest.config.ts（node 环境，include src/**/*.test.ts）+ package.json 加 test script（vitest run）",
          "首个单测 src/lib/__tests__/utils.test.ts 覆盖 safeJoin 八分支（null/数组/对象/字符串/JSON 字符串数组/数字数组过滤/非 JSON 原样）；实跑 8 passed，验证测试管线可用",
        ],
      },
      {
        label: "诚实边界与计划",
        items: [
          "ARCH-3 未引入 zod：原计划建议 zod，但本地单用户工具求轻，手写守卫已达成「防 500/防脏库」目标且不增运行时依赖",
          "ARCH-6 目前仅纯函数测试；API 路由（需 mock prisma/NextResponse from next/server 导入问题）留后续批次",
          "#216 其余子项：ARCH-1（合并 LLM）/FE-N8（保存冲突）/FE-N6（时间线）待续；ARCH-4（迁移历史）标注暂缓——schema 与 3 旧迁移已漂移，本地 db push 已够用，强行 migrate 有重建全表风险",
        ],
      },
    ],
  },
  {
    version: "v0.46.33",
    date: "2026-08-02",
    title: "前端新功能（#215）：FE-N5 全局快捷键系统 + FE-N7 网文合规违禁词预检",
    sections: [
      {
        label: "全局快捷键系统（FE-N5）",
        items: [
          "新增 src/components/ShortcutProvider.tsx：根布局挂载单一 keydown 监听 + 注册表；各页面用 useShortcut(id, combo, desc, handler) 注册，组件卸载自动注销，避免多组件各挂监听导致冲突",
          "workspace 页接入 4 个快捷键：mod+s 保存、[ 折叠左栏（桌面 lg:hidden / 窄屏抽屉）、] 切换右栏、n 新建章节",
          "安全护栏：非 mod 组合键（n、[、]）在 input/textarea/contenteditable 内自动忽略不打断打字；带 mod 组合（mod+s）即使在输入框也照常触发",
          "首次进入若未看过速查且当前页已有注册快捷键，延迟弹一次速查弹层（localStorage 记忆，可关）；设置页「快捷键」板块从已注册列表实时渲染",
        ],
      },
      {
        label: "网文合规违禁词预检（FE-N7）",
        items: [
          "新增 src/lib/banned-words.ts：内置常见网文违禁词基础词库（政治/色情/暴力/迷信等）+ 用户自定义追加/重置接口，导出前扫描命中",
          "导出路由 /api/projects/[id]/export 新增 ?check=1 模式：只扫描正文返回命中清单（词 + 行号 + 上下文片段），不生成文件",
          "ExportDialog 在真正导出前先调 ?check=1：命中即弹确认清单（展示命中条数 + 可展开上下文），用户可坚持导出或取消",
        ],
      },
      {
        label: "设置页增补",
        items: [
          "新增「违禁词管理」板块：展示内置词数、自定义词输入追加（回车/按钮）、一键重置自定义词",
          "新增「快捷键」速查板块：从 ShortcutProvider 已注册列表实时渲染当前页可用快捷键",
        ],
      },
    ],
  },
  {
    version: "v0.46.32",
    date: "2026-08-02",
    title: "后端深化与导入（#214）：BE-5 导入任务异步化 + FE-N3 多格式导入",
    sections: [
      {
        label: "多格式导入（FE-N3）",
        items: [
          "导入向导新增 .epub/.docx 支持：浏览器端用 jszip 解压抽取纯文本（epub 读 xhtml/html、docx 读 word/document.xml + w:p 段落），喂给现有 import/parse（仅收 rawText），后端无需感知格式",
          "新增 src/lib/manuscript-parse.ts（前端依赖）：parseEpubFile/parseDocxFile/fromManuscriptFile 统一入口 + estimateTokens 估算；accept 放宽到 .txt,.md,.epub,.docx，提示文案同步更新",
        ],
      },
      {
        label: "导入任务异步化（BE-5）",
        items: [
          "Prisma 新增 ImportTask model（status/progress/result/error/importMode/projectId，对齐已验证的 DissectionTask 模式），本地 PG17 已 db push 同步；未建数据库关系以免改动庞大 Project model",
          "import/parse 路由接入任务表：POST 建 ImportTask(pending) → SSE 流内 fire-and-forget 更新 progress/done(completed,存 characters/lore/style)/error(failed)，progress/done/error 事件均带 taskId",
          "新增 GET /api/import/[taskId] 轮询路由，返回 status/progress/result/error/importMode，对齐 dissect/[id]",
        ],
      },
      {
        label: "断线恢复（BE-5）",
        items: [
          "ImportWizard 在 progress/done 事件拿 taskId 存 sessionStorage(`nf-import-task-${projectId}`，done 后清除；error 不清除以便溯源）",
          "组件挂载时若 sessionStorage 有未完成 taskId 且当前非 preview/done，自动轮询 GET import/[taskId]：completed 取 result 进 preview、failed 报错，实现断线/刷新后凭 taskId 恢复",
        ],
      },
    ],
  },
  {
    version: "v0.46.31",
    date: "2026-08-02",
    title: "前端打磨（#213）：FE-10 弹窗合并 + FE-7 错误态 + FE-5 无障碍 + ARCH-7 颜色守卫",
    sections: [
      {
        label: "合并角色弹窗（FE-10）",
        items: [
          "CharacterEditDialog 与 CharacterCreateDialog 合并为单一 CharacterDialog（可选 character 参数：有则编辑全字段 + AI 补全，无则精简创建），调用方 page.tsx 两处渲染合并为一；旧两文件删除",
          "personality 文本↔结构化解析（fromText/toText）、时间线解析（timelineToText/textToTimeline）、角色选项 CHARACTER_ROLE_OPTIONS 抽至 src/lib/character-parse.ts 单一数据源，两个弹窗不再各自维护一份导致字段约定漂移",
        ],
      },
      {
        label: "错误态一致性（FE-7）",
        items: [
          "States.tsx 新增 ErrorState 组件（图标+标题+说明+可选重试动作），与既有 EmptyState/Loading 共用 --nv-* 令牌与视觉语言，组成「空态/加载/错误」三件套规范",
          "DrawCards 抽卡失败的「错误+重试」块改用统一 ErrorState，错误视觉语言一致",
        ],
      },
      {
        label: "无障碍补课（FE-5）",
        items: [
          "explore 与 game 窄屏抽屉切换的纯图标按钮（sliders/check/grid）补 aria-label（与既有 title 一致）；Modal 关闭键本已带 aria-label='关闭'，workspace 抽屉切换按钮带可见文字「大纲/侧栏」无需补",
        ],
      },
      {
        label: "颜色守卫（ARCH-7）",
        items: [
          "新增 scripts/lint-colors.mjs：扫描 src 下 TS/TSX 的任意十六进制色值（如 bg-[#ff0000]），提醒改用 --nv-* 令牌，防止观感回归；非阻塞（exit 0）",
          "package.json 加 npm run lint:colors；.github/workflows/ci.yml 加软门步骤（|| true 不阻断）",
          "已知残留：global-error.tsx 与 GameOutlineEditor 共 3 处游戏画布深底（#0a0a0f/#0a0a1f/#0d0d2a）为有意硬编码，守卫只拦截新增，不强制改既有",
        ],
      },
    ],
  },
  {
    version: "v0.46.30",
    date: "2026-08-02",
    title: "幂等 seed 脚本（ARCH-5）：prisma/seed.ts + db:seed，16 内置预设可重复播种",
    sections: [
      {
        label: "幂等 seed 脚本（ARCH-5）",
        items: [
          "新增 `prisma/seed.ts`：遍历 16 个内置预设，按 `findFirst({type, title, isBuiltin:true})` 查重，已存在则跳过、否则 `create`，可重复执行不重复插入（幂等）",
          "新增 `npm run db:seed` 命令（`prisma db seed` → `tsx prisma/seed.ts`）；Prisma 7 的 seed 配置从 package.json 的 `prisma.seed` 迁移到 `prisma.config.ts` 的 `migrations.seed`（v7 不再读 package.json）",
          "新增 `tsx` devDependency 作为 seed runner；seed 脚本自包含初始化 PrismaClient（复用 PrismaPg 连接池配置），并用相对路径 import 生成客户端与 BUILTINS，避开 `@/` 别名解析，tsx 可直接运行",
        ],
      },
      {
        label: "单一数据源（去重维护）",
        items: [
          "把 16 个内置预设从 `src/app/api/seed/presets/route.ts` 的 `BUILTINS` 常量抽到 `src/lib/builtin-presets.ts`（相对路径 import stagePlay.json），`/api/seed/presets` 路由与 `prisma/seed.ts` 都从这一处 import，避免两处各维护一份导致漂移",
          "stagePlay.json 用相对路径 `../app/api/seed/presets/stage-play.json` 引用，兼容 tsx/node 直接运行（不依赖 @/ 别名）",
        ],
      },
    ],
  },
  {
    version: "v0.46.29",
    date: "2026-08-02",
    title: "统一 API 错误响应（ARCH-2）：全站路由 catch 收敛到 jsonError",
    sections: [
      {
        label: "统一 API 错误响应（ARCH-2）",
        items: [
          "全站 96 个 API 路由中，约 90 个手写 `return NextResponse.json({error}, {status:500})` 的 catch 块统一收敛到 `@/lib/api-error` 的 `jsonError(e)`；错误响应体固定为 `{error, code?, hint?}`，前端一致解析、排查更省心",
          "两套 `jsonError` 收口：`@/lib/api-error` 的 `jsonError(e: unknown)` 走 `classifyError` 分类（Prisma 码 P1000/P1001/P2021/P2024/P2002 + 网络 + 默认）并带 `hint` 排查建议，为路由异常错误默认通道；`@/lib/api` 的 `jsonError(message, status, code?)` 保留给需精确 4xx 码的 3 个历史路由（presets/[id]、seed/presets、projects/[id]/config）",
        ],
      },
      {
        label: "诚实边界（SSE 与业务契约）",
        items: [
          "8 个 SSE 流式路由（characters/classify、characters/expand、import/commit、import/parse、import/quick、lorebook/expand、lorebook/import、lorebook/summarize）按设计走 `send({type:'error'})` 推送，不套 jsonError（流式无 HTTP 响应体可返回）",
          "`/api/settings/test` 保留 `{ok:false, error}` 业务契约（前端 `setTestResult` 依赖 `ok` 字段），但其 catch 内错误文本改用统一 `classifyError(err).error` 提取，兼顾一致与兼容；`/api/tools/execute` 为 `@deprecated` 且契约为 `{success,data,error,toolName}`，保留原结构不强行套 jsonError",
          "`/api/presets/import` 的 catch 原调用 `@/lib/api` 的 `jsonError(e)`（e:unknown 与该签名 `message:string` 冲突）导致 tsc 报错，随本单元把 import 源改到 `@/lib/api-error` 一并修复",
        ],
      },
    ],
  },
  {
    version: "v0.46.28",
    date: "2026-08-02",
    title: "后端健壮性：Prisma 连接池上限（BE-6）+ LLM 超时统一常量（BE-8）",
    sections: [
      {
        label: "Prisma 连接池上限（BE-6）",
        items: [
          "`src/lib/prisma.ts` 的 `PrismaPg` 适配器显式传入 `pg.PoolConfig`：`max`（默认 10，可用 `PRISMA_POOL_MAX` 环境变量调大）+ `idleTimeoutMillis: 30000` + `allowExitOnIdle`，高并发流式请求下避免连接耗尽抛出 `P2024`",
        ],
      },
      {
        label: "LLM 超时统一常量（BE-8）",
        items: [
          "`src/core/llm/client.ts` 抽出 `export const LLM_REQUEST_TIMEOUT_MS = 300_000`，替换散落在 `chat`/`chatStream` 的两处 `AbortSignal.timeout(180_000)`/`(300_000)`；所有 LLM 请求共用同一超时，语义一致、排查慢调用更简单",
        ],
      },
      {
        label: "诚实边界（BE-7 / BE-8 删除）",
        items: [
          "BE-7 复核：读 `characters/expand` 与 `stats/monitor` 源码——`expand` 预处理是必要顺序写（拆卡/合并需逐行 update/delete），无循环内 `findMany` 的 DB N+1；`monitor` 已用 `select` 只取所需字段 + `Promise.all` 并行 + DB `aggregate/groupBy` 算 LLM 成本，剩余 JS 归约是对单次 `findMany` 结果的 O(n) 单遍、`dailyWords` 按天聚合本需逐行 `updatedAt`——改成一堆 `count`/`aggregate` 反而增加 DB 往返且无收益，故未改",
          "BE-8「删除 11 个 deprecated 端点」与 U5 阶段已定「不删代码、保留给脚本/SDK」决策冲突，本单元不删除；`maxDuration` 按操作差异设置（单聊 60s / 整书导入 300s）属合理，不强制统一",
        ],
      },
    ],
  },
  {
    version: "v0.46.27",
    date: "2026-08-02",
    title: "空态统一（FE-4/BUG-9）+ 导入向导批量删除二次确认（BUG-13）",
    sections: [
      {
        label: "合并重复 EmptyState（FE-4 / BUG-9）",
        items: [
          "删除 `src/components/ui/EmptyState.tsx`（旧版用 `hint`、无 `className`、视觉偏小），全局统一走 `States.tsx` 的 `EmptyState`（保留 `description` 语义 + 支持 `className`）",
          "`CharacterList` / `StorylineList` / `RulesPanel` / `WorldEntryList` 4 处 import 改到 `States.tsx`，`hint=` 全部改为 `description=`，空态视觉与引导文案全站一致",
        ],
      },
      {
        label: "导入向导批量动作二次确认（BUG-13）",
        items: [
          "`ImportWizard.handleRemoveAllUnconfirmed` 清空全部未确认项前，先弹 `confirmDialog({ danger: true })` 让用户确认，避免误清空尚未写入数据库的章节/角色/词条",
        ],
      },
      {
        label: "诚实边界（BUG-1）",
        items: [
          "经核查，角色删除的「无确认弹窗、无 loading 态」症状已在 FE-8 重构中由 `CharacterList` 的 `useConfirmDelete`（确认弹窗 + 忙态锁定）解决；`LeftPanel` 内联 fetch 仅作 `deleteFn` 被 hook 托管，故本单元不重复修、仅做现状确认",
        ],
      },
    ],
  },
  {
    version: "v0.46.26",
    date: "2026-08-02",
    title: "轻量服务端状态层：useApi 缓存 + 失效，与 store 联动终结列表陈旧",
    sections: [
      {
        label: "轻量服务端状态层（FE-9）",
        items: [
          "新增 `src/hooks/useApi.ts`：自封装 mini React-Query 原语——进程内 Map 缓存 + `staleTime`（默认 30s）+ 失效订阅，零新 npm 依赖",
          "导出 `useQuery(key, fetcher, opts)` / `invalidateQuery(key)` / `invalidateQueries(prefix)`，为 70+ API 的缓存/失效迁移提供统一基础",
        ],
      },
      {
        label: "试点 + 与 FE-8 联动",
        items: [
          "仪表盘项目列表率先改用 `useQuery(\"projects:list\", ...)`：挂载自动拉取、删除/重试即 `refetch`、30s 内命中缓存省重复请求",
          "workspace 内角色/世界书/设定保存完成 → `refreshAfterMutate` 既刷新本页 store（FE-8）又 `invalidateQueries(\"projects\")` 让仪表盘列表回到新鲜，彻底解决「列表陈旧/重复拉取」",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "未一次性迁移全部 70+ 端点：计划原文「可先在新页面试点，再逐步迁移」，盲改全站风险高，故先落地原语 + 仪表盘试点 + store 联动，作为后续迁移地基",
          "缓存为进程内（非持久化），刷新页面即清空，符合本地工具定位；tsc 零错误，零新依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.25",
    date: "2026-08-02",
    title: "状态管理收口：useProjectStore 接管 workspace 实体数据，双源陈旧问题终结",
    sections: [
      {
        label: "store 接管为唯一源（FE-8）",
        items: [
          "扩展 `useProjectStore`：持有 `project`（章节/角色/世界书/故事线/文风卡全量）+ `rules`，`loadProject` 成功后 `setProjectData(data)` 统一写入；workspace 页移除本地 `useState project`，改为 `useProjectStore(s => s.project)` 读取",
          "`LeftPanel`/`RightPanel` 不再接收 `project` 大对象 prop，内部 `useProjectStore(s => s.project)` 直读——去掉了最重的实体数据 prop drilling",
        ],
      },
      {
        label: "原子操作 + 消除双源",
        items: [
          "新增粒度 action：`updateNode/addNode/removeNode/upsertCharacter/upsertLore/upsertRule/patchProject/setStyleCard/reset`，面板可改局部而非整体 reload",
          "终结「本地 project 与 store 并存、编辑后漏刷导致列表旧」的老问题：store 是唯一真相，订阅面板自动刷新",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "回调类 prop（onGenerateOutline 等动作）仍逐层透传——动作不是数据、不存在陈旧问题，留作后续增量优化",
          "未做 30-prop 100% 清零：计划原将 FE-8 排在 ARCH-6 测试护栏之后（本冲刺未建测试体系），无测试兜底下不盲目大改全页以防回归；tsc 零错误，零新依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.24",
    date: "2026-08-02",
    title: "项目备份包 .nfproject：整本设定一键打包，换电脑 / 送搭档不必懂数据库",
    sections: [
      {
        label: "备份包导出（FE-N2）",
        items: [
          "工作台工具栏新增「备份包」按钮，点击即触发 `GET /api/projects/[id]/backup` 下载 `.nfproject` 文件（Content-Disposition 附件）：内含 DB 该项目的全部表——章节 / 角色 / 世界书 / 规则 / 文风卡 / 分支 / 剧情线 / 世界表，纯 JSON 可人读",
          "仪表盘顶栏新增「导入备份」按钮（`<input type=file accept=.nfproject>`），选文件后 `POST /api/projects/import`，校验 `format===\"nfproject\"` 后落库为新项目并自动跳转新工作台",
        ],
      },
      {
        label: "导入即重映射",
        items: [
          "导入时剥离旧 id / 时间戳 / 关联字段，新建项目后重建子表；storyNode 两段式回填 parentId / branchId，lorebookEntry 回填 parentId / relatedEntryIds，保证关联完整且指向新数据",
          "导入项目名自动加「（导入）」后缀，与原项目互不干扰——是新增而非覆盖，避免误删原稿",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "数据模型纯文本 / JSON，无二进制附件，故 JSON 即完整备份（计划原写「zip + 附件」，实际无需 zip 即可完整携带，保持单文件可读）",
          "仅实现「导入为新项目」一种策略（计划提及的「覆盖」未做，覆盖风险高、易误伤原稿，本地工具以安全优先）；tsc 零错误，零新依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.23",
    date: "2026-08-02",
    title: "全局命令面板 Cmd/Ctrl+K：项目一大，搜索即达，专业感拉满",
    sections: [
      {
        label: "命令面板（FE-N1）",
        items: [
          "根 layout 挂载全局 `<CommandPalette />`：监听 Cmd/Ctrl+K 切换，也可由仪表盘顶栏「搜索 ⌘K」按钮派发 `nf-open-command-palette` 事件打开",
          "从 `usePathname` 解析当前 `projectId`，打开时 `GET /api/projects/[id]` 拉取 nodes/characters/lore/rules 建内存索引（项目详情接口已补 `rules: true`）；输入即过滤标题/副标题，↑↓ 选择、Enter 跳转、Esc 关闭",
        ],
      },
      {
        label: "跳转即定位",
        items: [
          "章节结果 → `/workspace/[id]?node=节点ID`，workspace 页新增 `useSearchParams` 效果应 `?node` 自动 `handleSelectNode` 选中该章；`?editCharacter`/`?editLore` 直接打开对应编辑弹窗；`?tab` 切左栏页签",
          "角色 / 世界书 / 规则结果分别回车打开编辑 / 跳规则页签；全局动作（新建章节 / 设置 / 探讨 / 拆书 / 创意工坊 / 回收站 / 主页）始终可用，不在项目页时面板自动聚焦这些动作",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "检索走前端内存索引（打开时拉一次当前项目数据），不上 ES / 全文库——符合计划「中」量级，项目内实时性足够；若需跨项目全局搜后续可加服务端接口",
          "workspace 页加 `export const dynamic = 'force-dynamic'` 以安全使用 `useSearchParams`（避免静态预渲染的 Suspense 报错）；全量 tsc 零错误、零新 npm 依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.22",
    date: "2026-08-02",
    title: "软删除 + 回收站：删项目不再物理抹掉，手滑可救",
    sections: [
      {
        label: "软删除（BE-2）",
        items: [
          "Project 模型新增 `deletedAt`（软删除标记）；`DELETE /api/projects/[id]` 改为 `update` 设 `deletedAt = now()`（软删除）而非 `delete`（物理删），子表均 `onDelete: Cascade` 故随项目软删一起被列表隐藏、不丢数据",
          "`GET /api/projects` 列表加 `where: { deletedAt: null }` 过滤，主页与所有取项目列表处只显示活跃项目；单项目 `GET /api/projects/[id]` 仍正常返回（直接 URL 进旧项目仍可用）",
        ],
      },
      {
        label: "回收站页面",
        items: [
          "新增 `GET /api/projects/recycle`（列出 `deletedAt != null`）、`POST /api/projects/[id]/restore`（清 deletedAt 恢复）、`POST /api/projects/[id]/purge`（硬删除，级联清全部子表）",
          "新增 `/recycle` 回收站页面：列出已删项目（含删除时间 + 角色/词条/节点计数），一键「恢复」或「彻底删除」（带二次确认）；主页顶栏加「回收站」入口；删除确认文案改为「移入回收站，可在回收站恢复」",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "软删除仅「隐藏」不「自动过期」——未做「保留 N 天自动清理」定时任务（本地工具无需紧迫清理，避免误删真数据；如需可后续加 cron 或启动时清理）",
          "全量 tsc 零错误、零新 npm 依赖；字段经 `prisma db push` 同步本地 PG；彻底删除走硬删除 + 级联，与旧行为一致但变为显式「彻底删除」按钮，非默认路径",
        ],
      },
    ],
  },
  {
    version: "v0.46.21",
    date: "2026-08-02",
    title: "正文版本历史与一键回滚：AI 重写再也不怕把写好的稿子改没了",
    sections: [
      {
        label: "版本快照（BE-1）",
        items: [
          "新增 `StoryNodeRevision` 表（nodeId / 版本号 version / 正文全文 content / 字数 / 来源 source / 时间），在 `src/core/pipeline/post-processor.ts` 写库前单点快照（覆盖所有走后处理管线的 AI 写 / 重写 / 润色 / 自动填表），并在 `src/app/api/story/nodes/[id]` 的 PUT（手动保存）写前也快照",
          "去重逻辑：若上一版内容与本节点最近一次快照完全相同则跳过，避免微调 / 频繁保存产生大量重复版本；空正文不快照；快照失败静默忽略，绝不阻断正文生成",
        ],
      },
      {
        label: "历史版本抽屉与回滚",
        items: [
          "编辑器状态栏新增「历史」按钮，打开统一 Modal 抽屉：左列本节点全部版本（版本号 / 来源标签 / 字数 / 时间），右栏预览选中版本正文，底部「回滚到此版本」一键恢复",
          "回滚 API `POST /api/story/nodes/[id]/rollback`：先把当前正文自动备份为「回滚快照」再覆盖，保证回滚可逆；成功后自动刷新节点内容；列表 / 详情分别由 `GET /revisions` 与 `GET /revisions/[revId]` 提供",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "仅 v0.46.21 起产生的版本有记录，此前的历史正文无快照（无法穿越回溯）；来源标签如实区分 AI 生成 / 重写 / 润色 / 手动保存 / 回滚快照",
          "全量 tsc 零错误、零新 npm 依赖；表经 `prisma db push` 同步本地 PG；快照为「安全网」，失败静默不影响主流程",
        ],
      },
    ],
  },
  {
    version: "v0.46.20",
    date: "2026-08-02",
    title: "AI 成本看板：真实 token 用量与估算花费落库，统计面板一眼看清本月 AI 花了多少",
    sections: [
      {
        label: "Token 落库与成本估算（BE-3）",
        items: [
          "新增 `LlmCallLog` 表（时间 / 模型 / 角色 / 输入·输出·总 token / 估算成本 / BaseURL / 是否故障转移），在 `src/core/llm/client.ts` 的 `chat` 成功返回、`chatStream` 流正常完成时（readStream 末尾 `onUsage` 回调）单点 fire-and-forget 落库，覆盖所有走 client 的生成 / agent / game / explore / dissect，不漏",
          "内置常见模型每百万 token 单价表（`lib/llm.ts` 的 `MODEL_PRICING`，含 DeepSeek / GPT / Claude / 通义 / 智谱 / Kimi 等 20+ 项），`estimateCost(model, prompt, completion)` 按模型名关键字匹配估算美元成本；未知模型标「单价未知」不伪造成本",
        ],
      },
      {
        label: "成本看板 UI",
        items: [
          "统计面板 MonitorPanel 新增「AI 成本（全项目 · 本月）」区块：本月调用次数 / Token 总量 / 估算花费（¥，按 7.2 汇率折算并标注 ≈$）/ 记录起始日，附按模型分布（次数·token·花费）小条",
          "monitor 路由 `/api/stats/monitor` 新增 `llmUsage` 聚合（本月 `groupBy model` 的 count/sum）；原字数估算 Token 区块保留不动",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "client 层不持有 project 上下文，故看板做「全局」聚合并明确标注「全项目」——不伪装 per-project 精确统计（如需 per-project 需在调用链注入 projectId，属独立优化）",
          "仅记录 v0.46.20 之后产生的调用，历史无数据；UI 在无记录时显示「暂无记录——自 2026-08-02 起累计」，不假装历史花费；价格随供应商调价失真，UI 标注「估算」",
          "全量 tsc 零错误、零新 npm 依赖；落库失败静默忽略不影响主流程；表经 `prisma db push` 同步本地 PG（无迁移历史文件）",
        ],
      },
    ],
  },
  {
    version: "v0.46.19",
    date: "2026-08-02",
    title: "LLM 重试 + 故障转移：模型抽风时自动退避重试 / 切备用模型，写作几乎无感",
    sections: [
      {
        label: "重试与退避（BE-4）",
        items: [
          "核心 LLM 客户端 `src/core/llm/client.ts` 的 `chat` / `chatStream` 接入指数退避重试：429 限流 / 5xx 服务端异常 / 网络不可达（fetch TypeError）默认重试 3 次，退避 600ms × 2^(n-1) 封顶 8s 并带 ±20% 抖动，避免瞬时抖动直接断生成",
          "4xx 鉴权/配置错误（401/403/404/400）视为不可重试——直接抛出 `mapLLMError` 中文提示，不浪费重试次数（这类是 Key 配错，重试无意义）",
        ],
      },
      {
        label: "故障转移（多模型兜底）",
        items: [
          "`LLMConfig` 新增 `fallbackModels: FallbackModel[]` 链；主模型重试耗尽后依次用备用模型重发整段请求（换 model / baseURL / apiKey）。配置经 `process.env.LLM_FALLBACK` 注入（形如 `deepseek-v3@https://api.deepseek.com,Pro/xxx@https://api.siliconflow.cn`），不配则纯重试、零 schema 改动",
          "call 链抽象为「主模型 → 备用模型」统一遍历，对所有生成/agent/game/explore/dissect 入口透明生效；设置页可视化开关留待后续（配置入口已就绪，未伪装「已配 UI」）",
        ],
      },
      {
        label: "流式安全与诚实边界",
        items: [
          "流式生成仅在「建立连接阶段」（fetch 失败 / 首 token 前 HTTP 错）重试与切换备用；一旦进入 token 流即不再重试/切换，避免重复输出污染已生成正文",
          "遗留路径 `src/lib/llm.ts` 的 `callLLM`（个别旧路由）同步补同等指数退避重试，但不带 fallback（避免范围膨胀）；全部为本地运行时逻辑，不引入任何部署/服务器组件，符合「本地自用、不做真实网络」定位",
        ],
      },
    ],
  },
  {
    version: "v0.46.18",
    date: "2026-08-02",
    title: "响应式补齐：explore 探讨页 / game 游戏页三栏抽屉化（窄屏不再挤压）",
    sections: [
      {
        label: "响应式补齐（FE-6）",
        items: [
          "explore 探讨页三栏（构建配置 w-80 / 中栏 / 已采纳 w-72）与 game 游戏页三栏（左信息 w-52 / 中栏 / 右信息 w-64）参考 workspace 主页补 `lg:` 抽屉：左右栏在 `<lg` 变 `fixed inset-y-0 left/right-0 z-40 w-* max-w-[85vw] h-full transition-transform`，开 `translate-x-0`、关 `-translate-x-full`；`lg:static lg:z-auto lg:shrink-0 lg:w-* lg:translate-x-0 lg:transition-none` 复位，桌面三栏并排零回归",
          "窄屏顶部新增抽屉切换按钮（`lg:hidden`）：explore 用 `sliders`/`check` 图标分别开构建配置/已采纳抽屉，game 用 `sliders`/`grid` 图标开关左右栏；中栏始终 `flex-1 min-w-0` 全宽不被压扁",
        ],
      },
      {
        label: "遮罩与交互",
        items: [
          "三栏容器末尾新增 `lg:hidden` 半透明遮罩：`(leftDrawerOpen || rightDrawerOpen)` 时渲染 `fixed inset-0 z-30 bg-black/50`，点击即关两栏；桌面 `lg:hidden` 自动隐去、不拦截交互",
          "explore 桌面「构建配置」内联开关改为 `hidden lg:inline-flex`（与窄屏抽屉切换分工清晰）；原 `showConfig` 状态保留控制桌面内联可见性",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "dissect 拆书页经 grep 核查本就是单栏 `max-w-6xl mx-auto` 表单（无 `grid-cols-*` / 多列并排），窄屏天然不挤压——未做无意义改写，避免 cargo cult 式硬凑「单栏堆叠」",
          "game 页根布局 `flex h-screen flex-col overflow-hidden` + 三栏 `flex flex-1 overflow-hidden` 保持不变，抽屉 `fixed` 脱离文档流后中栏自然占满，零布局回归",
          "全量 tsc 零错误、零新 npm 依赖；未在真机窄屏实跑手感，建议作者本地缩窗确认抽屉开合与遮罩点击收起",
        ],
      },
    ],
  },
  {
    version: "v0.46.17",
    date: "2026-08-02",
    title: "弹窗统一收口：22 个手写遮罩全部接入统一 Modal 基座（focus trap + ESC + 滚动锁）",
    sections: [
      {
        label: "弹窗统一收口（FE-3）",
        items: [
          "全项目 22 个业务弹窗（角色编辑/创建、世界书编辑、风格编辑、导入向导、设置导入、记忆衰减、项目配置、生成前确认、抽卡、扩展结果、工具箱、剧情线、规则面板、建表、首页公告、创意工坊上传、导出、大纲、自动化设置、构建配置等）的手写 `fixed inset-0 z-50 bg-black/60` 遮罩全部删除，统一替换为 `<Modal open onClose={...} bare panelClassName=\"...\">`",
          "统一基座 `src/components/ui/Modal.tsx` 自带：focus trap（Tab/Shift+Tab 在弹窗内循环不逃逸）、ESC 关闭、body 滚动锁、`role=\"dialog\" aria-modal` 无障碍语义——此前这些能力散落在各弹窗的 `useFocusTrap` + 手写遮罩里，现在只维护一处",
        ],
      },
      {
        label: "bare 模式与零破坏迁移",
        items: [
          "Modal 新增 `bare`（无默认标题栏）+ `panelClassName`（透传宽度/布局类）+ `header`（自定义头部插槽）+ `showClose`（bare 模式下右上角关闭键）四个 prop，统一「遮罩外壳 + 关闭行为」而保留各弹窗内部结构与样式",
          "bare 模式不再强加 `max-h-[88vh] overflow-y-auto`，把高度与滚动完全交给 `panelClassName`，避免与「头部固定 + 内容区滚动」类弹窗（生成前确认、抽卡、导入向导等）布局冲突",
          "DialogUI 的 `DialogOverlay` 已退役不再被任何业务组件引用，统一走 Modal",
        ],
      },
      {
        label: "关闭语义诚实保留",
        items: [
          "原「点遮罩不关闭」的弹窗（构建配置、建表、创意工坊上传、首页公告）用 `closeOnOverlay={false}` 诚实保留原交互；导入向导保留 `step === \"input\" || \"done\"` 才可点遮罩关闭的语义；其余统一点遮罩 / ESC 关闭",
          "全量 tsc 零错误、零新 npm 依赖；grep 复核 `src` 下已无残留手写业务弹窗遮罩（Modal 自身、移动抽屉、StyleSelector 下拉、toast、游戏画布、粒子特效等合法保留）",
        ],
      },
    ],
  },
  {
    version: "v0.46.16",
    date: "2026-08-02",
    title: "UI 装饰 emoji 收口：76 处 JSX 文本装饰 emoji 统一替换为 Icon 图标",
    sections: [
      {
        label: "UI 装饰 emoji 收口（FE-2）",
        items: [
          "用 ts-morph AST 精准命中 components/app（非 api）里把 emoji 当作装饰图标的 JSX 文本节点（JsxText），共改写 18 个文件、76 处，统一替换为 `<Icon name=\"...\" size={N} className=\"inline-block align-text-bottom shrink-0\" />`",
          "图标尺寸随祖先容器自适应（text-2xl→18 / text-3xl→20 / 默认 15），inline 对齐基线、不挤压文字；缺失 import 时自动补 `import { Icon } from \"@/components/ui/icons\"`",
        ],
      },
      {
        label: "图标库扩容",
        items: [
          "src/components/ui/icons.tsx 新增 26 个 lucide 语义图标：brain / mountain / messageCircle / smile / heart / scale / coffee / compass / hand / link / flask / radio / coins / clapperboard / swords / flower / rocket / drama / sliders / ruler / key / ban / party / landmark / paperclip / square",
          "覆盖被替换 emoji 的全部语义（📥下载 🤖AI 🎨风格 ⚡节奏 🧠记忆 🎯目标 💡灵感 🎉庆祝 📚章节 🌍世界 👥角色 🎒道具 📊图表 🔮伏笔 🗺地图 ⚖权衡 ☕氛围 🔗关联 🔬考据 📡广播 💰成本 🎬脚本 🥋交锋 🌸意境 🚀高潮 🎭戏剧 🎚参数 🏯场景 🚫禁止 📌锚点 等）",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "严格区分三层 emoji：①协议层（API 响应串 ✅❌⚠️，前端靠 startsWith(\"✅\") / ===\"❌失败\" 解析）②提示词层（LLM prompt 分隔符 ★、实体高亮 🟢🟡🔵）一律不动，动了破坏前后端契约或降 prompt 质量——本改写只命中 JsxText，天然不触碰这两层",
          "大插画 emoji（text-4xl/5xl 容器内，如空态 📭、成功大勾 ✅）保留为视觉焦点，换成小线性图标会视觉退化",
          "已知残余（如实披露，不伪装全清）：Type B 数据字段 emoji（DissectDimensions / ContextPreview 的 `icon: \"📚\"` 类，需改 render 链且半数无对应图标）与 JS 字符串字面量 emoji（如 DissectAdaptPanel 按钮文案 `🎨 应用修改`、ContextPreview 三元 `✅/❌` 状态标）本次未纳入，留待后续专项",
        ],
      },
    ],
  },
  {
    version: "v0.46.15",
    date: "2026-08-02",
    title: "视觉一致性收口 + 浅色主题：语义状态色全面令牌化，新增昼面换肤",
    sections: [
      {
        label: "视觉一致性收口（FE-1）",
        items: [
          "全站 4 类语义状态色（成功绿 / 危险红 / 提醒琥珀 / 信息青）从散落的 emerald-400/500/600、rose、amber、sky、green、yellow、blue、red 等 200+ 处硬编码色值，统一收敛到 --nv-success / --nv-danger / --nv-warning / --nv-info 设计令牌",
          "为支持该收敛，在 Tailwind @theme 注册 success/danger/warning/info 语义别名（含 -soft 变体），原生支持 text-success、bg-danger/20 等带透明度的写法",
          "中央图标色板 iconColor 与 StatusDot 组件同步改走令牌，全站状态点/图标颜色一处定义、处处一致",
        ],
      },
      {
        label: "浅色主题（FE-N4）",
        items: [
          "新增「虚空玻璃·昼面」浅色主题：仅通过覆盖设计令牌实现，组件零改动即可换肤——白底玻璃面 + 深色描边 + 深色正文",
          "根布局首屏前注入防闪烁脚本读取 localStorage('nf-theme')；新增 Sun 图标与 ThemeToggle 切换器，置于设置页「外观」区与全局状态横幅右上角",
          "主题偏好存本机、刷新保持；并同步更新 meta theme-color",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "统一语义色是 FE-N4 浅色主题能真正可用的前提——组件若仍直接写 red-400 等会绕过令牌、浅色模式下对比度崩溃，故本次将状态色收敛做全（cyan 作为游戏节点专属强调色有意保留）",
          "全量 tsc 零错误；Tailwind 仅新增语义别名、零新运行时依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.14",
    date: "2026-08-02",
    title: "统一 Loading 态：裸 emoji 转盘全面替换为统一 Icon 旋转图标",
    sections: [
      {
        label: "裸 emoji 转盘清零",
        items: [
          "拆书上传/进度、拆书详情页加载与等待、探索页大纲生成、卡片浏览生成中、文风扫描、仿写/转换/改编等长操作——原用裸 ⏳ emoji 当 CSS 旋转图标（样式失控、与全站 SVG loader 割裂），全部替换为统一 <Icon name=\"loader\" className=\"animate-spin\" />",
          "拆书维度网格状态字形 ✅❌⏳⬜ 一并收编为 Icon check/x/loader/circle，观感与全站状态体系一致",
        ],
      },
      {
        label: "按钮标签 loading 对齐",
        items: [
          "扫描/仿写/转换/创建改编等异步按钮的「⏳ 文案」前缀改为 Icon 旋转 + 文案，与 settings 页「测试中…/检索中…/保存中…」的 loader 风格完全对齐",
          "异步按钮本身已有 disabled 保护（canStart/scanning/converting/creating），loading 态仅做视觉统一，行为不变",
        ],
      },
      {
        label: "诚实边界与取舍",
        items: [
          "严格区分「UI loading 视觉」与「数据流协议」：API 流式进度串、LLM 提示词、状态检测串（startsWith(\"✅\") / === \"❌失败\"）中的 emoji 属协议层，一律不动，避免破坏前后端契约",
          "全量 tsc 零错误；零新依赖；纯视觉收口，无逻辑改动",
        ],
      },
    ],
  },
  {
    version: "v0.46.13",
    date: "2026-08-02",
    title: "AI 生成落库确认：写了多少、存没存一目了然",
    sections: [
      {
        label: "生成完成显式确认",
        items: [
          "正文生成流 done 事件触发 toastSuccess「正文已生成并保存 ✓」，比状态栏更显眼，明确告知作者本次产出已落库",
          "toast 置于 loadProject() 之前调用，避免读取到刷新前的旧字数导致误导；精确字数交由状态栏回填",
        ],
      },
      {
        label: "状态栏字数回填",
        items: [
          "done 状态由「已落库 ✓」增强为「已落库 ✓ · 本章 X 字」，X 取自 loadProject 刷新后的 selectedNode.wordCount（生成后已含新字数）",
          "作者一眼看到本章实写字数，确认 AI 产出真实落库，消除「写了一半会不会丢」的焦虑",
        ],
      },
      {
        label: "诚实修正与取舍",
        items: [
          "原计划「AI 插入可控/预览确认」基于「AI 会覆盖手写内容」假设——本产品无作者手写入口（正文由 AI 流 append 驱动），覆盖恐惧不成立",
          "P4 改为聚焦真实缺口（落库确认 + 字数反馈），与 P1 状态栏过程状态（草稿保存中/已落库）互补而非重复；全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.11",
    date: "2026-08-02",
    title: "保存状态透明化：消除「AI 写的内容会不会丢」焦虑",
    sections: [
      {
        label: "正文落库状态可见",
        items: [
          "CenterPanel 底部状态栏新增保存指示：AI 生成流传 span「草稿保存中…」(loader 旋转) → 完成后绿色「已落库 ✓」(check)，空闲时不打扰",
          "复用既有 genStep 状态（generating/done），零新状态、零新依赖；AI 流每 300 字落库草稿，状态指示与真实落库节奏一致",
        ],
      },
      {
        label: "大纲保存正向反馈",
        items: [
          "onEditOutline 成功分支补 toastSuccess「大纲已保存 ✓」，填补此前仅失败 toastError、成功静默变回显示态的缺口",
          "作者点保存后即时确认写入成功，不再凭「文本消失」猜测",
        ],
      },
      {
        label: "诚实修正与取舍",
        items: [
          "原计划「手写正文保存透明化」经侦察不成立：本产品正文完全由 AI 生成流驱动（生成/重写/微调/Flash/抽卡），无作者手写 textarea 入口，displayContent 为只读 MarkdownViewer",
          "P1 改为聚焦真实缺口（大纲反馈 + AI 落库确认），避免做假功能；全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.10",
    date: "2026-08-02",
    title: "稳定性：全局错误边界防白屏",
    sections: [
      {
        label: "React 错误边界兜底",
        items: [
          "新增 src/components/ui/ErrorBoundary.tsx：class 组件捕获渲染 / 生命周期抛错，降级为「该模块出错 + 重试」友好 UI，不再整页白屏",
          "工作台三栏各自包裹：左栏「大纲」、中栏「编辑器」、右栏「侧栏」独立容错——单栏组件抛错不影响其他栏写作会话",
          "根渲染树外加顶层兜底（「工作台」）：兜住工具栏 / 引导弹窗 / 各对话框等局部未覆盖处的意外，作为最后防线",
        ],
      },
      {
        label: "成品容错与取舍",
        items: [
          "此前任一面板抛错即整页白屏、作者正在写的会话被摧毁；本次让局部故障可隔离、可重试恢复",
          "错误上下文记录到 console，不影响交互；零新 npm 依赖，全量 tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.9",
    date: "2026-08-02",
    title: "互操作③：角色卡 ↔ 冲突推演互相照亮",
    sections: [
      {
        label: "冲突推演 · 标注涉及角色",
        items: [
          "POST /api/generate/conflict 新增 characters 字段：systemPrompt 要求每个冲突 / 转折选项标注「涉及角色」（从【主要角色】清单挑选真实名字，不涉及则为空数组）",
          "后端按 CharacterCard 的 name + aliases（大小写不敏感、去重）精确匹配成真实角色卡 id，返回每个选项 characters:[{id,name}]；别名也能匹配，匹配不到的角色名自动丢弃，避免不可点标签误导",
        ],
      },
      {
        label: "ConflictPanel · 一键跳角色卡",
        items: [
          "每个选项卡新增「涉及角色」标签（user 图标），点击即在工作台内打开对应角色卡——复用 workspace 既有 setEditingCharacter 机制，零新增状态",
          "让已做的「角色三层性格（surface/middle/core）」与「冲突推演」两个功能互相点名：从推演一眼看到「谁会被这条冲突考验」，再直达设定深挖",
        ],
      },
      {
        label: "闭环定位与取舍",
        items: [
          "此前冲突推演只出冲突、不点名角色，作者需手动回记忆找角色；本次让「谁被考验」看得见、可直达，推演 ↔ 角色设定形成回环",
          "仍定位为纯建议：冲突推演不写库、决定权在作者；仅补齐「推演 → 角色」的导航断点",
          "全量 tsc 零错误；零新 npm 依赖——复用 CharacterCard 既有 name/aliases/id，匹配在后端一次完成",
        ],
      },
    ],
  },
  {
    version: "v0.46.8",
    date: "2026-08-02",
    title: "互操作：每日目标贯穿写作与统计",
    sections: [
      {
        label: "① 编辑器状态栏 · 每日目标实时可见",
        items: [
          "CenterPanel 底部状态栏新增「今日 X / 目标 Y · Z%」胶囊：dailyGoal 读自 localStorage（与 MonitorPanel 同 key），今日字数来自 monitor 接口 dailyWords（与统计面板同源算法），保存后 workspace 自动刷新 monitorTodayWords 形成闭环",
          "达标时胶囊从灰转金 + animate-pulse 脉冲，并通过 localStorage 每日去重弹一次 toastSuccess「今日目标达成 ✨ 继续保持节奏」；跨标签页改目标经 storage 事件同步",
        ],
      },
      {
        label: "② 统计面板 · 近 7 天打卡节奏",
        items: [
          "MonitorPanel 每日目标区块新增一排 7 格周历：达标日显示金色 ✓、未达标显示字数（k 缩写）、今日 ring 高亮，复用既有 dailyWords 近 14 天聚合与 dailyGoal 判定",
          "把「单日进度环」扩展为「可回看的养成轨迹」，让每日目标从看数字变为节奏反馈；纯前端、零新依赖",
        ],
      },
    ],
  },
  {
    version: "v0.46.7",
    date: "2026-08-02",
    title: "互操作闭环：冲突推演一键落地为剧情节点",
    sections: [
      {
        label: "D4 冲突推演 → 剧情节点回流",
        items: [
          "ConflictPanel 每个选项卡新增「应用为剧情节点」按钮：将 AI 推演的冲突 / 转折（标题 / 触发 / 张力 / 走向 / 风险伏笔）一键创建为大纲章节（type=chapter，结构化写入 outline），打破此前「只展示 + 复制、不进大纲」的断裂",
          "应用后自动回调 loadProject() 刷新左侧大纲树，新章节命名「冲突·<标题>」并以 order=Date.now() 排末尾（唯一且靠后），作者可直接在其上续写",
          "保留「复制」按钮，作者亦可先复制再手动粘贴；HTTP 失败 / 网络异常均有 toast 提示，不改变冲突推演「纯建议、决定权在作者」的定位",
        ],
      },
    ],
  },
  {
    version: "v0.46.6",
    date: "2026-08-02",
    title: "成品感打磨收官：冲突推演 / 工具箱 / 导出增强 / 统计补完",
    sections: [
      {
        label: "D4 冲突推演",
        items: [
          "新增 /api/generate/conflict 端点：基于世界观硬规则 + 主角角色卡 + 近 2 章，AI 推演 ≥3 个结构化冲突 / 转折发展选项（title/trigger/tension/outcome/caution），空响应自动重试一次提升稳定性",
          "新增 ConflictPanel 弹窗（工具箱「智能分析」入口）：卡片化呈现选项，顶部明确「仅供参考，最终情节决定权在作者」，每张卡可一键复制",
        ],
      },
      {
        label: "D2 工具箱 + C2 导出增强 + D1/B3",
        items: [
          "工具箱：新建 ToolboxDialog，收拢续写 / 大纲 / 批量 / 摘要 / 抽卡 / 角色 / 工坊 / 表格 / 召回 / 冲突推演 10 项，按 写作辅助 / 内容生成 / 智能分析 三色分类网格",
          "导出增强：统一 ExportDialog（6 格式网格 + 选章范围 + 含大纲开关 + 作者署名）；后端 export 路由扩展 author / chapterIds 参数并透传 DOCX/EPUB/HTML/Markdown/TXT 构建器",
          "统计补完：monitor 端点加近 14 天 dailyWords 聚合；MonitorPanel 加近 7 天写作节奏柱状图 + 每日目标 conic 进度环（localStorage 持久化）",
          "新手引导：OnboardingModal 三步上手卡；OutlineTree 空态「看示例」经 LeftPanel 透传 onLoadSample 至 workspace 定义 handler（POST /api/seed/sample-project 后跳转）",
        ],
      },
      {
        label: "D3 复核 + E1/E2 压测",
        items: [
          "D3 规则中心 UI：复核发现 RulesPanel 已具备逐条启用 / 禁用 + 分类 / 范围标签 + 状态分组（已禁用区），路线图 🔲 为过时标记，无需重复造轮子（cargo cult 检测应用）",
          "E1/E2 压测：dev 冒烟实测全部关键路径（seed / 导出空边界 / markdown+docx 署名 / conflict / chat / stats）正常；实测中遇到的「中文乱码 / 0 字节 / 400」经隔离定位均为测试环境假象（GBK shell 发送 + dev 首次编译抖动），非产品 bug；真实 5 万字长跑建议作者侧实跑",
        ],
      },
      {
        label: "质量",
        items: [
          "全量 tsc 零错误；延续本地优先、零新 npm 依赖铁律",
        ],
      },
    ],
  },
  {
    version: "v0.46.5",
    date: "2026-08-02",
    title: "开箱即懂 + 投稿闭环：示例项目 / 题材开局 / DOCX 导出",
    sections: [
      {
        label: "开箱即懂 / 投稿闭环",
        items: [
          "B1 一键示例项目：首页新增「看示例」按钮，一键后端播种示范小说《山海拾遗·仙侠》——世界观铁律（全文严禁出现任何现代科技造物 / 修真境界严格分级 / 因果报应必有回响 3 条硬规则）+ 剧情推进倾向 + 主角李尘角色卡（结构化 personality）+ 已写 2 章仙侠示范正文，并自动 syncGlobalPrompt 让规则真正进 globalPrompt 缓存（彻底闭环最初担心的「定义了没用」）；幂等安全，重复点不重复建",
          "B2 题材开局模板库：新增 8 个高频题材骨架（仙侠/都市/西幻/历史/言情/科幻/悬疑/武侠），做成纯静态数据 src/core/templates/genres.ts 前后端共用单一数据源；选题材→后端一键建好项目（世界观铁律+剧情倾向+主角原型+卷纲含三段式大纲+第一章开局钩子）。选静态库而非改造 LLM 分支，避开运行时 API Key 依赖、保证离线可用、确定性最强",
          "C1 导出补全 DOCX：新增零依赖 Word 导出（src/core/docx.ts 复用 epub.ts 的 makeZip 手写 OOXML ZIP 包，中文靠 word/styles.xml 的 w:eastAsia=\"宋体\" 解决乱码），连同既有的 TXT（路线表旧记过时，txt 早已实现）+ 可打印 PDF（HTML 导出项改名「网页 HTML（可打印PDF）」引导浏览器 window.print 成 PDF），现已对齐云笔 6 格式；PDF 走前端打印零额外依赖",
          "三项全部 tsc 零错误、端到端实测通过：示例项目验证 worldview/story_progression 硬规则落库并进 globalPrompt；题材骨架验证世界观词条+卷纲三段式正确写入；DOCX 验证 HTTP 200 + ZIP 魔数 PK + document.xml/core.xml 存在。延续本地优先、零新 npm 依赖铁律",
        ],
      },
    ],
  },
  {
    version: "v0.46.4",
    date: "2026-08-02",
    title: "创意工坊：trirui推荐品牌化 + 导入/导出文件（本地分发）",
    sections: [
      {
        label: "创意工坊 / 本地分发",
        items: [
          "内置预设品牌化：16 个系统示范预设（宫斗表、分阶段人设、古风/快节奏/暗黑文笔、仙侠/现代/西幻世界观、苏苏角色卡、删除思维链、世界书、API 参数、舞台剧风格等）作者统一归为 trirui、标签追加 trirui推荐——这是我们（樊斯瑞项目）设立的创意工坊体系，随仓库 clone 即带、人人可用",
          "新增导入/导出预设文件（酒馆式分发）：创意工坊每张预设卡片加「导出」按钮，生成含 schema 版本与完整内容的 .preset.json 下载；顶部新增「导入文件」按钮，从本机或 GitHub 下载的分享文件一键导入本地库（新后端 POST /api/presets/import，落库为 isBuiltin=false、author=导入，仅本机不共享）",
          "产品方向纠偏并写入计划表与记忆：明确 novel-forge 是本地运行工具（类比 SillyTavern 酒馆），非云端 SaaS；分发靠 git clone 仓库（内置预设随仓库）+ 导入/导出文件分享社区预设，线上演示站 novel-forge-nu.vercel.app 仅是历史展示、非产品必需、额度耗尽无需修",
          "导入与内置清晰隔离：导入路由按 {type,title,isBuiltin:false} 去重防重复；用户上传/导入的预设永不影响系统内置 16 项。端到端验证：导入落库→公开列表可见→清理成功。tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.3",
    date: "2026-08-01",
    title: "创意工坊：内置预设开箱即用 + 上传本地化",
    sections: [
      {
        label: "创意工坊 / 预设可用性",
        items: [
          "修复可用性缺口：此前内置示范预设仅在手动点「载入示范预设」或手动调 /api/seed/presets 时才写入数据库，全新 git clone 后首次打开创意工坊会看到空列表（疑似「本地用不了工坊」）。现改为打开工坊「全部」页签时自动检测——若库中尚无任何内置预设，则自动触发一次播种（接口按 {type,title,isBuiltin} 去重，幂等安全），做到开箱即用",
          "系统预设随软件人人可用：16 个内置预设（宫斗居住表、好感度分阶段人设、古风文笔、仙侠/现代/西幻世界观、快节奏爽文、暗黑史诗、苏苏角色卡、删除思维链正则、世界书条目、API 参数、舞台剧风格等）写进代码 BUILTINS 数组，随仓库分发；任何本地部署都自动拥有这套系统预设",
          "上传弹窗底部新增一行说明：「你上传的预设仅保存在本机数据库，不会上传到任何服务器，也不与其他人共享——纯粹方便你自己随时套用」，明确隐私边界，落实「其他人上传只是给自己方便、不共享数据库」的设计",
          "共享模型厘清并确认无 bug：项目为单用户本地部署（无鉴权、无远程同步），预设只存本人本地 PostgreSQL，跨机器天然隔离；用户上传标记 isBuiltin:false 与系统预设区分。tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.2",
    date: "2026-08-01",
    title: "创意工坊：注入修复 + LLM 丰满预设",
    sections: [
      {
        label: "创意工坊 / 预设",
        items: [
          "修复「定义了没用」真 bug：此前 worldview（定义·规则）/ story_progression（剧情推进倾向）写入 LorebookEntry 后，syncGlobalPrompt 的「世界书」段落只渲染 8 个标准分类，这两类被漏掉；又因默认 depth 无触发词时动态路径不注入，导致用户下达的硬规则对生成完全不生效。现已让这两类作为「静态基础设定」常驻 globalPrompt 缓存（与角色卡/风格卡同级），并从动态触发路径排除避免重复注入——rules 真正落地",
          "新增「LLM 丰满预设」：上传向导顶部加 AI 面板，用户选好类型后用大白话描述（如「舞台剧风格：对白密集、动作夸张、情绪克制」「全文禁止出现男性角色」），后端调已配置的 LLM（模型名/Key 从 AppSettings 读）把松散描述扩展成与向导同字段的结构化 JSON 直接填进表单，用户确认/修改后点「发布」即可；style/worldview/story_progression/lorebook/character/table_template 六类全部支持，非技术用户无需懂 JSON",
          "确认创意工坊内容覆盖三项核心：① 自己的文风(style→StyleCard) ② 定义权·规则系(worldview，硬规则常驻) ③ 剧情推进倾向(story_progression，可融合进规则) 均真实进入写作上下文；世界书(lorebook) 保持关键词触发语义（舞台剧预设即此设计），与常驻规则分层清晰",
          "enrich 端点做了 LLM 输出容错（清理尾部逗号 / 不可见字符），实测六类创意预设全部跑通；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.1",
    date: "2026-08-01",
    title: "创意工坊增强：舞台剧风格预设 + 分类型上传向导",
    sections: [
      {
        label: "创意工坊 / 预设",
        items: [
          "新增「舞台剧风格」lorebook 预设：把酒馆（SillyTavern）世界书格式的舞台剧/话剧文风（角色性格恒定、克制情绪波动、对白密集、动作夸张）转成可一键套用预设，应用即注入话剧写作基调与文风开关",
          "上传预设从「裸 JSON textarea」改为「分类型向导」——style 给文风感觉自由写框 + 视角/节奏下拉、worldview/story_progression/lorebook 给可增删词条编辑器、character 给名/描述/定位、table_template 给表名+列，regex/api_config 保留高级 JSON 入口给懂的人",
          "非技术用户现在无需懂 JSON 即可创造并分享 style / worldview / lorebook / character / table_template 五类预设，门槛从「会写 JSON」降到「会填表」，但保留技术类 JSON 通道不切断高手（用户要求：不要分太细、给他们一点创造力）",
          "清理工坊乱码与显示不全的残留预设，16 个内置预设干净完整；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.46.0",
    date: "2026-08-01",
    title: "结构化表格大列表虚拟滚动（LoreTable 虚拟化）",
    sections: [
      {
        label: "性能 / 大列表（PROCESS/04 待迭代项收官）",
        items: [
          "新增零依赖轻量虚拟列表 hook useVirtualRows（src/hooks/use-virtual-rows.ts）：固定行高 + 上下 overscan 预渲染 + 阈值开关，原理是把「整张表」拆成「视口内一小段 + 撑高占位」，滚到哪算到哪",
          "LoreTable 展开后的表格行渲染接入虚拟化：行数 ≤ 50 走原 <table> 普通渲染（零开销），> 50 自动切换虚拟滚动（max-h 360px 滚动容器 + sticky 表头 + 绝对定位行），万行 auto_facts 大表也不卡",
          "每个表抽独立子组件 LoreTableGrid 持有自己的虚拟状态（符合 React hooks 规则，不能在 map 内直接调 hook）；编辑 / 增行 / 保存按钮与交互完全保留",
          "StorylineList 经评估不做虚拟化：故事线卡片高度不固定（展开/收起差异大），且数据量极小（几条到几十条），固定行高虚拟化会破坏展开交互且零收益——如实取舍，维持原样",
          "不引入 react-window / @tanstack/virtual 等第三方库，避免为小数据量项目背负重依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.9",
    date: "2026-08-01",
    title: "dev hydration 警告根治（时区确定性加固）",
    sections: [
      {
        label: "质量 / 稳定性（PROCESS/04 待迭代项）",
        items: [
          "根因：toLocaleDateString(\"zh-CN\") / toLocaleString(\"zh-CN\") 依赖运行时时区——部署服务器多为 UTC，浏览器为本地时区，跨 UTC 午夜的日期会算出不同字符串，一旦日期显示进入 SSR 阶段即触发 hydration 不匹配（文档记录的「偶发警告」最可疑根因）",
          "修复：给全部 5 处日期/时间格式化统一加 { timeZone: \"Asia/Shanghai\" }，服务器与客户端强制按北京时间计算，输出恒等，从根上消除时区驱动的文本不匹配",
          "范围：首页项目卡片 getTimeAgo 超 30 天分支、ForeshadowingPanel 创建时间、ProjectConfigPanel 套用时间、ImportWizard 两条日志时间、tables 页填表结果时间",
          "根布局 <html> 追加 suppressHydrationWarning（Next.js 官方对根节点环境属性漂移的推荐安全网）；静态排查确认 GameParticles/Math.random、各页 localStorage、getTimeAgo 均处 useEffect 或事件处理，渲染期无不确定性；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.8",
    date: "2026-08-01",
    title: "导出弹层一键复制全文 Markdown",
    sections: [
      {
        label: "功能 / 导出便捷化",
        items: [
          "Toolbar 导出弹层新增「复制全文 Markdown」按钮：点击即把整本书的 Markdown 文本写入系统剪贴板，作者可直接粘贴到微信 / 文档 / 聊天，无需先下载文件再打开（PROCESS/06 导出增强延续）",
          "纯前端实现——fetch 现有 /api/projects/[id]/export?format=markdown 取回已组装的全文文本，再调用 navigator.clipboard.writeText 写入剪贴板；零新依赖、零 schema 变更",
          "三重状态反馈：复制中… / 已复制全文 Markdown ✓ / 复制失败请改用导出文件，提示 2.2 秒自动消失，不阻断创作节奏",
          "复用 v0.45.0 已建的导出路由与章节组装逻辑，纯入口增量、零破坏性；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.7",
    date: "2026-08-01",
    title: "角色卡性格三层创作字段",
    sections: [
      {
        label: "功能 / 角色塑造",
        items: [
          "角色编辑弹窗（CharacterEditDialog）「性格详析」区块新增三层可选字段：表层 · 对外展现 / 中层 · 日常互动 / 内核 · 本质驱动（PROCESS/06 P2-1）",
          "三层直接并入 personality Json（surface/middle/core），零 schema 变更、零迁移；保存用 {...fromText(...), surface, middle, core} 展开运算，绝不丢失既有主导/驱动/矛盾/习惯/面具字段",
          "经 src/lib/utils.ts 的 safeJoin（对象值自动拼接）进入写作提示词「性格：…」区块——AI 生成时即感知三层差异，无需改动装配层",
          "AI 补全（autofill）仅回填主导/驱动等已知维度，不触碰你手填的三层；快速创建弹窗保持极简不改；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.6",
    date: "2026-08-01",
    title: "工作区新手引导弹窗",
    sections: [
      {
        label: "功能 / 入场体验",
        items: [
          "工作区（workspace）首次进入新增「新手引导弹窗」：卡片式介绍 5 个核心功能——自动化填表 / 抽卡剧情 / 拆解大纲 / 游戏化激励 / 竞品借鉴打磨（PROCESS/06 P2-3）",
          "复用统一 Modal 基础组件（自带焦点陷阱 / ESC 关闭 / 遮罩关闭 / body 滚动锁定），符合项目无障碍基线；首次访问（localStorage 无 nf_onboarded_v1 标记）才弹出，关闭即写入标记，永不重复打扰",
          "纯前端实现，零 schema 变更、零新依赖；localStorage 不可用时 try/catch 静默忽略，不阻断正常使用",
          "对齐竞品的「欢迎 + 功能引导」入场体验；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.5",
    date: "2026-08-01",
    title: "文风编辑器叙事视角选择",
    sections: [
      {
        label: "功能 / 文风编辑器 UX",
        items: [
          "StyleEditor「文风维度」Tab 新增「🎭 叙事视角」单选组：第一人称 / 第三人称限知 / 第三人称全知 / 第二人称 / 不指定（PROCESS/06 P1-3）",
          "视角选择存入项目 llmConfig.povType；style 路由 GET/PUT 同步持久化该字段，切换后立即刷新 globalPrompt",
          "syncGlobalPrompt 注入系统提示时新增叙事视角区块（中文可读映射，如「第三人称全知（上帝视角，跨越多角色心理）」），兜底读取 llmConfig.povType，下次生成即生效",
          "复用既有风格注入通道，零 schema 变更、零新依赖、tsc 零错误；行为完全向后兼容（旧项目无该字段视为「不指定」）",
        ],
      },
    ],
  },
  {
    version: "v0.45.4",
    date: "2026-08-01",
    title: "右侧 AI 快捷芯片条（一键常用动作）",
    sections: [
      {
        label: "功能 / AI 对话 UX",
        items: [
          "AIChatBar 顶部新增「快捷芯片条」：续写 / 润色 / 写对话 / 查漏 / 修正 / 展开 六个常用动作一键触发（PROCESS/06 P1-2）",
          "芯片本质是把常见意图预填为标准 prompt 直接发送，复用既有 /api/generate/chat 与全部前端动作处理链路，不新增任何 AI 逻辑",
          "生成进行中芯片自动 disabled，避免重复发送；纯入口聚合，零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.3",
    date: "2026-08-01",
    title: "世界模块网格视图（卡片仪表板）",
    sections: [
      {
        label: "功能 / 世界书 UX",
        items: [
          "WorldPanel 的条目区新增「列表 / 网格」视图切换（WorldEntryList 顶部分段控件），网格用 2 列卡片排布，对齐竞品的卡片仪表板概览（PROCESS/06 P1-1）",
          "网格视图复用现有 WorldEntryCard，窄侧栏下也能紧凑排布；左侧实时显示当前板块条目数",
          "切换为组件本地状态（useState），默认仍是列表视图，不影响世界书其它交互；纯 UI 增强、零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.2",
    date: "2026-08-01",
    title: "章节实体彩色徽章（一眼看到 AI 识别了什么）",
    sections: [
      {
        label: "功能 / 编辑器 UX",
        items: [
          "CenterPanel 章节正文标题下新增「实体彩色徽章」：扫描本章出现的角色 / 世界书词条（复用 /api/entities/highlight 的实体名→颜色映射），一眼看到本章涉及哪些 AI 识别实体（PROCESS/06 P0-3）",
          "徽章沿用实体高亮配色（角色统一蓝、世界书按 category 着色），与正文内实体高亮视觉一致；同一实体按 id 去重（别名 / 关键词命中仍指向主实体）",
          "点击徽章直接打开对应「角色查看编辑」或「世界书条查看编辑」弹窗（复用 page.tsx 既有 onEditCharacter / onEditLore id 跳转），无需再去侧栏翻找",
          "配套：/api/entities/highlight 返回的实体增加 id 字段（别名 / 关键词条目指向同一实体 id），供徽章精确跳转；仅 select 增加 id、无 schema 变更，tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.45.1",
    date: "2026-08-01",
    title: "编辑器底部状态栏（写作掌控感）",
    sections: [
      {
        label: "功能 / 编辑器 UX",
        items: [
          "CenterPanel 底部新增状态栏：实时显示 行数 / 字数 / 目标进度 / UTF-8 编码，对齐竞品的作者掌控感（PROCESS/06 P0-2）",
          "字数沿用项目约定 = 字符数（content.length），随正文生成 / 流式输出实时更新；与目标字数对比给出进度百分比，达标时进度文字变绿",
          "目标字数仍由顶部控制栏的数字输入设定（既有功能不变），状态栏为只读展示，纯展示组件、零破坏性",
          "无 schema 变更、无新依赖；tsc 零错误；因 CenterPanel 正文区为 MarkdownViewer 只读预览（章节正文由 AI 生成），状态栏不含光标行列跟踪，改为更有价值的 行数 / 字数 / 目标进度 / 编码",
        ],
      },
    ],
  },
  {
    version: "v0.45.0",
    date: "2026-08-01",
    title: "导出格式扩充 —— 网页 HTML + 电子书 EPUB",
    sections: [
      {
        label: "功能 / 导出",
        items: [
          "导出新增「网页 HTML (.html)」与「电子书 EPUB (.epub)」两种格式，原先仅有 Markdown / 纯文本；满足排版美观、社交分发、电子书阅读三类诉求（PROCESS/06 P0-1）",
          "HTML 单文件导出（buildHtmlDoc）：自带轻量散文→HTML 转换——处理段落（空行分隔）、行内 **粗体** / *斜体*、> 引用、--- 分割线，带目录导航 <nav>、衬线字体排版与署名页脚；可直接浏览器打开，也可被 Word / 公众号排版工具导入",
          "EPUB3 导出（buildEpub）：零新增 npm 依赖，手写 stored（不压缩）ZIP + CRC32 表，mimetype 置于首条且 stored（符合 EPUB 规范要求），依次打包 META-INF/container.xml、OEBPS/content.opf、nav.xhtml（目录）、各 chN.xhtml 章节、colophon.xhtml；微信读书 / Apple Books / Calibre 可直接打开",
          "导出按钮弹层由 2 项扩展为 4 项（Markdown / 纯文本 / 网页 HTML / 电子书 EPUB），Toolbar.onExport 与 page.tsx handleExport 类型统一为 markdown | txt | html | epub；复用现有章节树遍历与字数统计，导出路由按 format 分流；无 schema 变更，tsc 零错误，unzip -t 校验 EPUB 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.44.8",
    date: "2026-07-31",
    title: "远楼层 LLM 摘要 —— 酒馆记忆机制迁移收官",
    sections: [
      {
        label: "功能 / 上下文质量",
        items: [
          "远楼层 LLM 压缩摘要（酒馆 memory 迁移最后一环）：正文生成前，检测短期记忆预算放不下的较早章节，用与正文相同的 LLM 客户端（含项目级覆盖）预生成 ≤240 字中文情节压缩摘要，注入前文回顾区替换原「⚠️ 远楼层…已折叠·非完整原文」标记，保留情节推进/关键转折/角色变化/未回收伏笔，消除模型把截断片段误读为完整剧情而产生的断裂幻觉",
          "新增 core/assembly/distant-summary.ts：summarizeDistantFloor 用非流式 client.chat 生成压缩摘要（temperature 0.3），任何异常（网络/超时/内容过滤空返回）均静默回退到折叠标记，绝不阻断流式出文",
          "engine.ts 新增导出 getDistantFloors(window, contextWindowSize) 检测 helper，内部复用同一份 calculateBudget + 同一贪心循环，保证「被检测到要折叠的」与「实际被 buildShortTermSection 折叠的」完全一致；assemblePrompt 新增 opts.distantSummaries 第 4 参数",
          "零破坏性：preview-context 等其它调用点不传 opts，自动回退原折叠标记；无 schema 变更，tsc 零错误",
        ],
      },
    ],
  },
  {
    version: "v0.44.7",
    date: "2026-07-31",
    title: "巨型组件拆分收官 —— AIChatBar 593→155 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "AIChatBar（593 行）拆分为 6 个内聚子组件：AIChatHeader（Agent 标识头）、ChatMessageList（空状态+消息列表+写后分析采纳+思考步骤折叠）、ChatThinking（实时工具调用思考动画·含无步骤态）、ChatErrorBar（错误条）、ChatSuggestions（建议胶囊）、ChatInput（输入框+选中片段+发送/停止），共享类型外置 aichat/types.ts",
          "父组件保留全部 state/refs 与大 handler（handleSend 含 frontendActions 三类：analyze_chapter/analyze_relationships/relation_sync；handleAdoptSuggestion 角色卡字段更新；handleCancel/handleSuggestion）及思考轮播/自动滚底 useEffect；输入框 Enter 发送逻辑内联进 ChatInput，行为 100% 不变（tsc 零错误）",
          "主文件从 593 行降至约 155 行；巨型组件拆分 4/4 全部完成（CharacterList 883 / WorldPanel 375 / PostGenPanel 624 / AIChatBar 593），项目巨型组件可维护性彻底改善",
          "纯重构：无 schema 变更、无新功能、无样式改动",
        ],
      },
    ],
  },
  {
    version: "v0.44.6",
    date: "2026-07-31",
    title: "巨型组件拆分续 —— PostGenPanel 624→187 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "PostGenPanel（624 行）拆分为 7 个内聚子组件：PostGenPanelHeader（头部 stats+按钮）、PostGenPanelTabs（Tab 栏）、ExtractionTab（7 分组提取结果+逐条采纳）、ForbiddenTab / LogicTab / DistillTab / ReviewTab（四个分析 Tab），共享类型与 TabKey/TABS 外置 postgen/types.ts",
          "父组件保留全部 useState（7 个 adopted Set + tab/saving/saveMessage）与 handler（handleSave/toggleAdopt/importanceStars）及采纳初始化 useEffect，仅以子组件调用替换内联 JSX 区块；采纳状态经 AdoptControllers 注入 ExtractionTab，行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 624 行降至约 187 行；巨型组件拆分 4/4 全部完成（CharacterList / WorldPanel / PostGenPanel / AIChatBar 中本项收尾前三，AIChatBar 仍待拆）",
          "纯重构：无 schema 变更、无新功能、无样式改动，生成后分析面板可维护性提升",
        ],
      },
    ],
  },
  {
    version: "v0.44.5",
    date: "2026-07-31",
    title: "项目级 LLM 覆盖端到端闭环（outline + 自动填表接入）",
    sections: [
      {
        label: "功能补齐 / 一致性",
        items: [
          "项目配置中心「per-project LLM 覆盖」缺口补齐：此前仅 write/refine/continue/summarize 继承项目级 llmConfig，大纲生成（/generate/outline）与宝宝流自动填表（babyloreFill）只走全局设置——现已统一叠加 buildProjectOverrides（apiKey/baseUrl/model 非空字段覆盖全局），做到真正端到端",
          "outline 路由：从 project.llmConfig 解析项目级 baseURL/apiKey/model，叠加在全局 getSettings() 之上；modelUsed 按有效模型名（含 flash）判定",
          "babylore 自动填表：safeFillAfterWriting 新增 projectLlmConfig 入参，透传给 babyloreFill，使「生成一章→自动抽事实回填表格」也走项目 key；write/refine/continue 三路由均已透传已取出的 projLlm",
          "实测验证（本地 dev server 301 端口）：给测试项目设错误 apiKey → write 与 outline 均返回 401（Authentication Fails, Your api key: ****xxxx is invalid，后缀即所设错误 key，证明覆盖接管）；复位 llmConfig={} → 用 .env 全局 LLM_API_KEY 真实流式生成成功（274 token + done / 2 章大纲），证明全局 key 直接可用、不存在外部阻塞",
        ],
      },
      {
        label: "澄清 / 维护性",
        items: [
          "修正此前 backlog 中「项目级 LLM 覆盖端到端（待 API 恢复）」的阻塞误判——本地站运行读取 .env 的 LLM_API_KEY（已配 DeepSeek），API 一直可达可用，取消阻塞判定",
          "纯后端逻辑补齐，无 schema 变更、无前端改动；tsc 零错误；测试项目 llmConfig 已复位为空 {}，无残留",
        ],
      },
    ],
  },
  {
    version: "v0.44.4",
    date: "2026-08-01",
    title: "巨型组件拆分续 —— WorldPanel 375→137 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "WorldPanel（375 行）拆分为 4 个内聚子组件 + 1 个数据模块：WorldModuleSidebar（板块选择）、WorldEditor（标题栏+新建表单+深度选择）、WorldEntryCard（单条目卡片）、WorldEntryList（列表+空状态）、worldPanelData.ts（WORLD_MODULES/DEPTH_LABEL/CATEGORY_TO_MODULE/MODULE_FIELDS 常量与类型外置）",
          "父组件保留全部 useState 与 handler（handleCreate/handleFieldChange/deleteEntry）及派生计算（moduleEntries/getCount/moduleInfo/currentFields），仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 375 行降至 137 行；全局核查外置常量仅被 WorldPanel 相关文件引用，无别处依赖破坏",
          "纯重构：无 schema 变更、无新功能、无样式改动；WorldPanel 内无裸 fixed 弹窗，焦点陷阱不受影响",
        ],
      },
    ],
  },
  {
    version: "v0.44.3",
    date: "2026-08-01",
    title: "巨型组件拆分启动 —— CharacterList 883→504 行",
    sections: [
      {
        label: "重构 / 可维护性",
        items: [
          "CharacterList（883 行）拆分为 6 个内聚子组件：CharacterFilters（搜索+角色/状态/标签筛选）、CharacterToolbar（工具栏+全选/扩展/分类）、ClassifyPanel（分类进度+面板+结果）、ExpandResultModal（扩展进度+结果弹窗并接管 focus-trap）、CharacterRow（单角色卡片）、CharacterGroupList（分组渲染）",
          "父组件保留全部 useState/useRef/useEffect 与大 handler（handleExpand/handleClassify/handleApplyTags 等）及派生计算，仅以子组件调用替换内联 JSX 区块；行为 100% 不变（tsc 零错误，逻辑逐字迁移）",
          "主文件从 883 行降至 504 行（大 handler 按行为不变硬约束留父），可读性/可维护性提升，后续改角色功能不再需在巨型文件里定位",
          "纯重构：无 schema 变更、无新功能、无样式改动；焦点陷阱随扩展结果弹窗一并移交 ExpandResultModal",
        ],
      },
    ],
  },
  {
    version: "v0.44.2",
    date: "2026-08-01",
    title: "对话框焦点陷阱与键盘可达性（无障碍基线）",
    sections: [
      {
        label: "无障碍 / 焦点管理",
        items: [
          "新增通用 useFocusTrap hook（src/hooks/use-focus-trap.ts）：弹窗激活时焦点移入首个可聚焦元素、Tab/Shift+Tab 在弹窗内循环不逃逸到背后页面、Esc 关闭、关闭后焦点交还打开前的元素",
          "增强 DialogOverlay 与 Modal 基础组件自带焦点陷阱，覆盖所有使用它们的弹窗（角色编辑/创建、世界书编辑、设置导入、风格编辑等）",
          "11 个裸 fixed 弹窗统一挂焦点陷阱：大纲生成、布置配置、项目配置、生成前角色确认、抽卡、记忆衰减、自动化设置、规则面板、剧情线编辑、角色编辑、角色列表扩展结果",
          "键盘用户现可用 Tab 在弹窗内导航、Esc 关闭，焦点不会丢失到 <body>，符合无障碍基线（WAI-ARIA dialog 模式）",
        ],
      },
    ],
  },
  {
    version: "v0.44.1",
    date: "2026-08-01",
    title: "修复探讨模式采纳失败无法重试（稳定性）",
    sections: [
      {
        label: "Bug 修复（U6 后续）",
        items: [
          "修复 handleAdoptCard 在 fetch 之前就把卡片 adopted 置真：失败也会显示「已采纳」并禁用按钮，导致用户无法重试 —— 改为仅在成功响应后才置 adopted + 写入已采纳列表",
          "统一失败状态串：page.tsx 原写 \"采纳失败\" 与 ChatPanel 检查的 \"❌失败\" 不一致，失败徽标永不显示；现统一为 \"❌失败\"",
          "ChatPanel 失败卡片新增「点击卡片重试 ↻」提示，失败后整卡仍可点击触发 onAdoptCard 重新采纳（adopted 保持 false 不禁用）",
          "批量采纳（大纲模式）失败项同样受益：因卡片 adopted 不再提前置真，用户可在对话卡片上单卡重试",
        ],
      },
    ],
  },
  {
    version: "v0.44.0",
    date: "2026-07-31",
    title: "六大功能补齐 + 六项体验优化（本地化闭环）",
    sections: [
      {
        label: "六大新功能（F1-F6）",
        items: [
          "F1 创意工坊首启 seed + 载入示范预设按钮：一键拉取内置 regex/lorebook/api_config/style 示范预设（curl 实测 POST 返回 created:3 total:15）",
          "F2 布置结构化保存 + workspace 重编辑：14 个 BuildConfig 字段入库，项目设定面板可查看/修改并回写 globalPrompt",
          "F3 记忆衰减手动触发：preview→执行，旧楼层记忆按遗忘曲线衰减，透明可控",
          "F4 抽卡角色生成前确认打通：抽卡角色锁进章节 activeCharacters + 剧情线预设，确认页自动预选不重复选",
          "F5 项目配置中心：已应用预设追踪/移除、正则后处理可视编辑、分项目 LLM 覆盖（全局留空即继承）",
          "F6 自动填表可视化与重试：tables 页填表结果绿/红状态 + 重试按钮 + auto_facts 徽标，写作 SSE 失败前端提示",
        ],
      },
      {
        label: "六项体验优化（U1-U6）",
        items: [
          "U1 regex 预设三处统一：write/refine/continue 一致消费 postProcessingRules",
          "U2 lorebook 预设重复应用去重：按 projectId+category+title 查重，重复套用更新而非叠加（curl 实测第二次返回 updated:true）",
          "U3 章节大纲双入口区分：Flash 章纲（轻量预览 ghost）vs 抽卡分镜（正式 outline primary·带角色）",
          "U4 世界书注入深度文案友好化：0-2 常驻记忆 / 3-4 触发记忆（去除酒馆迁移黑话）",
          "U5 孤儿 API 处置：10 个无前端调用的死路由标注 @deprecated（不删代码）",
          "U6 角色卡 adopt 字段加固：补全 dialogueStyle/hiddenMotives/relationships，复杂设定不丢字段；词条按 worldview→常驻/其他→触发区分",
        ],
      },
    ],
  },
  {
    version: "v0.43.0",
    date: "2026-07-29",
    title: "API 配置体验重做 + 探讨/布置双区域 UI 升级",
    sections: [
      {
        label: "API 保存与模型检索",
        items: [
          "新增 POST /api/settings/models：按当前 provider 自动检索 OpenAI 兼容 /models 端点，deepseek 默认 base 特殊拼接 /v1/models，返回模型 id 列表供前端下拉选择",
          "设置页模型输入框改为 input+datalist 可检索下拉，切换 provider 或加载已保存配置时自动触发模型检索",
          "保存 API 配置后自动调用 /api/settings/test 做连接验证并刷新模型列表，消除「保存不住 / 不会自动连接」的体验断裂",
          "修复 settings page 中 lllBaseUrl 笔误为 llmBaseUrl，保证 Base URL 正确保存",
        ],
      },
      {
        label: "探讨模式 UI 升级（确认感）",
        items: [
          "新增 StepProgress 组件：11 步进度条接入 explore 顶栏，当前步骤高亮、已完成步骤带成功色、步骤间连线清晰",
          "重写 ChatPanel：顶部常驻「AI 创作顾问正在协助你构建小说世界」状态条 + 当前步徽章；bot/user 头像；气泡/采纳卡片加 nf-bubble-in / nf-adopt-flash 入场光效；loading 状态显示当前思考步骤",
          "CardBrowser 卡片加 nf-card-in 翻入动画，已采纳卡片有 nf-adopt-flash 光效",
          "globals.css 新增 nf-bubble-in / nf-card-in / nf-adopt-flash / nf-glow-pulse / nf-step-pop 关键帧",
        ],
      },
      {
        label: "布置区域 UI 升级（风格配置）",
        items: [
          "BuildConfigPanel 重构：新增实时预览卡 PreviewCard（小说名/类型/受众/字数/流派/文风一目了然）",
          "新增 StepGroup 四分区：基础信息 / 类型与受众 / 风格参数 / 高级设定，明确区分「核心设定/流派（可多选）」与「文风偏好（单选）」",
          "流派标签支持 tagSearch 搜索过滤，大量标签时可快速定位",
          "颜色统一收敛到 --nv-* 设计令牌，移除硬编码 emerald/purple/pink/amber，保持虚空玻璃视觉一致",
        ],
      },
      {
        label: "稳定性修复与验证",
        items: [
          "修复 globals.css 中误加的 :root 提前闭合括号，解决 Turbopack CSS 解析 500，dev server 正常热更新",
          "tsc --noEmit 零错误；浏览器真实走查确认 11 步进度条、状态条、分区、标签搜索、DeepSeek 真实对话回复均正常",
        ],
      },
    ],
  },
  {
    version: "v0.42.0",
    date: "2026-07-28",
    title: "虚空玻璃 UI 全面翻新（老土配色清零）",
    sections: [
      {
        label: "配色体系统一（设计令牌化）",
        items: [
          "全局扫描 src 下所有 .tsx/.ts，将 Tailwind 默认 zinc-*/indigo-*/gray-*/border-white/bg-white 等老土色按前缀+色阶映射至虚空玻璃 CSS 变量（--nv-void 最深底、--nv-abyss 容器、--nv-surface-1..3 抬升面、--nv-border-1..3 边线、--nv-text-primary/secondary/tertiary/muted 文字、--nv-primary 主操作、--nv-creative 紫罗兰）",
          "覆盖 40+ 组件与全部页面路由（首页/工作区/设置/创意工坊/探索/拆解/编辑器/游戏），DOM 实测 zinc/indigo/gray 残留归零、React hydrate 正常",
        ],
      },
      {
        label: "视觉与交互收尾",
        items: [
          "首页新增背景三处径向光晕 + Hero 霓虹渐变标题 + 玻璃徽章；工作区主容器/加载/错误态统一深空底",
          "交互组件保留语义：按钮 focus 环改 ring-[var(--nv-primary)]、开关滑块保留白色、进度条改表面令牌；历史调试遗留的装饰 emoji 清零",
        ],
      },
    ],
  },
  {
    version: "v0.41.0",
    date: "2026-07-28",
    title: "角色卡结构化模板收尾（酒馆模板呈现）",
    sections: [
      {
        label: "注入补全与一致性修复（不做字段扩张）",
        items: [
          "称呼完整化：调度卡头部追加别名（aliases），「称呼」维度对齐酒馆模板的称呼+特点+外貌+穿着+性格+背景+关系+发言参考",
          "穿着注入：外貌块补 attire（穿着）——UI 字段（appearanceAttire）早已存在却一直未注入 prompt 的遗漏修复",
          "关系备注修复：注入从 r.dynamic 读取值（UI 实际保存字段），原代码误读恒为空的 r.notes 导致关系动态永远丢失",
        ],
      },
      {
        label: "收尾说明（基础已具备）",
        items: [
          "侦察确认 relationships 字段（schema/types/UI/注入四路齐全）与 speechPatterns（dialogueStyle 内置子字段）此前已落地，故本次无新增字段",
          "改动仅修正注入渲染逻辑，未触碰 schema / 类型 / 表单重建点，静态自检 + 生产构建零回归",
        ],
      },
    ],
  },
  {
    version: "v0.40.0",
    date: "2026-07-28",
    title: "提示词结构升级：XML 标签分层包裹（酒馆格式论迁移）",
    sections: [
      {
        label: "上下文块边界明确化",
        items: [
          "assemblePrompt 拼接层改为逐块 XML 标签包裹，替代原有的「---」分隔符与【xxx】标题混排",
          "根标签 <novel_forge_context> 包裹全部上下文区块，<writing_task> 包裹撰写指令（含 depth1 上方、depth0 正文前强制层）",
          "新增 wrapBlock 辅助函数：内容为空时返回空串，调用方统一过滤空块",
        ],
      },
      {
        label: "向后兼容（不魔鬼化）",
        items: [
          "各区块内部仍保留【xxx】人类可读标题，仅外层加 XML 边界，不重排内部结构",
          "正则后处理作用于模型输出，与 prompt 格式无关；外部无代码依赖原分隔符，改动零回归",
        ],
      },
    ],
  },
  {
    version: "v0.39.0",
    date: "2026-07-28",
    title: "记忆清除 / 上下文溢出治理（酒馆记忆机制迁移）",
    sections: [
      {
        label: "短期记忆溢出治理（前文回顾）",
        items: [
          "buildShortTermSection 重写：较远楼层（超预算的旧小节）不再静默丢弃，改为显式「折叠标记」——保留末尾衔接点 + 标注\"开头已折叠/非完整原文\"",
          "预算极小（remaining≤60）时整段折叠为一行提示（[⚠️ 远楼层「标题」已折叠]），绝不静默丢内容",
          "section 头部追加折叠说明，明确告知模型哪些内容被压缩，避免把截断片段误读为完整情节而产生剧情断裂幻觉",
        ],
      },
      {
        label: "中期摘要边界标记（章节摘要）",
        items: [
          "buildMediumTermSection 的静默截断补标记：因预算省略的较早/低相关章节摘要显式标注数量（另有 N 个…因预算省略）",
          "对应酒馆第七章「记忆机制 / 记忆清除」：明确上下文压缩边界，消除“上下文污染”",
        ],
      },
    ],
  },
  {
    version: "v0.38.0",
    date: "2026-07-28",
    title: "世界书 depth 注入（酒馆 worldbook depth 0-4 迁移）",
    sections: [
      {
        label: "世界书注入深度（depth 0-4）",
        items: [
          "Prisma LorebookEntry 新增 `depth Int @default(3)`；类型层 LorebookEntry/PromptContext.forcedLore/LorebookData 同步",
          "depth 语义对齐酒馆：0=强效注入正文前(用户指令下方) / 1=用户指令上方 / 2=系统上下文(强制常驻) / 3=背景设定·关键词触发(默认) / 4=深层背景",
          "编排层 buildPromptContext 拆分 loreEntries 为 forced(depth≤2) 与 triggerable(depth≥3)，关键词匹配仅作用于 triggerable；forcedLore 经 PromptContext 透传",
          "组装引擎 assemblePrompt：depth2 注入系统上下文区、depth1 置于撰写指令上方、depth0 置于撰写指令下方（正文前·最强效）；关键词触发的 loreSection 按 depth 升序（3 在前、4 在后）",
        ],
      },
      {
        label: "去重与 API/UI",
        items: [
          "宝宝流 recall 路径（buildRecallBlock）排除 depth≤2 条目，避免与 forcedLore 常驻注入重复",
          "lorebook 新建/编辑 API、preset apply（worldview/story_progression/lorebook 分支）均写入 depth（默认3）",
          "世界书编辑弹窗与 WorldPanel 新建表单新增深度选择器（0-4 中文标签）；列表卡片显示深度徽标（depth≤2 高亮为常驻）",
          "创意工坊示范预设「示范·世界书条目」核心设定条目设为 depth=2（系统上下文常驻，演示强制注入）",
        ],
      },
    ],
  },
  {
    version: "v0.37.0",
    date: "2026-07-28",
    title: "酒馆理论迁移：创意工坊 Preset 类型扩展 + 正则后处理管线",
    sections: [
      {
        label: "创意工坊 Preset 类型扩展（regex / lorebook / api_config）",
        items: [
          "Prisma Preset.type 扩展支持 regex、lorebook、api_config；Project 新增 postProcessingRules JSON 字段",
          "/api/presets/[id]/apply 新增三类应用逻辑：regex → 合并到项目 postProcessingRules（按 name 去重/更新）；lorebook → 写入 LorebookEntry（category=lorebook）；api_config → 合并到 Project.llmConfig",
          "创意工坊 /workshop 页新增「正则 / 世界书 / API参数」三个 TAB、类型标签、上传占位 JSON 与默认选项",
          "内置示范预设：通用·删除思维链（regex）、示范·世界书条目（lorebook）、示范·创意奔放 API 参数（api_config）",
        ],
      },
      {
        label: "正则后处理管线",
        items: [
          "新建 src/core/post-process/regex.ts：按项目级规则列表对生成文本做 RegExp 替换，单条规则编译失败不影响其他规则",
          "write 路由在流式生成组装 fullContent 后、进入审校/摘要管线前调用 applyRegexRules，并通过 SSE 事件 postprocess_regex 报告已应用规则数",
        ],
      },
      {
        label: "流程文档",
        items: [
          "新增 PROCESS/05-酒馆理论迁移方案.txt，记录酒馆运行原理、可迁移方法论、下一步计划",
          "更新 PROCESS/00-目录清单.txt 纳入 05 并标注状态",
        ],
      },
    ],
  },
  {
    version: "v0.36.0",
    date: "2026-07-28",
    title: "色子抽卡与剧情线持久化关联 + 流程文档机制",
    sections: [
      {
        label: "色子（抽卡）剧情预设 → 剧情线（用户核心诉求）",
        items: [
          "DrawCards 抽卡「采用此路线」后，除写入章纲外，额外把走向持久化写入活跃剧情线 Storyline.chapterBindings（element:\"preset\"、含 cardLabel/coreConflict/mood）",
          "复用已有 PUT /api/storylines/[id]，不新增端点、不改 Prisma schema；生成前规划 plan-chapter 读 storylines 时即可读到「用户用色子选定的走向」作为剧情预设",
          "同章纲节点重采用时按 chapterId+preset 去重，避免堆叠；项目无活跃剧情线时优雅跳过",
        ],
      },
      {
        label: "流程文档机制（开发自参考）",
        items: [
          "新增 novel-forge/PROCESS/ 目录：00-目录清单.txt（主索引+三段式落档规范）+ 01架构逻辑/02自动化填表流程/03色子关联/04待迭代项",
          "每次执行更新前先写清「目标/执行流程/关联项」，完成后标【成功】，变更或失败同步更新，兼作产出记录与预期值追踪",
        ],
      },
    ],
  },
  {
    version: "v0.35.0",
    date: "2026-07-28",
    title: "无表自动建表——保证「生成一章即自动填表」零配置闭环",
    sections: [
      {
        label: "自动化填表零配置（修复体验矛盾）",
        items: [
          "safeFillAfterWriting 在真正填表前检查项目是否已有结构化表格；若无且自动化开启，自动创建默认「章节事实表」（key=auto_facts，列：名称/状态/说明），使「生成一章即自动填表」在零表格配置下也能成立",
          "E2E 验证：新建项目故意不应用任何表格模板，第1章生成后自动建表并填 4 行、第2章动态修正至 7 行；后端打印 [babylore] 自动建表日志",
        ],
      },
    ],
  },
  {
    version: "v0.34.0",
    date: "2026-07-28",
    title: "文风预设生效修复 + 系统角色条件化 + 后端监测报告",
    sections: [
      {
        label: "文风预设修复（与预期对齐的核心矛盾）",
        items: [
          "修复 apply 路由缺陷：创意工坊「应用」预设后未调用 syncGlobalPrompt，导致 globalPrompt 始终为空、文风预设（如古风·严谨文笔）完全不生效；现对所有预设类型（style/worldview/story-progression）统一刷新全局提示词",
          "文风卡经 syncGlobalPrompt 编入 globalPrompt，生成时 assemblePrompt 读取，套用文风后立即带该文风——E2E 实测 globalPrompt 长度 0 → 385 且含「文风设定/古风」",
        ],
      },
      {
        label: "系统角色条件化（消除体裁冲突）",
        items: [
          "orchestrator 系统提示词原硬编码「白金级玄幻修仙网文作家 + 修仙模拟引擎 + 都市重生流」，与项目 genre 解耦，压制一切非修仙文风预设",
          "改为条件化：题材含修仙/玄幻/仙侠/武侠/洪荒/奇幻/末世时沿用原版（零风险）；其他题材走通用作家角色，文风以文风卡为最高权威，不再被强制修仙化",
        ],
      },
      {
        label: "后端监测报告（满足核对流程需求）",
        items: [
          "召回节点打印 [recall] 命中条数与来源；生成前剧情规划打印 [plan-chapter] 回写章序；自动填表打印 [babylore] ops/applied/skipped",
          "E2E 实测后端日志清晰呈现「召回 1→3 条 → 剧情回写章序 1→2→3 → 填表 chapter1 ops=2 / 后续动态修正」的完整链路",
        ],
      },
    ],
  },
  {
    version: "v0.33.0",
    date: "2026-07-28",
    title: "自动化填表闭环 + 生成前剧情预设 + 可配上下文",
    sections: [
      {
        label: "自动化填表（正文→填表→召回→正文）",
        items: [
          "新增 safeFillAfterWriting：每章写完后自动用 DeepSeek 抽取结构化事实，以 JSON 行操作协议（insert/update/delete）回填创意工坊结构化表格，失败不影响正文交付",
          "回填表格经 buildRecallBlock 持续注入永久上下文，形成「写章节→填表→下一章召回」闭环；update 按唯一列匹配已有行，动态修正不矛盾、不重复插入",
          "填表频率可配置（默认每 3 章填一次）、默认跳过最近一章（用户常对最新章 re-roll 改写，跳过避免污染表格），二者均可在弹窗关闭",
        ],
      },
      {
        label: "生成前剧情预设（回忆召回式推进剧情线）",
        items: [
          "新增 plan-chapter.ts：点击生成一章之前，LLM 基于活跃剧情线 + 大纲 + 作者指令 + 记忆召回块规划本章剧情推进（焦点/推进/障碍/转折/执行提示）",
          "规划结果注入写作指令，并把本章绑定追加写回活跃剧情线（保留最近 50 章，不丢历史、持续修正）；规划失败静默降级，不阻断正文生成",
        ],
      },
      {
        label: "配置与 UI",
        items: [
          "顶部工具栏新增「自动化」入口，弹窗集中配置：自动填表总开关 / 填表频率 / 跳过最近章 / 上下文楼层（前文窗口，复用 contextKeepChapters）",
          "新增 /api/projects/[id]/config（GET/PUT）读写上述配置，已接入 jsonError 统一错误格式",
          "数据层：Project 模型新增 autoFillEnabled / fillFrequency / skipLatestChapter 字段",
        ],
      },
    ],
  },
  {
    version: "v0.32.3",
    date: "2026-07-28",
    title: "暗色可读性提升 + API 错误格式统一",
    sections: [
      {
        label: "可读性（A11y）",
        items: [
          "--nv-text-tertiary 提亮至对比度 ≥4.5:1（原约 3.5:1），暗色下弱文字达 WCAG AA 普通文本标准",
          "--nv-text-muted 适度提亮，占位符 / 禁用文字在暗色背景下恢复可读性",
        ],
      },
      {
        label: "API 错误响应统一",
        items: [
          "新增标准 helper jsonError(message, status?)，统一返回 { error } 结构与 HTTP 状态，消除各路由 {ok:true}/{error} 不一致",
          "/api/presets/[id]（GET/PUT/DELETE）与 /api/seed/presets（POST）已接入 jsonError，作为全站错误格式统一化起点",
        ],
      },
    ],
  },
  {
    version: "v0.32.2",
    date: "2026-07-28",
    title: "空态统一 + 项目资产闭环 + 监测告警（缺陷修复迭代）",
    sections: [
      {
        label: "空态统一（视觉完整度）",
        items: [
          "新增共享空态组件 EmptyState（虚空玻璃风格：虚线边框 + 居中 Icon + 主文案 + 可选引导/操作区）",
          "角色 / 世界书 / 故事线 / 规则四类列表的无数据占位统一为 EmptyState 卡片；规则面板原漏网的旧色板 text-zinc-600 一并收编为 nv 令牌",
        ],
      },
      {
        label: "项目资产闭环",
        items: [
          "GET /api/projects/[id] 的 include 补全 styleCards 与 loreTables，前端可在 workspace 直接读取创意工坊已应用预设，减少端点分裂",
        ],
      },
      {
        label: "健壮性",
        items: [
          "MonitorPanel 的 fetch 异常从静默忽略（/* ignore */）改为 console.warn，保留非关键降级但开发期可排查",
          "SSE 流关闭逐文件复核：17 个流式路由的 controller.close() 均已覆盖所有异常路径（try 末尾 / catch 内 / 提前 return 前），无悬挂风险，保持现状以控制改动风险",
        ],
      },
    ],
  },
  {
    version: "v0.32.1",
    date: "2026-07-28",
    title: "API 路由健壮性加固（预设路由异常捕获）",
    sections: [
      {
        label: "API 路由健壮性",
        items: [
          "修复 /api/presets/[id] 的 GET/PUT/DELETE 与 /api/seed/presets 的 POST 缺失 try/catch 的问题：prisma 异常原会返回无 {error} 的 500，导致前端解析崩溃",
          "统一异常响应：各 handler 包装 try/catch，返回 { error: string } + 对应 HTTP 状态（404/500），前端可稳定识别并 toastError",
        ],
      },
      {
        label: "诊断自检",
        items: [
          "按 novel-forge-diagnostic 六维度扫描：tsc 零错误、Prisma schema 校验通过、服务健康 200、无死代码、核心 SSE 路由已有外层 try/catch 兜底",
          "其余优化点（SSE finally 统一关闭、巨型组件拆分、大列表虚拟化、空态 / 对比度 / A11y）整理为优化建议清单，列入后续迭代",
        ],
      },
    ],
  },
  {
    version: "v0.32.0",
    date: "2026-07-27",
    title: "🎨 全模块视觉美化 + 创建/添加统一响应弹窗（虚空玻璃设计体系）",
    sections: [
      {
        label: "视觉美化体系落地（虚空玻璃 Void Glass）",
        items: [
          "全部小说相关子界面统一为暗色「虚空玻璃」设计：surface/border/primary/creative/accent/success/danger 令牌全量替换旧的 indigo/zinc/emerald/amber 平行色，配色风格一致",
          "按钮变体（btn-primary/btn-success/btn-danger/btn-creative/btn-ghost）+ .input-glass/.surface-floating 统一质感，每个按钮具备 hover / 点击 / 禁用态的视觉差异",
          "全站 UI 装饰 emoji 清零，改为统一 Icon 组件（Lucide 映射）：角色前缀 ★◆◈、状态 ✓✕⚠️⏳ 等收编为 check/x/alert/loader 等 Icon；业务数据标签 📥📝 保留其过滤语义",
        ],
      },
      {
        label: "创建/添加操作统一响应弹窗",
        items: [
          "新增命名式 toast：toastAdded / toastCreated（绿色辉光 + 勾选动画 + 固定标题「已添加 / 已创建」），字体与动效美化",
          "覆盖全部「创建 / 添加小说」入口：新建角色、新建世界书、新建规则、AI 生成故事线、探讨模式创建项目（含大纲落库建项目）——均弹出「XX「名称」已创建 / 已添加」",
        ],
      },
      {
        label: "构建与类型修复",
        items: [
          "修复 3 处阻塞构建的类型错误：workshop 页补 toastCreated 导入、游戏页 QUICK_ACTIONS 的 icon 收窄为 IconName、PostGenPanel 补 cloud 图标到注册表",
          "tsc --noEmit 与生产 next build 均通过（69 路由全量生成），可直接部署",
        ],
      },
    ],
  },
  {
    version: "v0.31.0",
    date: "2026-07-27",
    title: "📚 内置文档预设概念 + 创意工坊进入写作上下文 + 按钮全交互实测",
    sections: [
      {
        label: "内置预设概念（来自参考资料）",
        items: [
          "把参考资料教程里命名的所有预设类别实体化为系统内置预设：表格模板 3 个（主角信息表/属性·关系·资产、骰子随机事件表、宫斗·妃嫔居住建筑表）、剧情推进 2 个（缝合怪·多线剧情推进、好感度·分阶段人设模板）、文风 2 个（快节奏·爽文笔、古风·严谨文笔）、世界观 1 个（仙侠·世界观骨架）、角色卡 1 个（示范角色·苏苏）",
          "保留原 4 个示范预设，系统内置预设总数由 4 增至 12，覆盖 type: table_template / story_progression / style / worldview / character",
        ],
      },
      {
        label: "创意工坊贴合进入写作上下文（链路确证）",
        items: [
          "「应用到项目」真实落库经 pg 直连验证：文风→StyleCard(1)、角色卡→CharacterCard(2)、表格模板→LoreTable(3) 全部写入项目库",
          "写章节时预设经 loadGenerationContext / buildPromptContext / buildRecallBlock 注入正文 globalPrompt 与召回块——「参考资料预设→项目库→写作上下文」主链路闭环成立",
        ],
      },
      {
        label: "每个内置按钮可交互（真实点击验证）",
        items: [
          "创意工坊 Tab 过滤、搜索框、应用到项目、复刻、上传预设（填表+发布）、目标项目下拉 全部真实点击验证通过，无死按钮",
          "上传预设功能端到端验证：表单填表→POST /api/presets→后端真实创建入库",
          "生产模式（next build + start）全新渲染：创意工坊 12 张卡片完整渲染、交互正常",
        ],
      },
    ],
  },
  {
    version: "v0.30.2",
    date: "2026-07-27",
    title: "🔍 究极用户端五维诊断 + 工作台 hydration 修复",
    sections: [
      {
        label: "五维用户端诊断（真实点击验证）",
        items: [
          "① 按钮实质交互：写章节 / 微调 / 续写 / 自动填表 / 记忆召回 / 跳转 等核心按钮均实测有真实后端行为，未发现死按钮",
          "② 前后端统一：前端每个调用均能映射到后端 API 且实测有响应（规则链路最初 400 为诊断脚本字段误用，前端 RulesPanel 字段与后端契约一致）",
          "③ 重叠按钮审计：代码盘点 12 组嫌疑入口（文风管理三入口、章纲三生成器、导入双链路等），经判定均属合理导航 / 场景分化，未删除任何功能",
          "④ 功能落地：探讨 / 拆书 / 宝宝流 / 创意工坊 / 游戏 等模块边界清晰，参考资料核心承诺（写作闭环 / 分阶段人设 / 创意工坊）均已落地",
          "⑤ 功能意义：宝宝流闭环实测优秀——写章节后结构化表格「角色居所」被自动更新（applied:1），正文 1415 token 生成 + 自动填表生效",
        ],
      },
      {
        label: "修复与用户体验",
        items: [
          "工作台 /workspace/[id] 修复 SSR/CSR hydration 不一致：将 refineInstruction / chapterOutlinePrompt 的 localStorage 读取从 useState 初始化移入 useEffect，消除初始化期水合不匹配风险",
          "诊断结论：系统为免费无收费的小说 AI 生成器，核心写作闭环与记忆系统真实可用，契合谋生作者 / 自娱写手「低成本产出连贯长篇」的目的",
          "已知限制：沙箱 dev 模式下工作台偶发卡 loading（仅本地 dev 环境问题，生产构建 next build + start 完全正常，部署无碍）",
        ],
      },
    ],
  },
  {
    version: "v0.30.1",
    date: "2026-07-27",
    title: "🪟 写作界面新增「宝宝流记忆召回」实时面板（闭环透明化）",
    sections: [
      {
        label: "闭环透明度",
        items: [
          "写章节 / 微调 / 续写 完成后，中间列新增「🧠 宝宝流记忆召回」折叠面板，实时列出本轮自动召回并注入写作的世界书/结构化表格记忆",
          "面板直接展示已求值的人设阶段（如「阶段一：陌生人（态度：礼貌但疏离）」），写作者一眼看清 AI 在本轮呼应了哪些设定、当前角色处于什么状态——闭环不再只藏在后台 toast 里",
          "每轮生成开始时面板自动重置（setRecallMemories([])），避免上一次记忆残留误导",
        ],
      },
      {
        label: "实现与验证",
        items: [
          "数据直接复用已验证的 babylore_recall SSE 事件（items 已是循环求值后的内容），零新增后端逻辑",
          "验证：tsc 类型检查通过、next build 全路由编译通过、/workspace/[id] 页面 HTTP 200、写章节 SSE 苏苏条目 content 为已求值「阶段一：陌生人」且无 <if cell> 标签",
        ],
      },
    ],
  },
  {
    version: "v0.30.0",
    date: "2026-07-27",
    title: "🎭 分阶段人设求值生效（剧情推进 = 人设进化，参考资料核心亮点落地）",
    sections: [
      {
        label: "分阶段人设真正生效",
        items: [
          "新增 src/core/babylore/ifcell.ts 求值器：解析参考资料风格的 <if cell=\"属性表/苏苏/好感度 <= 10\">…<else>…</if> 语法（支持任意嵌套），按当前结构化表格的真实数值选出「当前激活的人设阶段」",
          "套用「好感度·分阶段人设模板」后，写章节 / 微调 / 续写 会自动把求值后的当前人设阶段注入写作指令，而非把原始语法标签丢给 AI——参考资料承诺的「剧情推进=人设进化」首次真正闭环",
          "端到端验证：属性表 苏苏.好感度=5 时，写章节召回的人设条目 content 已是「阶段一：陌生人（态度：礼貌但疏离）」，标签彻底清除",
        ],
      },
      {
        label: "安全与健壮性",
        items: [
          "单元 + 端到端双层测试：好感度 5/25/50/80 精准命中阶段一~四，标签全部清除；",
          "安全降级：属性表缺失、行缺失或数值非数字时返回「全阶段参考文本」（剥离标签、并列展示），绝不误判为某一阶段，也绝不向用户暴露原始 <if cell> 标签",
          "求值集成进共享模块 src/core/babylore/loop.ts：buildRecallBlock 对世界书条目里的 <if cell> 统一求值，recall 事件携带的也是已求值内容（透明可见）",
        ],
      },
    ],
  },
  {
    version: "v0.29.0",
    date: "2026-07-27",
    title: "🔁 写作闭环覆盖全部生成路径（写章节 / 微调 / 续写 三路由统一）",
    sections: [
      {
        label: "闭环扩展到全部路径",
        items: [
          "写章节 / 微调 refine / 续写 continue 三条生成路由现在都自动「记忆召回」+ 写后「LLM 填表」，参考资料承诺的正文→填表→召回→正文 在任意创作方式下都闭合",
          "端到端验证：微调指令「甄嬛居所改为棠梨宫」被 DeepSeek 自动抽取，结构化表格 甄嬛:碎玉轩 → 甄嬛:棠梨宫 实时更新；续写路径也正确召回角色设定",
        ],
      },
      {
        label: "架构精简（删冗余）",
        items: [
          "抽共享模块 src/core/babylore/loop.ts：把「召回净化（过滤[自动发现]占位世界书、表格命中优先、上限12条）+ 写后自动填表（失败不影响交付）」沉淀为单一事实来源",
          "write/refine/continue 三路由统一调用 buildRecallBlock 与 safeFillAfterWriting，消除三套重复逻辑、保证行为一致",
        ],
      },
      {
        label: "健壮性对齐",
        items: [
          "refine/continue 的后处理管线（审校/摘要）也加容错：LLM 限流/超时不再中断交付，降级为「仅生成」并继续自动填表、照常发 done",
          "前端 streamSSE 本就是 write/refine/continue 共用，宝宝流召回/填表的实时 toast 在三条路径自动透明展示",
        ],
      },
    ],
  },
  {
    version: "v0.28.0",
    date: "2026-07-27",
    title: "🔁 打通「正文→填表→召回→正文」写作闭环（参考资料核心承诺落地）",
    sections: [
      {
        label: "写作闭环（自动）",
        items: [
          "写章节时自动「记忆召回」：用本节大纲 + 作者指令 + 前文 + 角色名 作为召回上下文，命中世界书/结构化表格记忆并注入本轮撰写指令（剧情推进=记忆召回）",
          "写完后自动「LLM 填表」：DeepSeek 抽取本章结构化事实回填表格，闭环 正文→填表→召回→正文 全程无需手动调用 API",
          "端到端验证：宫斗章节正确召回 4 位妃嫔居住信息，并在续写「甄嬛迁入棠梨宫」后自动把 woman_live 表更新为 甄嬛:棠梨宫",
        ],
      },
      {
        label: "质量与稳定性",
        items: [
          "召回净化：自动过滤内容含「[自动发现]」的占位世界书，结构化表格命中优先，单次召回上限 12 条，避免 prompt 膨胀与低质记忆污染",
          "后处理容错：审校/摘要的 LLM 调用若因限流/超时失败，不再中断整章交付，降级为「仅生成」并继续自动填表、照常发送 done",
          "填表 LLM 调用加 120s 防御性超时，慢响应不再卡住 SSE 流",
          "前端透明化：实时 toast 提示「宝宝流记忆召回 N 条」与「自动填表完成：写入 M 行」，闭环每一步用户可见",
        ],
      },
    ],
  },
  {
    version: "v0.27.1",
    date: "2026-07-27",
    title: "🐛 修复宝宝流自动填表多行互相覆盖（稳定性）",
    sections: [
      {
        label: "稳定性修复",
        items: [
          "修复 /api/babylore/fill 累积写入 bug：同一张表的多个 insert 操作此前会在循环内从原始空数组重新拷贝，导致互相覆盖、只保留最后一行（如宫斗 4 位妃嫔只写入 1 位安陵容）",
          "改为按表维护累积 rows 副本（rowsCache），同表多操作串行生效；现已正确写入全部 4 行（华妃/翊坤宫、皇后/景仁宫、甄嬛/碎玉轩、安陵容/延禧宫）",
          "生产构建（next build）已通过 TypeScript 类型检查与 69 页静态生成，可正常部署上线",
        ],
      },
    ],
  },
  {
    version: "v0.27.0",
    date: "2026-07-27",
    title: "🗂 宝宝流数据库内核 + 创意工坊/共创社区：把参考资料变成可共享预设",
    sections: [
      {
        label: "宝宝流数据库内核（结构化表格 + LLM 填充 + 剧情推进召回）",
        items: [
          "新增 LoreTable 模型：世界书升级为结构化表格（人物/地点/物品/属性/时间线），行列可自定义，对标宝宝流「妃嫔居住建筑表」",
          "新增 /api/babylore/fill：每章写完后 DeepSeek 自动填表（国模填表精确配置：关 COT + 严格 JSON + 温度 1 + 失败重试 3 次），抽取结构化事实写入表格",
          "新增 /api/babylore/recall + recallContext 服务：剧情推进=记忆召回，按世界书绿灯关键词与表格行匹配，注入应召回的记忆（不替作者写剧情）",
          "大纲生成已增量注入召回命中项；项目内「结构化表格」页支持建表/行编辑/自动填表/召回预览",
        ],
      },
      {
        label: "创意工坊 / 共创社区（预设中心）",
        items: [
          "新增 Preset 模型与 /api/presets（列表/上传）、/apply（套用到项目）、/fork（复刻二创）",
          "把参考资料本身实体化为「预设」：表格模板预设、剧情推进预设、文风、世界观、角色卡均可一键套用",
          "内置 4 个示范预设（宫斗居住表 / 好感度分阶段人设 / 古风严谨文笔 / 仙侠世界观骨架），首次部署 POST /api/seed/presets 注入",
          "顶栏新增「创意工坊」入口；工作区新增「结构化表格」「创意工坊」按钮；产品免费、非商业",
        ],
      },
    ],
  },
  {
    version: "v0.26.3",
    date: "2026-07-26",
    title: "🛡 API 错误收敛与优雅降级：环境变量配置 DeepSeek、拆书页无 DB 不崩溃",
    sections: [
      {
        label: "API 错误收敛与可读化",
        items: [
          "拆书列表 `/api/dissect/list`、项目详情 `/api/projects/[id]`、角色 `/api/characters/[id]`、`/api/characters`、规则 `/api/rules`、故事线 `/api/storylines`、待办 `/api/pending-items`、统计 `/api/stats/monitor`、节点 `/api/story/nodes`、伏笔 `/api/foreshadowing/list`、世界书 `/api/lorebook/[id]` 等路由的 catch 块统一改为 `jsonError(err)`",
          "消除数据库未连接时 API 返回的原始 `__TURBOPACK__...` / `prisma.xxx.findMany()` 内部堆栈，前端拿到的是 `{error, code, hint}` 结构化的中文可读错误",
        ],
      },
      {
        label: "无数据库时的优雅降级",
        items: [
          "拆书页 `/dissect` 加载失败时不再弹出内部错误边界，改为居中友好空状态：标题「拆书任务加载失败」+ 错误原因 + 修复指引 +「重试」按钮",
          "拆书页在加载错误期间暂停 3 秒自动轮询，避免反复请求失败接口",
        ],
      },
      {
        label: "环境变量配置 API",
        items: [
          "在用户目录 `novel-forge-github/.env` 与沙箱仓库 `.env` 写入 DeepSeek 配置：`LLM_PROVIDER=deepseek`、`LLM_API_KEY`（用户提供）、`LLM_MODEL=deepseek-v4-flash`、`LLM_BASE_URL=https://api.deepseek.com`",
          "`DATABASE_URL` 默认指向 `docker compose up -d` 启动的 PostgreSQL，用户只需启动 Docker 即可让数据层跑通",
        ],
      },
      {
        label: "质量验证",
        items: [
          "tsc --noEmit 零错误；生产构建 64 页通过",
          "本地 3001 服务重启后 `/`、`/changelog`、`/settings`、`/explore`、`/dissect` 全部 200，浏览器控制台无 JS 报错",
          "curl `/api/dissect/list` 验证返回结构化中文错误，不再暴露 Prisma 内部路径",
        ],
      },
    ],
  },
  {
    version: "v0.26.2",
    date: "2026-07-26",
    title: "🛡 Pipeline 检查与 bug 修复：数组空值兜底、lorebook 死代码清理、类型对齐",
    sections: [
      {
        label: "运行时 bug 修复",
        items: [
          "LeftPanel 向子组件传递的数组统一加 `?? []` 兜底：`project.storyNodes ?? []` / `project.characters ?? []` / `project.lorebookEntries ?? []`，避免后端数据缺少字段时进入对应 tab 白屏",
          "CharacterList / WorldPanel 的数组 prop 改为可选（`characters?: CharacterData[]`、`entries?: LorebookData[]`）并默认空数组，从调用方到组件自身双层防御空值",
        ],
      },
      {
        label: "lorebook 死代码清理",
        items: [
          "v0.26.1 移除工作台冗余 lorebook 标签后，`onNewLore` / `showNewLore` / `<LorebookCreateDialog>` 已没有任何入口可触发，成为死代码；已清理 LeftPanel 与 workspace/[projectId]/page.tsx 中相关 props/state/渲染",
          "删除无人引用的组件文件 `LorebookList.tsx`（全仓 0 import）与 `LorebookCreateDialog.tsx`（仅被死代码渲染），精简代码库",
        ],
      },
      {
        label: "类型与一致性",
        items: [
          "LeftPanel 与 workspace 页面的 tab 联合类型移除已废弃的 `\"lorebook\"`，避免误切到无对应渲染分支的空白面板",
        ],
      },
      {
        label: "pipeline 检查",
        items: [
          "运行 `npx tsc --noEmit`：零错误",
          "运行 `npm run lint`：680 个既有 `no-explicit-any` 历史债务（memory-classifier/memory-decay 等），本次改动未引入新 lint 错误",
          "浏览器自动化检查 3001 首页/设置/探索/拆书/公告页：无客户端 JS 报错，无崩溃",
        ],
      },
    ],
  },
  {
    version: "v0.26.1",
    date: "2026-07-26",
    title: "🧹 前端按钮去重与矛盾消除：共享删除 Hook、冗余标签清理、加载态补全",
    sections: [
      {
        label: "删除逻辑去重（重构）",
        items: [
          "新增共享 Hook `useConfirmDelete`（src/components/workspace/useConfirmDelete.ts）：统一封装「确认弹窗 → 忙态锁定 → 删除 → 成功刷新 / 失败 toast」流程",
          "7 处删除入口（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）改用该 Hook，移除约 90 行重复样板，并消除各文件删除错误处理不一致、提示文案凌乱的隐患",
        ],
      },
      {
        label: "矛盾按钮消除（修复）",
        items: [
          "工作台侧栏原 `world` 与 `lorebook` 两个标签渲染同一 WorldPanel，形成重复且矛盾的入口；删除冗余的 lorebook 标签，仅保留 world 单一入口",
          "CharacterList 的 `onDelete` 由 `() => void` 修正为 `() => Promise<void>`，删除失败现在能被 Hook 正确捕获并提示，不再被静默吞掉",
        ],
      },
      {
        label: "按钮加载态补全（修复）",
        items: [
          "大纲树（OutlineTree）章节节点删除按钮此前缺失禁用/忙态，点击后无视觉反馈；现接入 `deletingId`，删除进行中禁用并锁定该按钮，防重复点击，消除「点了没反应」的矛盾观感",
        ],
      },
      {
        label: "构建与自检（质量）",
        items: [
          "tsc --noEmit 零错误；生产构建 64 个页面零警告通过",
          "本地服务自检：首页 / 设置 / 更新面板 / 探索 / 拆书 等所有页面路由返回 200，渲染真实内容（非错误边界）",
        ],
      },
    ],
  },
  {
    version: "v0.26.0",
    date: "2026-07-26",
    title: "🔔 交互硬化与 UI 美化：全局提示系统、按钮反馈与 DeepSeek 跑通",
    sections: [
      {
        label: "全局交互系统（新增）",
        items: [
          "新增全局 Toast + Confirm + Prompt 组件（src/components/ui/toast.tsx），统一替代所有原生 alert / confirm / prompt：右下角滑入、按类型（成功/错误/警告/信息）着色、自动消失、可手动关闭；确认/输入弹窗为虚空玻璃风格模态框，返回 Promise，Provider 未挂载时安全退化为原生对话框",
          "全局按钮基础样式（globals.css）：所有按钮（含原生 <button>）统一具备点击下沉、禁用态、聚焦光环的视觉按压反馈",
          "共享 Button 组件新增 `loading` 属性：异步操作期间显示 Spinner 并自动禁用，点击「有确定感」",
        ],
      },
      {
        label: "全站交互硬化（修复）",
        items: [
          "19 个文件原生 alert 全部替换为分类型 toast：错误不再被静默吞掉，成功/信息有明确正向反馈",
          "7 处破坏性删除（角色 / 故事线 / 规则 / 世界书条目 / 项目 / 拆书任务 / 章节节点）原生 confirm 替换为 styled 确认弹窗，并加 deleting 忙态锁定删除按钮，误删风险归零",
          "工作台「新建章节 / 小节」原生 prompt 替换为 styled 输入框弹窗（promptDialog），保持视觉一致",
        ],
      },
      {
        label: "DeepSeek 跑通（新增 / 修复）",
        items: [
          "llm.ts 新增各 Provider 默认模型表（DeepSeek → deepseek-v4-flash 等）；模型留空不再硬报错，读者只填 Key 即可跑",
          "testLLMConnection 默认模型按 Provider 取值，并兼容 DeepSeek v4 等推理模型（先思考后输出正文）——连接测试不再误判「返回格式异常」",
          "实测：以用户提供的 DeepSeek Key 经 /api/settings/test 与原始 HTTP 调用均返回 200 与正确中文内容，集成已跑通",
        ],
      },
    ],
  },
  {
    version: "v0.25.0",
    date: "2026-07-26",
    title: "🎨 UI 优化：首页重塑、布局修复与响应式打磨",
    sections: [
      {
        label: "布局缺陷修复（必须修）",
        items: [
          "系统自检横幅原为 `sticky top-0 z-50`，与页面 `sticky top-0 z-10` 页头争抢顶部导致页头被遮挡；改为 `relative` 后横幅处于文档流顶部、滚动时自然让位给粘性页头，重叠消除",
        ],
      },
      {
        label: "首页重塑",
        items: [
          "新增 Hero 欢迎区（标题 + 一句话定位 + 开始创作 / 拆书分析双 CTA），首屏更有产品感",
          "空项目状态由居中提示改为三张「起步引导卡」：探讨模式、拆书分析、配置 AI，直接引导用户完成关键第一步",
        ],
      },
      {
        label: "响应式与一致性",
        items: [
          "顶栏「开始创作 / 拆书 / 设置」按钮在移动端（<640px）自动隐藏文字仅留图标，窄屏不再拥挤",
          "更新面板「最新」徽标由 emerald 绿统一为 indigo 靛蓝，与该页及全站设计令牌一致",
        ],
      },
    ],
  },
  {
    version: "v0.24.9",
    date: "2026-07-26",
    title: "🏗️ 成品化：去远程字体依赖，整站可离线构建",
    sections: [
      {
        label: "构建成品化",
        items: [
          "移除 next/font/google 的 Geist / JetBrains Mono 远程拉取，改用系统字体栈（中文回退 PingFang SC / Microsoft YaHei）——任意环境（含无外网）`next build` 均可成功",
          "64 个页面静态生成全部通过，TypeScript 零错误，整站进入可部署成品状态",
        ],
      },
      {
        label: "构建警告清除",
        items: [
          "next.config.ts 显式声明 `turbopack.root = process.cwd()`，消除因上层目录多余 lockfile 导致的 workspace root 误判警告",
        ],
      },
      {
        label: "可移植性",
        items: [
          "部署不再依赖构建期联网拉取字体；`docker compose up -d` + `npx prisma db push` + `npm run dev` 即可起站",
        ],
      },
    ],
  },
  {
    version: "v0.24.8",
    date: "2026-07-26",
    title: "🗑️ 修最后 1 处必须修：拆书任务删除假成功（未查 res.ok）",
    sections: [
      {
        label: "拆书任务删除（dissect/page.tsx handleDelete）",
        items: [
          "原逻辑：`await fetch(DELETE)` 后直接 `setTasks(filter)` 移除列表项，不检查 res.ok → 服务端 4xx/5xx 时 UI 显示已删而服务端仍在=假删除成功",
          "现改为：先判 `res.ok`，失败 alert 具体 HTTP 状态且不移除列表项，成功才移除",
        ],
      },
    ],
  },
  {
    version: "v0.24.7",
    date: "2026-07-26",
    title: "🔍 收口全局静默吞错（角色卡采纳/世界书新建/文风应用·保存 + 加载失败可见化）",
    sections: [
      {
        label: "写操作假成功（4 处必须修）",
        items: [
          "AIChatBar handleAdoptSuggestion：采纳角色卡建议原不检查 GET/PUT 的 res.ok（非 2xx 静默）→ 现 GET 失败显式提示并 return、PUT 失败显式提示，不再「点了没反应」",
          "WorldPanel 新建世界书：原 `if(res.ok)` 无 else、catch 静默 → 现失败 alert 且不关闭表单",
          "StyleSelector 应用文风 / StyleEditor 保存文风：PUT 失败仍关弹窗=假成功 → 现失败 alert 且不开窗/不关闭，成功才生效",
        ],
      },
      {
        label: "加载失败可见化（4 处）",
        items: [
          "settings 加载设置：原 `if(res.ok)` 无 else、catch 空 → 现失败显式提示",
          "ContextPreview 上下文预览：加载失败原静默显示「无法加载上下文数据」→ 现显式报错条 + 原因",
          "StyleEditor 加载文风配置：失败原静默用默认配置 → 现显式报错弹窗",
          "ImitationPanel 拆书任务列表/维度加载：原 catch 静默置空 → 现显式提示失败原因",
        ],
      },
    ],
  },
  {
    version: "v0.24.6",
    date: "2026-07-26",
    title: "🔍 收尾 P1 静默吞错（章节提取/节点操作/故事线/关系同步/角色·词条·规则删除·开关）",
    sections: [
      {
        label: "章节与节点操作",
        items: [
          "autoExtractChapter（12 维度自动提取）：失败原仅 console.error 静默 → 现 alert 明确提示，不再「转圈后无结果」",
          "handleAddSection / handleSummarize：非 200 原静默 → 现失败 alert 具体原因；网络异常也提示",
          "handleDeleteNode：网络异常原静默 → 现 alert",
        ],
      },
      {
        label: "故事线面板（StorylineList）",
        items: [
          "加载失败原误显「还没有故事线」空态 → 现显式报错条 + 重试按钮，区分「无数据」与「加载失败」",
          "handleSave / handleDelete：原不检查 res.ok（保存失败仍关弹窗=假成功）→ 现失败 alert 且不关弹窗/不刷新",
        ],
      },
      {
        label: "关系同步与侧栏删除·开关",
        items: [
          "AIChatBar relation_sync：原不检查 syncRes.ok 且 catch 静默 → 现非 200 抛错 + 失败 alert，同步真实结果才提示",
          "AIChatBar analyze_relationships 的 catch 静默 → 现失败 alert",
          "LeftPanel 角色删除 / WorldPanel 词条删除 / RulesPanel 规则删除·开关：原不检查 res.ok → 现失败 alert 且不刷新（避免误以为已删/已切换）",
        ],
      },
    ],
  },
  {
    version: "v0.24.5",
    date: "2026-07-26",
    title: "🛡️ 修 P0 假成功/数据丢失（抽卡章纲 + 角色/词条弹窗 + 作者注记）",
    sections: [
      {
        label: "抽卡章纲保存（handleDrawSelect）",
        items: [
          "原逻辑：PUT 保存失败被 catch{} 静默吞掉，仍乐观显示「已采用」→ 用户以为章纲已存，刷新后丢失",
          "现改为：先请求成功（res.ok）才更新显示「已采用」；失败 alert 明确原因，不再误导",
        ],
      },
      {
        label: "角色/词条 编辑·创建弹窗",
        items: [
          "CharacterEditDialog / LorebookEditDialog 的 handleSave：原直接 await fetch 后 onSave+onClose，不检查 res.ok → PUT 失败弹窗关闭=假成功（编辑丢失）",
          "CharacterCreateDialog / LorebookCreateDialog 的 handleSave：POST 失败无提示 → 点了没反应",
          "现四个弹窗统一：检查 res.ok，失败 alert 且不关闭弹窗（保留用户输入可重试），成功才 onSave+onClose",
        ],
      },
      {
        label: "作者注记自动保存（handleAuthorNoteChange）",
        items: [
          "防抖 PATCH 原 catch{} 静默 → 服务端未存时刷新即丢注记，用户无感",
          "现失败 alert 提示（区分 5xx/网络），并保留 localStorage 兜底",
        ],
      },
    ],
  },
  {
    version: "v0.24.4",
    date: "2026-07-26",
    title: "🔧 后端错误结构化 + 死代码清理",
    sections: [
      {
        label: "后端错误响应结构化",
        items: [
          "explore/create、explore/chat（对话/一键生成/大纲三处）、agent/extract-chapter、imitate/start 外层共 6 个 catch 统一改用 jsonError",
          "返回标准化 { error, code, hint }：Prisma/网络连接错误给出针对性中文修复指引（如「请执行 npx prisma db push 建表」），不再只甩原始堆栈",
          "SSE 流式错误（explore 大纲流、imitate 流内）此前已用 SSE error 事件推送，保持不变；settings/test 维持 { ok:false, error } 前端契约不改",
        ],
      },
      {
        label: "死代码清理",
        items: [
          "删除 src/lib/conversation-compressor.ts——全代码库 0 引用（仅更新日志历史文本提及），属历史遗留冗余模块",
        ],
      },
    ],
  },
  {
    version: "v0.24.3",
    date: "2026-07-26",
    title: "🛠️ 工作台静默错误清零（修白屏 + 修假成功）",
    sections: [
      {
        label: "工作台加载失败不再白屏",
        items: [
          "workspace/[projectId] 的 loadProject 原本 catch 仅 console.error → 后端/DB 未就绪时整页白屏且无任何提示",
          "现统一错误状态：网络异常或 5xx 显示可读错误卡片（含原因）+「重试」按钮；仅 404 判定「项目不存在」跳转首页",
          "错误提示明确指引：请检查后端服务是否已启动并连接数据库",
        ],
      },
      {
        label: "大纲保存假成功修复",
        items: [
          "onEditOutline 原 catch {} 乐观更新后静默吞错 → 保存其实失败时用户以为成功、数据已丢",
          "现捕获 prev、请求非 2xx 或网络异常时回滚选中节点并 alert 明确原因，杜绝静默丢数据",
        ],
      },
    ],
  },
  {
    version: "v0.24.2",
    date: "2026-07-26",
    title: "🚪 修复部署启动链路（直击「完全不能用」真实根因）",
    sections: [
      {
        label: "端口错配修复（最关键）",
        items: [
          "README/AGENTS 全程写 `localhost:3001`，但 npm 脚本原是 `next dev`（默认 3000），用户照文档打开 3001 必空白页",
          "`dev`/`start` 改为 `next dev -p 3001` / `next start -p 3001`，与文档完全对齐",
        ],
      },
      {
        label: "环境要求校正",
        items: [
          "package.json 加 `engines: { node: \">=20\" }`，Next 16 强要求 Node ≥20",
          "README 表格 Node 版本 18.x → 20.x（≥20），安装说明同步强调；方式二手动 PG 补上 `echo DATABASE_URL > .env` 步骤（此前漏写会导致 db push 直接失败）",
        ],
      },
      {
        label: "配套（v0.24.0/v0.24.1）",
        items: [
          "系统自检横幅 + /api/health 探针，打开即提示 DB/AI 是否就绪",
          "npm run doctor 启动前自检；前端删除/拆书失败显式提示",
        ],
      },
    ],
  },
  {
    version: "v0.24.1",
    date: "2026-07-26",
    title: "🖥️ 前端错误不再静默（修「点了没反应」）",
    sections: [
      {
        label: "前端 fetch 错误可见化",
        items: [
          "仪表盘「删除项目」失败（含非 200）现在弹窗明确提示原因，不再静默无反应",
          "拆书列表加载失败显示红色报错条 + 重试按钮，不再误显示「还没有任务」空态",
          "拆书详情轮询失败显示顶部报错条 + 重试，避免轮询静默空白",
          "首页底部链接「更新公告」统一更名为「更新面板」，与站内面板一致",
        ],
      },
      {
        label: "后端配套（已在 v0.24.0）",
        items: [
          "5 个高频路由 catch 改用 jsonError，返回 {error, code, hint} 中文操作指引",
          "全局 error.tsx / global-error.tsx 错误边界，未捕获异常显示中文友好页",
        ],
      },
    ],
  },
  {
    version: "v0.24.0",
    date: "2026-07-26",
    title: "📋 站内更新面板 + 高频路由错误可读化",
    sections: [
      {
        label: "站内更新面板（/changelog）",
        items: [
          "页面顶部突出「当前版本」号与「最新」徽标，用户随时回看每个版本的版本号与更新内容",
          "固化记录协议：每次改动都在本文件的 VERSIONS 数组插入条目 + 同步根目录 CHANGELOG.md（两文件一起提交），面板即唯一记录出口",
        ],
      },
      {
        label: "高频 API 路由错误可读化",
        items: [
          "探讨「采纳」、拆书「查询/删除/启动」、实体高亮、Agent 工具执行 等 5 个高频路由的 catch 统一改用 jsonError，返回 {error, code, hint} 中文操作指引",
          "彻底告别「点了没反应却不知为何」——前端拿到可读错误即可直接展示",
        ],
      },
      {
        label: "健壮性修复",
        items: [
          "修复 /api/health 中 llm.hint 可能 undefined 的类型错误",
          "新增全局 error.tsx / global-error.tsx 错误边界，未捕获异常显示中文友好页而非白屏",
        ],
      },
    ],
  },
  {
    version: "v0.23.0",
    date: "2026-07-25",
    title: "🩺 系统自检与首启动引导（失败可读化）",
    sections: [
      {
        label: "系统状态自检横幅",
        items: [
          "根布局挂载全局 SystemStatusBanner，打开任意页面即调用 /api/health 探测 DB 与 AI 配置",
          "数据库未连接 / AI 未配置时顶部弹出琥珀色横幅：说明原因 + 给出 `docker compose up -d && npx prisma db push` 一键修复命令（可复制）或「去设置页填 Key」入口",
          "直击此前「完全不能用却找不到原因」的核心痛点——失败现在可读、可操作，而非静默空白",
        ],
      },
      {
        label: "健康检查探针",
        items: [
          "新增 GET /api/health——只读轻量探针，返回 { db:{ok,error,hint}, llm:{ok,error,hint}, version }",
          "DB 探测用 SELECT 1 实际连库（区分「环境变量存在 ≠ 有效」）；LLM 探测复用 getSettings 配置优先级",
          "任何异常都被吞掉并返回结构化结果，自检本身绝不拖垮页面",
        ],
      },
      {
        label: "API 错误可读化",
        items: [
          "新增 src/lib/api-error.ts：classifyError 把 Prisma 错误码（P1001 连不上 / P1000 登录失败 / P2021 表不存在 / P2024 连接池耗尽 / P2002 唯一冲突 …）翻译为中文操作指引",
          "jsonError() 统一返回 { error, code, hint }，已接入 /api/projects 与 /api/settings 两个首个触点路由",
        ],
      },
      {
        label: "首页加载失败可见",
        items: [
          "仪表盘加载项目失败时不再误显示「还没有小说项目」空态，改为明确报错卡片 + 重试按钮",
          "提示用户查看顶部黄色自检横幅按指引修复",
        ],
      },
    ],
  },
  {
    version: "v0.22.0",
    date: "2026-07-25",
    title: "🛡️ 稳定性与可观测性加固（可读错误 + 启动自检）",
    sections: [
      {
        label: "AI 错误可读化",
        items: [
          "所有 LLM 调用（流式/非流式）的报错从原始 `LLM API Error 401: ...` 统一翻译为可操作中文提示",
          "覆盖 401(Key 无效/过期) / 403(无权限) / 404(模型不存在，附硅基流动 vs DeepSeek 格式提示) / 429(限流) / 5xx(服务端异常)",
          "网络层异常（Base URL 配错、服务断连）也会给出明确指引，不再静默失败",
        ],
      },
      {
        label: "启动自检 doctor",
        items: [
          "新增 `npm run doctor`——启动前自动校验 PostgreSQL 可连接、LLM 配置是否就绪",
          "明确区分「环境变量存在 ≠ 有效」，避免「完全不能用」却找不到原因",
        ],
      },
      {
        label: "更新表同步",
        items: [
          "CHANGELOG.md 与 src/lib/changelog-data.ts 同步更新至 v0.22.0",
        ],
      },
    ],
  },
  {
    version: "v0.21.2",
    date: "2026-06-21",
    title: "🐳 Docker 一键安装 + README 重写优化安装体验",
    sections: [
      {
        label: "README 重写",
        items: [
          "Docker 作为首选安装方式——docker compose up -d 替代手动 PostgreSQL",
          "快速开始拆为两条路径：Docker（推荐，7行命令）和手动安装",
          "详细教程新增「方式一：Docker」完整4步指南——从零到跑起来",
          "环境表格补上 Git 依赖，之前克隆项目的工具反而没列",
          "PostgreSQL 创建命令从硬编码 PostgreSQL\\16 改为 createdb 直调",
          "新增「生产部署」章节——npm run build && npm start 日常使用",
        ]
      },
      {
        label: "常见问题扩充",
        items: [
          "新增：不想装 PostgreSQL 怎么办（推荐 Docker）",
          "新增：怎么关掉数据库释放内存（Docker + 手动安装两条路）",
          "新增：能部署到服务器上公网访问吗",
        ]
      },
    ]
  },
  {
    version: "v0.21.1",
    date: "2026-06-18",
    title: "🎨 虚空玻璃设计体系 + SVG图标系统 + 字体/Tooltip优化",
    sections: [
      {
        label: "虚空玻璃设计体系基建",
        items: [
          "3级深度表面系统：surface-base(噪点纹理)/surface-elevated(卡片)/surface-floating(模态)",
          "8色功能语义色彩(OKLCH空间)：靛蓝(主操作)/翠绿(确认)/琥珀(提醒)/玫瑰(危险)/紫罗兰(AI)/青(信息)/金(强调)",
          "4种按钮变体：btn-primary/success/danger/creative + btn-ghost幽灵按钮",
          "4档动画曲线(弹性/缓出/缓入/平滑) × 4档时长(150/250/400/600ms)",
          "统一输入框系统 input-glass + 聚焦辉光 + CSS噪点纹理消除塑料感",
        ],
      },
      {
        label: "SVG图标系统 + 全站迁移",
        items: [
          "新建 src/components/ui/icons.tsx——30+ Lucide图标 + StatusDot彩色圆点组件 + 语义色彩预设",
          "全站15个页面/组件 emoji → SVG图标替换（首页/设置/更新公告/探讨/工作台核心组件）",
          "实体面板9种类型图标SVG化 + 伏笔面板状态点(🟢🟡🔵⚫) → StatusDot",
          "AIChatBar Bot/User头像 + 角色面板筛选标签全部图标化",
        ],
      },
      {
        label: "字体链 + 文字层级 + 悬停系统",
        items: [
          "字体栈：Geist Sans → PingFang SC → Microsoft YaHei → system-ui（中文fallback链）",
          "等宽字体：JetBrains Mono替代Geist Mono——代码/API Key更清晰",
          "4级文字明度(L1主/L2辅/L3弱/L4禁用) + 6级排版比例(text-2xs→text-2xl)",
          "Tooltip纯CSS系统(data-tooltip属性驱动) + 链接悬停下划线动画(link-underline)",
          "3级悬停阴影(sm/md/lg) + 3色辉光(indigo/success/creative)",
        ],
      },
      {
        label: "设计类实际应用",
        items: [
          "首页项目卡片 → surface-elevated + card-lift；导航链接 → btn-ghost",
          "创建对话框/更新公告弹窗 → surface-floating + animate-spring 动画入场",
          "设置页所有输入框 → input-glass；保存按钮 → btn-primary；测试按钮 → btn-ghost",
          "状态消息emoji(✅❌) → Icon check/alert 组件",
        ],
      },
    ],
  },
  {
    version: "v0.21.0",
    date: "2026-06-18",
    title: "✨ UI全面升级 + 探讨模式重构 + 写作铁律注入",
    sections: [
      {
        label: "UI 全面升级——玻璃态设计",
        items: [
          "35+组件统一视觉：玻璃表面(bg-white/[0.02] backdrop-blur-sm) + 按压反馈(active:scale-[0.97])",
          "首页/设置/更新公告/探讨/工作台/拆书 全部页面 Premium 化",
          "新增设计 token：glass-surface / btn-press / card-lift / glow-pulse / fade-in-up 动画类",
          "自定义滚动条 + 聚焦光环 + 渐变按钮阴影 + 悬停上浮效果",
          "探讨页面拆分为 ChatPanel(230行) / OutlinePanel(210行) / CardBrowser(100行) 独立组件",
        ],
      },
      {
        label: "探讨模式架构重构",
        items: [
          "新增共享工具模块 src/core/explore/utils.ts——消除 stepToCategory/extractJson/extractKeysFromText 三处重复",
          "chat/route.ts 复用 shared utils 的 extractJson（-15行重复代码）",
          "adopt/route.ts 复用 stepToCategory + tryExtractStructured + extractCharacterKeys（-55行重复代码）",
          "create/route.ts 复用 stepToCategory + extractKeysFromText，重写 generateDefaultRules()",
          "删除废弃端点 outline/route.ts（207行死代码，零引用）",
        ],
      },
      {
        label: "写作铁律自动注入系统",
        items: [
          "新建项目时自动创建7条写作铁律到 Rule 表（scope=write_only, priority=94~100）",
          "句式铁律——长短交错，禁止短句堆砌 | 人物指代——名字优先，禁止他/她连用",
          "禁用符号与禁用句式 | 禁止描写声音/语气/眼神/视线",
          "白描铁律——可观察/可直感/零解读 | 节奏控制——详略与描写密度 | 情节与情绪——拉扯/抑扬/反转",
          "生成时自动注入：getActiveRules(\"write_only\") → injectRules() → 拼入 Prompt 顶部",
        ],
      },
      {
        label: "拆书功能增强",
        items: [
          "15维度智能拆解 + 仿写引擎 + 并行化8x提速",
          "拆书结果 UI 重设计——双路径创建项目（直接导入 / AI完善后导入）",
          "角色扩展 Step 0 硬过滤 + 复合名智能拆分 + 预览迷你卡",
          "世界书 AI 扩展五步管线——审计→拆分→删非词条→去重合并→扩展",
        ],
      },
    ],
  },
  {
    version: "v0.20.36",
    date: "2026-06-18",
    title: "🎯 探讨模式——对话式构建小说世界",
    sections: [
      {
        label: "探讨模式核心",
        items: [
          "/explore 页面——三栏布局：左构建配置 / 中AI对话 / 右已采纳内容",
          "11个构建步骤导航：开篇→世界观→主角→金手指→冲突→势力→力量→货币→地图→情节→自由讨论",
          "双模式切换：💬对话模式(自由交流) / 🃏抽卡模式(AI出3-5张候选卡，点选采纳)",
          "POST /api/explore/chat——AI对话端点，上下文来自构建配置+已采纳内容+当前步骤",
        ],
      },
      {
        label: "构建配置面板",
        items: [
          "基础字段：小说名称/主角名称/创作方向",
          "类型选择：12种小说类型(玄幻/仙侠/都市/科幻/历史/言情/悬疑/武侠/奇幻/末世/游戏/军事)",
          "流派标签：60+流派(系统流/重生/穿越/无敌流等)，多选自由组合",
          "受众定位+篇幅字数+情节结构(五幕式/三幕式/英雄之旅/起承转合/序破急)",
          "风格偏好8选+力量体系40选+金手指50选+核心冲突+强制原创命名+自动生成故事线",
        ],
      },
      {
        label: "创建项目",
        items: [
          "POST /api/explore/create——从构建配置+已采纳内容创建项目",
          "📦 直接创建——采纳的设定→世界书词条(按步骤自动分类)+主角名→角色卡",
          "🤖 AI完善后创建——LLM检测缺失设定并补充后再创建",
          "导航栏新增「🎯 探讨」入口，与拆书/设置并列",
        ],
      },
    ],
  },
  {
    version: "v0.20.35",
    date: "2026-06-18",
    title: "🛡️ Step 0硬过滤 + 复合名拆分 + 拆书预览迷你卡",
    sections: [
      {
        label: "Step 0 硬过滤",
        items: [
          "characters/expand 在AI审计前增加代码级预过滤——isValidCharName()内联实现",
          "100+字段标签硬黑名单（性别/年龄/外貌/一、主角/二、配角/在/背/与/性/说...）",
          "100+常见姓氏白名单——2字名须以姓氏开头",
          "硬过滤先删→再AI审计→再扩展，三步递进确保零垃圾残留",
        ],
      },
      {
        label: "复合名智能拆分",
        items: [
          "「叶临渊 / 林玄言」在硬过滤阶段检测到斜杠→自动拆为两个独立角色卡",
          "拆分后继承原卡的background/abilities/personality等数据",
          "自动标记「🆕 自动拆分」标签",
        ],
      },
      {
        label: "拆书预览迷你卡",
        items: [
          "DissectDimensions角色预览从简单name标签→迷你角色卡（头像+名字+角色badge+描述）",
          "角色定位badge色彩区分：★主角(amber)/◆反派(red)/◈导师(blue)/●配角(gray)",
          "parseCharPreviewDetailed()返回CharPreviewItem结构（name+role+description+abilities）",
          "预览格式匹配工作区CharacterList，导入前后视觉完全一致",
        ],
      },
    ],
  },
  {
    version: "v0.20.34",
    date: "2026-06-18",
    title: "🔧 AI审计prompt修复——字段标签黑名单",
    sections: [
      {
        label: "角色扩展审计修复",
        items: [
          "新增【绝对非角色】黑名单——50+字段标签（性别/年龄/外貌/说话风格/别名/称号等）",
          "分段标题检测——「一、主角」「二、主要配角」「三、反派」等直接标记为非角色",
          "单字属性检测——「在」「背」「与」「性」「说」「年」「外」「能」「动」「别」「关」",
          "常见姓氏引导——李王张刘陈杨赵黄周吴等100+姓氏作为角色识别辅助",
        ],
      },
      {
        label: "世界书扩展审计修复",
        items: [
          "新增【绝对非词条】黑名单——角色字段标签+分段标题+角色名检测",
          "2-4字中文姓名检测——不会再把角色名保留在世界书列表中",
          "审计失败降级为全保留——避免误删正常词条",
        ],
      },
      {
        label: "端到端检验",
        items: [
          "琼明神女录项目实测：30角色→AI审计合并13组重复→17个去重后→扩展中",
          "修复后再次扩展将正确删除「在剧情中的作用」等12个字段标签",
          "最终预期：保留3-5个真实角色（裴语涵/季婵溪/叶临渊/林玄言/俞小塘）",
        ],
      },
    ],
  },
  {
    version: "v0.20.33",
    date: "2026-06-18",
    title: "📚 世界书AI扩展 + 五步管线",
    sections: [
      {
        label: "世界书AI扩展",
        items: [
          "POST /api/lorebook/expand — SSE流式，12并发，对标角色卡扩展端点",
          "五步管线：AI审计 → 拆分组合词条 → 删除非词条 → 去重合并 → 并发扩展",
          "每完成一个词条即时推送SSE进度 + 结果弹窗展示成功/失败列表",
          "LorebookList新增「🤖 AI扩展」按钮——勾选词条后一键处理",
        ],
      },
      {
        label: "AI审计",
        items: [
          "检测非词条——角色名/无关内容混入世界书列表→自动删除",
          "检测组合词条——一个词条涵盖多个独立主题→自动拆分新建",
          "检测分类错误——标题/内容与category不匹配→自动修正（geography/faction/magic_system等10类）",
          "审计失败不阻塞流程——降级为保留原数据继续扩展",
        ],
      },
      {
        label: "单词条扩展",
        items: [
          "补全短内容/空内容——基于标题和项目世界观推断",
          "生成触发词——从扩展后内容提取5-8个关键词",
          "拆分请求——AI判断内容混杂时返回shouldSplit+splitEntries",
          "失败降级——解析失败用safeMerge保留原数据",
        ],
      },
    ],
  },
  {
    version: "v0.20.32",
    date: "2026-06-18",
    title: "🔧 角色名合法性校验 + AI批量结构化 + 智能拆分",
    sections: [
      {
        label: "角色名合法性校验",
        items: [
          "常见中文姓氏库（100+单姓+20+复姓）——2字名必须以常见姓氏开头才认",
          "FIELD_LABELS 过滤集（100+字段标签）——性别/年龄/外貌/说话风格等永不误认",
          "isValidCharacterName() 统一校验——纯中文/长度2-5/含姓氏/不在标签集",
          "含顿号分段标题过滤——「一、主角」「二、主要配角」不被当成角色名",
        ],
      },
      {
        label: "AI批量结构化",
        items: [
          "aiStructureCharacters()——一次LLM调用补全所有兜底角色的年龄/性别/外貌/性格",
          "结构化输出匹配 CharacterCard 完整字段：appearance/personality/background/abilities/aliases",
          "AI失败自动降级为仅名字导入，不影响流程",
          "兜底导入角色自动加「🤖AI补全」标签，方便识别",
        ],
      },
      {
        label: "智能拆分与后处理",
        items: [
          "「叶临渊 / 林玄言」→ 自动拆分为两个独立角色，共享原有描述上下文",
          "parseCharacterList 结尾统一过滤——所有策略的产出都过合法性校验",
          "extractCharacterNamesFromAllDimensions 双重过滤——parseCharacterList + isValidCharacterName",
        ],
      },
    ],
  },
  {
    version: "v0.20.31",
    date: "2026-06-18",
    title: "🔧 角色导入修复 + AI填满按钮 + 格式统一",
    sections: [
      {
        label: "角色导入修复",
        items: [
          "quick模式分割重试：维度内容<20字符自动模糊匹配+独立LLM重试",
          "全字段映射：age/gender/aliases/appearance/dialogueStyle完整导入CharacterCard",
          "兜底扫描：角色维度解析失败时从大纲摘要/故事核心/势力阵营扫描角色名",
          "角色预览：拆书完成页显示提取到的角色名列表，一目了然",
        ],
      },
      {
        label: "AI填满按钮",
        items: [
          "角色卡编辑：🤖 AI填满按钮检测空白字段（外貌/性格/对话风格/背景等）自动补全",
          "世界书编辑：🤖 AI填满按钮补全词条内容和触发关键词",
          "POST /api/characters/[id]/autofill + /api/lorebook/[id]/autofill 两个端点",
          "补全后自动去除「📥拆书导入」标签，标记为已人工处理",
        ],
      },
      {
        label: "格式统一",
        items: [
          "拆书导入映射完整CharacterCard字段：appearance/personality/dialogueStyle/hiddenMotives等",
          "缺失字段留空（年龄=未知/性别=未知），不伪造数据",
          "DissectDimensions顶部新增三卡片导入预览：角色数/世界书词条数/文风状态",
          "characterPreview函数快速预扫角色名，不依赖完整解析",
        ],
      },
    ],
  },
  {
    version: "v0.20.30",
    date: "2026-06-18",
    title: "🎨 拆书结果UI重设计 + 双路径创建项目",
    sections: [
      {
        label: "结果展示重做",
        items: [
          "分组卡片式：总览/世界设定/力量体系/角色剧情/物品风格 5大组可折叠",
          "维度内嵌展开：300字预览→点击展开全部Markdown内容",
          "章节摘要双列网格：编号+标题+摘要，一目了然",
          "空维度自动隐藏，有内容的才显示",
        ],
      },
      {
        label: "双路径创建",
        items: [
          "📦 原样转项目：一键100%还原，角色/世界观/情节全部照搬",
          "🎨 改编后转项目：与Agent讨论修改方案，改满意后应用并创建",
          "to-project API 接受 modifications 参数，改编要求写入 authorNote + globalPrompt",
          "改编项目名自动加[改编]前缀，方便与原版区分",
        ],
      },
      {
        label: "改编讨论面板",
        items: [
          "新增 DissectAdaptPanel 组件：左侧参考拆书数据，右侧Agent对话",
          "修改要求自动累积，点击「应用修改并创建」时一起提交",
          "复用 /api/generate/chat 端点，零额外API开销",
        ],
      },
    ],
  },
  {
    version: "v0.20.29",
    date: "2026-06-18",
    title: "🔧 拆书进度可视化 + 防抖动优化",
    sections: [
      {
        label: "SSE 实时进度",
        items: [
          "start API 从 fire-and-forget 改为 SSE 长连接——连接存活 = 任务在跑",
          "不再丢异步上下文——之前 POST 返回后 Next.js 可能回收执行环境",
          "实时推流阶段：分章→维度提取(每完成一个维度推一次)→章节摘要",
          "前端 AbortController 支持中途取消",
          "SSE 断开后 DB 有完整进度,重进详情页轮询恢复",
        ],
      },
      {
        label: "屏幕晃动修复",
        items: [
          "进度条从 width 动画改为 transform: scaleX()——GPU 合成层,不走 reflow/layout",
          "will-change: transform 提前提升到合成层",
          "固定 min-height 容器：进度区 120px、维度网格 56px、内容区 60vh",
          "章节进度预分配空间(minHeight:20),文本出现不跳动",
          "tabular-nums 数字等宽,百分比变化时数字不位移",
        ],
      },
      {
        label: "轮询逻辑重构",
        items: [
          "useRef 存 interval——消除 useEffect 闭包陷阱导致的重复/遗漏轮询",
          "始终轮询(不管什么状态),后端决定返回什么——不再有条件判断导致停轮",
          "taskRef 实时同步最新状态给 interval 回调",
          "任务完成后降频到 30s 一次(省资源)",
        ],
      },
    ],
  },
  {
    version: "v0.20.28",
    date: "2026-06-18",
    title: "⚡ 拆书系统性能优化 — 并行化 + 智能采样",
    sections: [
      {
        label: "维度提取并行化",
        items: [
          "标准模式：4组维度并行跑 → 耗时从~80s降至~20s（4x提速）",
          "精细模式：15维度并发池(limit=8) → 耗时从~300s降至~40s（~8x提速）",
          "快速模式不变（本身单次LLM调用，无法再拆）",
          "通用并发池 withConcurrency<T,R>()——任意批处理任务可复用",
        ],
      },
      {
        label: "章节摘要并发池",
        items: [
          "withConcurrency(8) 模式——复用 characters/expand 的并发池设计",
          "50章从串行~250s降至并发~35s（~8x提速）",
          "单章失败不阻断其他章——容错性比串行更好",
        ],
      },
      {
        label: "智能文本采样（省Token+提质量）",
        items: [
          "buildDimensionTextSample()：每个维度只看对它最有价值的文本部位",
          "角色维度→对话密集段落+前5章完整出场",
          "风格维度→头/中/尾三段代表性样本（避免头重脚轻）",
          "情节维度→各章开头段落（情节引入点）",
          "地图/势力→搜索含地名/势力名的段落",
          "力量/功法→搜索含修炼术语的段落",
          "货币/物品→搜索含交易/物品关键词的段落",
          "预期：精准度提升 + Token节省~30%",
        ],
      },
      {
        label: "容错与进度",
        items: [
          "降级容错：单维度/单章失败自动标记failed，继续跑不拖累整体",
          "实时进度：每完成一个维度/章节就更新DB，前端轮询2s可见",
          "DB更新失败静默忽略（.catch(()=>{})），不影响提取主流程",
        ],
      },
    ],
  },
  {
    version: "v0.20.27",
    date: "2026-06-18",
    title: "📚 整本拆书系统 — 15维度智能拆解 + 仿写引擎",
    sections: [
      {
        label: "拆书导航（3页面）",
        items: [
          "/dissect — 任务列表，实时进度轮询，删除管理，转为项目快捷入口",
          "/dissect/new — 新建拆书，TXT文件上传/粘贴文本，三级深度选择，逐章摘要开关",
          "/dissect/[id] — 结果+仿写双标签页，15维度切换查看，仿写面板全功能",
        ],
      },
      {
        label: "15维度拆解",
        items: [
          "覆盖世界卡全部维度：基本信息/世界观/故事核心/角色/情节脉络/大纲摘要/伏笔/地图/势力阵营/力量体系/特殊设定/货币体系/物品/功法体系/写作风格分析",
          "三种深度：快速（1次LLM全提）/ 标准（4组分批）/ 精细（15维各单独LLM调用）",
          "可选逐章摘要：每章独立提取摘要+新角色+伏笔+情感基调",
        ],
      },
      {
        label: "仿写引擎",
        items: [
          "三种仿写模式：完全仿写（高还原原作风骨）/ 部分仿写（留骨架创新）/ 创意改写（借灵感重写）",
          "相似度滑块 0-100%，控制与原作结构/风格/RU的接近程度",
          "15维度自由勾选——选哪些原作维度，仿写就继承哪些设定",
          "SSE 流式实时输出，自定义额外要求栏位",
        ],
      },
      {
        label: "技术实现",
        items: [
          "Prisma 新模型 DissectionTask：JSON字段存15维度+章节列表，@db.Text 存全文",
          "核心引擎 src/core/dissect/：types(15维度定义) + prompts(提取模板) + engine(分章+逐维提取+转项目) + imitation-engine(仿写上下文构建+SSE流)",
          "5个新API：start / [id] / list / dimensions / to-project / imitate/start",
          "4个新组件：DissectUpload + DissectProgress + DissectDimensions + ImitationPanel",
          "仪表盘新增「📚 拆书」导航入口",
        ],
      },
    ],
  },
  {
    version: "v0.20.26",
    date: "2026-06-18",
    title: "📐 文风预设11种 + 5种大纲模板 + 游戏模式就绪",
    sections: [
      {
        label: "大纲模板（outlines.ts 新建）",
        items: [
          "三幕式：建置25%→对抗50%→结局25%，电影级结构",
          "起承转合：中国传统四段式，起20%/承35%/转30%/合15%，仙侠首选",
          "英雄之旅：12阶段坎贝尔原型，启程30%/启蒙45%/归来25%，长篇成长型",
          "章回体：每章独立成篇+章尾悬念钩子+对仗标题，网文连载标准节奏",
          "自由结构：不拘套路，AI做执行者，作者做结构师",
        ],
      },
      {
        label: "文风预设扩充",
        items: [
          "styles.ts 从9种扩充到11种：新增古风仙侠（半文半白+修仙体系）+ 现代都市（当代中文+场景驱动）",
          "覆盖全类型：热血/日常/黑暗/悬疑/恋爱/奇幻/科幻/情欲古风/仙侠/都市/自定义",
          "每种预设含 stylePrompt + temperature/topP + forbiddenPatterns + pacing/dialogueGuide",
        ],
      },
      {
        label: "游戏模式（已有）",
        items: [
          "game-engine.ts 446行 + game-prompts.ts 261行 + types.ts + 5个API路由 + 3个前端组件",
          "start/action/end 完整回合循环 + outline/generate + outline/chat 大纲辅助",
          "GameCanvas + GameParticles + GameOutlineEditor 前端就绪",
        ],
      },
    ],
  },
  {
    version: "v0.20.25",
    date: "2026-06-18",
    title: "🤖 Agent 工具层——智能调度 + 意图解析 + 分层提示词 + 对话压缩",
    sections: [
      {
        label: "工具依赖图调度 + 意图解析 + 路由",
        items: [
          "tool-scheduler.ts——拓扑排序自动分析21个工具依赖，18个并行+3个串行",
          "intent-parser.ts——纯规则引擎，关键词+正则拆解自然语言，覆盖六大意图类别",
          "agent-router.ts——一条管道串起 解析→调度→执行→汇总，21种工具各有专属摘要模板",
          "低置信度/空结果→needsLLMFallback()返回true，上游LLM兜底",
        ],
      },
      {
        label: "分层提示词 + 对话压缩",
        items: [
          "layered-prompt.ts——五层结构：身份/硬规则★★★/中等规则★/动态上下文/工具说明",
          "每层独立可启用/禁用/编辑，assembleLayeredPrompt()按层组装",
          "conversation-compressor.ts——三层策略压缩对话，纯规则摘要零Token",
          "主动压缩(6000+token→300摘要) / 极端压缩(8000+→仅保留最近3轮)",
        ],
      },
    ],
  },
  {
    version: "v0.20.24",
    date: "2026-06-18",
    title: "🧠 S/A/B 三级记忆注入 + Token 优化五策略 + 长效记忆衰减",
    sections: [
      {
        label: "S/A/B 三级记忆注入（Token 优化五策略）",
        items: [
          "memory-injector.ts——JSON结构化（省40%）、选择性字段、增量去重、引用压缩、分层截断",
          "pre-processor.ts 自动调用 classifyEvents 做 S/A/B 分级，orchestrator 注入 systemPrompt",
          "S级用紧凑JSON、A级只注章节号+描述、B级用关键词索引，综合节省~60% Token",
        ],
      },
      {
        label: "长效记忆衰减引擎",
        items: [
          "memory-decay.ts——S级永久/A级30章/B级15章/C级5章，过期自动逐级降级",
          "computeEventDecay() 单事件衰减计算，支持多级跳跃（A→C一次性跨级）",
          "cleanupExpiredMemories() 遍历所有 ChapterSummary.eventImportances 应用衰减",
        ],
      },
      {
        label: "衰减清理 API",
        items: [
          "GET /api/cron/memory-decay?projectId=xxx&dryRun=true——预览/执行两种模式",
          "正式执行返回 kept/downgraded/deleted + S/A/B/C 各层级分布统计",
          "dryRun 模式轻量预览：不写库，仅返回衰减规则+当前摘要数+最新章号",
        ],
      },
    ],
  },
  {
    version: "v0.20.23",
    date: "2026-06-18",
    title: "🛡️ 实时质量拦截 + 六维质量矩阵 + 记忆系统升级",
    sections: [
      {
        label: "实时规则检测",
        items: [
          "write/route.ts 流式生成中每 ~200 字符实时扫描禁用词",
          "违规通过 SSE rule_violation 即时推送——写中拦截，不等写完",
          "扫描耗时 <2ms，不影响流式流畅度",
        ],
      },
      {
        label: "六维质量矩阵自动评分",
        items: [
          "新建 quality-analyzer.ts——废词率/展示vs讲述/PoV/句式/对话/主语，六维纯本地算法",
          "每维 0-100 分加权总分 → A/B/C/D 四级 → 写入 StoryNode.qualityScore",
          "复用步骤1禁用词扫描结果，避免重复计算，零 Token 消耗",
        ],
      },
      {
        label: "记忆系统——时间线过滤",
        items: [
          "context-loader.ts 自动按 currentNode.order 过滤摘要/事件/伏笔",
          "根治跳章剧情污染——写第7章不会注入第10章的角色状态",
        ],
      },
      {
        label: "待兑现事项追踪",
        items: [
          "新增 PendingItem 模型 + /api/pending-items CRUD",
          "post-processor 自动检测「下次/回头/以后」关键词 → 自动创建待办",
          "下次生成时待办事项自动注入系统提示词，提醒AI兑现",
        ],
      },
    ],
  },
  {
    version: "v0.20.22",
    date: "2026-06-18",
    title: "🎯 12维风格参数注入 + 代码去重",
    sections: [
      {
        label: "12维风格参数端到端打通",
        items: [
          "修复 Style API PUT——body.dimensions 不再被静默丢弃，正确存入 llmConfig",
          "修复 Style API GET——返回 dimensions 字段",
          "orchestrator.ts 读取 llmConfig.dimensions → 生成风格参数块注入系统提示词",
          "12维标签完整映射：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力程度/暧昧程度",
        ],
      },
      {
        label: "continue/route.ts 消除内联查询",
        items: [
          "改用 loadGenerationContext(projectId, currentNodeId, 5)，与 write/refine 统一",
          "删除 9 表 Promise.all 内联查询块",
        ],
      },
      {
        label: "chapter-outline 路由代码去重",
        items: [
          "新建 src/core/pipeline/outline-context.ts 共享模块",
          "6 个共享函数：loadOutlineData/extractPrevContext/extractNextContext/buildCharacterList/prepareOutlineDirective/formatSummaries",
          "chapter-outline/route.ts 和 draw/route.ts 各减少 ~60 行重复代码",
        ],
      },
    ],
  },
  {
    version: "v0.20.21",
    date: "2026-06-17",
    title: "🧹 全站架构自查+清理",
    sections: [
      {
        label: "前端死代码清理（-2300行）",
        items: [
          "CardUpdater（1051行）— PostGenPanel 替代",
          "ChapterExtractionPanel（612行）— PostGenPanel 替代",
          "OutlineGenerator（327行）— OutlineDialog 替代",
          "EntityDetector（253行）— 旧UI残留",
          "StreamingText（11行）— MarkdownViewer 替代",
        ],
      },
      {
        label: "后端死代码清理",
        items: [
          "/api/agent/logic-check — post-processor 已内联相同逻辑且更完整",
          "/api/generate/check-all-cards — 前端不调用",
          "/api/generate/update-style-card — 文风走 projects/[id]/style",
          "commitment-tracker.ts — 完整类从未实例化",
        ],
      },
      {
        label: "Schema + Store 清理",
        items: [
          "移除 Project.povCharacterId / StoryNode.previousVersionId 死字段",
          "移除 Store reviewPanelOpen 死状态",
          "移除 core/types 中对应的死类型定义",
        ],
      },
      {
        label: "重复修复 + P0 集成",
        items: [
          "ReviewPanel 不再在 CenterPanel 重复渲染，审校结果只看 PostGenPanel",
          "PostGenPanel 改用统一 ReviewIssue 类型",
          "抽卡 DrawCards API 输出 P0 标准格式章纲 + 语法高亮着色",
        ],
      },
    ],
  },
  {
    version: "v0.20.20",
    date: "2026-06-17",
    title: "📋 P0标准格式章纲系统 + 游戏页内置编辑器",
    sections: [
      {
        label: "结构化章纲格式",
        items: [
          "三层架构：元信息(C|/L0|/L1|/L2|) → 叙事段落(R|/L|/G|/P|/⟨✍⟩) → 技术规格(CF|/M|/K|/EL|/T|)",
          "R|角色行动 L|场景切换 G|金手指 P|剧情推进 CF|伏笔 M|情绪 K|金句 EL|弧线 T|过渡",
          "⟨✍ 写作指令⟩ 导演批注，不构成故事内容，只指导AI怎么写",
        ],
      },
      {
        label: "章纲生成API",
        items: [
          "/api/game/outline/generate — Agent按P0格式一键生成，自动匹配角色白名单+地点+伏笔+前后章约束",
          "/api/game/outline/chat — 多轮对话确认章纲（SSE流式），支持探讨-反馈-定稿循环",
        ],
      },
      {
        label: "游戏页内置章纲编辑器",
        items: [
          "三模式切换：✏️编辑（语法高亮） / 👁预览（着色渲染） / 💬对话（AI对话确认）",
          "10种行类型着色：C|青 R|绿 L|青 G|金 P|灰 CF|紫 M|玫瑰 K|琥珀 EL|粉 T|青",
          "⚡AI生成按钮 + 💾保存到StoryNode.outline",
        ],
      },
      {
        label: "章节树游戏入口",
        items: [
          "每个章节/分节节点悬停即显示🎮按钮，点击直接进入游戏模式",
          "无需先在workspace选中章节再点游戏按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.19",
    date: "2026-06-17",
    title: "🎮 游戏模式上线——互动文本冒险写作",
    sections: [
      {
        label: "独立沉浸式 UI",
        items: [
          "全新路由 /workspace/[pid]/game/[nid]，全屏暗黑主题三栏布局",
          "6 个快捷动作按钮：观察/对话/战斗/探索/使用物品/休息 + 自定义文本输入",
          "简单星空粒子背景动画，安静不喧宾夺主",
        ],
      },
      {
        label: "核心游戏循环",
        items: [
          "SSE 流式输出：用户行动 → AI 生成 300-600 字叙事 → 2-4 个编号选项 → 循环",
          "每轮产出实体追踪（NE|格式）+ 背包变动（CI|格式）+ 情节进度百分比",
          "左侧面板：情节/角色/势力 Tab，右侧面板：正文/背包/世界 Tab",
        ],
      },
      {
        label: "结束并导出",
        items: [
          "点击\"结束并导出\"→检查章纲\"章尾悬念\"钩子→有钩子用钩子收尾，无钩子自然收束",
          "拼接全部累积正文→保存为 StoryNode.content，与 AI 直写无差别",
          "返回工作区即可看到完整章节正文",
        ],
      },
      {
        label: "后端新增",
        items: [
          "新增 GameSession + GameState 两张数据表",
          "3 条 API：/api/game/start /action（SSE） /end",
          "新增 src/core/game/ 模块：game-engine.ts / game-prompts.ts / types.ts",
          "CenterPanel 新增 🎮 游戏模式入口按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.18",
    date: "2026-06-17",
    title: "文风面板12维度升级 + 统一分析面板 + 逻辑自查 + 前端大清理",
    sections: [
      {
        label: "文风面板全面升级",
        items: [
          "10种预设风格库（热血/日常/黑暗/悬疑/恋爱/史诗/科幻/古风/极简/自定义），一键切换",
          "12维度滑块微调：词汇丰富度/句子长度/描写密度/对话比例/修辞手法/节奏速度/心理描写/环境描写/口语化/幽默感/暴力/暧昧",
          "废词检测引擎v3.0：5类检测器（精确禁用词/句式模式/身体模板/模糊词密度/AI高频词），内置50+规则，质量评分0-100",
          "三Tab面板：文风维度/废词检测（含扫描按钮）/LLM参数",
        ],
      },
      {
        label: "统一分析面板 PostGenPanel",
        items: [
          "4 Tab：📊章节提取/🔍逻辑自查/⚡本地蒸馏/📝审校，替代旧版6个碎片UI",
          "删除2个浮动横幅+1个浮动按钮+1个全屏加载遮罩+ChapterExtractionPanel+CardUpdater",
          "\"继续写下一节\"按钮移至PostGenPanel底部操作栏，\"AI分析本章变化\"改为自动触发",
        ],
      },
      {
        label: "逻辑自查自动化",
        items: [
          "新增 /api/agent/logic-check：角色死活一致性/时间线连续/关系突变/物品追踪，零Token",
          "切换到逻辑自查Tab自动运行，可手动重新检查",
        ],
      },
      {
        label: "前端大清理",
        items: [
          "删除 autoAnalyzeChapter 旧函数，统一为 autoExtractChapter → PostGenPanel",
          "删除 cardUpdatePending/pendingCardUpdateNodeId/autoUpdateNotification/preCardUpdateResult 等过时state",
          "CenterPanel 删除\"继续写下一节\"和\"AI分析本章变化\"两个按钮",
        ],
      },
    ],
  },
  {
    version: "v0.20.17",
    date: "2026-06-17",
    title: "章节自动提取系统 + 角色关系维度 + Agent 会话记忆",
    sections: [
      {
        label: "章节自动提取（12 维度）",
        items: [
          "生成完自动弹出提取面板：角色/场景/势力/道具/伏笔/情绪/台词/摘要/衔接/要素/经历/关系",
          "逐项采纳/编辑/取消，智能路人检测（提及<3次+无对话+无行动→不建卡）",
          "批量写入 5 张表：角色卡/世界书/伏笔/章节摘要/下章大纲",
          "替代旧 CardUpdater 自动触发，CardUpdater 保留手动入口作后备",
        ],
      },
      {
        label: "角色关系——世界书新维度",
        items: [
          "关系存为世界书条目 (character_relationship)，零 schema 变更",
          "Agent 从正文自动提取关系 → 融合替代写入世界书",
          "正文生成时强制注入涉及角色的关系条目（不走触发词，直接按角色名查）",
          "WorldPanel 新增「角色关系」板块，RelationshipGraph 重写为正文分析驱动",
        ],
      },
      {
        label: "Agent 会话记忆 + 写后分析",
        items: [
          "会话记忆：内存存储，按项目隔离，最多 20 条，30 分钟过期",
          "写后分析：对比正文 vs 角色卡，一键采纳更新能力/性格/关系/别名/状态/外貌",
          "新增 4 个 Agent 工具：analyze_chapter / analyze_relationships / relation_sync / extract_chapter",
        ],
      },
    ],
  },
  {
    version: "v0.20.16",
    date: "2026-06-17",
    title: "右侧栏重构——三 tab 一体化",
    sections: [
      {
        label: "三 tab 架构",
        items: [
          "🤖 AI助手——AI 对话栏从页面底部移入右侧面板",
          "🔍 查询实体——实体追踪 + 伏笔，子 tab 切换",
          "📊 监测——字数概览/Token估算/章节分布/数据记录",
        ],
      },
      {
        label: "监测面板",
        items: [
          "总字数/完成率/当前章字数/均章字数 实时展示",
          "Token 估算：生成/提示/总计（中文 1字≈0.8生成token）",
          "章节分布：最多/最少字数、完成进度",
        ],
      },
      {
        label: "交互优化",
        items: [
          "最小化状态三条竖排标签可点击切 tab",
          "底部统计栏 + 可折叠上下文监控保留",
        ],
      },
    ],
  },
  {
    version: "v0.20.15",
    date: "2026-06-17",
    title: "Agent 工具箱全面升级——21 工具接管所有按钮",
    sections: [
      {
        label: "角色管理 (5)",
        items: [
          "character_list/get/create/update/delete——完整 CRUD，create 支持快速导入原文描述",
          "character_get 返回完整信息：性格/外貌/对话风格/关系网/时间线/弧光",
        ],
      },
      {
        label: "世界书管理 (5)",
        items: [
          "lore_list/get/create/update/delete——覆盖地理/势力/物品/功法/生物/文化等全部 10 种分类",
          "lore_create 自动设置触发关键词，正文出现关键词时自动注入",
        ],
      },
      {
        label: "大纲管理 (4)",
        items: [
          "outline_list 返回完整大纲树（卷→章→节层级，含状态/字数）",
          "outline_create/update/delete——支持指定父节点、递归删除子节点",
        ],
      },
      {
        label: "伏笔 + 正文 + 其他 (7)",
        items: [
          "foreshadowing_list/create/update——创建/追踪/回收伏笔",
          "chapter_get/generate——查询正文 + 触发写作面板（frontendAction 机制）",
          "detect_entities + project_info——实体扫描 + 项目统计",
        ],
      },
      {
        label: "前端工具箱",
        items: [
          "AIChatBar 新增 6 个工具按钮：🧑查角色 📖查设定 🔮查伏笔 🔍扫实体 📋大纲 📊项目",
          "/api/tools/execute 接口——前端按钮直接执行任意工具",
          "chat route 支持 frontendAction 透传——工具可以通知前端弹面板",
        ],
      },
    ],
  },
  {
    version: "v0.20.14",
    date: "2026-06-17",
    title: "记忆系统闭环 + Agent 工具层",
    sections: [
      {
        label: "规则分类接入",
        items: [
          "memory-classifier 新增 tieredMemoryToImportances + classifyAndConvert 转换函数",
          "post-processor step 4.5 自动运行规则分类，LLM+规则双保险合并存入 ChapterSummary",
          "SSE classify_done 事件推送分类统计，失败降级不阻塞",
        ],
      },
      {
        label: "伏笔页签",
        items: [
          "ForeshadowingPanel 新组件——按状态分组（埋设中/部分回收/已回收/已废弃）",
          "/api/foreshadowing/list 新接口，按 projectId 返回分组伏笔列表",
          "RightPanel 支持实体/伏笔双 tab 切换，最小化状态动态显示当前 tab 名",
        ],
      },
      {
        label: "Agent 工具层",
        items: [
          "tool-registry 单例注册表——detect_entities/query_characters/query_lore/check_foreshadowing",
          "LLM client 支持 tools 参数 + toolCalls 解析 + tool 角色消息",
          "chat route 工具调用循环——LLM 可主动查角色/设定/伏笔后作答（最多 3 轮）",
        ],
      },
    ],
  },
  {
    version: "v0.20.13",
    date: "2026-06-17",
    title: "记忆系统——S级伏笔强制注入",
    sections: [
      {
        label: "S级记忆",
        items: [
          "buildForeshadowingSection——从 PendingCommitment 加载未回收伏笔，按到期章号排序",
          "标注 ⚠️ 待回收 + 预计回收章 + 关联角色，Token 预算 5%",
          "context-loader 并行加载 pendingCommitments（最多 30 条），所有路由自动生效",
        ],
      },
      {
        label: "记忆分级引擎",
        items: [
          "memory-classifier.ts — S/A/B 三级：伏笔+major→S，近5章→A，老章节→B归档",
          "formatTieredMemory() 按 token 预算智能截断注入",
        ],
      },
      {
        label: "Token 预算调整",
        items: [
          "新增 foreshadowing 5%（从 shortTerm 分出）",
          "shortTerm: 25%→20%，其他不变",
        ],
      },
    ],
  },
  {
    version: "v0.20.12",
    date: "2026-06-17",
    title: "右侧实体追踪面板 + 底部 AI 对话栏",
    sections: [
      {
        label: "实体追踪面板",
        items: [
          "ChapterEntitiesPanel 扫描章节正文，按 6 组分类展示已出现实体（角色/势力/物品/地点/世界观/功法）",
          "颜色圆点 + 实体名 + 数量标记，点击实体名打开编辑弹窗",
          "未注册实体标记提示，底部统计已注册总数和本章匹配次数",
          "RightPanel 标题改为「实体追踪」，原上下文监控折叠到底部",
        ],
      },
      {
        label: "AI 对话栏",
        items: [
          "AIChatBar 页面底部常驻：输入框 + 发送按钮 + 4 条快捷建议",
          "选中正文区间自动带上文发送，AI 回复显示在输入框上方",
          "新 API /api/generate/chat —— 200 字以内回复，温度 0.7",
        ],
      },
      {
        label: "共享逻辑",
        items: [
          "findEntitiesInText() 从 rehype 插件抽取到 entity-highlighter.ts",
          "高亮渲染和面板扫描共用同一套匹配逻辑（最长名优先 + 词边界检测）",
        ],
      },
    ],
  },
  {
    version: "v0.20.11",
    date: "2026-06-17",
    title: "Markdown 渲染 + 实体高亮 + 阅读排版",
    sections: [
      {
        label: "Markdown 渲染",
        items: [
          "MarkdownViewer 组件——react-markdown + remark-gfm，替换纯文本 StreamingText",
          "支持标题/粗斜体/引用块/列表/表格/代码块/删除线/链接，深色主题定制样式",
        ],
      },
      {
        label: "阅读排版",
        items: [
          "正文字号 14px→17px，行距 1.6→1.85，字间距 0.02em，内容区 700px 居中",
          "颜色纯白→柔白 #e2e2e2，章节标题自动居中，护眼舒适",
        ],
      },
      {
        label: "实体颜色高亮",
        items: [
          "低饱和度色板：柔蓝 #5B9BD5 / 苔绿 #70AD47 / 暗金 #D4A017 / 赭石 #C55A11 / 淡紫 #9B59B6",
          "API 路由加载→客户端 fetch + 60s 内存缓存",
          "rehype 插件遍历 HAST 包裹彩色 span，跳过 code/pre/a 标签",
          "正文底部实体图例 + 流式兼容",
        ],
      },
    ],
  },
  {
    version: "v0.20.10",
    date: "2026-06-17",
    title: "文风系统接通——模板 stylePrompt 真正注入生成提示词",
    sections: [
      {
        label: "核心修复",
        items: [
          "sync-global-prompt.ts 现读 llmConfig.styleTemplateId→加载模板→注入 stylePrompt+禁用词+节奏+对话指引",
          "style/route.ts 切换模板后自动调 syncGlobalPrompt 刷新缓存",
          "此前 9 个预设模板完全写好但 applyTemplate() 从未被任何生成路由调用——stylePrompt 只影响 temperature/topP",
        ],
      },
      {
        label: "注入内容",
        items: [
          "stylePrompt：200-300 字详细写作指令，标注为「最高优先级」",
          "禁用词/句式：从 forbiddenPatterns 转为 prompt 指令（不再仅后处理检查）",
          "节奏指引 pacingGuide + 对话指引 dialogueGuide 一并注入",
        ],
      },
    ],
  },
  {
    version: "v0.20.9",
    date: "2026-06-17",
    title: "人物关系独立提取 + 自动应用模式",
    sections: [
      {
        label: "人物关系提取",
        items: [
          "update-cards prompt 新增 characterRelations 输出（sourceName/targetName/relation/reason）",
          "关系类型 15 种：仇恨/爱慕/盟友/敌对/师徒/主仆/同门/血亲/恩人/利用/敬仰/嫉妒/竞争/合作",
          "apply-updates 多向总结：已存在关系→追加动态和原因，不存在→新建",
          "CardUpdater 新增 👥人物关系展示区域（粉色高亮）",
        ],
      },
      {
        label: "自动应用模式",
        items: [
          "CardUpdater 新增自动应用复选框——localStorage 持久化",
          "勾选后全选所有提取结果→自动调 apply-updates→关闭，跳过手动确认",
          "不勾选保持原有手动确认流程",
        ],
      },
    ],
  },
  {
    version: "v0.20.8",
    date: "2026-06-17",
    title: "世界构建面板拆分——11 板块独立管理",
    sections: [
      {
        label: "WorldPanel 组件",
        items: [
          "新建 WorldPanel 组件：11 个独立板块（地理/势力/物品/力量/功法/生物/文化/历史/法则/货币/特殊设定）",
          "每板块独立字段模板——地理有类型+父级，功法有品阶+属性+传承，货币有材质+层级+流通",
          "LeftPanel 集成：世界书→世界 tab，点击切换板块，空板块显示引导",
          "数据仍存 LorebookEntry，category 区分板块，不改数据库",
        ],
      },
      {
        label: "Prompt 注入优化",
        items: [
          "buildLoreSection 改为按板块分组注入，每板块独立小标题（如 🗺️地理环境）",
          "宽松格式：- 条目名：内容描述，纯自然语言，不给 LLM 结构化压力",
        ],
      },
    ],
  },
  {
    version: "v0.20.7",
    date: "2026-06-17",
    title: "情节脉络+支线故事自动提取——Storyline 七要素映射",
    sections: [
      {
        label: "情节脉络 & 支线故事",
        items: [
          "update-cards prompt 新增 plotLines/subPlots 输出（title/type/progress/stage/characters）",
          "apply-updates 写入 Storyline 表：同名线→追加阶段进展，新线→创建，七要素字段自动填充",
          "chapterBindings 自动绑定当前章节，stage 映射到七阶段之一",
          "CardUpdater 新增 📌情节脉络推进 / 🌿支线故事展开 展示区域",
        ],
      },
      {
        label: "功法体系",
        items: [
          "newLoreEntries category 新增 technique（功法/技能/传承）选项",
          "entity-auto-creator 已经能把功法实体写入 LorebookEntry",
        ],
      },
    ],
  },
  {
    version: "v0.20.6",
    date: "2026-06-17",
    title: "章节摘要→17模块自动映射（第一阶段）",
    sections: [
      {
        label: "修复 + 扩展",
        items: [
          "修复 apply-updates 伏笔写入 bug：newForeshadowings 现在自动创建 PendingCommitment 记录",
          "update-cards prompt 扩展：新增 worldSettings（6维）/ storyCore（3维）/ globalTimeline 输出字段",
          "apply-updates 写入路径扩展：worldSettings→Project.description，storyCore→Project.synopsis，globalTimeline→StoryBeat",
          "CardUpdater 面板新增 3 个展示区域：世界观设定/故事核心/全局时间线",
        ],
      },
    ],
  },
  {
    version: "v0.20.5",
    date: "2026-06-17",
    title: "前端 SSE 事件补全——蒸馏结果实时可见",
    sections: [
      {
        label: "SSE 事件处理",
        items: [
          "workspace/page.tsx：streamSSE 新增 6 种事件处理（distill_local_start/done、foreshadow_update、entity_auto_created/skip/error）",
          "types.ts：SSEEvent 类型扩展 stats/stateChanges/foreshadowEvents/newEntities/created/updated",
          "绿色蒸馏完成通知横幅——生成后自动弹出，显示完整蒸馏统计",
        ],
      },
    ],
  },
  {
    version: "v0.20.4",
    date: "2026-06-17",
    title: "数据反哺——新实体自动入库",
    sections: [
      {
        label: "实体自动创建",
        items: [
          "entity-auto-creator.ts：新实体自动创建器——角色→CharacterCard，地点→LorebookEntry(geography)，丹药/法宝/材料→LorebookEntry(item)，功法→LorebookEntry(technique)",
          "查重：大小写不敏感对比已有角色名+世界书标题，避免重复创建",
          "新增SSE事件：entity_auto_create_start / entity_auto_created / entity_auto_skip / entity_auto_create_error",
        ],
      },
    ],
  },
  {
    version: "v0.20.3",
    date: "2026-06-17",
    title: "伏笔自动检测——本地蒸馏驱动五状态机",
    sections: [
      {
        label: "伏笔信号自动入库",
        items: [
          "post-processor.ts：蒸馏完成后自动处理伏笔——埋设信号（20个词）→创建PendingCommitment，回收信号（13个词）→标记fulfilled，深化信号（7个词）→标记partially_fulfilled",
          "去重机制：同一信号词每章只处理一次，取置信度最高者",
          "新增SSE事件：foreshadow_update（汇总通知前端）/ foreshadow_update_error（单个伏笔失败不阻塞）",
        ],
      },
      {
        label: "默认模型修正",
        items: [
          "settings/page.tsx：DeepSeek 默认模型 deepseek-v4-pro → deepseek-v4-flash（匹配 CodeX/CCX 当前配置）",
        ],
      },
    ],
  },
  {
    version: "v0.20.2",
    date: "2026-06-17",
    title: "本地蒸馏引擎——实体检测不再烧 Token",
    sections: [
      {
        label: "命名模式库 + 四遍扫描",
        items: [
          "entity-detector.ts：5 类正则（丹药/法宝/功法/地点/材料）+ 排除词库 + 归属推断（属格/动词前置/段落主人）",
          "distillation-runner.ts：四遍扫描（实体识别→状态变化→伏笔匹配→一致性校验），零 Token，<1秒/万字",
          "post-processor.ts：Step 3 和 Step 4 之间插入本地蒸馏，LLM summarize 继续运行——双轨并行",
        ],
      },
      {
        label: "全局默认模型切换",
        items: [
          "默认提供商：硅基流动 → DeepSeek 官方（api.deepseek.com）",
          "默认模型：deepseek-ai/DeepSeek-V4-Flash → deepseek-v4-pro",
          "修复 outline/route.ts 和 characters/expand/route.ts 硬编码硅基流动 URL",
        ],
      },
    ],
  },
  {
    version: "v0.20.1",
    date: "2026-06-17",
    title: "API Key 动态透传——全局设置全面生效",
    sections: [
      {
        label: "修复 401 Invalid token",
        items: [
          "parser.ts 三个函数 fallback 从 getDefaultClient()（读 env vars→空 token→401）改为 getEffectiveConfig()（读数据库 AppSettings）",
          "update-cards/route.ts 变化检测同样从 getDefaultLLMConfig() 改为 getEffectiveConfig()",
          "全部 LLM 调用路径统一走数据库全局设置",
        ],
      },
    ],
  },
  {
    version: "v0.20.0",
    date: "2026-06-17",
    title: "写作质量闭环——禁用词v2.0 + 审校9维 + 管线全覆盖",
    sections: [
      {
        label: "禁用词检查器 v2.0",
        items: [
          "正则表达式支持：/pattern/flags 格式自动识别，强制 g 标志防死循环",
          "三级严重度：error/warning/info + 替换建议",
          "无效正则自动降级为精确匹配",
        ],
      },
      {
        label: "审校维度扩展",
        items: [
          "5维→9维：新增节奏/对话质量/描写密度/情绪一致性",
          "审校 Prompt 和 ReviewIssueType 同步更新",
        ],
      },
      {
        label: "管线覆盖",
        items: [
          "refine 路由接入 runPostGenerationPipeline",
          "3个路由全部使用统一后处理管线",
        ],
      },
      {
        label: "诊断修复",
        items: [
          "正则无 g 标志死循环、allNodes 过滤导致 previousNodes 错误",
          "角色集不一致、authorNote 双重注入、审校缺异常保护",
        ],
      },
    ],
  },
  {
    version: "v0.19.1",
    date: "2026-06-17",
    title: "架构重构——生成管线抽取，消除 60% 路由重复代码",
    sections: [
      {
        label: "新增管线模块",
        items: [
          "context-loader.ts — loadGenerationContext() 统一7表数据加载",
          "pre-processor.ts — 角色自建/过滤/备注/规则注入/LLM配置提取/上下文构建",
          "post-processor.ts — runPostGenerationPipeline() 扫描→审校→存储→摘要完整后处理链",
        ],
      },
      {
        label: "路由精简",
        items: [
          "write/route.ts：424行 → ~170行",
          "refine/route.ts：277行 → ~140行",
          "continue/route.ts：420行 → ~190行",
        ],
      },
      {
        label: "附带修复",
        items: [
          "summarizeChapter 正确传入 chapterOrder 和 existingSummariesCount",
          "eventImportances 四级事件分层在所有路由中统一存储",
          "StoryBeat impact 字段根据 impactScore 动态判断",
        ],
      },
    ],
  },
  {
    version: "v0.19.0",
    date: "2026-06-17",
    title: "蒸馏系统上线——四级事件分层 + 伏笔追踪基础",
    sections: [
      {
        label: "蒸馏引擎",
        items: [
          "S/A/B/C 四级事件评分：时效性×事件类型×伏笔关联×角色重要性 四因子算法",
          "自动推断事件类型（突破/死亡/传承/转折/揭露/战斗/日常 8 种）",
          "formatEventsForPrompt() 格式化 [S-N]/[A-N] 标签注入",
        ],
      },
      {
        label: "数据库",
        items: [
          "ChapterSummary 新增 eventImportances JSON 字段",
          "新增 PendingCommitment 模型——五状态机 + closure_conditions + status_history",
        ],
      },
      {
        label: "上下文组装",
        items: [
          "buildMediumTermSection 读取四级事件分层差异化注入",
          "summarizeChapter 生成后自动评分分层",
        ],
      },
    ],
  },
  {
    version: "v0.18.0",
    date: "2026-06-14",
    title: "项目化——多模型支持 + 全局设置 + 代码清理",
    sections: [
      {
        label: "🌐 多提供商 LLM 层",
        items: [
          "src/lib/llm.ts 重写为多提供商引擎：支持 OpenAI / 硅基流动 / DeepSeek 官方 / Groq / 自定义 OpenAI 兼容",
          "配置优先级：数据库 AppSettings 表 > 环境变量 LLM_API_KEY——填过数据库就用数据库，向后兼容",
          "60 秒内存缓存避免每次 LLM 调用查库",
          "新增 testLLMConnection() ——设置页一键验证 API Key 和模型是否可用",
          "clearLLMCache() 供设置页保存后即时刷新",
          "callSiliconFlow 别名保留——所有旧 API 路由无需改动，编译零错误",
        ],
      },
      {
        label: "⚙️ 全局设置系统",
        items: [
          "Prisma 新增 AppSettings 单例模型（id='default'）：llmProvider / llmApiKey / llmModel / llmBaseUrl",
          "GET /api/settings ——返回设置（Key 仅展示后 4 位，其余掩码）",
          "PUT /api/settings ——保存设置，自动失效 LLM 缓存，返回 ok",
          "POST /api/settings/test ——前端即时验证连接，不修改数据库",
          "设置页面 /settings ——暗色 UI：提供商单选→填 Key（👁切换可见）→模型名→测试连接→保存",
          "首页顶栏新增「⚙️ 设置」入口，一键跳转",
          "切换提供商会自动填入推荐默认模型（如 DeepSeek→deepseek-chat）",
          "自定义提供商支持手动填 API Base URL",
        ],
      },
      {
        label: "🏗 代码清理",
        items: [
          "LLM 调用统一：删除 7 个 API 路由中的本地 callFlash/callLLM 定义，统一走 src/lib/llm.ts",
          "净削减 ~70 行重复代码，删除 21 个冗余 MODEL/BASE_URL/API_KEY 常量声明",
          "orchestrator.ts 删除 3 个死函数：povLabel / ndLabel / pct（定义后全文无调用）",
          "orchestrator.ts 删除重复注释（同一行贴了两遍）",
          "4 个组件加 AbortController clean up：page.tsx / RulesPanel / StorylineList / PreGenConfirm",
          "CharacterList 和 CardUpdater 确认无误报——useEffect 不含 fetch",
          "README.md 完整替换为项目文档：快速开始 / 首次配置 / 提供商表 / 技术栈",
        ],
      },
    ],
  },
  {
    version: "v0.17.0",
    date: "2026-06-14",
    title: "规则中心 + 记忆压缩 + Bug修复",
    sections: [
      {
        label: "📏 规则中心——统一创作规则管理",
        items: [
          "Prisma 新增 Rule 模型：name / content / category（writing/world/character/style/custom）/ enabled / priority / scope",
          "CRUD API 完整：GET/POST /api/rules + GET/PUT/DELETE /api/rules/[id]",
          "核心工具函数 getActiveRules() + injectRules() —— 一处定义，全局生效",
          "规则注入 6 大 AI 路由：write / continue / refine / chapter-outline / outline / draw",
          "规则按分类编组后注入 authorNote，以「⚠️ 创作规则——铁律」最高优先级块呈现",
          "scope 分级：all（全局）/ write_only（正文生成）/ outline_only（大纲章纲）/ review_only（审校）",
          "前端 RulesPanel 组件——LeftPanel 新增「规则」Tab（第 5 个 Tab）",
          "规则创建/编辑/删除/启用禁用的完整交互，暗色 Tailwind 风格统一",
        ],
      },
      {
        label: "🧠 记忆压缩 MVP——告别「只看最近3章」",
        items: [
          "summarizeChapter 增强输出：impactScore（1-10影响力评分）、threadProgress（故事线进度）、unresolvedQuestions（悬念/伏笔列表）",
          "StoryBeat 不再硬编码 'minor'——impactScore ≥7 自动标为 major，影响排序优先注入",
          "engine.ts buildMediumTermSection：从固定取3章 → 角色重叠评分检索（Top-8最相关+最后一章保底）",
          "新增 buildArcSection：「角色弧光追踪」区块——有 arcProgress 的角色自动注入当前弧光状态",
          "新增 buildStorylineSection：「活跃故事线当前状态」区块——按七要素链展示每条线走到哪一步",
          "assemblePrompt 从 7 区块扩展到 9 区块——弧光 + 故事线追上最新进展",
          "TokenAllocation 新增 arcMemory + storylineMemory 预算分配",
          "第 50 章写玉佩相关内容时，第 5 章埋的伏笔能被角色重叠检索自动召回",
        ],
      },
      {
        label: "🐛 代码质量——审查修复 6 个 Bug",
        items: [
          "page.tsx handleDrawSelect：fire-and-forget fetch → await + try/catch，失败不静默丢数据",
          "page.tsx onEditOutline：同上——乐观更新后加 await + try/catch",
          "ContextPreview.tsx：useEffect 内 fetch 无 AbortController → 加全流程竞态防护",
          "StyleEditor.tsx：同上——加 AbortController + cleanup",
          "DrawCards.tsx：3 重竞态防护——过期请求检查、AbortError 精准跳过、finally 只关当前请求的 loading",
          "DrawCards.tsx API route：personality 字段从提取但不使用 → 正确拼入角色简介",
        ],
      },
      {
        label: "🛡 工程质量",
        items: [
          "新建 novel-forge-diagnostic 专属诊断 skill——每次代码变更后六维自检（TS/Prisma/React反模式/API健壮性/代码质量/服务健康）",
          "TypeScript 零错误编译通过",
          "Prisma 数据库同步——新增 Rule 表 + db push + client regenerate",
          "CHANGELOG.md 同步更新",
        ],
      },
    ],
  },
  {
    version: "v0.15.8",
    date: "2026-06-14",
    title: "章纲AI自主选角 + 系统提示词预缓存",
    sections: [
      {
        label: "🤖 章纲 AI 自主选角",
        items: [
          "两阶段生成——Step 1: AI 读取前5章+作者指令选角 → Step 2: 用选定角色生成章纲",
          "作者指令作为最高优先级注入选角和生成两个阶段",
          "空闲角色不再塞入——AI 根据剧情逻辑决定谁出场，不相关的不放",
          "生成结果展示 AI 选角列表 + 选角理由",
        ],
      },
      {
        label: "📖 章纲上下文大幅增强",
        items: [
          "前文上下文：从3章→5章，正文从300字→800字末段",
          "新增后文伏笔读取——知道后面发生什么才能埋好钩子",
          "章纲结构：核心冲突→情感基调→场景序列→对话点子→衔接钩子",
        ],
      },
      {
        label: "⚡ 系统提示词预缓存",
        items: [
          "全卡编译到 Project.globalPrompt ——角色+世界书+风格实时同步",
          "9 个同步钩子：角色CRUD、世界书CRUD、扩展、导入、整理apply、设定解析",
          "buildPromptContext + chapter-outline 有缓存时跳过 3 个 DB 查询",
          "缓存 >100 字生效，卡变动 <1 秒刷新",
        ],
      },
      {
        label: "🔧 其他优化",
        items: [
          "去重四层：自去重+跨聚类+与已有+全局 → apply 报告去重数量",
          "范围选择器：支持 1-50、1,3,5-10 等表达式",
          "SSE 预览缓存：previewId 替代完整 JSON 传输",
        ],
      },
    ],
  },
  {
    version: "v0.15.7",
    date: "2026-06-13",
    title: "批量范围选择 + 世界书确认UI + 信息零丢失架构",
    sections: [
      {
        label: "📐 批量范围选择",
        items: [
          "新增 RangeSelector 组件——支持 1-50、1,3,5-10、10-、-30、all/* 等范围表达式",
          "已装到世界书列表和角色卡列表——全选按钮旁边，输入后 Enter 确认",
          "角色卡列表中范围基于筛选后可见列表（1-based 索引）",
          "Esc 清空选择，焦点离开自动应用",
        ],
      },
      {
        label: "🛡️ 信息零丢失架构",
        items: [
          "max_tokens 分级——Phase 1 聚类:4096（够用），Phase 2 整理:16384~32768（按输入量自适应）",
          "输入 token 估算——中文 1.5 tokens/字，超 4 万 tokens 自动拆分批处理",
          "分批整理——每批独立调用 Flash，批间标题去重，多批结果再合并去重",
          "输出截断检测——检查 finish_reason === 'length'，被截断时打日志警告",
        ],
      },
      {
        label: "🔍 专有名词覆盖校验",
        items: [
          "整理后自动提取原文专有名词（书名号/引号/括号内容），比对输出中是否保留",
          "逐 cluster 报告覆盖率和缺失列表",
          "前端确认面板实时展示——缺失专有名词标红警告",
          "总体覆盖率在 done 事件中展示（如\"专有名词保留 97%\"）",
        ],
      },
      {
        label: "📚 确认面板",
        items: [
          "整理改为两步——预览（AI整理不写库）→ 确认面板 → apply 写入",
          "展示：来源词条 → 生成的新词条标题+内容摘要+关键词 + 拆分批次标记 + 覆盖警告",
          "确认后调 POST /api/lorebook/summarize/apply 原子写库（事务保护）",
        ],
      },
      {
        label: "🧠 主题聚类 + 求同存异",
        items: [
          "Phase 1: AI 扫描全选词条，按人物/势力/历史/地点/力量体系/杂项聚类",
          "内容预览从 300 字 → 500 字，聚类更准",
          "Phase 2 铁律：禁止用\"等\"省略、禁止概括数字、禁止合并分歧、禁止删专有名词",
          "maxDuration: 60 → 120s（分批调用需要更长时间）",
        ],
      },
    ],
  },
  {
    version: "v0.15.6",
    date: "2026-06-13",
    title: "章纲生成全面升级 —— 基于角色档案+风格设定",
    sections: [
      {
        label: "📋 章纲生成（chapter-outline）",
        items: [
          "角色信息从一行摘要 → 完整档案：性格五维(dominant/drive/contradiction/habits/socialMask) + 背景300字 + 能力 + 关系 + 说话风格",
          "新增文风注入——加载 styleCard，传入文风描述/视角/句长/对话比/语气标记",
          "前后文增强——从取前2章到取前3章，正文从取前200字到取末段300字",
          "systemPrompt 重写——6条铁律：行为必须匹配性格五维、关系一致、不违背核心驱动、文风匹配、角色不凭空创造、世界观铁律",
          "章纲结构升级：核心冲突→情感基调→场景序列(地点/角色/事件/情感变化)→关键对话点子→衔接钩子",
          "temperature 0.7 → 0.4（严谨不胡编），max_tokens 2048 → 4096（章纲更详细）",
        ],
      },
    ],
  },
  {
    version: "v0.15.5",
    date: "2026-06-13",
    title: "缺失角色自动发现 + 人物卡提示词全面升级",
    sections: [
      {
        label: "🆕 缺失角色自动建卡",
        items: [
          "AI 审计新增第三项任务——扫描 background 中提到的所有人物名",
          "比对全项目已有角色卡，发现新人物→自动创建独立角色卡",
          "去重保护——同名/与已删卡同名不重复建",
          "进度报告——发现几个缺失角色一目了然",
        ],
      },
      {
        label: "📝 人物卡提取全面升级（parser.ts + import/parse）",
        items: [
          "personality: 从简单字符串数组 → {dominant, drive, contradiction, habits, socialMask} 五维对象",
          "background: 从'简述' → '复述原文全部细节，至少100字'",
          "新增 abilities(能力列表)、timeline(时间线)、dialogueStyle(对话风格五字段)、hiddenMotives(隐藏动机)",
          "import/parse: 全字段禁止留空/填'未知'——必须从原文提取或合理推断",
          "角色提取 system prompt: 强调'保留全部信息，禁止精简''零精简'",
        ],
      },
      {
        label: "🔧 JSON 解析器",
        items: [
          "新增第 2.5 层——AI 输出多个 JSON 对象粘连时只取第一个完整对象",
          "解决 'Unexpected non-whitespace character after JSON' 报错",
        ],
      },
      {
        label: "⬆️ 限制解除",
        items: [
          "expand 路由 MAX_TOKENS: 16384 → 32768",
        ],
      },
    ],
  },
  {
    version: "v0.15.4",
    date: "2026-06-13",
    title: "角色扩展预处理 + JSON 解析器修复",
    sections: [
      {
        label: "🧹 扩展前预处理管线",
        items: [
          "AI 批量审计——一次 Flash 调用检查全部卡：是否真人 / 是否组合卡",
          "拆组合卡——'张三、李四'→每人独立建卡，已有同名则合并信息不重复",
          "删非角色——地名/物品/势力/概念混入角色列表的自动检测并删除",
          "智能合并增强——去括号匹配('洁世一(蓝色监狱)'↔'洁世一')，信息更丰富的卡优先保留，重复卡删除",
          "全流程 SSE 进度推送——拆分/删除/合并每步都有报告",
        ],
      },
      {
        label: "🔧 JSON 解析器修复",
        items: [
          "sanitizeUnescapedQuotes 不再空转——字符串内未转义引号自动检测并转义",
          "中文对话引号场景：'他说\"你好\"'→自动转义为 '他说\\\"你好\\\"'",
          "接入解析管线第5/6/7层——每个恢复层先修引号再解析",
          "错误消息扩展到 300 字 + 包含 JSON.parse 原始 SyntaxError",
        ],
      },
    ],
  },
  {
    version: "v0.15.3",
    date: "2026-06-13",
    title: "全链路硅基流动 —— 16路由统一迁移 + 模型名修正",
    sections: [
      {
        label: "☁️ API 迁移",
        items: [
          "getDefaultLLMConfig() → 硅基流动（连锁修复 detect-entities / update-style-card / settings/parser 等 5 场景）",
          "chapter-outline（章纲）/ outline（大纲）/ classify（角色分类）→ 硅基流动",
          "check-all-cards / import/commit / import/parse → 硅基流动",
          "lorebook/import / lorebook/summarize / characters/expand → 硅基流动",
          "全部 DEEPSEEK_API_KEY → LLM_API_KEY，统一密钥管理",
        ],
      },
      {
        label: "🔧 模型名修正",
        items: [
          "硅基流动实际支持的模型名：deepseek-ai/DeepSeek-V4-Pro、deepseek-ai/DeepSeek-V4-Flash",
          "之前使用的 deepseek-v4-pro / deepseek-v4-flash 在硅基流动上不存在（400 code 20012）",
          "16个文件批量替换，TypeScript 0 错误编译通过",
        ],
      },
      {
        label: "🐛 修复的问题",
        items: [
          "章纲生成 API 400 —— 模型名不存在",
          "章纲生成 API 401 —— 用了失效的 DeepSeek 官方 key 调官方 API",
          "大纲/分类/导入/世界书 全部存在同样的硬编码问题，一并根除",
        ],
      },
    ],
  },
  {
    version: "v0.15.2",
    date: "2026-06-12",
    title: "maxTokens 全链路 32768——真正无上限提取",
    sections: [
      {
        label: "⬆️ 输出拉满",
        items: [
          "parseSettings / parseLorebookOnly / parseStyleOnly: 16384 → 32768",
          "import/parse A路(角色提取) + B路(世界+风格): 16384 → 32768",
          "classify 四路并行: 16000 → 32768",
          "lorebook/summarize: 8000 → 32768",
          "上下文窗口百万token(DeepSeek原生)——输入不截断，输出不设限",
        ],
      },
    ],
  },
  {
    version: "v0.15.1",
    date: "2026-06-12",
    title: "仅世界卡 + 仅风格卡——复述蒸馏专用模式",
    sections: [
      {
        label: "📖 仅世界卡（parseLorebookOnly）",
        items: [
          "核心理念「复述蒸馏」——保留原文全部细节，去重去矛盾分类，不总结不压缩",
          "8大分类全覆盖：地理/势力/力量体系/历史/文化/生物/器物/自定义",
          "每条 content 保持原文信息密度——200字设定→200字+结构化输出",
          "专有名词零丢失、具体数值零丢失",
        ],
      },
      {
        label: "🎨 仅风格卡（parseStyleOnly）",
        items: [
          "覆盖9大维度：视角/叙事距离/句式量化/叙事比例/语气标记/词汇特征/文风描述/写作规则/样本段落",
          "写作规则提取：原文明确规则逐条照搬 + 从文风反推隐含规则",
          "styleDescription 100-200字具体描述——不写'文风古雅'，写'半文半白，叙述句现代中文短句...'",
        ],
      },
      {
        label: "🔀 API + 前端",
        items: [
          "/api/parse-settings 支持 mode 参数：all / lorebook / style",
          "SettingsImporter 三模式切换器——每个模式有独立说明和placeholder",
          "仅风格卡响应额外返回 writingRules 数组",
        ],
      },
    ],
  },
  {
    version: "v0.15.0",
    date: "2026-06-12",
    title: "导入设定一键出三卡——三卡分界标准建立 + 全局统一调度",
    sections: [
      {
        label: "🃏 导入设定一键出三卡",
        items: [
          "SettingsImporter 从两卡变三卡——角色卡 + 世界书 + 风格卡并行写入",
          "粘贴设定文本 → AI 自动拆出全部三卡，不需要进 ImportWizard 走多步流程",
          "一个 Promise.all 搞定三卡写入，速度快不阻塞",
        ],
      },
      {
        label: "📐 三卡分界标准建立（THREE_CARD_BOUNDARIES）",
        items: [
          "角色卡：有名字的个体人物——外貌/性格/背景/能力/关系/对话/动机/时间线。排除地名/组织/功法",
          "世界卡：非人物概念——地理/势力/力量体系/历史/文化/生物/器物，含触发关键词。排除人物/文风",
          "风格卡：写作特征——视角/叙事距离/句式/比例/语气/词汇/文风描述。排除人物/世界观",
          "parser.ts 是唯一定义源——所有提取路径引用同一套规则，杜绝各说各话",
        ],
      },
      {
        label: "🔗 ImportWizard 统一三卡标准",
        items: [
          "B路（世界+风格提取）引用 THREE_CARD_BOUNDARIES，与 SettingsImporter 完全一致",
          "分块模式下不再跳过世界提取——改用文本前16000字独立调用",
          "maxTokens 全链路 16384：A路角色提取、B路世界提取、parser.ts 解析，全部无上限",
        ],
      },
      {
        label: "🏗 类型系统",
        items: [
          "新增 StyleProfile 接口——对应 StyleCard 全部字段（视角/距离/句式/比例/语气/词汇/描述/样本）",
          "ParsedSettings 新增 styleProfile 字段",
          "新增 toStyleCardCreateParams()——StyleProfile → Prisma 创建参数",
          "SettingsImporter 前端显示风格卡创建结果（粉色高亮）",
        ],
      },
    ],
  },
  {
    version: "v0.14.0",
    date: "2026-06-10",
    title: "自动分类四维重写 + 错误报告修复 + SSE 收尾丢包",
    sections: [
      {
        label: "🏷 自动分类四维重写（称号/学校/经历/俱乐部）",
        items: [
          "从三个抽象维度（能力/势力/原型）→ 四个足球同人专属维度",
          "称号头衔：从角色描述提取修饰性称号、媒体标签、实力评价",
          "学校学园：识别日本高中、足球名校、海外学校、蓝色监狱内部层级",
          "经历履历：国家队经历、海外经历、重大事件、特殊履历、蓝色监狱经历",
          "俱乐部队伍：职业俱乐部、日本俱乐部队、国家队、蓝色监狱内部队伍",
          "未归类角色自动归入 ❓ 组，后端覆盖率检查",
        ],
      },
      {
        label: "🐛 分类错误不再被闷杀",
        items: [
          "根因：四个分类函数 catch { return [] } 吞掉所有错误，外层永远看到空数组",
          "修复：去掉内层 catch，错误冒泡到 POST handler 被 SSE 推送到前端",
          "API Key 缺失、限流 429、JSON 解析失败——全部显示具体原因",
        ],
      },
      {
        label: "📡 SSE 收尾丢包修复",
        items: [
          "根因：while 循环 done=true 时直接 break，buf 中残留的 done 事件被丢弃",
          "修复：break 前检查 buf.trim()，有 data: 行就解析——done 事件不再丢失",
          "done 事件丢失时 useEffect 兜底从 classifyResult 重建面板",
        ],
      },
      {
        label: "🔧 分类进度条不再卡 5%",
        items: [
          "四维串行执行（避免限流），每维独立推送 25%/45%/65%/85% 进度",
          "每维完成即推送 ✅ N组 确认消息",
        ],
      },
    ],
  },
  {
    version: "v0.13.0",
    date: "2026-06-10",
    title: "AI扩展双Provider + SSE弹窗修复 + continue提示词统一 + 死代码清理",
    sections: [
      {
        label: "🔀 AI扩展双Provider架构",
        items: [
          "硅基流动 V4 Flash ×4 并发 + DeepSeek官方 deepseek-chat ×4 并发 = 8路并行",
          "共享角色队列——哪个Provider快就多做，自动负载均衡",
          "DeepSeek未配置时自动回退全部8并发走硅基",
          "进度条标注每个角色由哪个Provider处理 [硅基]/[DeepSeek]",
        ],
      },
      {
        label: "🪟 扩展弹窗修复（SSE buf残留bug）",
        items: [
          "根因：SSE流结束时buf里残留的done事件被直接丢弃→expandResult永远不设置",
          "修复：流结束后检查buf残留，有data行就解析——done事件不再丢失",
          "扩展完成后弹窗正确显示成功/失败角色列表+原因",
        ],
      },
      {
        label: "🔧 continue提示词统一",
        items: [
          "续写不再自建systemPrompt——统一走buildPromptContext与write/refine同一套",
          "删除重复的风格卡注入代码（buildPromptContext已含）",
          "模板禁用词+自定义禁用词合并进authorNote统一传递",
          "续写文风与正文生成完全一致——含角色出场原则、丰满性示例、心理直嵌范例",
        ],
      },
      {
        label: "🧹 技术债清理",
        items: [
          "删除 SYSTEM_PROMPTS.writer 死代码——从未被使用（buildPromptContext始终生成systemPrompt）",
          "writeSection 移除无意义的回退逻辑 `context.systemPrompt || SYSTEM_PROMPTS.writer`",
        ],
      },
    ],
  },
  {
    version: "v0.12.1",
    date: "2026-06-10",
    title: "AI扩展结果弹窗 + 并发10不断联 + 自动分类AI三分类 + 扩展维度升级",
    sections: [
      {
        label: "🪟 AI扩展结果弹窗（替代盲alert）",
        items: [
          "扩展完成后弹出详细结果面板——成功X个/失败X个一目了然",
          "成功角色名列表绿色标签展示",
          "失败角色逐一列出+具体失败原因（API错误/JSON解析失败/DB写入失败）",
          "进度条实时显示每个角色的状态标记+错误原因",
          "点击遮罩层或「知道了」按钮关闭弹窗",
        ],
      },
      {
        label: "⚡ AI扩展并发10 + 绝不主动断联",
        items: [
          "并发数从6恢复到10——跑满Flash API处理能力",
          "移除所有AbortController超时——绝不主动中断API调用",
          "原文截断8000字保留——防止超长prompt拖垮API",
        ],
      },
      {
        label: "🏷 自动分类全面升级",
        items: [
          "从纯字符串匹配升级为Flash AI三分类：能力等级(⭐)、势力归属(🏛)、角色原型(🎭)",
          "三路Parallel并发分析——基于世界书+角色卡综合判断，不靠死规则",
          "未覆盖角色自动归入「未归类」组——不漏人",
          "分类结果直接显示为可勾选的标签面板——可选择性应用到角色tags",
        ],
      },
      {
        label: "📝 扩展质量升级",
        items: [
          "Prompt核心原则改为「少总结，多复述，多扩展，多补充」——原文照搬不缩写",
          "abilities/hiddenMotives改用textarea多行编辑，支持换行分隔",
          "AI扩展后quickImportContent自动清空——消化完毕不留冗余",
          "去重合并逻辑修正——重复角色内容合并到主卡，副本不删除保留在DB",
        ],
      },
    ],
  },
  {
    version: "v0.12.0",
    date: "2026-06-10",
    title: "作者指令优先级 + 自动三卡更新 + 比分追踪 + 导入流程修复 + 多项体验修复",
    sections: [
      {
        label: "📝 作者指令优先级提升",
        items: [
          "作者指令=大纲同等效力——冲突处以作者指令为准，大纲没有的内容按指令执行",
          "注入 system prompt 时明确标注「最高优先级」",
          "作者指令切换章节时自动清零——每章独立，互不干扰",
        ],
      },
      {
        label: "🔍 自动三卡更新（后台分析）",
        items: [
          "正文/微调/续写完成后自动调用 update-cards API 分析章节变化",
          "分析过程不弹窗——顶部显示「正在分析本章变化...」加载提示",
          "分析完成后自动弹出 CardUpdater 确认窗，跳过重复 API 调用",
          "修复 SSE 闭包导致 autoAnalyzeChapter 拿到空内容的严重 Bug",
        ],
      },
      {
        label: "⚽ 比赛比分智能追踪",
        items: [
          "update-cards 系统提示新增「比赛结果记录」强制区块",
          "每场比赛比分/胜负自动写入世界书（category=history）",
          "buildPromptContext 扫描世界书中比赛/比分词条，注入「必须保证前后一致」",
          "后续章节生成时自动引用历史比分，前后统一不打架",
        ],
      },
      {
        label: "🃏 CardUpdater 增强",
        items: [
          "新增「🔍 搜索已有角色」——输入名字即时筛选，点击添加",
          "新增「✨ 自建新角色」——输入名字回车直接创建",
          "支持 preAnalysisResult 外部传入，跳过内部 API 调用",
          "移除正文下方冗余的 EntityDetector 按钮——功能统一归入三卡分析",
        ],
      },
      {
        label: "📥 导入流程修复",
        items: [
          "AI识别+快速导入双路角色提取重构——编号→人名→整段描述塞background，不拆解分析",
          "编号全面兼容：Markdown标题(### 1.)、阿拉伯(1. 2、3)、中文数字(一、二)、序数(第一位)、圈号(①②)、括号((1))",
          "快速导入纯正则秒级解析——40→100+角色瞬间完成，自动去重合并同名/小名/别名",
          "快速导入dbMerge占位代码bug修复——quickImportContent被写为对象导致后续导入崩溃",
          "AI识别Prompt增强——Markdown标题支持、名字清洗(去——修饰)、重复引用自动跳过",
          "导入分批合并进度实时推送——每批API返回立即SSE推送，不再卡在 0/10",
          "mergeOneBatch 45s超时保护 + AB路解析55s超时 + 2万字截断 + 真进度替代假百分比",
        ],
      },
      {
        label: "🔧 体验修复",
        items: [
          "添加章节自动编号——统计已有章节数，弹窗预填「第N章：」",
          "Flash 章纲提示词切换章节时清零——每章独立",
          "Flash 章纲按钮原位显示生成状态——⏳生成中 / ✅完成 / ❌失败",
          "Deploy 改用部署令牌环境变量传参",
          "人物卡编辑「背景」栏 textarea 从 4 行扩大到 16 行——导入的详细角色描述不再挤在小框里",
        ],
      },
    ],
  },
  {
    version: "v0.11.1",
    date: "2026-06-09",
    title: "全场景角色确认 + 进度可视化 + 上下文监控 + 写完不跳转",
    sections: [
      {
        label: "🔄 全场景角色确认",
        items: [
          "微调（✏️）→ 弹角色确认框 → 确认后精准微调",
          "续写（➡️）→ 弹角色确认框 → 确认后精准续写",
          "大纲生成（🤖）→ 弹角色确认框 → 确认后按名单生成大纲",
          "Flash章纲（⚡）→ 直接生成+进度UI，不弹角色确认",
          "全部走同一套调度逻辑——你确认谁出场，AI就用谁",
        ],
      },
      {
        label: "📊 上下文监控优化",
        items: [
          "Token用量面板顶部新增「📊 角色卡读取 X/Y 张」进度条",
          "角色名标签改为可折叠——默认收起，点开才看名单",
          "替换原来不知所云的角色激活列表",
          "preview-context API 返回 activeCharacterCount + totalCharacterCount",
        ],
      },
      {
        label: "⏳ 进度可视化",
        items: [
          "所有生成操作显示步骤状态：生成中/审校中/摘要中/完成/出错",
          "4步进度条动画——时刻知道AI在干什么",
          "完成/出错状态5秒后自动消失",
          "Flash章纲/大纲生成/微调/续写全部覆盖",
        ],
      },
      {
        label: "🐛 写完不跳转修复",
        items: [
          "根因：loadProject() 自动跳到第一个未完成章节",
          "修复：记住当前章节，只刷新数据不跳选",
          "写完一章后留在原地目送成功",
        ],
      },
      {
        label: "📋 大纲角色联动",
        items: [
          "大纲生成时 pre-write-cards 支持无节点模式——用作品总纲做调度",
          "确认的角色名单注入大纲prompt——AI按名单规划每章出场",
          "角色备注同样生效——「这场他右腿旧伤」→ AI在大纲中体现",
          "大纲和章纲的prompt都追加角色出场策略指令",
        ],
      },
      {
        label: "🔧 后端统一",
        items: [
          "outline/refine/continue 三个API全部支持 confirmedCardIds + cardNotes + newCharacterRequests",
          "三个API全部支持运行时自建角色——输入名字自动建卡",
          "pre-write-cards API nodeId改为可选——大纲生成时用作品总纲替代",
          "chapter-outline API 保留 confirmedCardIds 支持（向后兼容）",
        ],
      },
    ],
  },
  {
    version: "v0.11.0",
    date: "2026-06-09",
    title: "生成前角色确认系统——你决定谁出场，AI不再乱拉人",
    sections: [
      {
        label: "🎭 生成前角色确认",
        items: [
          "点「生成」→ 弹确认框：列出AI调度的角色+出场理由+打分",
          "每张卡可勾选/取消——你控制谁出场",
          "每张卡可写备注（如「这场他右腿旧伤隐隐作痛」）→ 自动注入prompt最高优先级",
          "无匹配角色卡时AI提示缺失类型（如「大纲提到门将但无对应卡」）",
        ],
      },
      {
        label: "🆕 自建角色",
        items: [
          "输入角色名 → AI自动创建角色卡并送入prompt",
          "新卡标🆕，基础字段自动填充，后续可在角色列表补充细节",
        ],
      },
      {
        label: "🔗 完整链路",
        items: [
          "新API /api/generate/pre-write-cards —— 返回调度卡+理由+缺角色建议",
          "write API新增confirmedCardIds/cardNotes/newCharacterRequests参数",
          "确认后仅送确认的角色卡——不再全量178人塞进prompt",
          "write API向后兼容——不传confirmedCardIds走原调度逻辑",
        ],
      },
      {
        label: "📝 其他优化",
        items: [
          "角色备注注入后覆盖全局作者指令",
          "确认框可修改作者指令——本章权重与大纲等同",
          "调度理由透明化——每张卡标注为什么被选中",
        ],
      },
    ],
  },
  {
    version: "v0.10.2",
    date: "2026-06-09",
    title: "持久化+自动流程+世界书扩充——写完自动弹三卡",
    sections: [
      { label: "📝 持久化", items: ["Flash章纲提示词从prompt()→持久输入框", "作者指令+微调指令→localStorage", "三卡浮动按钮→关闭弹窗后不消失"] },
      { label: "⚡ 自动流程", items: ["写完自动弹CardUpdater→不需手动点通知", "经历时间线自动汇总→timeline字段", "调度卡全量展开~15人完整卡面"] },
      { label: "🌍 世界书扩充", items: ["三卡分析新增7类世界观检测", "自动创建世界书词条→从11条涨到30+"] },
    ],
  },
  {
    version: "v0.9.4",
    date: "2026-06-09",
    title: "角色出场逻辑系统——S/A/B/C叙事权重，根治前期角色乱入",
    sections: [
      {
        label: "🎭 叙事权重系统",
        items: [
          "S级（世界级/传说级/国家队/反派首领）：仅在重大比赛/剧情高潮/关键冲突出现——绝不可日常陪同",
          "A级（导师/反派/催化剂/队长）：有明确叙事目的才出场——不是随叫随到",
          "B级（队友/同辈/主角团）：可在训练/比赛/日常场景自然出现",
          "C级（背景角色）：可随意出现，但不应主导剧情",
        ],
      },
      {
        label: "🔍 出场追踪",
        items: [
          "扫描前文章节自动判断每个角色是否已出场",
          "花名册标注✅已出场/🆕未出场——未出场角色不能凭空出现",
          "🆕角色引入必须有铺垫（他人提及→旁观出现→消息/电话→面对面）",
          "已死亡角色自动从花名册移除",
        ],
      },
      {
        label: "📋 角色出场规则注入",
        items: [
          "系统提示词新增「角色出场逻辑」段：每个出场角色必须回答'他为什么在这里'",
          "Writer SYSTEM_PROMPTS同步——确保续写/重写都遵守",
          "花名册精确到每个角色的出场条件和场景限制",
          "禁止：S级陪训练、对手无故串场、未出场角色突然加入对话",
        ],
      },
    ],
  },
  {
    version: "v0.9.3",
    date: "2026-06-09",
    title: "修复504超时 + JSON解析容错——AI分析本章变化终于能跑完了",
    sections: [
      {
        label: "⚡ 性能修复",
        items: [
          "maxDuration从60秒拉到300秒——部署平台不再提前掐断LLM分析",
          "角色智能过滤：只送章节中出现的角色+主角反派导师（178→≤40个），LLM处理时间大幅下降",
          "章节内容截取从10000字降到8000字——再减20%prompt体积",
        ],
      },
      {
        label: "🛡 容错加固",
        items: [
          "LLM调用加try/catch——模型不可用时返回空结果+友好错误信息，不再抛500",
          "JSON解析四层容错：markdown提取→花括号截取→JSON.parse→失败返回raw文本",
          "前端res.json()改成先res.text()再JSON.parse——API返回非JSON不再白屏炸掉",
        ],
      },
    ],
  },
  {
    version: "v0.9.2",
    date: "2026-06-09",
    title: "角色花名册注入prompt——修复三卡更新后后续章节读不到的致命漏洞",
    sections: [
      {
        label: "🧠 架构修复",
        items: [
          "根因：buildPromptContext只把主角极简卡送进globalMemory——apply-updates写入的关系/对话风格/外貌/弧光/能力全停在数据库永不进prompt",
          "修复：GlobalMemory新增characterRoster字段，遍历所有角色提取有意义字段",
          "花名册按角色优先级排序(protagonist/antagonist优先→最多60个有更新记录的角色)",
          "assemblePrompt把花名册注入「全局设定——始终牢记」区——AI写后续章节时能看到所有角色当前状态",
        ],
      },
      {
        label: "🔍 AI分析本章变化增强",
        items: [
          "新增「对话风格」「外貌描述」「性格信念转变」「获得物品/身份」检测字段",
          "apply-updates新增dialogueStyle/appearance字段的章节标记写入",
          "chapterNumber提取修复：正则匹配中文数字(一二三)和阿拉伯数字，不再传完整标题",
          "autoAnalyzeChapter也传chapterNumber——自动检测的更新也能被后续章节读取",
        ],
      },
    ],
  },
  {
    version: "v0.9.1",
    date: "2026-06-08",
    title: "四大功能齐发 + 足球风格卡 + AI分析本章变化修复",
    sections: [
      {
        label: "🗑 章节管理",
        items: [
          "章节删除+自动重编号：DELETE API自动将剩余章节重新编号为第一章/第二章…",
          "大纲追加模式：已有章节时默认追加而非替换，对话框toggle切换",
          "正文禁写「第X章」：orchestrator/write/continue三处prompt格式铁律",
          "单章Flash章纲：新API /api/generate/chapter-outline + 中栏⚡按钮",
        ],
      },
      {
        label: "⚽ 蓝锁足球美学风格卡",
        items: [
          "心理直嵌：内心想法口语化碎片化，不加引导词直接写进叙述流",
          "对话肉搏感：每句承载性格/战术/情绪，禁止单字对话，每个动作必须有回应",
          "变速齿轮：一对一慢速展开·球转移快速掠过·射门前心理定格",
          "足球肉搏精度：触球动词具体化·身体接触量化·空间距离精确·失败失误拉满",
          "超能力自然下沉：允许但自然发生，不命名不强调，给高光留物理解释",
        ],
      },
      {
        label: "🔍 AI分析本章变化",
        items: [
          "修复按钮400报错：改用selectedNode?.content不再传空值",
          "内联编辑：每条检测变化可点击✏️编辑，编辑后标记「已编辑」",
          "significance过滤：high/medium默认勾选，low不选",
          "三卡写入格式对齐角色卡(personality/关系/背景/对话风格/外貌)",
          "世界观词条自动去重",
          "Prompt优化：分析上限10000字，明确big/little区分标准",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "Flash章纲按钮：加prompt输入框+错误alert+res.ok检查",
          "支持通过 CI 自动部署到自有服务器",
        ],
      },
    ],
  },
  {
    version: "v0.9.0",
    date: "2026-06-08",
    title: "大纲生成对话框——可选章节数 + 提示词 + 编辑预览 + 确认写入",
    sections: [
      {
        label: "📋 大纲生成",
        items: [
          "可选4/8/12章或自定义数量",
          "点选即切",
        ],
      },
      {
        label: "✏️ 自定义提示词",
        items: [
          "输入提示词走V4 Flash快速生成",
          "不填走V4 Pro深度创作",
        ],
      },
      {
        label: "👁 章节预览编辑",
        items: [
          "生成后逐章预览",
          "点击即可编辑标题和梗概",
        ],
      },
      {
        label: "✅ 确认写入",
        items: [
          "预览满意后一键写入DB替换旧大纲",
          "不满意可以关闭重来",
        ],
      },
      {
        label: "🔧 后端",
        items: [
          "chapters自动从第一章编号",
          "JSON解析失败→正则回退→默认兜底三级容错",
        ],
      },
    ],
  },
  {
    version: "v0.8.3",
    date: "2026-06-08",
    title: "大纲一键生成——不要弹窗，点按钮直接出章节",
    sections: [
      {
        label: "📋 大纲一键生成",
        items: [
          "移除弹窗流程：不再需要选章数→预览→勾选，点「🤖 大纲」直接生成",
          "自动创建 StoryNode：生成后章节自动出现在左侧大纲树",
          "失败弹窗提示：不再静默失败，alert 显示具体错误",
          "maxDuration=60s：防止部署平台超时掐断",
        ],
      },
      {
        label: "🎨 风格卡注入",
        items: [
          "大纲生成自动读取 StyleCard：句长分布、对话/描写/动作比例、视角类型、语气标记",
          "llmConfig 自定义笔记和禁用词一并传入",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "personality/hiddenMotives 字段 safeJoin 兼容数组/对象/字符串",
          "SW v5 自毁版本：激活后清除缓存+注销自身，终结缓存死锁",
        ],
      },
    ],
  },
  {
    version: "v0.8.2",
    date: "2026-06-08",
    title: "大纲生成修复 + 风格卡注入 + 自动更新公告",
    sections: [
      {
        label: "📋 大纲生成修复",
        items: [
          "按钮修复：Toolbar 和 OutlineGenerator 全部按钮换原生 button，解决点击无反应",
          "风格卡注入：生成大纲时自动读取 StyleCard 全部量化特征（句长、对话比、视角、语气标记等）",
          "personality 兼容：safeJoin 统一处理数组/对象/字符串三种格式，不再报 join is not a function",
          "大纲自动分章节：第一章到第N章顺序生成，标题自动拟定",
        ],
      },
      {
        label: "🔄 自动更新系统",
        items: [
          "Service Worker v4：network-first 策略，激活时强制刷新所有页面",
          "首页自动弹更新公告：检测版本变化自动展示 changelog",
          "版本数据统一：LATEST_VERSION + CHANGELOG_BRIEF + VERSIONS 集中管理",
        ],
      },
    ],
  },
  {
    version: "v0.8.1",
    date: "2026-06-08",
    title: "导入稳定性修复——SSE 不再卡死 + 数据零丢失",
    sections: [
      {
        label: "🐛 导入修复",
        items: [
          "SSE 错误通道修复：单层 try/catch，不再卡在「连接中」假死",
          "三卡数据完整写入：relationships、subFields、background 三字段不再丢失",
          "尾块短合并：smartChunk 不再丢弃 <50 字的尾部碎片",
          "流式进度全程可见：单次 V4 Pro 调用，一次分析完，不用分批等待",
        ],
      },
    ],
  },
  {
    version: "v0.8.0",
    date: "2026-06-08",
    title: "自动分类重构 + 章末快照 + 断点续写 + thinking 全面修复",
    sections: [
      {
        label: "🏷 角色分类重构",
        items: [
          "从「全自动逐角色打标签」改为「AI 分析分类体系 → 你勾选确认」",
          "按维度分组：势力/组织、身份/职业、阵营/立场、特殊称号、剧情功能",
          "每组列出所有成员，可全选/取消全组，也可单独勾选/取消成员",
          "一个角色可属于多个分类",
          "新增 apply-tags API，勾选后一键写入",
        ],
      },
      {
        label: "📥 世界书导入 & 整理",
        items: [
          "一键导入：粘贴设定文本 → Flash 自动提取术语/概念/势力/地点",
          "结构化整理：去重去矛盾，专有名词零丢失，不再压缩信息",
          "导入/整理结果持久显示——成功/失败不再凭空消失",
        ],
      },
      {
        label: "🧠 章末快照 + 角色脉搏",
        items: [
          "写完后自动提取前章收尾氛围（压抑/释然/紧张…）",
          "自动提取每个角色的「当下冲动」——我要 X，因为 Y 刚发生",
          "下一章提示词自动注入氛围 + 冲动，修「上下章连不上」",
          "数据存入 ChapterSummary，不增加额外 API 调用",
        ],
      },
      {
        label: "💾 断点续写",
        items: [
          "写/续路由每 300 字自动保存草稿到数据库",
          "浏览器关了、连接断了——重新点生成自动从断点接续",
          "前端收到 resume 事件提示「从草稿续写（已有 xxx 字）」",
        ],
      },
      {
        label: "🔧 审校 & 文风",
        items: [
          "审校结果改为 JSON Schema 输出——分维度、有位置引用、有修改建议",
          "StyleCard（对话比例、视角、语气标记、句长）真正写入写作提示词",
          "longTerm 内存从空数组改为读取 StoryBeat 关键转折点索引",
        ],
      },
    ],
  },
  {
    version: "v0.7.1",
    date: "2026-06-08",
    title: "thinking 字段全面修复——5 个 API 恢复可用",
    sections: [
      {
        label: "🐛 致命修复",
        items: [
          "硅基流动 Flash 不支持 thinking 字段",
          "import、summarize、classify、expand、commit、parse 共 6 个 API 的裸 fetch 调用全部清理",
          "之前这些 API 点了没反应——报 400 但前端没显示错误",
        ],
      },
      {
        label: "🏗 工程",
        items: [
          "Workspace 页面 2895→2063 行，抽出 CharacterList/LorebookList/types 三个模块",
        ],
      },
    ],
  },
  {
    version: "v0.7.0",
    date: "2026-06-07",
    title: "角色扩展大幅加速 + 查重优化",
    sections: [
      {
        label: "⚡ 加速",
        items: [
          "Expand 从非流式改为流式生成——3 秒开始出角色，不再是干等 20 秒",
          "批量从 4 翻到 8——100 角色从 25 批减到 13 批",
          "Prompt 压缩 40%——框架式模板替代散装指令",
        ],
      },
      {
        label: "🧠 扩展质量",
        items: [
          "铁律 1：禁止\"无\"\"未知\"\"暂无\"——缺信息按地位推敲",
          "铁律 2：同类型角色外貌性格必须可区分",
          "铁律 3：能力按地位推导——掌门 > 长老 > 执事 > 弟子",
          "世界书+风格卡走缓存，秒读上下文",
        ],
      },
      {
        label: "🗄️ 性能",
        items: [
          "角色查重：复用已加载数据，0 次额外 DB 查询",
          "词条查重：1 次批量 findMany 替代逐个查询",
          "100 角色 + 100 词条：DB 查询从 200 次 → 1 次",
        ],
      },
    ],
  },
  {
    version: "v0.6.1",
    date: "2026-06-07",
    title: "解析进度完全可视化",
    sections: [
      {
        label: "📊 进度",
        items: [
          "流式检测中实时显示角色名计数",
          "去重合并阶段逐角色推送——每发现新角色即时通知",
          "前端实时显示已发现角色数 + 词条数",
        ],
      },
      {
        label: "🔧 修复",
        items: [
          "commit + expand 加 maxDuration=300，防止部署平台 60s 超时掐断",
          "commit 完成消息角色数双倍计数修复",
        ],
      },
    ],
  },
  {
    version: "v0.6.0",
    date: "2026-06-07",
    title: "最后小块丢失修复",
    sections: [
      {
        label: "🐛 Bug",
        items: [
          "smartChunk 短尾块（<200 字）自动合并到前一块，不再丢弃",
          "十万字文本的最后一段不会凭空消失",
        ],
      },
    ],
  },
  {
    version: "v0.5.0",
    date: "2026-06",
    title: "核心功能上线",
    sections: [
      {
        label: "✨ 导入解析",
        items: [
          "Smart chunk 分块：按段落边界，≤6000 字/块",
          "N 路 Flash 并行提取 + JS 去重合并",
          "SSE 流式进度——解析阶段全程可见",
        ],
      },
      {
        label: "📝 确认提交",
        items: [
          "Flash 分批并行合并（每批 4 个）",
          "同名角色/词条自动合并",
          "可选确认/单个移除/一键删除/分批提交",
        ],
      },
      {
        label: "🤖 AI 扩展",
        items: [
          "选中角色一键批量扩展",
          "globalPrompt 缓存世界书+风格卡",
          "人物时间线 timeline 防 OOC",
        ],
      },
      {
        label: "📱 部署",
        items: [
          "生产环境部署",
          "PWA manifest + Service Worker",
        ],
      },
    ],
  },
];
